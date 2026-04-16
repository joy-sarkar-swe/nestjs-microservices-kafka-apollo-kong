import {
  Resolver, Query, Mutation, Args,
  ResolveReference, ResolveField, Parent,
} from '@nestjs/graphql';
import { HttpStatus } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { Blog, User } from './entities/blog.entity';
import { CreateBlogInput, UpdateBlogInput, DeleteBlogInput } from './dto/blog.input';
import { ApiResponse, ApiResponseType } from '../common/responses/api-response.union';
import { ResponseFactory } from '../common/responses/response.factory';

/**
 * @resolver BlogsResolver
 * @description GraphQL resolver for the blog-service Federation subgraph.
 *
 * All queries and mutations return the ApiResponse union.
 * Clients discriminate on __typename:
 *
 *   query {
 *     getBlog(id: "…") {
 *       __typename
 *       ... on BlogSuccessResponse {
 *         statusCode success message timestamp
 *         data {
 *           id title content authorId
 *           author { id name email }    ← resolved from user-service by Apollo Router
 *         }
 *       }
 *       ... on ErrorResponse { statusCode message errors { field message } timestamp }
 *     }
 *   }
 *
 * Author resolution — how it works per Blog object
 * ─────────────────────────────────────────────────
 * 1. Any query that returns Blog(s) triggers @ResolveField author().
 * 2. author() returns { id: blog.authorId } for EVERY blog in the set.
 * 3. Apollo Router collects all User stubs across the entire result set.
 * 4. Router sends ONE batched _entities request to user-service:
 *      { __typename: "User", id: "uuid-1" },
 *      { __typename: "User", id: "uuid-2" }, ...
 * 5. user-service resolveReference() returns full User for each id.
 * 6. Router stitches name/email/etc. into each blog's author field.
 *
 * This means resolving 100 blogs with author data costs exactly ONE
 * extra round-trip to user-service — not 100. This is Federation's
 * DataLoader-style batching, built in at the protocol level.
 *
 * @ResolveReference
 * ─────────────────
 * If another future subgraph references a Blog by id, Apollo Router
 * sends _entities here. Returns raw Blog (not ApiResponse) — internal call.
 */
@Resolver(() => Blog)
export class BlogsResolver {
  constructor(private readonly blogsService: BlogsService) {}

  // ── QUERIES ───────────────────────────────────────────────────────────────

  /**
   * @query getBlogs
   * Returns all blog posts. Author fields resolved per-blog by the Router
   * when the client includes `data { author { … } }` in the query.
   *
   * @example
   *   query {
   *     getBlogs {
   *       __typename
   *       ... on BlogsSuccessResponse {
   *         statusCode success message timestamp
   *         data { id title content authorId author { id name email } }
   *       }
   *       ... on ErrorResponse { statusCode message timestamp }
   *     }
   *   }
   */
  @Query(() => ApiResponse, {
    name: 'getBlogs',
    description: 'Fetch all blog posts. Returns BlogsSuccessResponse or ErrorResponse.',
  })
  async getBlogs(): Promise<ApiResponseType> {
    try {
      const blogs = this.blogsService.findAll();
      return ResponseFactory.blogs(blogs, 'Blog posts retrieved successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * @query getBlog
   * Returns a single blog post by UUID.
   *
   * @example
   *   query {
   *     getBlog(id: "some-uuid") {
   *       __typename
   *       ... on BlogSuccessResponse {
   *         statusCode success message timestamp
   *         data { id title content authorId author { id name email } }
   *       }
   *       ... on ErrorResponse { statusCode message timestamp }
   *     }
   *   }
   */
  @Query(() => ApiResponse, {
    name: 'getBlog',
    description: 'Fetch one blog post by UUID. Returns BlogSuccessResponse or ErrorResponse.',
  })
  async getBlog(@Args('id', { type: () => String }) id: string): Promise<ApiResponseType> {
    try {
      const blog = this.blogsService.findOne(id);
      return ResponseFactory.blog(blog, 'Blog post retrieved successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  // ── FIELD RESOLVER ────────────────────────────────────────────────────────

  /**
   * @resolveField author
   * Returns the federation User reference for each Blog's author.
   *
   * This method is called ONCE PER BLOG in the result set.
   * Returning { id } is the federation contract — the Apollo Router
   * uses this id to batch-resolve full User fields from user-service
   * in a single _entities round-trip regardless of result set size.
   *
   * Why NOT call user-service directly from here?
   * ─────────────────────────────────────────────
   * • Direct HTTP calls would bypass federation batching → N+1 problem
   * • Tight coupling between services → defeats the purpose of federation
   * • The Router's _entities batching gives us automatic DataLoader behaviour
   *
   * @param blog - The parent Blog being resolved.
   * @returns    - Minimal { id } User reference; Router fills in the rest.
   */
  @ResolveField(() => User, {
    description: 'Author resolved from user-service via Apollo Federation _entities',
  })
  author(@Parent() blog: Blog): User {
    // Return only the federation @key — Apollo Router resolves full User fields
    return { id: blog.authorId };
  }

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  /**
   * @mutation createBlog
   * Creates a blog post. Returns BlogSuccessResponse (201) or ErrorResponse.
   *
   * Possible outcomes:
   *   BlogSuccessResponse (201) — blog created
   *   ErrorResponse (400)       — validation failed (caught by GqlValidationFilter)
   *   ErrorResponse (500)       — unexpected error
   *
   * @example
   *   mutation {
   *     createBlog(input: {
   *       title: "My First Post"
   *       content: "Hello from blog-service!"
   *       authorId: "USER-UUID"
   *     }) {
   *       __typename
   *       ... on BlogSuccessResponse {
   *         statusCode message timestamp
   *         data { id title content authorId author { id name email } }
   *       }
   *       ... on ErrorResponse { statusCode message errors { field message } timestamp }
   *     }
   *   }
   */
  @Mutation(() => ApiResponse, {
    description: 'Create a new blog post. Emits blog.created Kafka event on success.',
  })
  async createBlog(@Args('input') input: CreateBlogInput): Promise<ApiResponseType> {
    try {
      const blog = await this.blogsService.create(input);
      return ResponseFactory.blog(blog, 'Blog post created successfully', HttpStatus.CREATED);
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * @mutation updateBlog
   * Partially updates a blog post. Returns BlogSuccessResponse or ErrorResponse.
   *
   * @example
   *   mutation {
   *     updateBlog(input: { id: "some-uuid", title: "Updated Title" }) {
   *       __typename
   *       ... on BlogSuccessResponse { statusCode message data { id title content } timestamp }
   *       ... on ErrorResponse { statusCode message errors { field message } timestamp }
   *     }
   *   }
   */
  @Mutation(() => ApiResponse, {
    description: 'Partially update a blog post. Emits blog.updated Kafka event.',
  })
  async updateBlog(@Args('input') input: UpdateBlogInput): Promise<ApiResponseType> {
    try {
      const blog = await this.blogsService.update(input);
      return ResponseFactory.blog(blog, 'Blog post updated successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * @mutation deleteBlog
   * Deletes a blog post. Returns BaseResponse or ErrorResponse.
   * Emits blog.deleted Kafka event.
   *
   * @example
   *   mutation {
   *     deleteBlog(input: { id: "some-uuid" }) {
   *       __typename
   *       ... on BaseResponse  { statusCode success message timestamp }
   *       ... on ErrorResponse { statusCode message timestamp }
   *     }
   *   }
   */
  @Mutation(() => ApiResponse, {
    description: 'Delete a blog post. Emits blog.deleted Kafka event.',
  })
  async deleteBlog(@Args('input') input: DeleteBlogInput): Promise<ApiResponseType> {
    try {
      await this.blogsService.delete(input);
      return ResponseFactory.deleted('Blog post deleted successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  // ── FEDERATION ────────────────────────────────────────────────────────────

  /**
   * @resolveReference
   * Apollo Router entity resolution for Blog.
   * Returns raw Blog (not ApiResponse) — this is a Router-internal call.
   */
  @ResolveReference()
  resolveReference(reference: { __typename: string; id: string }): Blog {
    return this.blogsService.resolveReference(reference);
  }
}
