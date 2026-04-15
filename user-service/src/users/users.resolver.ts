import {
  Resolver,
  Query,
  Mutation,
  Args,
  ResolveReference,
} from '@nestjs/graphql';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import {
  CreateUserInput,
  UpdateUserInput,
  DeleteUserInput,
} from './dto/user.input';

/**
 * @resolver UsersResolver
 * @description GraphQL resolver for the user-service Federation subgraph.
 *
 * Exposes:
 *   Queries    — getUsers, getUser
 *   Mutations  — createUser, updateUser, deleteUser
 *   Federation — @ResolveReference (entity resolver for cross-service joins)
 *
 * Apollo Router routes field-level requests to this subgraph based on the
 * composed supergraph SDL.  When blog-service returns `author { id }`, the
 * Router recognises `User` as a federated entity owned here and dispatches
 * an entity-resolution sub-request.
 */
@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  // ── QUERIES ───────────────────────────────────────────────────────────────

  /**
   * @query getUsers
   * Returns all users.
   *
   * @example
   *   query { getUsers { id name email } }
   */
  @Query(() => [User], { name: 'getUsers', description: 'Fetch all users' })
  getUsers(): User[] {
    return this.usersService.findAll();
  }

  /**
   * @query getUser
   * Returns a single user by UUID.
   *
   * @param id - UUID of the requested user.
   *
   * @example
   *   query { getUser(id: "…") { id name email } }
   */
  @Query(() => User, { name: 'getUser', description: 'Fetch one user by id' })
  getUser(@Args('id') id: string): User {
    return this.usersService.findOne(id);
  }

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  /**
   * @mutation createUser
   * Creates a new user.  Emits `user.created` Kafka event.
   *
   * @example
   *   mutation {
   *     createUser(input: { name: "Alice", email: "alice@example.com" }) {
   *       id name email
   *     }
   *   }
   */
  @Mutation(() => User, { description: 'Create a new user' })
  createUser(@Args('input') input: CreateUserInput): Promise<User> {
    return this.usersService.create(input);
  }

  /**
   * @mutation updateUser
   * Partially updates an existing user.  Emits `user.updated` Kafka event.
   *
   * @example
   *   mutation {
   *     updateUser(input: { id: "…", name: "Alice Updated" }) {
   *       id name email
   *     }
   *   }
   */
  @Mutation(() => User, { description: 'Update an existing user' })
  updateUser(@Args('input') input: UpdateUserInput): Promise<User> {
    return this.usersService.update(input);
  }

  /**
   * @mutation deleteUser
   * Removes a user.  Emits `user.deleted` Kafka event — blog-service will
   * clean up all posts authored by this user.
   *
   * @example
   *   mutation { deleteUser(input: { id: "…" }) }
   */
  @Mutation(() => Boolean, { description: 'Delete a user' })
  deleteUser(@Args('input') input: DeleteUserInput): Promise<boolean> {
    return this.usersService.delete(input);
  }

  // ── FEDERATION ────────────────────────────────────────────────────────────

  /**
   * @resolveReference
   * Apollo Router entity-resolution entry point.
   *
   * When blog-service resolves `author { id name email }`, the Router sends a
   * batch `_entities` query to this subgraph containing `{ __typename: "User", id }`.
   * This method must return the full `User` record so the Router can merge fields.
   */
  @ResolveReference()
  resolveReference(reference: { __typename: string; id: string }): User {
    return this.usersService.resolveReference(reference);
  }
}
