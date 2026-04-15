import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersResolver } from './users.resolver';
import { UsersRestController } from './users.rest.controller';
import { UsersKafkaController } from './users.kafka.controller';

/**
 * @module UsersModule
 * @description Feature module encapsulating all user-domain logic.
 *
 * Providers
 * ├─ UsersService          — business logic + Kafka producer
 * └─ UsersResolver         — GraphQL queries / mutations / @ResolveReference
 *
 * Controllers
 * ├─ UsersRestController   — REST CRUD endpoints (for Kong)
 * └─ UsersKafkaController  — Kafka event consumer (for observability)
 *
 * Exports
 * └─ UsersService          — available to other modules if this module is imported
 */
@Module({
  providers: [UsersService, UsersResolver],
  controllers: [UsersRestController, UsersKafkaController],
  exports: [UsersService],
})
export class UsersModule {}
