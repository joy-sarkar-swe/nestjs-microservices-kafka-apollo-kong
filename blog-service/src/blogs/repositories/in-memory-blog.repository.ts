import { Injectable } from "@nestjs/common";
import { Blog } from "../entities/blog.entity.js";
import { BlogRepository } from "./blog.repository.interface.js";

/**
 * @repository InMemoryBlogRepository
 * @implements {BlogRepository}
 * @description Concrete in-memory implementation of BlogRepository.
 *
 * Storage: `Map<string, Blog>` — keyed by blog UUID.
 * State is lost on process restart (acceptable for demo/lecture).
 *
 * Upgrade path
 * ────────────
 * Create PrismaBlogRepository implementing BlogRepository, then change
 * ONE line in BlogsModule:
 *   { provide: 'BLOG_REPOSITORY', useClass: PrismaBlogRepository }
 * BlogsService requires zero changes.
 *
 * Why @Injectable()?
 * ──────────────────
 * NestJS DI manages the lifecycle. @Injectable() allows future dependencies
 * (e.g. PrismaService, TypeORM DataSource) to be injected via the constructor.
 */
@Injectable()
export class InMemoryBlogRepository implements BlogRepository {
  /**
   * In-memory store keyed by blog UUID.
   * Private — no code outside this class touches the Map directly.
   * Replaced by a real DB connection in production.
   */
  private readonly store: Map<string, Blog> = new Map();

  /**
   * Persists a new Blog record to the in-memory store.
   *
   * @param {Blog} blog - The fully constructed Blog entity (id already assigned).
   * @returns {Promise<Blog>} The stored Blog, identical to the input for in-memory storage.
   */
  async create(blog: Blog): Promise<Blog> {
    this.store.set(blog.id, blog);
    return blog;
  }

  /**
   * Retrieves a Blog by its UUID primary key.
   *
   * @param {string} id - UUID v4 of the target blog post.
   * @returns {Promise<Blog | null>} The matching Blog, or null if not found.
   */
  async findById(id: string): Promise<Blog | null> {
    return this.store.get(id) ?? null;
  }

  /**
   * Returns all stored Blog records as an array.
   *
   * @returns {Promise<Blog[]>} All blog posts; possibly an empty array.
   */
  async findAll(): Promise<Blog[]> {
    return Array.from(this.store.values());
  }

  /**
   * Returns all blog posts authored by a specific user.
   * Used by BlogsService.handleUserDeleted() for cross-service orphan cleanup
   * when a user.deleted Kafka event is received.
   *
   * @param {string} authorId - UUID of the author to filter by.
   * @returns {Promise<Blog[]>} All blog posts where `authorId` matches; possibly empty.
   */
  async findByAuthorId(authorId: string): Promise<Blog[]> {
    return Array.from(this.store.values()).filter((b) => b.authorId === authorId);
  }

  /**
   * Applies a partial update to an existing Blog record.
   * Merges only the fields present in `data`; all other fields are preserved.
   * Only `title` and `content` are accepted — `authorId` is immutable.
   *
   * @param {string} id - UUID of the Blog to update.
   * @param {Partial<Pick<Blog, 'title' | 'content'>>} data - The fields to overwrite.
   * @returns {Promise<Blog>} The fully merged, updated Blog record.
   * @throws {Error} If the id does not exist in the store (should be pre-checked by the service).
   */
  async update(id: string, data: Partial<Pick<Blog, "title" | "content">>): Promise<Blog> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(`InMemoryBlogRepository: Blog "${id}" not found during update`);
    }
    const updated: Blog = { ...existing, ...data };
    this.store.set(id, updated);
    return updated;
  }

  /**
   * Removes a Blog from the in-memory store by UUID.
   * A no-op if the id does not exist (Map.delete is safe on missing keys).
   *
   * @param {string} id - UUID of the Blog to remove.
   * @returns {Promise<void>}
   */
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
