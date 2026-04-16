import { ObjectType, Field, Int, Directive } from '@nestjs/graphql';
import { DateTimeScalar } from '../graphql/scalars';
import { FieldError } from './field-error.type';

/**
 * @type ErrorResponse
 * Unified error envelope for all failure scenarios in blog-service.
 *
 * GraphQL schema:
 *   type ErrorResponse {
 *     statusCode: Int!  success: Boolean!  message: String!
 *     errors: [FieldError!]  timestamp: DateTime!
 *   }
 */
@Directive('@shareable')
@ObjectType({ description: 'Returned when a blog-service operation fails' })
export class ErrorResponse {
  @Field(() => Int, { description: 'HTTP-equivalent status code' })
  statusCode: number;

  @Field(() => Boolean, { description: 'Always false for error responses' })
  success: boolean;

  @Field(() => String, { description: 'Human-readable error summary' })
  message: string;

  @Field(() => [FieldError], {
    nullable: true,
    description: 'Field-level validation errors (present on status 400 only)',
  })
  errors?: FieldError[];

  @Field(() => DateTimeScalar, { description: 'Server-side response timestamp' })
  timestamp: Date;
}

/**
 * @type BaseResponse
 * Generic success confirmation — no data payload.
 * Returned by delete operations.
 *
 * GraphQL schema:
 *   type BaseResponse {
 *     statusCode: Int!  success: Boolean!  message: String!  timestamp: DateTime!
 *   }
 */
@Directive('@shareable')
@ObjectType({ description: 'Generic success confirmation without a data payload' })
export class BaseResponse {
  @Field(() => Int, { description: 'HTTP-equivalent status code' })
  statusCode: number;

  @Field(() => Boolean, { description: 'Always true for success responses' })
  success: boolean;

  @Field(() => String, { description: 'Human-readable success message' })
  message: string;

  @Field(() => DateTimeScalar, { description: 'Server-side response timestamp' })
  timestamp: Date;
}
