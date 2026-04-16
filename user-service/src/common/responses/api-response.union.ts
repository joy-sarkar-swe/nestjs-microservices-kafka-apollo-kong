import { createUnionType } from '@nestjs/graphql';
import { ErrorResponse } from './error-response.type';
import { BaseResponse } from './base-response.type';
import { UserSuccessResponse, UsersSuccessResponse } from './user-success-response.type';

/**
 * @union ApiResponse
 * @description The single return type for ALL queries and mutations.
 *
 * Why a union?
 * ------------
 * A union forces the client to explicitly handle every possible outcome.
 * It is impossible for a resolver to return an untyped error or a raw entity
 * that bypasses the response envelope — TypeScript + GraphQL enforce this.
 *
 * Members
 * ─────────────────────────────────────────────────────────
 * ErrorResponse         — any failure (validation, not found, conflict, 500)
 * BaseResponse          — success without a data payload (e.g. delete)
 * UserSuccessResponse   — success with a single User entity
 * UsersSuccessResponse  — success with a User array
 *
 * Client discrimination
 * ---------------------
 * Clients use the `__typename` field to branch:
 *
 *   query {
 *     getUser(id: "…") {
 *       __typename
 *       ... on UserSuccessResponse  { data { id name email } }
 *       ... on ErrorResponse        { statusCode message errors { field message } }
 *     }
 *   }
 *
 * GraphQL schema:
 *   union ApiResponse =
 *     | ErrorResponse
 *     | BaseResponse
 *     | UserSuccessResponse
 *     | UsersSuccessResponse
 *
 * __resolveType strategy
 * ----------------------
 * NestJS createUnionType() accepts a `resolveType` function.
 * We inspect the runtime shape of the value — specifically the presence of
 * the `success` field and the type of `data` — to determine the correct type.
 * This is more reliable than checking constructor names (which get minified).
 */
export const ApiResponse = createUnionType({
  name: 'ApiResponse',
  description:
    'Union of all possible GraphQL operation outcomes. ' +
    'Use __typename to discriminate in client queries.',
  types: () =>
    [
      ErrorResponse,
      BaseResponse,
      UserSuccessResponse,
      UsersSuccessResponse,
    ] as const,

  /**
   * @resolveType
   * Called by Apollo at query-time to determine which concrete type a value is.
   *
   * Resolution rules (evaluated in order):
   * 1. success === false                         → ErrorResponse
   * 2. success === true AND data is an array     → UsersSuccessResponse
   * 3. success === true AND data is an object    → UserSuccessResponse
   * 4. success === true AND no data field        → BaseResponse
   */
  resolveType(value: any) {
    if (value.success === false) {
      return ErrorResponse;
    }
    if (value.success === true) {
      if (Array.isArray(value.data)) {
        return UsersSuccessResponse;
      }
      if (value.data !== undefined && value.data !== null) {
        return UserSuccessResponse;
      }
      return BaseResponse;
    }
    // Fallback — should never reach here with ResponseFactory
    return ErrorResponse;
  },
});

/** TypeScript type alias for resolver return signatures. */
export type ApiResponseType =
  | ErrorResponse
  | BaseResponse
  | UserSuccessResponse
  | UsersSuccessResponse;
