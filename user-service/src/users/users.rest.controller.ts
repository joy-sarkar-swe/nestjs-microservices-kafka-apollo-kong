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
import { UsersService } from './users.service';
import { CreateUserInput, UpdateUserInput } from './dto/user.input';
import { User } from './entities/user.entity';

/**
 * @controller UsersRestController
 * @description Pure REST controller — **no GraphQL involved**.
 *
 * Kong API Gateway routes REST client requests directly to these endpoints.
 * This keeps the REST layer clean and independent from the GraphQL layer.
 * Both layers share the same UsersService so business logic is never duplicated.
 *
 * Route map (prefix: /users)
 * ├─ GET    /users         → list all users
 * ├─ GET    /users/:id     → get one user
 * ├─ POST   /users         → create user
 * ├─ PUT    /users/:id     → update user (partial)
 * └─ DELETE /users/:id     → delete user
 *
 * Kong upstream for these routes: http://localhost:3001
 */
@Controller('users')
export class UsersRestController {
  constructor(private readonly usersService: UsersService) {}

  // ── GET /users ────────────────────────────────────────────────────────────

  /**
   * @route GET /users
   * @description Returns all users in the in-memory store.
   *
   * Kong route: GET http://localhost:8000/users
   *   → forwards to → GET http://localhost:3001/users
   */
  @Get()
  findAll(): User[] {
    return this.usersService.findAll();
  }

  // ── GET /users/:id ────────────────────────────────────────────────────────

  /**
   * @route GET /users/:id
   * @description Returns a single user by UUID.
   *
   * Kong route: GET http://localhost:8000/users/:id
   *   → forwards to → GET http://localhost:3001/users/:id
   *
   * @param id - UUID of the requested user (path parameter).
   * @throws 404 when not found (NestJS default from NotFoundException).
   */
  @Get(':id')
  findOne(@Param('id') id: string): User {
    return this.usersService.findOne(id);
  }

  // ── POST /users ───────────────────────────────────────────────────────────

  /**
   * @route POST /users
   * @description Creates a new user.
   *
   * Kong route: POST http://localhost:8000/users
   *   → forwards to → POST http://localhost:3001/users
   *
   * Request body: { "name": "Alice", "email": "alice@example.com" }
   * Response 201: Created User object with assigned id.
   *
   * Also emits `user.created` Kafka event.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() input: CreateUserInput): Promise<User> {
    return this.usersService.create(input);
  }

  // ── PUT /users/:id ────────────────────────────────────────────────────────

  /**
   * @route PUT /users/:id
   * @description Partially updates an existing user.
   *
   * Kong route: PUT http://localhost:8000/users/:id
   *   → forwards to → PUT http://localhost:3001/users/:id
   *
   * Request body: { "name": "Alice Updated" }  (all fields optional except id)
   * The id is taken from the URL parameter and injected into the DTO.
   *
   * Also emits `user.updated` Kafka event.
   */
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: Omit<UpdateUserInput, 'id'>,
  ): Promise<User> {
    return this.usersService.update({ id, ...body });
  }

  // ── DELETE /users/:id ─────────────────────────────────────────────────────

  /**
   * @route DELETE /users/:id
   * @description Deletes a user.
   *
   * Kong route: DELETE http://localhost:8000/users/:id
   *   → forwards to → DELETE http://localhost:3001/users/:id
   *
   * Response 200: { "deleted": true }
   * Also emits `user.deleted` Kafka event — blog-service removes orphaned posts.
   */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const deleted = await this.usersService.delete({ id });
    return { deleted };
  }
}
