import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  Inject,
} from '@nestjs/common';
import { Client, ClientKafka, Transport } from '@nestjs/microservices';
import { v4 as uuidv4 } from 'uuid';
import { Blog } from './entities/blog.entity';
import { CreateBlogInput, UpdateBlogInput, DeleteBlogInput } from './dto/blog.input';
import { BlogRepository } from './repositories/blog.repository.interface';
import { KafkaEvent } from '../common/kafka/kafka-event.interface';

/**
 * @service BlogsService
 * @description Orchestrates blog-post CRUD operations.
 *
 * Dependency Inversion
 * ─────────────────────
 * Depends on the BlogRepository INTERFACE only — no Map, Prisma, or ORM
 * imports anywhere in this file. Swapping storage is one line in BlogsModule.
 *
 * Responsibility boundary
 * ─────────────────────────
 * 1. Validate business rules (existence, immutable fields)
 * 2. Build the federation author stub { id: authorId } on creation
 * 3. Delegate storage to BlogRepository
 * 4. Publish typed KafkaEvent<T> envelopes after every mutation
 * 5. Return plain Blog objects — response wrapping is the resolver's job
 *
 * Author federation note
 * ──────────────────────
 * Blog.author is always set to { id: authorId } — a minimal federation stub.
 * The @ResolveField author() in the resolver returns this stub for every blog,
 * Apollo Router batches all stubs into one _entities request to user-service,
 * and the full User is stitched in. This service never calls user-service.
 *
 * Kafka events emitted
 * ─────────────────────
 *   blog.created  — KafkaEvent<Blog>
 *   blog.updated  — KafkaEvent<Blog>
 *   blog.deleted  — KafkaEvent<{ id: string }>
 *   blog.deleted  — KafkaEvent<{ id, reason, authorId }> (orphan cleanup)
 */
@Injectable()
export class BlogsService implements OnModuleInit {
  @Client({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'blog-service-producer',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      producer: { allowAutoTopicCreation: true },
    },
  })
  private kafkaClient: ClientKafka;

  constructor(
    @Inject('BLOG_REPOSITORY')
    private readonly repo: BlogRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaClient.connect();
  }

  // ── READ ──────────────────────────────────────────────────────────────────

  async findAll(): Promise<Blog[]> {
    return this.repo.findAll();
  }

  /**
   * @throws {NotFoundException} 404 when no blog exists with the given id.
   */
  async findOne(id: string): Promise<Blog> {
    const blog = await this.repo.findById(id);
    if (!blog) {
      throw new NotFoundException(`Blog with id "${id}" was not found`);
    }
    return blog;
  }

  // ── CREATE ────────────────────────────────────────────────────────────────

  /**
   * Flow: build entity (with federation stub) → persist → emit → return
   *
   * The author field is set to { id: authorId } — the federation reference.
   * Apollo Router resolves the full User from user-service at query time.
   * blog-service never validates whether the user actually exists; that is
   * enforced at the application level before calling this service.
   */
  async create(input: CreateBlogInput): Promise<Blog> {
    const blog: Blog = {
      id: uuidv4(),
      title: input.title,
      content: input.content,
      authorId: input.authorId,
      author: { id: input.authorId }, // Apollo Federation stub
    };

    const saved = await this.repo.create(blog);
    this.publish<Blog>('blog.created', saved);
    return saved;
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────

  /**
   * Only title and content are updatable. authorId is immutable after creation.
   * @throws {NotFoundException} 404 when id not found.
   */
  async update(input: UpdateBlogInput): Promise<Blog> {
    await this.findOne(input.id); // throws 404

    const patch: Partial<Pick<Blog, 'title' | 'content'>> = {};
    if (input.title   !== undefined) patch.title   = input.title;
    if (input.content !== undefined) patch.content = input.content;

    const updated = await this.repo.update(input.id, patch);
    this.publish<Blog>('blog.updated', updated);
    return updated;
  }

  // ── DELETE ────────────────────────────────────────────────────────────────

  /**
   * @throws {NotFoundException} 404 when id not found.
   */
  async delete(input: DeleteBlogInput): Promise<void> {
    await this.findOne(input.id); // throws 404
    await this.repo.delete(input.id);
    this.publish<{ id: string }>('blog.deleted', { id: input.id });
  }

  // ── CROSS-SERVICE ─────────────────────────────────────────────────────────

  /**
   * Called by BlogsKafkaController when a user.deleted event arrives.
   * Implements referential integrity via async events — equivalent to
   * ON DELETE CASCADE across service boundaries.
   *
   * Each orphaned post emits its own blog.deleted event so downstream
   * consumers (search index, CDN, analytics) can react.
   */
  async handleUserDeleted(userId: string): Promise<void> {
    const orphaned = await this.repo.findByAuthorId(userId);

    for (const blog of orphaned) {
      await this.repo.delete(blog.id);
      this.publish('blog.deleted', {
        id: blog.id,
        reason: 'author_deleted',
        authorId: userId,
      });
    }

    if (orphaned.length > 0) {
      console.log(
        `🗑  Removed ${orphaned.length} orphaned blog(s) for deleted user ${userId}`,
      );
    }
  }

  // ── FEDERATION ────────────────────────────────────────────────────────────

  /**
   * Apollo Federation entity resolver for Blog.
   * Returns raw Blog — no response wrapping.
   */
  async resolveReference(reference: { id: string }): Promise<Blog> {
    return this.findOne(reference.id);
  }

  // ── KAFKA ─────────────────────────────────────────────────────────────────

  /**
   * Wraps payload in KafkaEvent envelope and emits fire-and-forget.
   * correlationId is a fresh UUID per call — consumers use it for idempotency
   * and to route real-time notifications back to the right subscriber.
   */
  private publish<T extends { id?: string }>(topic: string, payload: T): void {
    const event: KafkaEvent<T> = {
      correlationId: uuidv4(),
      eventType:     topic,
      version:       1,
      timestamp:     new Date().toISOString(),
      payload,
    };

    this.kafkaClient.emit(topic, {
      key:   (payload as any).id ?? 'unknown',
      value: JSON.stringify(event),
    });
  }
}
