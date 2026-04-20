import {
  Resolver, Query, Mutation, Args,
  ResolveReference, ResolveField, Parent, Subscription,
} from "@nestjs/graphql";
import { Inject, HttpStatus } from "@nestjs/common";
import { PubSub } from "graphql-subscriptions";
import { BlogsService } from "./blogs.service";
import { Blog, User } from "./entities/blog.entity";
import {
  CreateBlogInput,
  UpdateBlogInput,
  DeleteBlogInput,
  GetBlogArgs,
} from "./dto/blog.input";
import {
  BlogResponse,
  BlogsResponse,
  BaseApiResponse,
  BlogResponseType,
  BlogsResponseType,
  BaseApiResponseType,
} from "../common/responses/api-response.union";
import { ResponseFactory } from "../common/responses/response.factory";

/**
 * @resolver BlogsResolver
 * @description GraphQL resolver for the blog-service Federation subgraph.
 *
 * Pattern B — real-time layer
 * ────────────────────────────
 * Three GraphQL subscriptions mirror the three mutation topics:
 *   blogCreated — fires after blog.created Kafka event is consumed
 *   blogUpdated — fires after blog.updated Kafka event is consumed
 *   blogDeleted — fires after blog.deleted Kafka event is consumed
 *
 * Author resolution (Federation)
 * ──────────────────────────────
 * @ResolveField author() returns { id: blog.authorId } for every Blog.
 * Apollo Router batches all stubs into one _entities request to user-service.
 * This resolver never calls user-service directly.
 *
 * All methods are async — required because BlogsService and BlogRepository
 * are both async (supports real DB backends transparently).
 */
@Resolver(() => Blog)
export class BlogsResolver {
  constructor(
    private readonly blogsService: BlogsService,
    @Inject("GQL_PUB_SUB") private readonly pubSub: PubSub,
  ) {}

  // ── QUERIES ───────────────────────────────────────────────────────────────

  /**
   * Returns all blog posts wrapped in a BlogsSuccessResponse, or an ErrorResponse on failure.
   *
   * @returns {Promise<BlogsResponseType>} A BlogsSuccessResponse with the blog array,
   *   or an ErrorResponse if the service throws.
   */
  @Query(() => BlogsResponse, {
    name: "getBlogs",
    description: "Fetch all blog posts.",
  })
  async getBlogs(): Promise<BlogsResponseType> {
    try {
      const blogs = await this.blogsService.findAll();
      return ResponseFactory.blogs(blogs, "Blog posts retrieved successfully");
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * Returns a single blog post by UUID wrapped in a BlogSuccessResponse,
   * or an ErrorResponse (404) when the blog does not exist.
   *
   * @param {GetBlogArgs} input - Validated input object containing the target `id`.
   * @returns {Promise<BlogResponseType>} A BlogSuccessResponse or ErrorResponse.
   */
  @Query(() => BlogResponse, {
    name: "getBlog",
    description: "Fetch one blog post by UUID.",
  })
  async getBlog(@Args("input") input: GetBlogArgs): Promise<BlogResponseType> {
    try {
      const blog = await this.blogsService.findOne(input.id);
      return ResponseFactory.blog(blog, "Blog post retrieved successfully");
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  // ── FIELD RESOLVER ────────────────────────────────────────────────────────

  /**
   * Returns the Apollo Federation User stub `{ id: blog.authorId }` for every Blog.
   * Apollo Router resolves the full User from user-service via a single batched
   * `_entities` request — N blogs still results in only 1 round-trip to user-service.
   *
   * @param {Blog} blog - The parent Blog object being resolved.
   * @returns {User} A minimal User reference object containing only the federation @key.
   */
  @ResolveField(() => User, {
    description: "Author resolved from user-service via Apollo Federation _entities",
  })
  author(@Parent() blog: Blog): User {
    return { id: blog.authorId };
  }

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  /**
   * Creates a new blog post and returns a BlogSuccessResponse (HTTP 201) on success.
   * On failure returns an ErrorResponse: 400 for validation failures.
   * Also triggers a `blogCreated` subscription push via Kafka → PubSub pipeline.
   *
   * @param {CreateBlogInput} input - Validated input containing title, content, and authorId.
   * @returns {Promise<BlogResponseType>} A BlogSuccessResponse or ErrorResponse.
   */
  @Mutation(() => BlogResponse, {
    description: "Create a blog post. Emits blog.created Kafka event. Subscribers receive push after Kafka consumer fires.",
  })
  async createBlog(@Args("input") input: CreateBlogInput): Promise<BlogResponseType> {
    try {
      const blog = await this.blogsService.create(input);
      return ResponseFactory.blog(blog, "Blog post created successfully", HttpStatus.CREATED);
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * Partially updates an existing blog post and returns a BlogSuccessResponse on success.
   * Only `title` and `content` can be updated — `authorId` is immutable after creation.
   * Also triggers a `blogUpdated` subscription push via Kafka → PubSub pipeline.
   *
   * @param {UpdateBlogInput} input - Validated input with `id` plus optional title/content.
   * @returns {Promise<BlogResponseType>} A BlogSuccessResponse or ErrorResponse (404).
   */
  @Mutation(() => BlogResponse, {
    description: "Partially update a blog post. Emits blog.updated Kafka event.",
  })
  async updateBlog(@Args("input") input: UpdateBlogInput): Promise<BlogResponseType> {
    try {
      const blog = await this.blogsService.update(input);
      return ResponseFactory.blog(blog, "Blog post updated successfully");
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * Deletes a blog post and returns a BaseResponse confirmation on success.
   * Also emits a `blog.deleted` Kafka event which triggers a `blogDeleted` subscription push.
   *
   * @param {DeleteBlogInput} input - Validated input containing the blog's UUID.
   * @returns {Promise<BaseApiResponseType>} A BaseResponse or ErrorResponse (404).
   */
  @Mutation(() => BaseApiResponse, {
    description: "Delete a blog post. Emits blog.deleted Kafka event.",
  })
  async deleteBlog(@Args("input") input: DeleteBlogInput): Promise<BaseApiResponseType> {
    try {
      await this.blogsService.delete(input);
      return ResponseFactory.deleted("Blog post deleted successfully");
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  // ── SUBSCRIPTIONS ─────────────────────────────────────────────────────────

  /**
   * @subscription blogCreated
   * Fires when BlogsKafkaController processes a blog.created Kafka event
   * and calls pubSub.publish('blogCreated', { blogCreated: blog }).
   *
   * Client usage:
   *   subscription {
   *     blogCreated { id title content authorId author { id name email } }
   *   }
   *
   * @returns {AsyncIterator} Async iterator over the 'blogCreated' PubSub channel.
   */
  @Subscription(() => Blog, {
    description: "Real-time push when a blog post is created.",
  })
  blogCreated() {
    return this.pubSub.asyncIterator("blogCreated");
  }

  /**
   * @subscription blogUpdated
   * Fires when BlogsKafkaController processes a blog.updated Kafka event.
   *
   * @returns {AsyncIterator} Async iterator over the 'blogUpdated' PubSub channel.
   */
  @Subscription(() => Blog, {
    description: "Real-time push when a blog post is updated.",
  })
  blogUpdated() {
    return this.pubSub.asyncIterator("blogUpdated");
  }

  /**
   * @subscription blogDeleted
   * Fires when BlogsKafkaController processes a blog.deleted Kafka event.
   * Returns the deleted blog's id as a String — the Blog entity no longer exists.
   *
   * @returns {AsyncIterator} Async iterator over the 'blogDeleted' PubSub channel.
   */
  @Subscription(() => String, {
    description: "Real-time push when a blog post is deleted. Returns the deleted blog id.",
    resolve: (payload) => payload.blogDeleted,
  })
  blogDeleted() {
    return this.pubSub.asyncIterator("blogDeleted");
  }

  // ── FEDERATION ────────────────────────────────────────────────────────────

  /**
   * Apollo Federation entity resolution for Blog.
   * Apollo Router calls this when another subgraph references a Blog by id
   * and the client requests Blog-owned fields.
   * Returns raw Blog — no ApiResponse wrapping — this is a Router-internal call.
   *
   * @param {{ __typename: string; id: string }} reference - The minimal entity reference from the Router.
   * @returns {Promise<Blog>} The fully populated Blog record.
   * @throws {NotFoundException} If the referenced blog no longer exists.
   */
  @ResolveReference()
  async resolveReference(reference: { __typename: string; id: string }): Promise<Blog> {
    return this.blogsService.resolveReference(reference);
  }
}
