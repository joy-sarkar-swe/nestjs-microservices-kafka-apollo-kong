import { createUnionType } from '@nestjs/graphql';
import { ErrorResponse } from './error-response.type';
import { BaseResponse } from './base-response.type';
import { UserSuccessResponse, UsersSuccessResponse } from './user-success-response.type';

/**
 * @union UserResponse
 * @description Union of success (single User) or error.
 */
export const UserResponse = createUnionType({
  name: 'UserResponse',
  description: 'Returns UserSuccessResponse or ErrorResponse',
  types: () => [UserSuccessResponse, ErrorResponse] as const,
  resolveType(value) {
    if (value.success === false) return ErrorResponse;
    if (value.success === true) return UserSuccessResponse;
    return null;
  },
});

/**
 * @union UsersResponse
 * @description Union of success (User list) or error.
 */
export const UsersResponse = createUnionType({
  name: 'UsersResponse',
  description: 'Returns UsersSuccessResponse or ErrorResponse',
  types: () => [UsersSuccessResponse, ErrorResponse] as const,
  resolveType(value) {
    if (value.success === false) return ErrorResponse;
    if (value.success === true) return UsersSuccessResponse;
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

/** TypeScript type aliases for resolver return signatures. */
export type UserResponseType = UserSuccessResponse | ErrorResponse;
export type UsersResponseType = UsersSuccessResponse | ErrorResponse;
export type BaseApiResponseType = BaseResponse | ErrorResponse;
