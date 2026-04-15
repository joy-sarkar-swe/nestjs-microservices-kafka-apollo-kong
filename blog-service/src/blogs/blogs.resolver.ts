import {
  Resolver,
  Query,
  Mutation,
  Args,
  ResolveReference,
  ResolveField,
  Parent,
} from '@nestjs/graphql';
import { BlogsService } from './blogs.service';
import { Blog, User } from './entities/blog.entity';
import {
  CreateBlogInput,
  UpdateBlogInput,
  DeleteBlogInput,
} from './dto/blog.input';

/**
 * @resolver BlogsResolver
 * @description GraphQL resolver for the blog-service Federation subgraph.
 *
 * Key design decisions
 * ────────────────────
 * 1. `author` @ResolveField returns `{ id: blog.authorId }` — a minimal User
 *    reference.  Apollo Router sees User's @key(fields: "id"), sends an
 *    `_entities` batch query to user-service, and stitches the full User
 *    object back into the response.  No direct HTTP call from blog-service
 *    to user-service — the Router orchestrates everything.
 *
 * 2. `getBlogWithAuthor` is a named query alias for `getBlog` — it exists to
 *    make the cross-service federation demo more explicit in the playground.
 *    The actual cross-service join happens at the field level (author field),
 *    not at the query level.
 *
 * 3. @ResolveReference handles the reverse direction: if any future subgraph
 *    references a Blog by id, the Router can resolve full Blog fields here.
 */
@Resolver(() => Blog)
export class BlogsResolver {
  constructor(private readonly blogsService: BlogsService) {}

  // ── QUERIES ───────────────────────────────────────────────────────────────

  /**
   * @query getBlogs
   * Returns all blog posts (no author fields resolved unless requested).
   *
   * @example
   *   query { getBlogs { id title content authorId } }
   */
  @Query(() => [Blog], { name: 'getBlogs', description: 'Fetch all blog posts' })
  getBlogs(): Blog[] {
    return this.blogsService.findAll();
  }

  /**
   * @query getBlog
   * Returns a single blog post by UUID.
   *
   * @example
   *   query { getBlog(id: "…") { id title content authorId } }
   */
  @Query(() => Blog, { name: 'getBlog', description: 'Fetch one blog post by id' })
  getBlog(@Args('id') id: string): Blog {
    return this.blogsService.findOne(id);
  }

  /**
   * @query getBlogWithAuthor
   * Fetches a blog post AND triggers cross-service author resolution.
   * When the client requests `author { id name email }`, Apollo Router
   * automatically sends an _entities request to user-service.
   *
   * This query is identical to getBlog internally — the cross-service join
   * is driven entirely by which fields the client requests, not by the query name.
   * Named separately to make the federation demo explicit.
   *
   * @example
   *   query {
   *     getBlogWithAuthor(id: "…") {
   *       id title content
   *       author { id name email }
   *     }
   *   }
   */
  @Query(() => Blog, {
    name: 'getBlogWithAuthor',
    description: 'Fetch a blog post; request author { … } for cross-service resolution',
  })
  getBlogWithAuthor(@Args('id') id: string): Blog {
    return this.blogsService.findOne(id);
  }

  // ── FIELD RESOLVER ────────────────────────────────────────────────────────

  /**
   * @resolveField author
   * Returns a federation User reference `{ id }`.
   *
   * Why only return `{ id }` and not the full user?
   * ─────────────────────────────────────────────────
   * blog-service does NOT have access to user data — it only stores `authorId`.
   * Returning `{ id }` is the Federation contract: the Router recognises the
   * User @key, dispatches `_entities` to user-service, and merges the result.
   * This is the core value proposition of Apollo Federation.
   *
   * @param {Blog} blog - The parent Blog being resolved.
   * @returns {User} Minimal User reference — Router fills in the rest.
   */
  @ResolveField(() => User)
  author(@Parent() blog: Blog): User {
    return { id: blog.authorId };
  }

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  /**
   * @mutation createBlog
   * Creates a blog post linked to an existing user via authorId.
   * Emits `blog.created` Kafka event.
   *
   * @example
   *   mutation {
   *     createBlog(input: {
   *       title: "My First Post"
   *       content: "Hello, Federation!"
   *       authorId: "USER-UUID"
   *     }) { id title content authorId }
   *   }
   */
  @Mutation(() => Blog, { description: 'Create a new blog post' })
  createBlog(@Args('input') input: CreateBlogInput): Promise<Blog> {
    return this.blogsService.create(input);
  }

  /**
   * @mutation updateBlog
   * Partially updates title and/or content of an existing blog post.
   * Emits `blog.updated` Kafka event.
   *
   * @example
   *   mutation {
   *     updateBlog(input: { id: "…", title: "Updated Title" }) {
   *       id title content
   *     }
   *   }
   */
  @Mutation(() => Blog, { description: 'Update an existing blog post' })
  updateBlog(@Args('input') input: UpdateBlogInput): Promise<Blog> {
    return this.blogsService.update(input);
  }

  /**
   * @mutation deleteBlog
   * Removes a blog post. Emits `blog.deleted` Kafka event.
   *
   * @example
   *   mutation { deleteBlog(input: { id: "…" }) }
   */
  @Mutation(() => Boolean, { description: 'Delete a blog post' })
  deleteBlog(@Args('input') input: DeleteBlogInput): Promise<boolean> {
    return this.blogsService.delete(input);
  }

  // ── FEDERATION ────────────────────────────────────────────────────────────

  /**
   * @resolveReference
   * Apollo Router entity-resolution entry point for Blog.
   * If any future subgraph references a Blog by id, the Router sends an
   * `_entities` request here to resolve the full Blog record.
   */
  @ResolveReference()
  resolveReference(reference: { __typename: string; id: string }): Blog {
    return this.blogsService.resolveReference(reference);
  }
}
