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
 * REST returns plain JSON — no ApiResponse envelope.
 * GraphQL (via Apollo Router) uses the full ApiResponse union.
 * Both paths share the same UsersService — zero logic duplication.
 *
 * Kong upstream: http://host.docker.internal:3001
 *
 * Routes
 * ├─ GET    /users         → list all users
 * ├─ GET    /users/:id     → get one user
 * ├─ POST   /users         → create user  (201)
 * ├─ PUT    /users/:id     → update user  (partial)
 * └─ DELETE /users/:id     → delete user  (200)
 */
@Controller('users')
export class UsersRestController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(): User[] {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): User {
    return this.usersService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() input: CreateUserInput): Promise<User> {
    return this.usersService.create(input);
  }

  @Put(':id')
  update(
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
