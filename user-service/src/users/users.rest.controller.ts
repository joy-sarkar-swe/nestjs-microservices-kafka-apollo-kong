import {
  Controller,
  Get, Post, Put, Delete,
  Body, Param, Query,
  HttpCode, HttpStatus,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserInput, UpdateUserInput } from "./dto/user.input";
import { User } from "./entities/user.entity";

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
 * ├─ GET    /users            → list all users
 * ├─ GET    /users?ids=...    → batch fetch users by comma-separated ids (used by blog-service)
 * ├─ GET    /users/:id        → get one user
 * ├─ POST   /users            → create user (201)
 * ├─ PUT    /users/:id        → update user (partial)
 * └─ DELETE /users/:id        → delete user (200)
 *
 * Real-time (Socket.IO)
 * ─────────────────────
 * REST clients receive real-time updates via Socket.IO events emitted by
 * UserEventsGateway after the Kafka consumer processes the mutation.
 * The REST response is immediate — the Socket.IO push is asynchronous.
 */
@Controller("users")
export class UsersRestController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Retrieves users from the repository.
   *
   * Supports two modes:
   *   - `GET /users`             → returns ALL users (standard list endpoint).
   *   - `GET /users?ids=a,b,c`  → returns ONLY the users with the given UUIDs.
   *     Used by blog-service's UserServiceClient to batch-resolve authors
   *     for REST blog list responses in a single HTTP call instead of N calls.
   *
   * @param {string} [ids] - Optional comma-separated list of user UUIDs (query param).
   * @returns {Promise<User[]>} Matching User records; empty array when none found.
   */
  @Get()
  async findAll(@Query("ids") ids?: string): Promise<User[]> {
    if (ids) {
      // Batch fetch — split CSV, resolve each in parallel, filter out nulls
      const idList = ids.split(",").map((id) => id.trim()).filter(Boolean);
      const results = await Promise.all(
        idList.map((id) => this.usersService.findOne(id).catch(() => null)),
      );
      return results.filter((u): u is User => u !== null);
    }
    return this.usersService.findAll();
  }

  /**
   * Retrieves a single user by their UUID.
   *
   * @param {string} id - UUID v4 path parameter extracted from the URL.
   * @returns {Promise<User>} The matching User record.
   * @throws {NotFoundException} 404 when no user exists with the given id.
   */
  @Get(":id")
  async findOne(@Param("id") id: string): Promise<User> {
    return this.usersService.findOne(id);
  }

  /**
   * Creates a new user record.
   * Responds with HTTP 201 Created on success.
   * Also emits a `user.created` Kafka event which triggers real-time Socket.IO push.
   *
   * @param {CreateUserInput} input - Validated request body containing `name` and `email`.
   * @returns {Promise<User>} The newly created User with assigned UUID.
   * @throws {ConflictException} 409 when the email is already registered.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() input: CreateUserInput): Promise<User> {
    return this.usersService.create(input);
  }

  /**
   * Partially updates an existing user record.
   * Only the fields provided in the request body are applied (patch semantics).
   * Also emits a `user.updated` Kafka event which triggers real-time Socket.IO push.
   *
   * @param {string} id - UUID v4 of the user to update, extracted from the URL path.
   * @param {Omit<UpdateUserInput, 'id'>} body - Partial user fields to overwrite.
   * @returns {Promise<User>} The fully updated User record.
   * @throws {NotFoundException}  404 when no user exists with the given id.
   * @throws {ConflictException}  409 when the new email is already taken by another user.
   */
  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() body: Omit<UpdateUserInput, "id">,
  ): Promise<User> {
    return this.usersService.update({ id, ...body });
  }

  /**
   * Deletes a user by UUID.
   * Also emits a `user.deleted` Kafka event which:
   *   - Triggers real-time Socket.IO push to REST clients.
   *   - Causes blog-service to remove all orphaned posts by this author.
   *
   * @param {string} id - UUID v4 of the user to delete, extracted from the URL path.
   * @returns {Promise<{ deleted: boolean }>} Confirmation object `{ deleted: true }`.
   * @throws {NotFoundException} 404 when no user exists with the given id.
   */
  @Delete(":id")
  async remove(@Param("id") id: string): Promise<{ deleted: boolean }> {
    await this.usersService.delete({ id });
    return { deleted: true };
  }
}
