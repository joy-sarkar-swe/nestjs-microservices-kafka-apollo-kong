import { Controller, Logger, Inject } from '@nestjs/common';
import { EventPattern, Payload, Ctx, KafkaContext, Client, ClientKafka, Transport } from '@nestjs/microservices';
import { PubSub } from 'graphql-subscriptions';
import { BlogsService } from './blogs.service';
import { BlogEventsGateway } from '../realtime/blog-events.gateway';
import { KafkaEvent } from '../common/kafka/kafka-event.interface';
import { Blog } from './entities/blog.entity';

/**
 * @controller BlogsKafkaController
 * @description Kafka consumer for blog-service.
 *
 * Consumer group: blog-service-group
 *
 * This controller is the real-time layer in Pattern B:
 *   1. Kafka event arrives (from blog-service or user-service producers)
 *   2. Parse KafkaEvent<T> envelope — validate structure
 *   3. Deduplicate via processedCorrelationIds (idempotency)
 *   4. Execute domain side-effect (e.g. orphan cleanup for user.deleted)
 *   5. Trigger GraphQL subscription via PubSub
 *   6. Trigger Socket.IO push via BlogEventsGateway
 *   7. On failure: forward to DLQ topic + log error
 *
 * Topics subscribed
 * ──────────────────
 *   user.created  — cross-service: observability hook
 *   user.updated  — cross-service: observability hook
 *   user.deleted  — cross-service: ⚡ orphan blog cleanup + realtime push
 *   blog.created  — self: GQL subscription + Socket.IO push
 *   blog.updated  — self: GQL subscription + Socket.IO push
 *   blog.deleted  — self: GQL subscription + Socket.IO push
 *
 * Idempotency
 * ────────────
 * processedCorrelationIds is an in-memory Set capped at 10 000 entries.
 * Replace with Redis Set for multi-instance deployments.
 */
@Controller()
export class BlogsKafkaController {
  private readonly logger = new Logger(BlogsKafkaController.name);
  private readonly processedCorrelationIds = new Set<string>();

  @Client({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'blog-service-dlq-producer',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      producer: { allowAutoTopicCreation: true },
    },
  })
  private dlqClient: ClientKafka;

  constructor(
    private readonly blogsService: BlogsService,
    @Inject('GQL_PUB_SUB') private readonly pubSub: PubSub,
    private readonly gateway: BlogEventsGateway,
  ) {}

  // ── BLOG EVENTS (self) ────────────────────────────────────────────────────

  @EventPattern('blog.created')
  async handleBlogCreated(
    @Payload() raw: any,
    @Ctx() ctx: KafkaContext,
  ): Promise<void> {
    const event = this.parseEnvelope<Blog>(raw);
    if (!event) return;
    if (this.isDuplicate(event.correlationId)) return;

    try {
      this.logger.log(
        `[blog.created] correlationId=${event.correlationId} id=${event.payload?.id}`,
      );

      // Push to GraphQL subscribers
      await this.pubSub.publish('blogCreated', { blogCreated: event.payload });

      // Push to Socket.IO REST clients
      this.gateway.emitBlogCreated(event);

      this.markProcessed(event.correlationId);
    } catch (err) {
      this.sendToDlq('blog.created', raw, err, ctx);
    }
  }

  @EventPattern('blog.updated')
  async handleBlogUpdated(
    @Payload() raw: any,
    @Ctx() ctx: KafkaContext,
  ): Promise<void> {
    const event = this.parseEnvelope<Blog>(raw);
    if (!event) return;
    if (this.isDuplicate(event.correlationId)) return;

    try {
      this.logger.log(
        `[blog.updated] correlationId=${event.correlationId} id=${event.payload?.id}`,
      );

      await this.pubSub.publish('blogUpdated', { blogUpdated: event.payload });
      this.gateway.emitBlogUpdated(event);
      this.markProcessed(event.correlationId);
    } catch (err) {
      this.sendToDlq('blog.updated', raw, err, ctx);
    }
  }

  @EventPattern('blog.deleted')
  async handleBlogDeleted(
    @Payload() raw: any,
    @Ctx() ctx: KafkaContext,
  ): Promise<void> {
    const event = this.parseEnvelope<{ id: string }>(raw);
    if (!event) return;
    if (this.isDuplicate(event.correlationId)) return;

    try {
      const reason = (event.payload as any).reason
        ? ` (reason: ${(event.payload as any).reason})`
        : '';
      this.logger.log(
        `[blog.deleted] correlationId=${event.correlationId} id=${event.payload?.id}${reason}`,
      );

      await this.pubSub.publish('blogDeleted', { blogDeleted: event.payload?.id });
      this.gateway.emitBlogDeleted(event);
      this.markProcessed(event.correlationId);
    } catch (err) {
      this.sendToDlq('blog.deleted', raw, err, ctx);
    }
  }

  // ── USER EVENTS (cross-service) ───────────────────────────────────────────

  @EventPattern('user.created')
  handleUserCreated(@Payload() raw: any, @Ctx() ctx: KafkaContext): void {
    const event = this.parseEnvelope<{ id: string }>(raw);
    if (!event) return;
    this.logger.log(`[user.created] correlationId=${event?.correlationId} id=${event?.payload?.id}`);
    // Extend: pre-warm author name cache, analytics hook, etc.
  }

  @EventPattern('user.updated')
  handleUserUpdated(@Payload() raw: any, @Ctx() ctx: KafkaContext): void {
    const event = this.parseEnvelope<{ id: string }>(raw);
    if (!event) return;
    this.logger.log(`[user.updated] correlationId=${event?.correlationId} id=${event?.payload?.id}`);
    // Extend: refresh any denormalised author display name in cached blog summaries.
  }

  /**
   * @handler handleUserDeleted
   * ⚡ Critical cross-service handler.
   *
   * When user-service deletes a user and emits user.deleted:
   *   1. BlogsService.handleUserDeleted() removes all orphaned posts
   *   2. Each removed post emits its own blog.deleted event
   *   3. Those blog.deleted events are consumed by handleBlogDeleted above
   *      which then pushes to GQL subscriptions + Socket.IO
   *
   * This implements ON DELETE CASCADE semantics across service boundaries
   * via event streaming — no shared DB, no synchronous RPC.
   */
  @EventPattern('user.deleted')
  async handleUserDeleted(
    @Payload() raw: any,
    @Ctx() ctx: KafkaContext,
  ): Promise<void> {
    const event = this.parseEnvelope<{ id: string }>(raw);
    if (!event) return;
    if (this.isDuplicate(event.correlationId)) return;

    const userId = event.payload?.id;
    this.logger.warn(
      `[user.deleted] correlationId=${event.correlationId} — removing blogs for user ${userId}`,
    );

    try {
      if (userId) {
        await this.blogsService.handleUserDeleted(userId);
      }
      this.markProcessed(event.correlationId);
    } catch (err) {
      this.sendToDlq('user.deleted', raw, err, ctx);
    }
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  private parseEnvelope<T>(raw: any): KafkaEvent<T> | null {
    try {
      const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const parsed = JSON.parse(str);
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

  private isDuplicate(correlationId: string): boolean {
    if (this.processedCorrelationIds.has(correlationId)) {
      this.logger.warn(`Duplicate Kafka event skipped — correlationId=${correlationId}`);
      return true;
    }
    return false;
  }

  private markProcessed(correlationId: string): void {
    this.processedCorrelationIds.add(correlationId);
    if (this.processedCorrelationIds.size > 10_000) {
      const first = this.processedCorrelationIds.values().next().value;
      this.processedCorrelationIds.delete(first);
    }
  }

  private sendToDlq(
    topic: string,
    raw: any,
    err: unknown,
    ctx: KafkaContext,
  ): void {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.logger.error(`[DLQ] Processing failed topic=${topic} error=${errorMessage}`);

    this.dlqClient.emit('blog.events.dlq', {
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
