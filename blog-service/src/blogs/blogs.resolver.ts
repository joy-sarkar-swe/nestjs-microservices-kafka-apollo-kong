import {
  Resolver, Query, Mutation, Args,
  ResolveReference, ResolveField, Parent,
} from '@nestjs/graphql';
import { HttpStatus } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { Blog, User } from './entities/blog.entity';
import {
  CreateBlogInput,
  UpdateBlogInput,
  DeleteBlogInput,
  GetBlogArgs,
} from './dto/blog.input';
import {
  BlogResponse,
  BlogsResponse,
  BaseApiResponse,
  BlogResponseType,
  BlogsResponseType,
  BaseApiResponseType,
} from '../common/responses/api-response.union';
import { ResponseFactory } from '../common/responses/response.factory';

/**
 * @resolver BlogsResolver
 * @description GraphQL resolver for the blog-service Federation subgraph.
 *
 * Specialized response unions are used to ensure precise GraphQL outcomes:
 * - BlogResponse: Returns BlogSuccessResponse or ErrorResponse
 * - BlogsResponse: Returns BlogsSuccessResponse or ErrorResponse
 * - BaseApiResponse: Returns BaseResponse or ErrorResponse
 *
 * Author resolution — how it works per Blog object
 * ─────────────────────────────────────────────────
 * 1. Any query that returns Blog(s) triggers @ResolveField author().
 * 2. author() returns { id: blog.authorId } for EVERY blog in the set.
 * 3. Apollo Router collects all User stubs across the entire result set.
 * 4. Router sends ONE batched _entities request to user-service.
 * 5. user-service resolveReference() returns full User for each id.
 * 6. Router stitches name/email/etc. into each blog's author field.
 */
@Resolver(() => Blog)
export class BlogsResolver {
  constructor(private readonly blogsService: BlogsService) {}

  // ── QUERIES ───────────────────────────────────────────────────────────────

  /**
   * @query getBlogs
   * Returns all blog posts wrapped in BlogsSuccessResponse or ErrorResponse.
   */
  @Query(() => BlogsResponse, {
    name: 'getBlogs',
    description: 'Fetch all blog posts. Returns BlogsSuccessResponse or ErrorResponse.',
  })
  async getBlogs(): Promise<BlogsResponseType> {
    try {
      const blogs = this.blogsService.findAll();
      return ResponseFactory.blogs(blogs, 'Blog posts retrieved successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * @query getBlog
   * Returns a single blog post wrapped in BlogSuccessResponse or ErrorResponse.
   */
  @Query(() => BlogResponse, {
    name: 'getBlog',
    description: 'Fetch one blog post by UUID. Returns BlogSuccessResponse or ErrorResponse.',
  })
  async getBlog(@Args('input') input: GetBlogArgs): Promise<BlogResponseType> {
    try {
      const blog = this.blogsService.findOne(input.id);
      return ResponseFactory.blog(blog, 'Blog post retrieved successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  // ── FIELD RESOLVER ────────────────────────────────────────────────────────

  /**
   * @resolveField author
   * Returns the federation User reference for each Blog's author.
   */
  @ResolveField(() => User, {
    description: 'Author resolved from user-service via Apollo Federation _entities',
  })
  author(@Parent() blog: Blog): User {
    return { id: blog.authorId };
  }

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  /**
   * @mutation createBlog
   * Creates a blog post. Returns BlogResponse.
   */
  @Mutation(() => BlogResponse, {
    description: 'Create a new blog post. Emits blog.created Kafka event on success.',
  })
  async createBlog(@Args('input') input: CreateBlogInput): Promise<BlogResponseType> {
    try {
      const blog = await this.blogsService.create(input);
      return ResponseFactory.blog(blog, 'Blog post created successfully', HttpStatus.CREATED);
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * @mutation updateBlog
   * Partially updates a blog post. Returns BlogResponse.
   */
  @Mutation(() => BlogResponse, {
    description: 'Partially update a blog post. Emits blog.updated Kafka event.',
  })
  async updateBlog(@Args('input') input: UpdateBlogInput): Promise<BlogResponseType> {
    try {
      const blog = await this.blogsService.update(input);
      return ResponseFactory.blog(blog, 'Blog post updated successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * @mutation deleteBlog
   * Deletes a blog post. Returns BaseApiResponse.
   */
  @Mutation(() => BaseApiResponse, {
    description: 'Delete a blog post. Emits blog.deleted Kafka event.',
  })
  async deleteBlog(@Args('input') input: DeleteBlogInput): Promise<BaseApiResponseType> {
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
   */
  @ResolveReference()
  resolveReference(reference: { __typename: string; id: string }): Blog {
    return this.blogsService.resolveReference(reference);
  }
}
