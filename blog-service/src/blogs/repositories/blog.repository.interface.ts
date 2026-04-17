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
   * The id is assigned before calling this method.
   */
  create(blog: Blog): Promise<Blog>;

  /**
   * Find a blog post by primary key.
   * @returns Blog if found, null otherwise.
   */
  findById(id: string): Promise<Blog | null>;

  /**
   * Return all blog posts.
   */
  findAll(): Promise<Blog[]>;

  /**
   * Return all blog posts authored by a given user.
   * Used for orphan cleanup when user.deleted is received.
   */
  findByAuthorId(authorId: string): Promise<Blog[]>;

  /**
   * Apply a partial update to an existing Blog.
   * Only title and content are updatable; authorId is immutable.
   */
  update(id: string, data: Partial<Pick<Blog, 'title' | 'content'>>): Promise<Blog>;

  /**
   * Remove a blog post.
   */
  delete(id: string): Promise<void>;
}
