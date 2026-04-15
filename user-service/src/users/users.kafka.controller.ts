import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, KafkaContext } from '@nestjs/microservices';

/**
 * @controller UsersKafkaController
 * @description Kafka consumer for user-domain events within user-service.
 *
 * Consumer group: user-service-group
 *
 * Why consume your own events?
 * Observability — logs and metrics for every mutation without adding code
 * to the service methods.  In production you'd hook into an APM tool here.
 *
 * Topics subscribed
 * ├─ user.created  — log + extensible side-effects (welcome email etc.)
 * ├─ user.updated  — log + extensible (cache invalidation etc.)
 * └─ user.deleted  — log + extensible (GDPR scrub, auth provider cleanup etc.)
 */
@Controller()
export class UsersKafkaController {
  private readonly logger = new Logger(UsersKafkaController.name);

  /**
   * @handler handleUserCreated
   * Processes `user.created` events emitted by UsersService.create().
   *
   * @param payload - Serialised User object.
   * @param context - Raw KafkaContext exposing topic / partition / offset.
   */
  @EventPattern('user.created')
  handleUserCreated(
    @Payload() payload: any,
    @Ctx() context: KafkaContext,
  ): void {
    const data = this.parsePayload(payload);
    this.logger.log(
      `[${context.getTopic()}:${context.getPartition()}] ` +
      `user.created — id=${data?.id}  email=${data?.email}`,
    );
    // Extend: trigger welcome email, analytics event, etc.
  }

  /**
   * @handler handleUserUpdated
   * Processes `user.updated` events emitted by UsersService.update().
   */
  @EventPattern('user.updated')
  handleUserUpdated(
    @Payload() payload: any,
    @Ctx() context: KafkaContext,
  ): void {
    const data = this.parsePayload(payload);
    this.logger.log(
      `[${context.getTopic()}] user.updated — id=${data?.id}`,
    );
    // Extend: invalidate CDN caches, sync to CRM, etc.
  }

  /**
   * @handler handleUserDeleted
   * Processes `user.deleted` events emitted by UsersService.delete().
   */
  @EventPattern('user.deleted')
  handleUserDeleted(
    @Payload() payload: any,
    @Ctx() context: KafkaContext,
  ): void {
    const data = this.parsePayload(payload);
    this.logger.warn(
      `[${context.getTopic()}] user.deleted — id=${data?.id}`,
    );
    // Extend: revoke auth tokens, trigger GDPR data-deletion pipeline, etc.
  }

  /** Safely parse the Kafka message value which may arrive as string or object. */
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
