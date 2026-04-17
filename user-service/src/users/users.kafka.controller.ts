import { Controller, Logger, Inject } from '@nestjs/common';
import { EventPattern, Payload, Ctx, KafkaContext, Client, ClientKafka, Transport } from '@nestjs/microservices';
import { PubSub } from 'graphql-subscriptions';
import { UserEventsGateway } from '../realtime/user-events.gateway';
import { KafkaEvent } from '../common/kafka/kafka-event.interface';
import { User } from './entities/user.entity';

/**
 * @controller UsersKafkaController
 * @description Kafka consumer for user-domain events.
 *
 * Consumer group: user-service-group
 *
 * This is the "real-time layer" in Pattern B:
 *   1. Kafka event arrives (produced by UsersService after write)
 *   2. Controller parses the KafkaEvent<T> envelope
 *   3. Deduplicates using processedCorrelationIds (idempotency)
 *   4. Triggers GraphQL subscription push via PubSub
 *   5. Triggers Socket.IO push via UserEventsGateway
 *   6. On failure: emits to dead-letter topic + logs
 *
 * Idempotency
 * ────────────
 * correlationId is used as the deduplication key. Kafka at-least-once delivery
 * may replay messages; the Set prevents double-processing.
 * The Set is in-memory — for multi-instance deployments, move to Redis.
 *
 * Dead Letter Topic
 * ──────────────────
 * On any processing error, the raw message is forwarded to 'user.events.dlq'
 * with an error annotation. A separate DLQ consumer can inspect/replay it.
 *
 * Topics subscribed
 * ──────────────────
 *   user.created  — push to GQL subscription + Socket.IO
 *   user.updated  — push to GQL subscription + Socket.IO
 *   user.deleted  — push to GQL subscription + Socket.IO
 */
@Controller()
export class UsersKafkaController {
  private readonly logger = new Logger(UsersKafkaController.name);

  /** In-process idempotency store. Replace with Redis Set for multi-instance. */
  private readonly processedCorrelationIds = new Set<string>();

  /** DLQ producer client. */
  @Client({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'user-service-dlq-producer',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      producer: { allowAutoTopicCreation: true },
    },
  })
  private dlqClient: ClientKafka;

  constructor(
    @Inject('GQL_PUB_SUB') private readonly pubSub: PubSub,
    private readonly gateway: UserEventsGateway,
  ) {}

  // ── user.created ──────────────────────────────────────────────────────────

  @EventPattern('user.created')
  async handleUserCreated(
    @Payload() raw: any,
    @Ctx() ctx: KafkaContext,
  ): Promise<void> {
    const event = this.parseEnvelope<User>(raw);
    if (!event) return;
    if (this.isDuplicate(event.correlationId)) return;

    try {
      this.logger.log(
        `[user.created] correlationId=${event.correlationId} id=${event.payload?.id}`,
      );

      // ── Trigger GraphQL subscription push ───────────────────────────────
      await this.pubSub.publish('userCreated', { userCreated: event.payload });

      // ── Trigger Socket.IO push to REST clients ──────────────────────────
      this.gateway.emitUserCreated(event);

      this.markProcessed(event.correlationId);
    } catch (err) {
      this.sendToDlq('user.created', raw, err, ctx);
    }
  }

  // ── user.updated ──────────────────────────────────────────────────────────

  @EventPattern('user.updated')
  async handleUserUpdated(
    @Payload() raw: any,
    @Ctx() ctx: KafkaContext,
  ): Promise<void> {
    const event = this.parseEnvelope<User>(raw);
    if (!event) return;
    if (this.isDuplicate(event.correlationId)) return;

    try {
      this.logger.log(
        `[user.updated] correlationId=${event.correlationId} id=${event.payload?.id}`,
      );

      await this.pubSub.publish('userUpdated', { userUpdated: event.payload });
      this.gateway.emitUserUpdated(event);
      this.markProcessed(event.correlationId);
    } catch (err) {
      this.sendToDlq('user.updated', raw, err, ctx);
    }
  }

  // ── user.deleted ──────────────────────────────────────────────────────────

  @EventPattern('user.deleted')
  async handleUserDeleted(
    @Payload() raw: any,
    @Ctx() ctx: KafkaContext,
  ): Promise<void> {
    const event = this.parseEnvelope<{ id: string }>(raw);
    if (!event) return;
    if (this.isDuplicate(event.correlationId)) return;

    try {
      this.logger.warn(
        `[user.deleted] correlationId=${event.correlationId} id=${event.payload?.id}`,
      );

      await this.pubSub.publish('userDeleted', { userDeleted: event.payload?.id });
      this.gateway.emitUserDeleted(event);
      this.markProcessed(event.correlationId);
    } catch (err) {
      this.sendToDlq('user.deleted', raw, err, ctx);
    }
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  /**
   * Parse and validate the KafkaEvent envelope.
   * Returns null (and logs a warning) on malformed payloads so the
   * consumer never crashes on bad messages.
   */
  private parseEnvelope<T>(raw: any): KafkaEvent<T> | null {
    try {
      const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const parsed = JSON.parse(str);
      // Minimal envelope validation
      if (!parsed.correlationId || !parsed.eventType || !parsed.payload) {
        this.logger.warn('Received malformed KafkaEvent — missing required fields');
        return null;
      }
      return parsed as KafkaEvent<T>;
    } catch {
      this.logger.warn(`Failed to parse Kafka message: ${String(raw).slice(0, 200)}`);
      return null;
    }
  }

  /** True if correlationId has already been processed. */
  private isDuplicate(correlationId: string): boolean {
    if (this.processedCorrelationIds.has(correlationId)) {
      this.logger.warn(`Duplicate Kafka event skipped — correlationId=${correlationId}`);
      return true;
    }
    return false;
  }

  /** Mark correlationId as processed. Caps set size to prevent unbounded growth. */
  private markProcessed(correlationId: string): void {
    this.processedCorrelationIds.add(correlationId);
    // Keep only the last 10 000 ids to bound memory usage
    if (this.processedCorrelationIds.size > 10_000) {
      const first = this.processedCorrelationIds.values().next().value;
      this.processedCorrelationIds.delete(first);
    }
  }

  /**
   * Forward failed messages to the dead-letter topic.
   * The DLQ message preserves the original payload plus error metadata.
   */
  private sendToDlq(topic: string, raw: any, err: unknown, ctx: KafkaContext): void {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.logger.error(`[DLQ] Processing failed for topic=${topic} error=${errorMessage}`);

    this.dlqClient.emit('user.events.dlq', {
      key: topic,
      value: JSON.stringify({
        originalTopic: topic,
        originalPayload: raw,
        error: errorMessage,
        partition: ctx.getPartition(),
        timestamp: new Date().toISOString(),
      }),
    });
  }
}
