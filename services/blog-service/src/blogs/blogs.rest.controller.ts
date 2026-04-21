import {
  Controller, Get, Post, Put, Delete,
  Body, Param, HttpCode, HttpStatus,
} from "@nestjs/common";
import { BlogsService } from "./blogs.service.js";
import { CreateBlogInput, UpdateBlogInput } from "./dto/blog.input.js";
import { Blog } from "./entities/blog.entity.js";
import { UserServiceClient } from "../common/http/user-service.client.js";
import { BlogWithAuthor } from "./author/blog-with-author.type.js";

/**
 * @controller BlogsRestController
 * @description REST endpoints for blog-service, consumed directly by Kong Gateway.
 *
 * Author resolution for REST
 * ───────────────────────────
 * GraphQL clients get author enrichment for free via Apollo Federation:
 * the Router dispatches a batched `_entities` call to user-service and stitches
 * the result. REST clients have no Router — so this controller performs
 * equivalent author resolution explicitly via UserServiceClient.
 *
 * Production strategy (zero N+1):
 *   - List endpoint (GET /blogs): collects all unique authorIds from the result
 *     set, issues exactly ONE batch HTTP call `GET /users?ids=id1,id2,...`,
 *     then maps resolved users back onto each blog in O(1) per blog via Map lookup.
 *     100 blogs with 5 unique authors = 1 HTTP call, not 100.
 *
 *   - Single endpoint (GET /blogs/:id): uses UserServiceClient.resolveOne()
 *     which maintains a TTL cache. Repeated fetches for the same user within
 *     60 seconds cost 0 additional HTTP calls.
 *
 *   - Graceful degradation: if user-service is unavailable, `author` is `null`
 *     in the response. Blog data remains intact and the request still succeeds.
 *
 * Kong upstream: http://host.docker.internal:4002
 *
 * Routes
 * ├─ GET    /blogs         → list all blogs with resolved authors
 * ├─ GET    /blogs/:id     → get one blog with resolved author
 * ├─ POST   /blogs         → create blog post (201)
 * ├─ PUT    /blogs/:id     → update blog post (partial)
 * └─ DELETE /blogs/:id     → delete blog post (200)
 */
@Controller("blogs")
export class BlogsRestController {
  constructor(
    private readonly blogsService: BlogsService,
    private readonly userClient: UserServiceClient,
  ) {}

  // ── READ ──────────────────────────────────────────────────────────────────

  /**
   * Returns all blog posts with fully resolved author details.
   *
   * Author resolution strategy (single batch call):
   * 1. Fetch all blogs from repository.
   * 2. Collect all unique `authorId` values (deduplication happens inside UserServiceClient).
   * 3. Call `userClient.resolveMany(ids)` → single `GET /users?ids=...` to user-service.
   * 4. Map each blog to a `BlogWithAuthor` by looking up its author in the result Map.
   *
   * Total HTTP calls to user-service: 1, regardless of how many blogs or authors exist.
   *
   * @returns {Promise<BlogWithAuthor[]>} All blog posts with `author` populated (or null if unresolvable).
   */
  @Get()
  async findAll(): Promise<BlogWithAuthor[]> {
    const blogs = await this.blogsService.findAll();
    if (blogs.length === 0) return [];

    // Extract all authorIds — UserServiceClient.resolveMany() deduplicates internally
    const authorIds = blogs.map((b) => b.authorId);

    // Single batch HTTP call — 1 round-trip regardless of N blogs
    const authorMap = await this.userClient.resolveMany(authorIds);

    // Map blogs to enriched shape in O(1) per blog via Map lookup
    return blogs.map((blog) => this.enrich(blog, authorMap.get(blog.authorId) ?? null));
  }

  /**
   * Returns a single blog post with its fully resolved author.
   * Uses the TTL cache in UserServiceClient — repeated fetches for the same
   * user within 60 seconds incur no additional HTTP calls.
   *
   * @param {string} id - UUID v4 path parameter extracted from the URL.
   * @returns {Promise<BlogWithAuthor>} The blog post with `author` populated (or null if unresolvable).
   * @throws {NotFoundException} 404 when no blog exists with the given id.
   */
  @Get(":id")
  async findOne(@Param("id") id: string): Promise<BlogWithAuthor> {
    const blog = await this.blogsService.findOne(id);
    const author = await this.userClient.resolveOne(blog.authorId);
    return this.enrich(blog, author);
  }

  // ── WRITE ─────────────────────────────────────────────────────────────────

  /**
   * Creates a new blog post.
   * Returns HTTP 201 Created. The response is the raw Blog — author enrichment
   * is skipped for mutation responses to keep them minimal and fast.
   * Clients that need the full author immediately after creation can call GET /blogs/:id.
   * Also emits a `blog.created` Kafka event which triggers real-time Socket.IO push.
   *
   * @param {CreateBlogInput} input - Validated request body containing title, content, and authorId.
   * @returns {Promise<Blog>} The newly created Blog with assigned UUID.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() input: CreateBlogInput): Promise<Blog> {
    return this.blogsService.create(input);
  }

  /**
   * Partially updates an existing blog post.
   * Returns the raw Blog — author enrichment skipped for mutation responses.
   * Also emits a `blog.updated` Kafka event which triggers real-time Socket.IO push.
   *
   * @param {string} id - UUID v4 of the blog post to update, extracted from the URL path.
   * @param {Omit<UpdateBlogInput, 'id'>} body - Partial blog fields to overwrite.
   * @returns {Promise<Blog>} The fully updated Blog record.
   * @throws {NotFoundException} 404 when no blog exists with the given id.
   */
  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() body: Omit<UpdateBlogInput, "id">,
  ): Promise<Blog> {
    return this.blogsService.update({ id, ...body });
  }

  /**
   * Deletes a blog post by UUID.
   * Also emits a `blog.deleted` Kafka event which triggers real-time Socket.IO push.
   *
   * @param {string} id - UUID v4 of the blog post to delete, extracted from the URL path.
   * @returns {Promise<{ deleted: boolean }>} Confirmation object `{ deleted: true }`.
   * @throws {NotFoundException} 404 when no blog exists with the given id.
   */
  @Delete(":id")
  async remove(@Param("id") id: string): Promise<{ deleted: boolean }> {
    await this.blogsService.delete({ id });
    return { deleted: true };
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  /**
   * Maps a raw Blog entity and a resolved User to a BlogWithAuthor REST response.
   * Pure function — no side effects, no async operations.
   *
   * @param {Blog} blog - The raw Blog from the repository.
   * @param {ResolvedUser | null} author - The resolved author, or null if unavailable.
   * @returns {BlogWithAuthor} The enriched REST response shape.
   */
  private enrich(
    blog: Blog,
    author: import("../common/http/user-service.client.js").ResolvedUser | null,
  ): BlogWithAuthor {
    return {
      id:       blog.id,
      title:    blog.title,
      content:  blog.content,
      authorId: blog.authorId,
      author,
    };
  }
}
