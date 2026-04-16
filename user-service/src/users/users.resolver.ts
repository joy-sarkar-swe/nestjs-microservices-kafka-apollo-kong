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
import { ApiResponse, ApiResponseType } from '../common/responses/api-response.union';
import { ResponseFactory } from '../common/responses/response.factory';

/**
 * @resolver UsersResolver
 * @description GraphQL resolver for the user-service Federation subgraph.
 *
 * All queries and mutations return `ApiResponse` — the union of all
 * possible response types.  Clients use `__typename` to discriminate:
 *
 *   mutation {
 *     createUser(input: { name: "Alice", email: "alice@example.com" }) {
 *       __typename
 *       ... on UserSuccessResponse  { statusCode success message data { id name email } timestamp }
 *       ... on ErrorResponse        { statusCode success message errors { field message } timestamp }
 *     }
 *   }
 *
 * Error handling strategy
 * -----------------------
 * Each resolver wraps the service call in try/catch.
 * On success: ResponseFactory.user() / ResponseFactory.users() / ResponseFactory.deleted()
 * On failure: ResponseFactory.fromException(error)
 *
 * Validation errors (BadRequestException from ValidationPipe) are caught
 * by GqlValidationFilter BEFORE reaching the resolver — they return
 * ErrorResponse directly without entering the try/catch here.
 *
 * Federation
 * ----------
 * @ResolveReference — Apollo Router calls this when blog-service returns a
 * `User { id }` stub and the client requests User fields.
 * This resolver returns the full User object (not wrapped in ApiResponse)
 * because the Router handles entity stitching internally.
 */
@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  // ── QUERIES ───────────────────────────────────────────────────────────────

  /**
   * @query getUsers
   * Returns all users wrapped in UsersSuccessResponse.
   *
   * @example
   *   query {
   *     getUsers {
   *       __typename
   *       ... on UsersSuccessResponse {
   *         statusCode success message timestamp
   *         data { id name email }
   *       }
   *       ... on ErrorResponse { statusCode message }
   *     }
   *   }
   */
  @Query(() => ApiResponse, {
    name: 'getUsers',
    description: 'Fetch all users. Returns UsersSuccessResponse or ErrorResponse.',
  })
  async getUsers(): Promise<ApiResponseType> {
    try {
      const users = this.usersService.findAll();
      return ResponseFactory.users(users, 'Users retrieved successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * @query getUser
   * Returns a single user by UUID wrapped in UserSuccessResponse.
   *
   * @param id - UUID of the requested user.
   *
   * @example
   *   query {
   *     getUser(id: "some-uuid") {
   *       __typename
   *       ... on UserSuccessResponse {
   *         statusCode success message timestamp
   *         data { id name email }
   *       }
   *       ... on ErrorResponse { statusCode message }
   *     }
   *   }
   */
  @Query(() => ApiResponse, {
    name: 'getUser',
    description: 'Fetch a single user by UUID. Returns UserSuccessResponse or ErrorResponse.',
  })
  async getUser(@Args('id', { type: () => String }) id: string): Promise<ApiResponseType> {
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
   * Creates a new user. Returns UserSuccessResponse (201) or ErrorResponse.
   *
   * Possible outcomes:
   *   UserSuccessResponse (201) — user created
   *   ErrorResponse (400)       — validation failed (caught by GqlValidationFilter)
   *   ErrorResponse (409)       — email already registered
   *   ErrorResponse (500)       — unexpected server error
   *
   * @example
   *   mutation {
   *     createUser(input: { name: "Alice", email: "alice@example.com" }) {
   *       __typename
   *       ... on UserSuccessResponse {
   *         statusCode success message timestamp
   *         data { id name email }
   *       }
   *       ... on ErrorResponse {
   *         statusCode success message timestamp
   *         errors { field message }
   *       }
   *     }
   *   }
   */
  @Mutation(() => ApiResponse, {
    description: 'Create a new user. Emits user.created Kafka event on success.',
  })
  async createUser(
    @Args('input') input: CreateUserInput,
  ): Promise<ApiResponseType> {
    try {
      const user = await this.usersService.create(input);
      return ResponseFactory.user(user, 'User created successfully', HttpStatus.CREATED);
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * @mutation updateUser
   * Partially updates an existing user. Returns UserSuccessResponse or ErrorResponse.
   *
   * Possible outcomes:
   *   UserSuccessResponse (200) — user updated
   *   ErrorResponse (400)       — validation failed
   *   ErrorResponse (404)       — user not found
   *   ErrorResponse (409)       — new email already taken
   *   ErrorResponse (500)       — unexpected server error
   *
   * @example
   *   mutation {
   *     updateUser(input: { id: "some-uuid", name: "Alice Updated" }) {
   *       __typename
   *       ... on UserSuccessResponse {
   *         statusCode message data { id name email } timestamp
   *       }
   *       ... on ErrorResponse { statusCode message errors { field message } timestamp }
   *     }
   *   }
   */
  @Mutation(() => ApiResponse, {
    description: 'Partially update an existing user. Emits user.updated Kafka event.',
  })
  async updateUser(
    @Args('input') input: UpdateUserInput,
  ): Promise<ApiResponseType> {
    try {
      const user = await this.usersService.update(input);
      return ResponseFactory.user(user, 'User updated successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * @mutation deleteUser
   * Deletes a user. Returns BaseResponse or ErrorResponse.
   * Emits user.deleted Kafka event → blog-service removes orphaned posts.
   *
   * Possible outcomes:
   *   BaseResponse  (200) — user deleted
   *   ErrorResponse (400) — validation failed
   *   ErrorResponse (404) — user not found
   *   ErrorResponse (500) — unexpected server error
   *
   * @example
   *   mutation {
   *     deleteUser(input: { id: "some-uuid" }) {
   *       __typename
   *       ... on BaseResponse  { statusCode success message timestamp }
   *       ... on ErrorResponse { statusCode message timestamp }
   *     }
   *   }
   */
  @Mutation(() => ApiResponse, {
    description: 'Delete a user. Emits user.deleted Kafka event — blog orphans removed.',
  })
  async deleteUser(
    @Args('input') input: DeleteUserInput,
  ): Promise<ApiResponseType> {
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
   *
   * Called by Apollo Router when blog-service returns `author { id }` and
   * the client requests User fields like `name` or `email`.
   * The Router sends an `_entities` batch query: `{ __typename: "User", id }`.
   *
   * Returns raw User (NOT wrapped in ApiResponse) — this is an internal
   * Router-to-subgraph call, not a client-facing operation.
   *
   * @param {{ __typename: string; id: string }} reference - Federation key.
   * @returns {User} Fully populated User entity.
   */
  @ResolveReference()
  resolveReference(reference: { __typename: string; id: string }): User {
    // Note: if user is not found, NotFoundException propagates as a GraphQL error.
    // This is correct behaviour — a dangling reference is a server-side data integrity issue.
    return this.usersService.resolveReference(reference);
  }
}
