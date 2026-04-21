import { Controller, Inject, Logger } from "@nestjs/common";
import {
  Client,
  ClientKafka,
  Ctx,
  EventPattern,
  KafkaContext,
  Payload,
  Transport,
} from "@nestjs/microservices";
import { PubSub } from "graphql-subscriptions";
import { UserServiceClient } from "../common/http/user-service.client.js";
import { KafkaEvent } from "../common/kafka/kafka-event.interface.js";
import { BlogEventsGateway } from "../realtime/blog-events.gateway.js";
import { BlogsService } from "./blogs.service.js";
import { Blog } from "./entities/blog.entity.js";

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
 * Cache invalidation
 * ───────────────────
 * When user.updated or user.deleted events arrive, this controller calls
 * UserServiceClient.evictCache(userId) to ensure the REST author cache
 * does not serve stale user data after a mutation on the user-service side.
 *
 * Topics subscribed
 * ──────────────────
 *   user.created  — cross-service: observability hook
 *   user.updated  — cross-service: observability hook + cache eviction
 *   user.deleted  — cross-service: ⚡ orphan blog cleanup + cache eviction + realtime push
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

  /**
   * In-process idempotency store — keyed by correlationId.
   * Prevents double-processing when Kafka replays messages.
   * Replace with a Redis Set for multi-instance deployments.
   */
  private readonly processedCorrelationIds = new Set<string>();

  /** DLQ producer client — forwards failed messages for inspection and replay. */
  @Client({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: "blog-service-dlq-producer",
        brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
      },
      producer: { allowAutoTopicCreation: true },
    },
  })
  private dlqClient: ClientKafka;

  constructor(
    private readonly blogsService: BlogsService,
    @Inject("GQL_PUB_SUB") private readonly pubSub: PubSub,
    private readonly gateway: BlogEventsGateway,
    private readonly userClient: UserServiceClient,
  ) {}

  // ── BLOG EVENTS (self) ────────────────────────────────────────────────────

  /**
   * Handles the `blog.created` Kafka topic.
   * Publishes to GraphQL PubSub (fires blogCreated subscription) and
   * broadcasts via Socket.IO to connected REST clients.
   *
   * @param {any} raw - Raw Kafka message payload (string or object).
   * @param {KafkaContext} ctx - Kafka execution context (topic, partition metadata).
   * @returns {Promise<void>}
   */
  @EventPattern("blog.created")
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
      await this.pubSub.publish("blogCreated", { blogCreated: event.payload });

      // Push to Socket.IO REST clients
      this.gateway.emitBlogCreated(event);

      this.markProcessed(event.correlationId);
    } catch (err) {
      this.sendToDlq("blog.created", raw, err, ctx);
    }
  }

  /**
   * Handles the `blog.updated` Kafka topic.
   * Publishes to GraphQL PubSub and broadcasts via Socket.IO.
   *
   * @param {any} raw - Raw Kafka message payload.
   * @param {KafkaContext} ctx - Kafka execution context.
   * @returns {Promise<void>}
   */
  @EventPattern("blog.updated")
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

      await this.pubSub.publish("blogUpdated", { blogUpdated: event.payload });
      this.gateway.emitBlogUpdated(event);
      this.markProcessed(event.correlationId);
    } catch (err) {
      this.sendToDlq("blog.updated", raw, err, ctx);
    }
  }

  /**
   * Handles the `blog.deleted` Kafka topic.
   * Publishes the deleted blog id to GraphQL PubSub and broadcasts via Socket.IO.
   *
   * @param {any} raw - Raw Kafka message payload containing `{ id: string }`.
   * @param {KafkaContext} ctx - Kafka execution context.
   * @returns {Promise<void>}
   */
  @EventPattern("blog.deleted")
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
        : "";
      this.logger.log(
        `[blog.deleted] correlationId=${event.correlationId} id=${event.payload?.id}${reason}`,
      );

      await this.pubSub.publish("blogDeleted", {
        blogDeleted: event.payload?.id,
      });
      this.gateway.emitBlogDeleted(event);
      this.markProcessed(event.correlationId);
    } catch (err) {
      this.sendToDlq("blog.deleted", raw, err, ctx);
    }
  }

  // ── USER EVENTS (cross-service) ───────────────────────────────────────────

  /**
   * Handles `user.created` events from user-service.
   * No cache action needed — there is nothing to evict for a brand-new user.
   * Extensible: pre-warm cache, trigger analytics, etc.
   *
   * @param {any} raw - Raw Kafka message payload.
   * @returns {void}
   */
  @EventPattern("user.created")
  handleUserCreated(@Payload() raw: any): void {
    const event = this.parseEnvelope<{ id: string }>(raw);
    if (!event) return;
    this.logger.log(
      `[user.created] correlationId=${event?.correlationId} id=${event?.payload?.id}`,
    );
    // Extend: pre-warm author name cache, analytics hook, etc.
  }

  /**
   * Handles `user.updated` events from user-service.
   * Evicts the updated user from the REST author cache so subsequent REST
   * blog requests reflect the latest user data.
   *
   * @param {any} raw - Raw Kafka message payload.
   * @returns {void}
   */
  @EventPattern("user.updated")
  handleUserUpdated(@Payload() raw: any): void {
    const event = this.parseEnvelope<{ id: string }>(raw);
    if (!event) return;
    this.logger.log(
      `[user.updated] correlationId=${event?.correlationId} id=${event?.payload?.id}`,
    );
    // Evict stale author data from the REST cache
    if (event.payload?.id) {
      this.userClient.evictCache(event.payload.id);
    }
  }

  /**
   * @handler handleUserDeleted
   * ⚡ Critical cross-service handler.
   *
   * When user-service deletes a user and emits user.deleted:
   *   1. Evicts the deleted user from the REST author cache immediately.
   *   2. BlogsService.handleUserDeleted() removes all orphaned blog posts.
   *   3. Each removed post emits its own blog.deleted event.
   *   4. Those blog.deleted events are consumed by handleBlogDeleted above,
   *      which pushes to GQL subscriptions + Socket.IO.
   *
   * This implements ON DELETE CASCADE semantics across service boundaries
   * via event streaming — no shared DB, no synchronous RPC.
   *
   * @param {any} raw - Raw Kafka message payload containing `{ id: string }`.
   * @param {KafkaContext} ctx - Kafka execution context.
   * @returns {Promise<void>}
   */
  @EventPattern("user.deleted")
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
      // Evict from REST cache — deleted user should never be served
      if (userId) {
        this.userClient.evictCache(userId);
        await this.blogsService.handleUserDeleted(userId);
      }
      this.markProcessed(event.correlationId);
    } catch (err) {
      this.sendToDlq("user.deleted", raw, err, ctx);
    }
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  /**
   * Parses and validates a raw Kafka message into a typed KafkaEvent<T> envelope.
   * Returns null (logging a warning) on malformed messages so the consumer
   * never crashes — bad messages are logged and silently discarded.
   *
   * @template T - The expected shape of the event's `payload` field.
   * @param {any} raw - Raw value received from the Kafka transport (string or object).
   * @returns {KafkaEvent<T> | null} The parsed envelope, or null if malformed.
   */
  private parseEnvelope<T>(raw: any): KafkaEvent<T> | null {
    try {
      const str = typeof raw === "string" ? raw : JSON.stringify(raw);
      const parsed = JSON.parse(str);
      if (!parsed.correlationId || !parsed.eventType || !parsed.payload) {
        this.logger.warn(
          "Received malformed KafkaEvent — missing required fields",
        );
        return null;
      }
      return parsed as KafkaEvent<T>;
    } catch {
      this.logger.warn(
        `Failed to parse Kafka message: ${String(raw).slice(0, 200)}`,
      );
      return null;
    }
  }

  /**
   * Checks whether a correlationId has already been processed.
   * Guards against duplicate deliveries from Kafka's at-least-once guarantee.
   *
   * @param {string} correlationId - UUID v4 from the KafkaEvent envelope.
   * @returns {boolean} True if already processed; false otherwise.
   */
  private isDuplicate(correlationId: string): boolean {
    if (this.processedCorrelationIds.has(correlationId)) {
      this.logger.warn(
        `Duplicate Kafka event skipped — correlationId=${correlationId}`,
      );
      return true;
    }
    return false;
  }

  /**
   * Marks a correlationId as processed, capping the set at 10 000 entries
   * by evicting the oldest entry when the limit is reached.
   *
   * @param {string} correlationId - UUID v4 to mark as processed.
   * @returns {void}
   */
  private markProcessed(correlationId: string): void {
    this.processedCorrelationIds.add(correlationId);
    if (this.processedCorrelationIds.size > 10_000) {
      const first = this.processedCorrelationIds.values().next().value;
      this.processedCorrelationIds.delete(first);
    }
  }

  /**
   * Forwards a failed Kafka message to the dead-letter topic for later inspection.
   * Preserves the original payload, error message, topic name, and partition.
   *
   * @param {string} topic - The Kafka topic on which processing failed.
   * @param {any} raw - The original raw Kafka message payload.
   * @param {unknown} err - The error that caused processing to fail.
   * @param {KafkaContext} ctx - Kafka context providing partition metadata.
   * @returns {void}
   */
  private sendToDlq(
    topic: string,
    raw: any,
    err: unknown,
    ctx: KafkaContext,
  ): void {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.logger.error(
      `[DLQ] Processing failed topic=${topic} error=${errorMessage}`,
    );

    this.dlqClient.emit("blog.events.dlq", {
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
