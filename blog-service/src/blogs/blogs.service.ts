import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Client, ClientKafka, Transport } from '@nestjs/microservices';
import { v4 as uuidv4 } from 'uuid';
import { Blog } from './entities/blog.entity';
import { CreateBlogInput, UpdateBlogInput, DeleteBlogInput } from './dto/blog.input';

/**
 * @service BlogsService
 * @description Core business logic for blog-post CRUD.
 *
 * Responsibility boundary
 * ───────────────────────
 * Operates on plain Blog domain objects only.
 * Throws NestJS HTTP exceptions on failure — never constructs ApiResponse.
 * Response wrapping is the resolver's responsibility via ResponseFactory.
 *
 * Author resolution note
 * ──────────────────────
 * Blog.author is set to { id: authorId } on every blog record in the store.
 * This is the Apollo Federation reference object. The @ResolveField in the
 * resolver returns it directly — Apollo Router dispatches _entities to
 * user-service to resolve the full User. The service itself never calls
 * user-service directly; the Router orchestrates the cross-service join.
 *
 * Storage:  in-memory Map<UUID, Blog>
 * Events:   Kafka — blog.created | blog.updated | blog.deleted
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

  private readonly blogs: Map<string, Blog> = new Map();

  async onModuleInit(): Promise<void> {
    await this.kafkaClient.connect();
  }

  // ── READ ──────────────────────────────────────────────────────────────────

  findAll(): Blog[] {
    return Array.from(this.blogs.values());
  }

  findOne(id: string): Blog {
    const blog = this.blogs.get(id);
    if (!blog) {
      throw new NotFoundException(`Blog with id "${id}" was not found`);
    }
    return blog;
  }

  findByAuthor(authorId: string): Blog[] {
    return Array.from(this.blogs.values()).filter((b) => b.authorId === authorId);
  }

  // ── CREATE ────────────────────────────────────────────────────────────────

  /**
   * Creates a blog post and persists it.
   *
   * The `author` field is initialised to `{ id: authorId }` — the minimal
   * federation reference object. Every time a resolver returns this blog,
   * the @ResolveField author() re-returns { id: blog.authorId }, and Apollo
   * Router dispatches _entities to user-service for the full User object.
   * This pattern ensures author always resolves correctly for every blog,
   * regardless of how many blogs are in the list.
   */
  async create(input: CreateBlogInput): Promise<Blog> {
    const blog: Blog = {
      id: uuidv4(),
      title: input.title,
      content: input.content,
      authorId: input.authorId,
      author: { id: input.authorId }, // federation stub
    };
    this.blogs.set(blog.id, blog);
    this.publish('blog.created', blog);
    return blog;
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────

  /**
   * Partially updates title and/or content. authorId is immutable.
   * @throws {NotFoundException} 404 when id not found.
   */
  async update(input: UpdateBlogInput): Promise<Blog> {
    const existing = this.findOne(input.id);
    const updated: Blog = {
      ...existing,
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: input.content }),
    };
    this.blogs.set(updated.id, updated);
    this.publish('blog.updated', updated);
    return updated;
  }

  // ── DELETE ────────────────────────────────────────────────────────────────

  /**
   * Removes a blog post.
   * @throws {NotFoundException} 404 when id not found.
   */
  async delete(input: DeleteBlogInput): Promise<void> {
    this.findOne(input.id); // throws 404 if missing
    this.blogs.delete(input.id);
    this.publish('blog.deleted', { id: input.id });
  }

  // ── CROSS-SERVICE ─────────────────────────────────────────────────────────

  /**
   * Called by BlogsKafkaController when `user.deleted` arrives.
   * Removes all blog posts whose authorId matches the deleted user.
   * Implements referential integrity via async events (no shared DB / FK).
   * Each removed post emits its own blog.deleted event for downstream consumers.
   */
  async handleUserDeleted(userId: string): Promise<void> {
    const orphaned = this.findByAuthor(userId);
    for (const blog of orphaned) {
      this.blogs.delete(blog.id);
      this.publish('blog.deleted', { id: blog.id, reason: 'author_deleted', authorId: userId });
    }
    if (orphaned.length > 0) {
      console.log(`🗑  Removed ${orphaned.length} orphaned blog(s) for deleted user ${userId}`);
    }
  }

  // ── FEDERATION ────────────────────────────────────────────────────────────

  /**
   * Apollo Federation entity resolver for Blog.
   * Called by Apollo Router via _entities when another subgraph references
   * a Blog by id and the client requests Blog-owned fields.
   */
  resolveReference(reference: { id: string }): Blog {
    return this.findOne(reference.id);
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  private publish(topic: string, payload: object): void {
    const key = (payload as any).id ?? 'unknown';
    this.kafkaClient.emit(topic, { key, value: JSON.stringify(payload) });
  }
}
