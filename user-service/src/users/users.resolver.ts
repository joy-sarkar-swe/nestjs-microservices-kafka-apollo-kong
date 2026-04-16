import {
  Resolver,
  Query,
  Mutation,
  Args,
  ResolveReference,
} from '@nestjs/graphql';
import { HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import {
  CreateUserInput,
  UpdateUserInput,
  DeleteUserInput,
} from './dto/user.input';
import {
  UserResponse,
  UsersResponse,
  BaseApiResponse,
  UserResponseType,
  UsersResponseType,
  BaseApiResponseType,
} from '../common/responses/api-response.union';
import { ResponseFactory } from '../common/responses/response.factory';

/**
 * @resolver UsersResolver
 * @description GraphQL resolver for the user-service Federation subgraph.
 *
 * Specialized response unions are used to ensure precise GraphQL outcomes:
 * - UserResponse: Returns UserSuccessResponse or ErrorResponse
 * - UsersResponse: Returns UsersSuccessResponse or ErrorResponse
 * - BaseApiResponse: Returns BaseResponse or ErrorResponse
 *
 * Error handling strategy
 * -----------------------
 * Each resolver wraps the service call in try/catch.
 * On success: ResponseFactory.user() / ResponseFactory.users() / ResponseFactory.deleted()
 * On failure: ResponseFactory.fromException(error)
 *
 * Federation
 * ----------
 * @ResolveReference — Apollo Router calls this when blog-service returns a
 * `User { id }` stub and the client requests User fields.
 */
@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  // ── QUERIES ───────────────────────────────────────────────────────────────

  /**
   * @query getUsers
   * Returns all users wrapped in UsersSuccessResponse or ErrorResponse.
   */
  @Query(() => UsersResponse, {
    name: 'getUsers',
    description: 'Fetch all users. Returns UsersSuccessResponse or ErrorResponse.',
  })
  async getUsers(): Promise<UsersResponseType> {
    try {
      const users = this.usersService.findAll();
      return ResponseFactory.users(users, 'Users retrieved successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * @query getUser
   * Returns a single user by UUID wrapped in UserSuccessResponse or ErrorResponse.
   */
  @Query(() => UserResponse, {
    name: 'getUser',
    description: 'Fetch a single user by UUID. Returns UserSuccessResponse or ErrorResponse.',
  })
  async getUser(@Args('id', { type: () => String }) id: string): Promise<UserResponseType> {
    try {
      const user = this.usersService.findOne(id);
      return ResponseFactory.user(user, 'User retrieved successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  /**
   * @mutation createUser
   * Creates a new user. Returns UserResponse.
   */
  @Mutation(() => UserResponse, {
    description: 'Create a new user. Emits user.created Kafka event on success.',
  })
  async createUser(
    @Args('input') input: CreateUserInput,
  ): Promise<UserResponseType> {
    try {
      const user = await this.usersService.create(input);
      return ResponseFactory.user(user, 'User created successfully', HttpStatus.CREATED);
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * @mutation updateUser
   * Partially updates an existing user. Returns UserResponse.
   */
  @Mutation(() => UserResponse, {
    description: 'Partially update an existing user. Emits user.updated Kafka event.',
  })
  async updateUser(
    @Args('input') input: UpdateUserInput,
  ): Promise<UserResponseType> {
    try {
      const user = await this.usersService.update(input);
      return ResponseFactory.user(user, 'User updated successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * @mutation deleteUser
   * Deletes a user. Returns BaseApiResponse.
   */
  @Mutation(() => BaseApiResponse, {
    description: 'Delete a user. Emits user.deleted Kafka event — blog orphans removed.',
  })
  async deleteUser(
    @Args('input') input: DeleteUserInput,
  ): Promise<BaseApiResponseType> {
    try {
      await this.usersService.delete(input);
      return ResponseFactory.deleted('User deleted successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  // ── FEDERATION ────────────────────────────────────────────────────────────

  /**
   * @resolveReference
   * Apollo Federation entity resolution.
   */
  @ResolveReference()
  resolveReference(reference: { __typename: string; id: string }): User {
    return this.usersService.resolveReference(reference);
  }
}
