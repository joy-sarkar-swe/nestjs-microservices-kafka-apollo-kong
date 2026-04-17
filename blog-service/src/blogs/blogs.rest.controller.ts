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
 * All methods async — BlogsService and BlogRepository are async.
 * Kong upstream: http://host.docker.internal:4002
 *
 * Real-time (Socket.IO)
 * ─────────────────────
 * REST clients receive real-time pushes via Socket.IO /blogs namespace
 * after the Kafka consumer processes each mutation.
 * The REST response is immediate — Socket.IO push is async and independent.
 */
@Controller('blogs')
export class BlogsRestController {
  constructor(private readonly blogsService: BlogsService) {}

  @Get()
  async findAll(): Promise<Blog[]> {
    return this.blogsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Blog> {
    return this.blogsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() input: CreateBlogInput): Promise<Blog> {
    return this.blogsService.create(input);
  }

  @Put(':id')
  async update(
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
