import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { CreateBlogInput, UpdateBlogInput } from './dto/blog.input';
import { Blog } from './entities/blog.entity';

/**
 * @controller BlogsRestController
 * @description Pure REST controller — **no GraphQL involved**.
 *
 * Kong API Gateway routes REST requests directly to these endpoints.
 * This makes Kong completely independent from Apollo Router:
 *   • Kong knows nothing about GraphQL schemas or federation.
 *   • Kong just does HTTP proxying to clean REST endpoints.
 *
 * Both REST and GraphQL paths use the same BlogsService, so business logic
 * and Kafka event emission are never duplicated.
 *
 * Route map (prefix: /blogs)
 * ├─ GET    /blogs         → list all blog posts
 * ├─ GET    /blogs/:id     → get one blog post
 * ├─ POST   /blogs         → create a blog post
 * ├─ PUT    /blogs/:id     → update a blog post (partial)
 * └─ DELETE /blogs/:id     → delete a blog post
 *
 * Kong upstream for these routes: http://localhost:3002
 *
 * NOTE: The `author` field is NOT present in REST responses because it's a
 * federation concept (resolved by Apollo Router from user-service at query time).
 * REST consumers get `authorId` and can call GET /users/:authorId separately.
 */
@Controller('blogs')
export class BlogsRestController {
  constructor(private readonly blogsService: BlogsService) {}

  // ── GET /blogs ────────────────────────────────────────────────────────────

  /**
   * @route GET /blogs
   * @description Returns all blog posts.
   *
   * Kong: GET http://localhost:8000/blogs
   *   → GET http://localhost:3002/blogs
   */
  @Get()
  findAll(): Blog[] {
    return this.blogsService.findAll();
  }

  // ── GET /blogs/:id ────────────────────────────────────────────────────────

  /**
   * @route GET /blogs/:id
   * @description Returns a single blog post by UUID.
   *
   * Kong: GET http://localhost:8000/blogs/:id
   *   → GET http://localhost:3002/blogs/:id
   *
   * @throws 404 via NestJS default NotFoundException handling.
   */
  @Get(':id')
  findOne(@Param('id') id: string): Blog {
    return this.blogsService.findOne(id);
  }

  // ── POST /blogs ───────────────────────────────────────────────────────────

  /**
   * @route POST /blogs
   * @description Creates a new blog post.
   *
   * Kong: POST http://localhost:8000/blogs
   *   → POST http://localhost:3002/blogs
   *
   * Request body:
   *   { "title": "Hello World", "content": "My first post.", "authorId": "USER-UUID" }
   *
   * Response 201: Created Blog object.
   * Also emits `blog.created` Kafka event.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() input: CreateBlogInput): Promise<Blog> {
    return this.blogsService.create(input);
  }

  // ── PUT /blogs/:id ────────────────────────────────────────────────────────

  /**
   * @route PUT /blogs/:id
   * @description Partially updates an existing blog post.
   *
   * Kong: PUT http://localhost:8000/blogs/:id
   *   → PUT http://localhost:3002/blogs/:id
   *
   * Request body (all fields optional):
   *   { "title": "Updated Title", "content": "Updated body." }
   *
   * The `id` is taken from the URL param and merged into the update input.
   * Also emits `blog.updated` Kafka event.
   */
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: Omit<UpdateBlogInput, 'id'>,
  ): Promise<Blog> {
    return this.blogsService.update({ id, ...body });
  }

  // ── DELETE /blogs/:id ─────────────────────────────────────────────────────

  /**
   * @route DELETE /blogs/:id
   * @description Deletes a blog post.
   *
   * Kong: DELETE http://localhost:8000/blogs/:id
   *   → DELETE http://localhost:3002/blogs/:id
   *
   * Response 200: { "deleted": true }
   * Also emits `blog.deleted` Kafka event.
   */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const deleted = await this.blogsService.delete({ id });
    return { deleted };
  }
}
