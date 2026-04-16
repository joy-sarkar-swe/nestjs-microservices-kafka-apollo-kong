import { createUnionType } from '@nestjs/graphql';
import { ErrorResponse, BaseResponse } from './base-responses.type';
import { BlogSuccessResponse, BlogsSuccessResponse } from './blog-success-response.type';

/**
 * @union BlogResponse
 * @description Union of success (single Blog) or error.
 */
export const BlogResponse = createUnionType({
  name: 'BlogResponse',
  description: 'Returns BlogSuccessResponse or ErrorResponse',
  types: () => [BlogSuccessResponse, ErrorResponse] as const,
  resolveType(value) {
    if (value.success === false) return ErrorResponse;
    if (value.success === true) return BlogSuccessResponse;
    return null;
  },
});

/**
 * @union BlogsResponse
 * @description Union of success (Blog list) or error.
 */
export const BlogsResponse = createUnionType({
  name: 'BlogsResponse',
  description: 'Returns BlogsSuccessResponse or ErrorResponse',
  types: () => [BlogsSuccessResponse, ErrorResponse] as const,
  resolveType(value) {
    if (value.success === false) return ErrorResponse;
    if (value.success === true) return BlogsSuccessResponse;
    return null;
  },
});

/**
 * @union BaseApiResponse
 * @description Union of generic success or error.
 */
export const BaseApiResponse = createUnionType({
  name: 'BaseApiResponse',
  description: 'Returns BaseResponse or ErrorResponse',
  types: () => [BaseResponse, ErrorResponse] as const,
  resolveType(value) {
    if (value.success === false) return ErrorResponse;
    if (value.success === true) return BaseResponse;
    return null;
  },
});

export type BlogResponseType = BlogSuccessResponse | ErrorResponse;
export type BlogsResponseType = BlogsSuccessResponse | ErrorResponse;
export type BaseApiResponseType = BaseResponse | ErrorResponse;
