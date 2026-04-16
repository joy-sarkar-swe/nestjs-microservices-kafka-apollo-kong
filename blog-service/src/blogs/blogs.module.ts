import { Module } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { BlogsResolver } from './blogs.resolver';
import { BlogsRestController } from './blogs.rest.controller';
import { BlogsKafkaController } from './blogs.kafka.controller';

/**
 * @module BlogsModule
 * Providers:    BlogsService, BlogsResolver
 * Controllers:  BlogsRestController (Kong), BlogsKafkaController (Kafka)
 * Exports:      BlogsService
 */
@Module({
  providers: [BlogsService, BlogsResolver],
  controllers: [BlogsRestController, BlogsKafkaController],
  exports: [BlogsService],
})
export class BlogsModule {}
