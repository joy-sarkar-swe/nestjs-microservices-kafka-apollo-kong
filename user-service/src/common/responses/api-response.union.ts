import { createUnionType } from "@nestjs/graphql";
import { ErrorResponse } from "./error-response.type.js";
import { BaseResponse } from "./base-response.type.js";
import { UserSuccessResponse, UsersSuccessResponse } from "./user-success-response.type.js";

/**
 * @union UserResponse
 * @description GraphQL union returned by single-user queries and mutations.
 *
 * Members:
 *   - {@link UserSuccessResponse}  — operation succeeded; `data` holds the User.
 *   - {@link ErrorResponse}        — operation failed; `errors` may hold field violations.
 *
 * Client usage:
 * ```graphql
 * query {
 *   getUser(input: { id: "..." }) {
 *     __typename
 *     ... on UserSuccessResponse { data { id name email } }
 *     ... on ErrorResponse       { statusCode message errors { field message } }
 *   }
 * }
 * ```
 */
export const UserResponse = createUnionType({
  name: "UserResponse",
  description: "Returns UserSuccessResponse or ErrorResponse",
  types: () => [UserSuccessResponse, ErrorResponse] as const,
  /**
   * Determines the concrete GraphQL type at query-time by inspecting
   * the `success` boolean set by ResponseFactory on every response object.
   *
   * @param {object} value - The runtime response object.
   * @returns {typeof UserSuccessResponse | typeof ErrorResponse | null}
   */
  resolveType(value) {
    if (value.success === false) return ErrorResponse;
    if (value.success === true) return UserSuccessResponse;
    return null;
  },
});

/**
 * @union UsersResponse
 * @description GraphQL union returned by the `getUsers` list query.
 *
 * Members:
 *   - {@link UsersSuccessResponse} — operation succeeded; `data` holds the User array.
 *   - {@link ErrorResponse}        — operation failed.
 */
export const UsersResponse = createUnionType({
  name: "UsersResponse",
  description: "Returns UsersSuccessResponse or ErrorResponse",
  types: () => [UsersSuccessResponse, ErrorResponse] as const,
  /**
   * Determines the concrete GraphQL type at query-time.
   *
   * @param {object} value - The runtime response object.
   * @returns {typeof UsersSuccessResponse | typeof ErrorResponse | null}
   */
  resolveType(value) {
    if (value.success === false) return ErrorResponse;
    if (value.success === true) return UsersSuccessResponse;
    return null;
  },
});

/**
 * @union BaseApiResponse
 * @description GraphQL union returned by operations that have no data payload on success.
 *
 * Used by `deleteUser` — on success the entity no longer exists, so only
 * a confirmation message is returned rather than the deleted entity itself.
 *
 * Members:
 *   - {@link BaseResponse}  — deletion confirmed.
 *   - {@link ErrorResponse} — operation failed (e.g. user not found).
 */
export const BaseApiResponse = createUnionType({
  name: "BaseApiResponse",
  description: "Returns BaseResponse or ErrorResponse",
  types: () => [BaseResponse, ErrorResponse] as const,
  /**
   * Determines the concrete GraphQL type at query-time.
   *
   * @param {object} value - The runtime response object.
   * @returns {typeof BaseResponse | typeof ErrorResponse | null}
   */
  resolveType(value) {
    if (value.success === false) return ErrorResponse;
    if (value.success === true) return BaseResponse;
    return null;
  },
});

/**
 * TypeScript type alias for resolver return signatures that return a single User or error.
 * Keeps resolver method signatures concise and avoids repeating the union inline.
 */
export type UserResponseType = UserSuccessResponse | ErrorResponse;

/**
 * TypeScript type alias for resolver return signatures that return a User list or error.
 */
export type UsersResponseType = UsersSuccessResponse | ErrorResponse;

/**
 * TypeScript type alias for resolver return signatures that return a base confirmation or error.
 * Used by delete operations.
 */
export type BaseApiResponseType = BaseResponse | ErrorResponse;
