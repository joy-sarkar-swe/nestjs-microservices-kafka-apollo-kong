import { Module } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { BlogsService } from './blogs.service';
import { BlogsResolver } from './blogs.resolver';
import { BlogsRestController } from './blogs.rest.controller';
import { BlogsKafkaController } from './blogs.kafka.controller';
import { InMemoryBlogRepository } from './repositories/in-memory-blog.repository';
import { BlogEventsGateway } from '../realtime/blog-events.gateway';
import { UserServiceClient } from '../common/http/user-service.client';

/**
 * @module BlogsModule
 * @description Feature module for the blog domain.
 *
 * Dependency Injection wiring
 * ────────────────────────────
 *
 * 'BLOG_REPOSITORY'
 *   Token that BlogsService injects via @Inject('BLOG_REPOSITORY').
 *   Current implementation: InMemoryBlogRepository.
 *   To switch storage backend — change one line:
 *     { provide: 'BLOG_REPOSITORY', useClass: PrismaBlogRepository }
 *   BlogsService, BlogsResolver, BlogsRestController: zero changes.
 *
 * 'GQL_PUB_SUB'
 *   Singleton PubSub shared between:
 *     - BlogsResolver (Subscription resolvers read from it)
 *     - BlogsKafkaController (publishes after consuming Kafka events)
 *   Both must share the SAME instance — PubSub is in-process, not distributed.
 *   For multi-instance deployments replace with RedisPubSub.
 *
 * UserServiceClient
 *   HTTP client that blog-service uses to resolve User data for REST responses.
 *   Provides batched author resolution (GET /users?ids=...) and TTL caching.
 *   Injected into BlogsRestController (for read paths) and BlogsKafkaController
 *   (for cache eviction on user.updated / user.deleted events).
 *
 * BlogEventsGateway
 *   Socket.IO gateway for REST clients on /blogs namespace.
 *   Injected into BlogsKafkaController to broadcast after Kafka consume.
 */
@Module({
  providers: [
    // ── Repository ────────────────────────────────────────────────────────
    {
      provide: 'BLOG_REPOSITORY',
      useClass: InMemoryBlogRepository,
    },

    // ── Pub/Sub (GraphQL subscriptions) ───────────────────────────────────
    {
      provide: 'GQL_PUB_SUB',
      useFactory: () => new PubSub(),
    },

    // ── HTTP client for author resolution ─────────────────────────────────
    UserServiceClient,

    // ── Feature providers ─────────────────────────────────────────────────
    BlogsService,
    BlogsResolver,

    // ── Real-time ─────────────────────────────────────────────────────────
    BlogEventsGateway,
  ],
  controllers: [
    BlogsRestController,
    BlogsKafkaController,
  ],
  exports: [BlogsService],
})
export class BlogsModule {}
