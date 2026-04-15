import {
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Client, ClientKafka, Transport } from '@nestjs/microservices';
import { v4 as uuidv4 } from 'uuid';
import { Blog } from './entities/blog.entity';
import {
  CreateBlogInput,
  UpdateBlogInput,
  DeleteBlogInput,
} from './dto/blog.input';

/**
 * @service BlogsService
 * @description Core business logic for blog-post CRUD.
 *
 * Storage
 * -------
 * In-memory `Map<id, Blog>` — no database. State is lost on restart,
 * which is acceptable for this demo/lecture project.
 *
 * Kafka integration
 * -----------------
 * Emits domain events after every mutation.
 * Also exposes `handleUserDeleted()` which the Kafka controller calls when
 * a `user.deleted` event arrives from user-service — this removes all posts
 * authored by that user (orphan cleanup / referential integrity via events).
 *
 * Topics emitted
 * ├─ blog.created  — full Blog payload
 * ├─ blog.updated  — full Blog payload
 * └─ blog.deleted  — { id, reason? } payload
 */
@Injectable()
export class BlogsService implements OnModuleInit {
  /**
   * @property kafkaClient
   * Inline Kafka producer — emits blog domain events.
   * allowAutoTopicCreation ensures topics exist without manual setup.
   */
  @Client({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'blog-service-producer',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      producer: {
        allowAutoTopicCreation: true,
      },
    },
  })
  private kafkaClient: ClientKafka;

  /** In-memory store — keyed by blog UUID. */
  private readonly blogs: Map<string, Blog> = new Map();

  /**
   * @lifecycle onModuleInit
   * Connects the Kafka producer before the first request is handled.
   */
  async onModuleInit(): Promise<void> {
    await this.kafkaClient.connect();
  }

  // ── READ ─────────────────────────────────────────────────────────────────

  /**
   * Returns every blog post in the store.
   * @returns {Blog[]} Possibly empty array.
   */
  findAll(): Blog[] {
    return Array.from(this.blogs.values());
  }

  /**
   * Returns a single blog post by UUID.
   * @throws {NotFoundException} When the id is not found.
   */
  findOne(id: string): Blog {
    const blog = this.blogs.get(id);
    if (!blog) {
      throw new NotFoundException(`Blog "${id}" not found`);
    }
    return blog;
  }

  /**
   * Returns all blog posts authored by a given user.
   * Used internally by `handleUserDeleted` for orphan cleanup.
   */
  findByAuthor(authorId: string): Blog[] {
    return Array.from(this.blogs.values()).filter(
      (b) => b.authorId === authorId,
    );
  }

  // ── CREATE ────────────────────────────────────────────────────────────────

  /**
   * Creates a new blog post and emits `blog.created` on Kafka.
   *
   * The `author` field is set to `{ id: authorId }` — a federation reference
   * object.  Apollo Router resolves the full User from user-service at query
   * time; REST consumers just get `authorId` from the flat Blog object.
   *
   * Flow
   * 1. Build Blog record with uuid()
   * 2. Set author federation reference
   * 3. Persist to Map
   * 4. Emit blog.created
   * 5. Return record
   */
  async create(input: CreateBlogInput): Promise<Blog> {
    const blog: Blog = {
      id: uuidv4(),
      title: input.title,
      content: input.content,
      authorId: input.authorId,
      // Federation reference — Router resolves full User fields from user-service
      author: { id: input.authorId },
    };

    this.blogs.set(blog.id, blog);
    this.emit('blog.created', blog);
    return blog;
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────

  /**
   * Partially updates an existing blog post and emits `blog.updated` on Kafka.
   *
   * Only `title` and `content` are updatable — `authorId` is immutable after
   * creation (ownership cannot change without deleting and recreating).
   *
   * @throws {NotFoundException} Unknown id.
   *
   * Flow
   * 1. Resolve existing record
   * 2. Merge changed fields (undefined stays as-is)
   * 3. Persist updated record
   * 4. Emit blog.updated
   * 5. Return updated record
   */
  async update(input: UpdateBlogInput): Promise<Blog> {
    const existing = this.findOne(input.id);

    const updated: Blog = {
      ...existing,
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: input.content }),
    };

    this.blogs.set(updated.id, updated);
    this.emit('blog.updated', updated);
    return updated;
  }

  // ── DELETE ────────────────────────────────────────────────────────────────

  /**
   * Removes a blog post and emits `blog.deleted` on Kafka.
   *
   * @throws {NotFoundException} Unknown id.
   * @returns {boolean} Always `true` on success.
   */
  async delete(input: DeleteBlogInput): Promise<boolean> {
    this.findOne(input.id); // throws if missing
    this.blogs.delete(input.id);
    this.emit('blog.deleted', { id: input.id });
    return true;
  }

  // ── CROSS-SERVICE EVENT HANDLER ───────────────────────────────────────────

  /**
   * @method handleUserDeleted
   * @description Called by BlogsKafkaController when a `user.deleted` event
   *   arrives from user-service.
   *
   * Removes ALL blog posts whose `authorId` matches the deleted user.
   * This implements referential integrity via async Kafka events rather than
   * database FK constraints — a common pattern in event-driven microservices.
   *
   * Each removed post also emits its own `blog.deleted` event so downstream
   * consumers (analytics, search index, CDN cache) can react accordingly.
   *
   * @param {string} userId - UUID of the user that was deleted.
   */
  async handleUserDeleted(userId: string): Promise<void> {
    const orphaned = this.findByAuthor(userId);

    for (const blog of orphaned) {
      this.blogs.delete(blog.id);
      this.emit('blog.deleted', {
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
   * Apollo Router calls this via the `_entities` query when another subgraph
   * references a Blog by id and the client requests Blog-owned fields.
   *
   * @param {{ id: string }} reference - Partial entity from the Router.
   * @returns {Blog} Fully populated Blog record.
   */
  resolveReference(reference: { id: string }): Blog {
    return this.findOne(reference.id);
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  /**
   * Fire-and-forget Kafka emit.
   * Uses the entity id as the message key so Kafka routes all events for
   * the same entity to the same partition (ordering guarantee per entity).
   */
  private emit(topic: string, payload: object): void {
    const id = (payload as any).id ?? 'unknown';
    this.kafkaClient.emit(topic, {
      key: id,
      value: JSON.stringify(payload),
    });
  }
}
