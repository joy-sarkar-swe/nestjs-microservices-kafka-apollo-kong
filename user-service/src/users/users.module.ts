import { Module } from "@nestjs/common";
import { PubSub } from "graphql-subscriptions";
import { UsersService } from "./users.service.js";
import { UsersResolver } from "./users.resolver.js";
import { UsersRestController } from "./users.rest.controller.js";
import { UsersKafkaController } from "./users.kafka.controller.js";
import { InMemoryUserRepository } from "./repositories/in-memory-user.repository.js";
import { UserEventsGateway } from "../realtime/user-events.gateway.js";

/**
 * @module UsersModule
 * @description Feature module for the user domain.
 *
 * Dependency Injection wiring
 * ────────────────────────────
 *
 * 'USER_REPOSITORY'
 *   Token that UsersService injects via @Inject('USER_REPOSITORY').
 *   Current implementation: InMemoryUserRepository.
 *   To switch to a real DB — change ONE line here:
 *     { provide: 'USER_REPOSITORY', useClass: PrismaUserRepository }
 *   UsersService, UsersResolver, and UsersRestController require ZERO changes.
 *
 * 'GQL_PUB_SUB'
 *   Singleton PubSub instance shared between:
 *     - UsersResolver (Subscription resolvers read from it)
 *     - UsersKafkaController (publishes to it after consuming Kafka events)
 *   Both must share the same instance for subscriptions to fire correctly.
 *   For multi-instance deployments, replace PubSub with RedisPubSub:
 *     npm install graphql-redis-subscriptions ioredis
 *     { provide: 'GQL_PUB_SUB', useFactory: () => new RedisPubSub(...) }
 *
 * UserEventsGateway
 *   Socket.IO WebSocket gateway for REST clients.
 *   Injected into UsersKafkaController to broadcast events.
 */
@Module({
  providers: [
    // ── Repository ────────────────────────────────────────────────────────
    {
      provide: "USER_REPOSITORY",
      useClass: InMemoryUserRepository,
    },

    // ── Pub/Sub (GraphQL subscriptions) ───────────────────────────────────
    {
      provide: "GQL_PUB_SUB",
      useFactory: () => new PubSub(),
    },

    // ── Feature providers ─────────────────────────────────────────────────
    UsersService,
    UsersResolver,

    // ── Real-time ─────────────────────────────────────────────────────────
    UserEventsGateway,
  ],
  controllers: [
    UsersRestController,
    UsersKafkaController,
  ],
  exports: [UsersService],
})
export class UsersModule {}
