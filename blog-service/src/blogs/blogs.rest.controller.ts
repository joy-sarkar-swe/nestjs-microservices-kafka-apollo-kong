import {
  Controller, Get, Post, Put, Delete,
  Body, Param, HttpCode, HttpStatus,
} from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { CreateBlogInput, UpdateBlogInput } from './dto/blog.input';
import { Blog } from './entities/blog.entity';

/**
 * @controller BlogsRestController
 * @description Pure REST endpoints consumed directly by Kong Gateway.
 *
 * Returns plain JSON — no ApiResponse envelope.
 * Kong upstream: http://host.docker.internal:3002
 *
 * Routes
 * ├─ GET    /blogs         → list all blog posts
 * ├─ GET    /blogs/:id     → get one blog post
 * ├─ POST   /blogs         → create blog post (201)
 * ├─ PUT    /blogs/:id     → update blog post (partial)
 * └─ DELETE /blogs/:id     → delete blog post (200)
 *
 * NOTE: `author` field is not populated in REST responses.
 * REST consumers receive `authorId` and can call GET /users/:id separately.
 * Cross-service author resolution is a GraphQL/Federation concern only.
 */
@Controller('blogs')
export class BlogsRestController {
  constructor(private readonly blogsService: BlogsService) {}

  @Get()
  findAll(): Blog[] {
    return this.blogsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Blog {
    return this.blogsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() input: CreateBlogInput): Promise<Blog> {
    return this.blogsService.create(input);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: Omit<UpdateBlogInput, 'id'>,
  ): Promise<Blog> {
    return this.blogsService.update({ id, ...body });
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    await this.blogsService.delete({ id });
    return { deleted: true };
  }
}
