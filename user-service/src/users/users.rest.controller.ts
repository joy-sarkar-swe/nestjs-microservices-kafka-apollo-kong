import {
  Controller,
  Get, Post, Put, Delete,
  Body, Param,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserInput, UpdateUserInput } from './dto/user.input';
import { User } from './entities/user.entity';

/**
 * @controller UsersRestController
 * @description Pure REST endpoints consumed directly by Kong Gateway.
 *
 * All methods are now async because UsersService methods are async
 * (repository interface is always async to support both in-memory and DB backends).
 *
 * Kong upstream: http://host.docker.internal:4001
 *
 * Routes
 * ├─ GET    /users         → list all users
 * ├─ GET    /users/:id     → get one user
 * ├─ POST   /users         → create user (201)
 * ├─ PUT    /users/:id     → update user (partial)
 * └─ DELETE /users/:id     → delete user (200)
 *
 * Real-time (Socket.IO)
 * ─────────────────────
 * REST clients receive real-time updates via Socket.IO events emitted by
 * UserEventsGateway after the Kafka consumer processes the mutation.
 * The REST response is immediate — the Socket.IO push is asynchronous.
 */
@Controller('users')
export class UsersRestController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() input: CreateUserInput): Promise<User> {
    return this.usersService.create(input);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Omit<UpdateUserInput, 'id'>,
  ): Promise<User> {
    return this.usersService.update({ id, ...body });
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    await this.usersService.delete({ id });
    return { deleted: true };
  }
}
