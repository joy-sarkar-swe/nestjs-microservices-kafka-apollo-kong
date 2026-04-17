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
   * Payload is { id: string } because the User no longer exists.
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
   * @resolveReference
   * Now async — required because the repository layer is async.
   * Apollo Router calls this when blog-service returns User { id } stubs.
   */
  @ResolveReference()
  async resolveReference(reference: { __typename: string; id: string }): Promise<User> {
    return this.usersService.resolveReference(reference);
  }
}
