import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, KafkaContext } from '@nestjs/microservices';

/**
 * @controller UsersKafkaController
 * @description Kafka consumer for user-domain events within user-service.
 *
 * Consumer group: user-service-group
 *
 * Topics subscribed
 * ├─ user.created  — log + extensible (welcome email, analytics, etc.)
 * ├─ user.updated  — log + extensible (cache invalidation, CRM sync, etc.)
 * └─ user.deleted  — log + extensible (auth token revocation, GDPR scrub, etc.)
 */
@Controller()
export class UsersKafkaController {
  private readonly logger = new Logger(UsersKafkaController.name);

  @EventPattern('user.created')
  handleUserCreated(@Payload() payload: any, @Ctx() context: KafkaContext): void {
    const data = this.parse(payload);
    this.logger.log(`[${context.getTopic()}:${context.getPartition()}] user.created — id=${data?.id} email=${data?.email}`);
  }

  @EventPattern('user.updated')
  handleUserUpdated(@Payload() payload: any, @Ctx() context: KafkaContext): void {
    const data = this.parse(payload);
    this.logger.log(`[${context.getTopic()}] user.updated — id=${data?.id}`);
  }

  @EventPattern('user.deleted')
  handleUserDeleted(@Payload() payload: any, @Ctx() context: KafkaContext): void {
    const data = this.parse(payload);
    this.logger.warn(`[${context.getTopic()}] user.deleted — id=${data?.id}`);
  }

  private parse(payload: any): any {
    if (typeof payload === 'string') {
      try { return JSON.parse(payload); } catch { return { raw: payload }; }
    }
    return payload;
  }
}
