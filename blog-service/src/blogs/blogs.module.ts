import { Module } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { BlogsResolver } from './blogs.resolver';
import { BlogsRestController } from './blogs.rest.controller';
import { BlogsKafkaController } from './blogs.kafka.controller';

/**
 * @module BlogsModule
 * @description Feature module encapsulating all blog-domain logic.
 *
 * Providers
 * ├─ BlogsService        — business logic + in-memory store + Kafka producer
 * └─ BlogsResolver       — GraphQL queries / mutations / @ResolveReference
 *
 * Controllers
 * ├─ BlogsRestController  — REST CRUD endpoints at /blogs/* (consumed by Kong)
 * └─ BlogsKafkaController — Kafka event consumer (cross-service + self-observe)
 *
 * Exports
 * └─ BlogsService         — available to other modules if this module is imported
 */
@Module({
  providers: [BlogsService, BlogsResolver],
  controllers: [BlogsRestController, BlogsKafkaController],
  exports: [BlogsService],
})
export class BlogsModule {}
