import { ObjectType, Field, Int } from "@nestjs/graphql";
import { DateTimeScalar } from "../graphql/scalars";
import { User } from "../../users/entities/user.entity";

/**
 * @type UserSuccessResponse
 * @description Specific success response for operations that return a User.
 *
 * Why a specific type instead of a generic `SuccessResponse<T>`?
 * --------------------------------------------------------------
 * GraphQL unions require every member to be a concrete named ObjectType.
 * TypeScript generics are erased at runtime — GraphQL cannot represent
 * `SuccessResponse<User>` as a distinct named type in the schema.
 * Each domain entity therefore needs its own concrete response type.
 *
 * Pattern used for all specific success responses:
 *   - Implements the same shape as BaseResponse (statusCode, success, message, timestamp)
 *   - Adds a `data` field typed to the specific entity
 *
 * Part of the `ApiResponse` union type.  Clients discriminate on `__typename`.
 *
 * GraphQL schema:
 *   type UserSuccessResponse {
 *     statusCode: Int!
 *     success:    Boolean!
 *     message:    String!
 *     data:       User!
 *     timestamp:  DateTime!
 *   }
 */
@ObjectType({ description: "Success response wrapping a single User entity" })
export class UserSuccessResponse {
  /** Always true for UserSuccessResponse. */
  @Field(() => Boolean, { description: "Always true for success responses" })
  success: boolean;

  /** Human-readable success message. */
  @Field(() => String, { description: "Human-readable success message" })
  message: string;

  /** HTTP-equivalent status code. Typically 200 (fetch/update) or 201 (create). */
  @Field(() => Int, { description: "HTTP-equivalent status code" })
  statusCode: number;

  /** ISO 8601 timestamp of when the response was generated (server clock). */
  @Field(() => DateTimeScalar, { description: "Server-side response timestamp" })
  timestamp: Date;

  /**
   * @field data
   * The resolved User entity.
   * This is the primary payload the client cares about.
   */
  @Field(() => User, { description: "The resolved User entity" })
  data: User;
}

/**
 * @type UsersSuccessResponse
 * @description Specific success response for operations that return a User list.
 *
 * Returned by the `getUsers` query when the operation succeeds.
 * Clients discriminate on `__typename === 'UsersSuccessResponse'`.
 *
 * GraphQL schema:
 *   type UsersSuccessResponse {
 *     success:    Boolean!
 *     message:    String!
 *     statusCode: Int!
 *     timestamp:  DateTime!
 *     data:       [User!]!
 *   }
 */
@ObjectType({ description: "Success response wrapping a list of User entities" })
export class UsersSuccessResponse {
  /** Always true for UsersSuccessResponse. */
  @Field(() => Boolean)
  success: boolean;

  /** Human-readable success message. */
  @Field(() => String)
  message: string;

  /** HTTP-equivalent status code. Typically 200. */
  @Field(() => Int)
  statusCode: number;

  /** ISO 8601 timestamp of when the response was generated (server clock). */
  @Field(() => DateTimeScalar)
  timestamp: Date;

  /** The resolved array of User entities. Empty array when no users exist. */
  @Field(() => [User], { description: "The resolved User list" })
  data: User[];
}
