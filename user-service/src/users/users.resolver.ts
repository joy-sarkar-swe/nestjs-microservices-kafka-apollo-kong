import {
  Resolver,
  Query,
  Mutation,
  Args,
  ResolveReference,
  Subscription,
} from '@nestjs/graphql';
import { Inject, HttpStatus } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import {
  CreateUserInput,
  UpdateUserInput,
  DeleteUserInput,
  GetUserArgs,
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
 * Queries / Mutations
 * ────────────────────
 * All operations return typed union responses (UserResponse, UsersResponse,
 * BaseApiResponse). ResponseFactory builds the envelope; this resolver only
 * calls the service and delegates formatting.
 *
 * Subscriptions (Pattern B — real-time layer)
 * ────────────────────────────────────────────
 * Three subscriptions mirror the three mutation topics:
 *   userCreated   — emitted after user.created Kafka event is consumed
 *   userUpdated   — emitted after user.updated Kafka event is consumed
 *   userDeleted   — emitted after user.deleted Kafka event is consumed
 *
 * Clients subscribe BEFORE mutating to receive the confirmation push:
 *   subscription { userCreated { id name email } }
 *
 * The PubSub instance is injected via 'GQL_PUB_SUB' token so the Kafka
 * consumer (UsersKafkaController) and this resolver share the same instance.
 *
 * Federation
 * ────────────
 * @ResolveReference — called by Apollo Router when blog-service returns a
 * User { id } stub and the client requests User fields (name, email).
 * Must be async because the repository is async.
 */
@Resolver(() => User)
export class UsersResolver {
  constructor(
    private readonly usersService: UsersService,
    @Inject('GQL_PUB_SUB') private readonly pubSub: PubSub,
  ) {}

  // ── QUERIES ───────────────────────────────────────────────────────────────

  /**
   * Returns all users wrapped in a UsersSuccessResponse, or an ErrorResponse on failure.
   *
   * @returns {Promise<UsersResponseType>} A UsersSuccessResponse containing the user array,
   *   or an ErrorResponse if the service throws.
   */
  @Query(() => UsersResponse, {
    name: 'getUsers',
    description: 'Fetch all users.',
  })
  async getUsers(): Promise<UsersResponseType> {
    try {
      const users = await this.usersService.findAll();
      return ResponseFactory.users(users, 'Users retrieved successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * Returns a single user by UUID wrapped in a UserSuccessResponse,
   * or an ErrorResponse (404) when the user does not exist.
   *
   * @param {GetUserArgs} input - Validated input object containing the target `id`.
   * @returns {Promise<UserResponseType>} A UserSuccessResponse or ErrorResponse.
   */
  @Query(() => UserResponse, {
    name: 'getUser',
    description: 'Fetch a single user by UUID.',
  })
  async getUser(@Args('input') input: GetUserArgs): Promise<UserResponseType> {
    try {
      const user = await this.usersService.findOne(input.id);
      return ResponseFactory.user(user, 'User retrieved successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  /**
   * Creates a new user and returns a UserSuccessResponse (HTTP 201) on success.
   * On failure returns an ErrorResponse: 400 for validation, 409 for duplicate email.
   * Also triggers a `userCreated` subscription push via Kafka → PubSub pipeline.
   *
   * @param {CreateUserInput} input - Validated input containing `name` and `email`.
   * @returns {Promise<UserResponseType>} A UserSuccessResponse or ErrorResponse.
   */
  @Mutation(() => UserResponse, {
    description: 'Create a new user. Emits user.created Kafka event. Subscribers receive push once Kafka consumer fires.',
  })
  async createUser(@Args('input') input: CreateUserInput): Promise<UserResponseType> {
    try {
      const user = await this.usersService.create(input);
      return ResponseFactory.user(user, 'User created successfully', HttpStatus.CREATED);
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * Partially updates an existing user and returns a UserSuccessResponse on success.
   * Only the fields present in `input` are applied (patch semantics).
   * Also triggers a `userUpdated` subscription push via Kafka → PubSub pipeline.
   *
   * @param {UpdateUserInput} input - Validated input with `id` plus optional `name`/`email`.
   * @returns {Promise<UserResponseType>} A UserSuccessResponse or ErrorResponse (404/409).
   */
  @Mutation(() => UserResponse, {
    description: 'Partially update a user. Emits user.updated Kafka event.',
  })
  async updateUser(@Args('input') input: UpdateUserInput): Promise<UserResponseType> {
    try {
      const user = await this.usersService.update(input);
      return ResponseFactory.user(user, 'User updated successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  /**
   * Deletes a user and returns a BaseResponse confirmation on success.
   * Also emits a `user.deleted` Kafka event which:
   *   - Triggers a `userDeleted` subscription push.
   *   - Causes blog-service to remove all orphaned posts by this author.
   *
   * @param {DeleteUserInput} input - Validated input containing the target `id`.
   * @returns {Promise<BaseApiResponseType>} A BaseResponse or ErrorResponse (404).
   */
  @Mutation(() => BaseApiResponse, {
    description: 'Delete a user. Emits user.deleted Kafka event — blog orphans removed.',
  })
  async deleteUser(@Args('input') input: DeleteUserInput): Promise<BaseApiResponseType> {
    try {
      await this.usersService.delete(input);
      return ResponseFactory.deleted('User deleted successfully');
    } catch (error) {
      return ResponseFactory.fromException(error);
    }
  }

  // ── SUBSCRIPTIONS ─────────────────────────────────────────────────────────

  /**
   * @subscription userCreated
   * Fires when the Kafka consumer processes a user.created event and calls
   * pubSub.publish('userCreated', { userCreated: user }).
   *
   * Client usage:
   *   subscription {
   *     userCreated { id name email }
   *   }
   *
   * @returns {AsyncIterator} Async iterator over the 'userCreated' PubSub channel.
   */
  @Subscription(() => User, {
    description: 'Real-time push when a user is created (fires after Kafka consumer processes the event).',
  })
  userCreated() {
    return this.pubSub.asyncIterator('userCreated');
  }

  /**
   * @subscription userUpdated
   * Fires when the Kafka consumer processes a user.updated event.
   *
   * @returns {AsyncIterator} Async iterator over the 'userUpdated' PubSub channel.
   */
  @Subscription(() => User, {
    description: 'Real-time push when a user is updated.',
  })
  userUpdated() {
    return this.pubSub.asyncIterator('userUpdated');
  }

  /**
   * @subscription userDeleted
   * Fires when the Kafka consumer processes a user.deleted event.
   * Payload is the deleted user's id as a String — the User no longer exists.
   *
   * @returns {AsyncIterator} Async iterator over the 'userDeleted' PubSub channel.
   */
  @Subscription(() => String, {
    description: 'Real-time push when a user is deleted. Returns the deleted user id.',
    resolve: (payload) => payload.userDeleted,
  })
  userDeleted() {
    return this.pubSub.asyncIterator('userDeleted');
  }

  // ── FEDERATION ────────────────────────────────────────────────────────────

  /**
   * Apollo Federation entity resolution entry point.
   * Apollo Router calls this when blog-service returns a `User { id }` stub
   * and the client requests additional User fields (name, email).
   * Must be async because the repository layer is always async.
   *
   * @param {{ __typename: string; id: string }} reference - The minimal entity reference from the Router.
   * @returns {Promise<User>} The fully populated User record.
   * @throws {NotFoundException} If the referenced user no longer exists.
   */
  @ResolveReference()
  async resolveReference(reference: { __typename: string; id: string }): Promise<User> {
    return this.usersService.resolveReference(reference);
  }
}
