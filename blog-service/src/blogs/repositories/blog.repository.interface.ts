import { Blog } from '../entities/blog.entity';

/**
 * @interface BlogRepository
 * @description Persistence contract for blog post storage.
 *
 * BlogsService depends ONLY on this interface. Swapping the backend
 * (InMemory → Prisma → Mongoose) is a single-line change in BlogsModule.
 *
 * Injection token: 'BLOG_REPOSITORY'
 *
 * Current implementations
 * ───────────────────────
 *   InMemoryBlogRepository  — Map<string, Blog>  (this project)
 *   PrismaBlogRepository    — Prisma ORM          (add when ready)
 *   TypeOrmBlogRepository   — TypeORM             (add when ready)
 *   MongooseBlogRepository  — Mongoose            (add when ready)
 */
export interface BlogRepository {
  /**
   * Persist a new Blog record.
   * The `id` field is already assigned before this method is called.
   *
   * @param {Blog} blog - The fully constructed Blog entity to store.
   * @returns {Promise<Blog>} The stored Blog (may differ from input if DB sets defaults).
   */
  create(blog: Blog): Promise<Blog>;

  /**
   * Find a blog post by its UUID primary key.
   *
   * @param {string} id - UUID v4 of the target blog post.
   * @returns {Promise<Blog | null>} The matching Blog, or null if not found.
   */
  findById(id: string): Promise<Blog | null>;

  /**
   * Return all stored blog posts.
   *
   * @returns {Promise<Blog[]>} Possibly empty array of all Blog records.
   */
  findAll(): Promise<Blog[]>;

  /**
   * Return all blog posts authored by a given user.
   * Called during orphan cleanup when a `user.deleted` Kafka event is received.
   *
   * @param {string} authorId - UUID of the author whose posts should be returned.
   * @returns {Promise<Blog[]>} All Blog records whose `authorId` matches; possibly empty.
   */
  findByAuthorId(authorId: string): Promise<Blog[]>;

  /**
   * Apply a partial update to an existing Blog record.
   * Only `title` and `content` are updatable; `authorId` is immutable after creation.
   *
   * @param {string} id - UUID of the Blog to update.
   * @param {Partial<Pick<Blog, 'title' | 'content'>>} data - The fields to overwrite.
   * @returns {Promise<Blog>} The fully updated Blog record.
   */
  update(id: string, data: Partial<Pick<Blog, 'title' | 'content'>>): Promise<Blog>;

  /**
   * Remove a blog post from the store.
   *
   * @param {string} id - UUID of the Blog to delete.
   * @returns {Promise<void>}
   */
  delete(id: string): Promise<void>;
}
