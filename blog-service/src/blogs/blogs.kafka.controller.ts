import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, KafkaContext } from '@nestjs/microservices';
import { BlogsService } from './blogs.service';

/**
 * @controller BlogsKafkaController
 * @description Kafka consumer for the blog-service.
 *
 * Consumer group: blog-service-group
 *
 * Each Kafka consumer group gets its own copy of every message.
 * Both user-service and blog-service can subscribe to `user.created` and
 * each receives the message independently — no competition between groups.
 *
 * Topics subscribed
 * ├─ user.created  — cross-service: log for observability
 * ├─ user.updated  — cross-service: log (extend for denorm cache update)
 * ├─ user.deleted  — cross-service: ⚡ triggers orphan blog cleanup
 * ├─ blog.created  — self: observability / analytics hook
 * ├─ blog.updated  — self: observability / search-index update hook
 * └─ blog.deleted  — self: observability / CDN purge hook
 */
@Controller()
export class BlogsKafkaController {
  private readonly logger = new Logger(BlogsKafkaController.name);

  constructor(private readonly blogsService: BlogsService) {}

  // ── USER EVENTS (cross-service) ───────────────────────────────────────────

  /**
   * @handler handleUserCreated
   * Receives `user.created` from user-service.
   * Logs for observability; extend to pre-warm caches or update denorm data.
   */
  @EventPattern('user.created')
  handleUserCreated(
    @Payload() payload: any,
    @Ctx() context: KafkaContext,
  ): void {
    const data = this.parsePayload(payload);
    this.logger.log(
      `[${context.getTopic()}] user.created received — id=${data?.id}`,
    );
    // Extend: pre-warm author name cache, notify analytics, etc.
  }

  /**
   * @handler handleUserUpdated
   * Receives `user.updated` from user-service.
   * In production: update any denormalised author name stored on cached blog objects.
   */
  @EventPattern('user.updated')
  handleUserUpdated(
    @Payload() payload: any,
    @Ctx() context: KafkaContext,
  ): void {
    const data = this.parsePayload(payload);
    this.logger.log(
      `[${context.getTopic()}] user.updated received — id=${data?.id}`,
    );
    // Extend: refresh author display name on cached blog summaries, etc.
  }

  /**
   * @handler handleUserDeleted
   * Receives `user.deleted` from user-service.
   *
   * ⚡ This is the critical cross-service handler.
   * Delegates to BlogsService.handleUserDeleted() which:
   *   1. Finds all Blog posts where authorId === deleted userId
   *   2. Removes them from the in-memory store
   *   3. Emits a `blog.deleted` event for each removed post
   *
   * This implements referential integrity via async events — the microservice
   * equivalent of a database ON DELETE CASCADE foreign key constraint.
   *
   * @param payload - Expected shape: { id: string } or stringified JSON of same.
   */
  @EventPattern('user.deleted')
  async handleUserDeleted(
    @Payload() payload: any,
    @Ctx() context: KafkaContext,
  ): Promise<void> {
    const data = this.parsePayload(payload);
    const userId = data?.id;

    this.logger.warn(
      `[${context.getTopic()}] user.deleted received — removing blogs for user ${userId}`,
    );

    if (userId) {
      await this.blogsService.handleUserDeleted(userId);
    }
  }

  // ── BLOG EVENTS (self — observability) ────────────────────────────────────

  /**
   * @handler handleBlogCreated
   * Observes own `blog.created` events.
   * Extend: index in Elasticsearch, push to real-time feed, etc.
   */
  @EventPattern('blog.created')
  handleBlogCreated(
    @Payload() payload: any,
    @Ctx() context: KafkaContext,
  ): void {
    const data = this.parsePayload(payload);
    this.logger.log(
      `[${context.getTopic()}] blog.created — id=${data?.id}  title="${data?.title}"`,
    );
  }

  /**
   * @handler handleBlogUpdated
   * Observes own `blog.updated` events.
   * Extend: update search index entry, clear CDN cache, etc.
   */
  @EventPattern('blog.updated')
  handleBlogUpdated(
    @Payload() payload: any,
    @Ctx() context: KafkaContext,
  ): void {
    const data = this.parsePayload(payload);
    this.logger.log(
      `[${context.getTopic()}] blog.updated — id=${data?.id}`,
    );
  }

  /**
   * @handler handleBlogDeleted
   * Observes own `blog.deleted` events (including orphan-cleanup ones).
   * Extend: remove from search index, purge CDN, trigger notification, etc.
   */
  @EventPattern('blog.deleted')
  handleBlogDeleted(
    @Payload() payload: any,
    @Ctx() context: KafkaContext,
  ): void {
    const data = this.parsePayload(payload);
    const reason = data?.reason ? ` (reason: ${data.reason})` : '';
    this.logger.log(
      `[${context.getTopic()}] blog.deleted — id=${data?.id}${reason}`,
    );
  }

  /** Safely parse Kafka message value (may arrive as string or object). */
  private parsePayload(payload: any): any {
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return { raw: payload };
      }
    }
    return payload;
  }
}
