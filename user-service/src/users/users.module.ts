import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersResolver } from './users.resolver';
import { UsersRestController } from './users.rest.controller';
import { UsersKafkaController } from './users.kafka.controller';

/**
 * @module UsersModule
 * @description Feature module for the user domain.
 *
 * Providers
 * ├─ UsersService         — business logic + Kafka producer
 * └─ UsersResolver        — GraphQL queries / mutations / @ResolveReference
 *
 * Controllers
 * ├─ UsersRestController  — REST /users/* (Kong)
 * └─ UsersKafkaController — Kafka @EventPattern consumers
 *
 * Exports
 * └─ UsersService         — available to other modules if needed
 */
@Module({
  providers: [UsersService, UsersResolver],
  controllers: [UsersRestController, UsersKafkaController],
  exports: [UsersService],
})
export class UsersModule {}
