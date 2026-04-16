import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, KafkaContext } from '@nestjs/microservices';
import { BlogsService } from './blogs.service';

/**
 * @controller BlogsKafkaController
 * @description Kafka consumer for blog-service.
 *
 * Consumer group: blog-service-group
 * Each group gets its own independent copy of every message,
 * so user-service and blog-service both consume user.* events independently.
 *
 * Topics subscribed
 * ├─ user.created  — cross-service: observability
 * ├─ user.updated  — cross-service: observability / denorm cache
 * ├─ user.deleted  — cross-service: ⚡ orphan blog cleanup
 * ├─ blog.created  — self: observability / search index hook
 * ├─ blog.updated  — self: observability / CDN purge hook
 * └─ blog.deleted  — self: observability / cleanup hook
 */
@Controller()
export class BlogsKafkaController {
  private readonly logger = new Logger(BlogsKafkaController.name);

  constructor(private readonly blogsService: BlogsService) {}

  // ── USER EVENTS (cross-service) ───────────────────────────────────────────

  @EventPattern('user.created')
  handleUserCreated(@Payload() payload: any, @Ctx() context: KafkaContext): void {
    const data = this.parse(payload);
    this.logger.log(`[${context.getTopic()}] user.created — id=${data?.id}`);
  }

  @EventPattern('user.updated')
  handleUserUpdated(@Payload() payload: any, @Ctx() context: KafkaContext): void {
    const data = this.parse(payload);
    this.logger.log(`[${context.getTopic()}] user.updated — id=${data?.id}`);
  }

  /**
   * @handler handleUserDeleted
   * ⚡ Critical cross-service handler.
   *
   * When user-service deletes a user, it emits user.deleted.
   * This handler delegates to BlogsService.handleUserDeleted() which:
   *   1. Finds all blogs where authorId === deletedUserId
   *   2. Removes them from the in-memory store
   *   3. Emits blog.deleted for each removed post
   *
   * This is microservice-native referential integrity via event streaming —
   * equivalent to a database ON DELETE CASCADE foreign key, but async and
   * decoupled across service boundaries.
   */
  @EventPattern('user.deleted')
  async handleUserDeleted(@Payload() payload: any, @Ctx() context: KafkaContext): Promise<void> {
    const data = this.parse(payload);
    const userId = data?.id;
    this.logger.warn(`[${context.getTopic()}] user.deleted — removing blogs for user ${userId}`);
    if (userId) {
      await this.blogsService.handleUserDeleted(userId);
    }
  }

  // ── BLOG EVENTS (self — observability) ────────────────────────────────────

  @EventPattern('blog.created')
  handleBlogCreated(@Payload() payload: any, @Ctx() context: KafkaContext): void {
    const data = this.parse(payload);
    this.logger.log(`[${context.getTopic()}] blog.created — id=${data?.id} title="${data?.title}"`);
    // Extend: update search index, push to real-time feed, etc.
  }

  @EventPattern('blog.updated')
  handleBlogUpdated(@Payload() payload: any, @Ctx() context: KafkaContext): void {
    const data = this.parse(payload);
    this.logger.log(`[${context.getTopic()}] blog.updated — id=${data?.id}`);
    // Extend: update search index entry, clear CDN cache, etc.
  }

  @EventPattern('blog.deleted')
  handleBlogDeleted(@Payload() payload: any, @Ctx() context: KafkaContext): void {
    const data = this.parse(payload);
    const reason = data?.reason ? ` (reason: ${data.reason})` : '';
    this.logger.log(`[${context.getTopic()}] blog.deleted — id=${data?.id}${reason}`);
    // Extend: remove from search index, purge CDN, notify subscribers, etc.
  }

  private parse(payload: any): any {
    if (typeof payload === 'string') {
      try { return JSON.parse(payload); } catch { return { raw: payload }; }
    }
    return payload;
  }
}
