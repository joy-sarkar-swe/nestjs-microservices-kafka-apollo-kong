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
  /**
   * Kafka producer client for publishing blog domain events.
   * `allowAutoTopicCreation` ensures topics are created on first emit
   * without requiring manual Kafka CLI setup.
   */
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

  /**
   * Injected blog persistence layer.
   * The concrete class is determined by BlogsModule providers — this service
   * never imports InMemoryBlogRepository or any DB-specific class directly.
   */
  constructor(
    @Inject('BLOG_REPOSITORY')
    private readonly repo: BlogRepository,
  ) {}

  /**
   * Connects the Kafka producer client on module initialisation.
   * NestJS guarantees this lifecycle hook runs before the first request is handled.
   *
   * @returns {Promise<void>}
   */
  async onModuleInit(): Promise<void> {
    await this.kafkaClient.connect();
  }

  // ── READ ──────────────────────────────────────────────────────────────────

  /**
   * Returns all blog posts from the repository.
   *
   * @returns {Promise<Blog[]>} All blog posts; possibly an empty array.
   */
  async findAll(): Promise<Blog[]> {
    return this.repo.findAll();
  }

  /**
   * Returns a single blog post by UUID.
   *
   * @param {string} id - UUID v4 of the target blog post.
   * @returns {Promise<Blog>} The matching Blog record.
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
   * Creates a new blog post and emits a `blog.created` Kafka event.
   *
   * Flow: build entity (with federation stub) → persist → emit → return
   *
   * The author field is set to { id: authorId } — the federation reference.
   * Apollo Router resolves the full User from user-service at query time.
   * blog-service never validates whether the user actually exists; that is
   * enforced at the application level before calling this service.
   *
   * @param {CreateBlogInput} input - Validated DTO containing title, content, and authorId.
   * @returns {Promise<Blog>} The newly created Blog with assigned UUID.
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
   * Partially updates an existing blog post and emits a `blog.updated` Kafka event.
   * Only `title` and `content` are updatable; `authorId` is immutable after creation.
   *
   * @param {UpdateBlogInput} input - Validated DTO with id plus optional title/content.
   * @returns {Promise<Blog>} The fully updated Blog record.
   * @throws {NotFoundException} 404 when no blog exists with the given id.
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
   * Deletes a blog post and emits a `blog.deleted` Kafka event.
   *
   * @param {DeleteBlogInput} input - Validated DTO containing the blog's UUID.
   * @returns {Promise<void>}
   * @throws {NotFoundException} 404 when no blog exists with the given id.
   */
  async delete(input: DeleteBlogInput): Promise<void> {
    await this.findOne(input.id); // throws 404
    await this.repo.delete(input.id);
    this.publish<{ id: string }>('blog.deleted', { id: input.id });
  }

  // ── CROSS-SERVICE ─────────────────────────────────────────────────────────

  /**
   * Removes all blog posts authored by the specified user.
   * Called by BlogsKafkaController when a `user.deleted` Kafka event arrives.
   *
   * Implements referential integrity via async events — equivalent to
   * ON DELETE CASCADE across service boundaries without a shared database.
   * Each orphaned post emits its own `blog.deleted` event so downstream
   * consumers (search index, CDN, analytics) can react accordingly.
   *
   * @param {string} userId - UUID of the user whose posts should be removed.
   * @returns {Promise<void>}
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
   * Called by Apollo Router via the `_entities` query when another subgraph
   * references a Blog by id and the client requests Blog-owned fields.
   * Returns raw Blog — no response wrapping.
   *
   * @param {{ id: string }} reference - Minimal entity reference from the Router.
   * @returns {Promise<Blog>} The fully populated Blog record.
   * @throws {NotFoundException} If the referenced blog no longer exists.
   */
  async resolveReference(reference: { id: string }): Promise<Blog> {
    return this.findOne(reference.id);
  }

  // ── KAFKA ─────────────────────────────────────────────────────────────────

  /**
   * Wraps a domain payload in a KafkaEvent envelope and emits it fire-and-forget.
   *
   * The `correlationId` is a fresh UUID per call — consumers use it for idempotency
   * and to route real-time notifications back to the correct subscriber.
   * The Kafka message key is set to the entity id to ensure consistent partition
   * routing (all events for the same entity land on the same partition, preserving order).
   *
   * @template T - The shape of the domain payload; must include an optional `id` field.
   * @param {string} topic - Kafka topic name (e.g. 'blog.created').
   * @param {T} payload - The domain object to wrap and emit.
   * @returns {void}
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
