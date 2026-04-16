import {
  Resolver, Query, Mutation, Args,
  ResolveReference, ResolveField, Parent,
} from '@nestjs/graphql';
import { HttpStatus } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { Blog, User } from './entities/blog.entity';
import { CreateBlogInput, UpdateBlogInput, DeleteBlogInput } from './dto/blog.input';
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
 */
@Resolver(() => Blog)
export class BlogsResolver {
  constructor(private readonly blogsService: BlogsService) {}

  // ── QUERIES ───────────────────────────────────────────────────────────────

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

  @Query(() => BlogResponse, {
    name: 'getBlog',
    description: 'Fetch one blog post by UUID. Returns BlogSuccessResponse or ErrorResponse.',
  })
  async getBlog(@Args('id', { type: () => String }) id: string): Promise<BlogResponseType> {
    try {
      const blog = this.blogsService.findOne(id);
      return ResponseFactory.blog(blog, 'Blog post retrieved successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  // ── FIELD RESOLVER ────────────────────────────────────────────────────────

  @ResolveField(() => User, {
    description: 'Author resolved from user-service via Apollo Federation _entities',
  })
  author(@Parent() blog: Blog): User {
    return { id: blog.authorId };
  }

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

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

  @ResolveReference()
  resolveReference(reference: { __typename: string; id: string }): Blog {
    return this.blogsService.resolveReference(reference);
  }
}
