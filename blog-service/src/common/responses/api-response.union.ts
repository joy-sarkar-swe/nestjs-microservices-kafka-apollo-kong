import { createUnionType } from '@nestjs/graphql';
import { ErrorResponse, BaseResponse } from './base-responses.type';
import { BlogSuccessResponse, BlogsSuccessResponse } from './blog-success-response.type';

/**
 * @union BlogResponse
 * @description GraphQL union returned by single-blog queries and mutations.
 *
 * Members:
 *   - {@link BlogSuccessResponse}  — operation succeeded; `data` holds the Blog.
 *   - {@link ErrorResponse}        — operation failed; `errors` may hold field violations.
 *
 * Client usage:
 * ```graphql
 * query {
 *   getBlog(input: { id: "..." }) {
 *     __typename
 *     ... on BlogSuccessResponse { data { id title content author { name email } } }
 *     ... on ErrorResponse       { statusCode message errors { field message } }
 *   }
 * }
 * ```
 */
export const BlogResponse = createUnionType({
  name: 'BlogResponse',
  description: 'Returns BlogSuccessResponse or ErrorResponse',
  types: () => [BlogSuccessResponse, ErrorResponse] as const,
  /**
   * Determines the concrete GraphQL type at query-time by inspecting the
   * `success` boolean set by ResponseFactory on every response object.
   *
   * @param {object} value - The runtime response object.
   * @returns {typeof BlogSuccessResponse | typeof ErrorResponse | null}
   */
  resolveType(value) {
    if (value.success === false) return ErrorResponse;
    if (value.success === true) return BlogSuccessResponse;
    return null;
  },
});

/**
 * @union BlogsResponse
 * @description GraphQL union returned by the `getBlogs` list query.
 *
 * Members:
 *   - {@link BlogsSuccessResponse} — operation succeeded; `data` holds the Blog array.
 *   - {@link ErrorResponse}        — operation failed.
 */
export const BlogsResponse = createUnionType({
  name: 'BlogsResponse',
  description: 'Returns BlogsSuccessResponse or ErrorResponse',
  types: () => [BlogsSuccessResponse, ErrorResponse] as const,
  /**
   * Determines the concrete GraphQL type at query-time.
   *
   * @param {object} value - The runtime response object.
   * @returns {typeof BlogsSuccessResponse | typeof ErrorResponse | null}
   */
  resolveType(value) {
    if (value.success === false) return ErrorResponse;
    if (value.success === true) return BlogsSuccessResponse;
    return null;
  },
});

/**
 * @union BaseApiResponse
 * @description GraphQL union returned by operations with no data payload on success.
 *
 * Used by `deleteBlog` — on success the entity no longer exists, so only
 * a confirmation message is returned rather than the deleted entity itself.
 *
 * Members:
 *   - {@link BaseResponse}  — deletion confirmed.
 *   - {@link ErrorResponse} — operation failed (e.g. blog not found).
 */
export const BaseApiResponse = createUnionType({
  name: 'BaseApiResponse',
  description: 'Returns BaseResponse or ErrorResponse',
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
 * TypeScript type alias for resolver return signatures that return a single Blog or error.
 * Used by `getBlog`, `createBlog`, and `updateBlog` resolvers.
 */
export type BlogResponseType = BlogSuccessResponse | ErrorResponse;

/**
 * TypeScript type alias for resolver return signatures that return a Blog list or error.
 * Used by the `getBlogs` resolver.
 */
export type BlogsResponseType = BlogsSuccessResponse | ErrorResponse;

/**
 * TypeScript type alias for resolver return signatures returning a base confirmation or error.
 * Used by the `deleteBlog` resolver.
 */
export type BaseApiResponseType = BaseResponse | ErrorResponse;
