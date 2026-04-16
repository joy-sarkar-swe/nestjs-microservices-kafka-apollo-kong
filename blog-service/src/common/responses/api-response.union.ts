import { createUnionType } from '@nestjs/graphql';
import { ErrorResponse, BaseResponse } from './base-responses.type';
import { BlogSuccessResponse, BlogsSuccessResponse } from './blog-success-response.type';

/**
 * @union ApiResponse  (blog-service)
 * @description Single return type for ALL blog-service queries and mutations.
 *
 * Members
 * ─────────────────────────────────────────────────────────
 * ErrorResponse        — any failure (validation, not found, conflict, 500)
 * BaseResponse         — success without data payload (delete operations)
 * BlogSuccessResponse  — success with a single Blog entity
 * BlogsSuccessResponse — success with a Blog array
 *
 * Client discrimination via __typename:
 *   query {
 *     getBlog(id: "…") {
 *       __typename
 *       ... on BlogSuccessResponse {
 *         data {
 *           id title content authorId
 *           author { id name email }   ← resolved from user-service by Router
 *         }
 *       }
 *       ... on ErrorResponse { statusCode message errors { field message } }
 *     }
 *   }
 *
 * GraphQL schema:
 *   union ApiResponse =
 *     | ErrorResponse
 *     | BaseResponse
 *     | BlogSuccessResponse
 *     | BlogsSuccessResponse
 */
export const ApiResponse = createUnionType({
  name: 'ApiResponse',
  description:
    'Union of all possible blog-service operation outcomes. ' +
    'Use __typename to discriminate in client queries.',
  types: () =>
    [ErrorResponse, BaseResponse, BlogSuccessResponse, BlogsSuccessResponse] as const,

  /**
   * @resolveType
   * Determines concrete GraphQL type at query-time based on runtime shape.
   *
   * Rules (evaluated in order):
   * 1. success === false                     → ErrorResponse
   * 2. success === true, data is array       → BlogsSuccessResponse
   * 3. success === true, data is object      → BlogSuccessResponse
   * 4. success === true, no data             → BaseResponse
   */
  resolveType(value: any) {
    if (value.success === false) return ErrorResponse;
    if (value.success === true) {
      if (Array.isArray(value.data)) return BlogsSuccessResponse;
      if (value.data !== undefined && value.data !== null) return BlogSuccessResponse;
      return BaseResponse;
    }
    return ErrorResponse;
  },
});

export type ApiResponseType =
  | ErrorResponse
  | BaseResponse
  | BlogSuccessResponse
  | BlogsSuccessResponse;
