import { ObjectType, Field, Int, Directive } from '@nestjs/graphql';
import { DateTimeScalar } from '../graphql/scalars';
import { FieldError } from './field-error.type';

/**
 * @type ErrorResponse
 * @description Unified error response returned for all failure scenarios:
 *   - Input validation failures (status 400) — `errors` array populated
 *   - Not found (status 404)                  — `errors` null
 *   - Conflict / duplicate (status 409)       — `errors` null
 *   - Internal server error (status 500)      — `errors` null
 *
 * Part of the `ApiResponse` union type.  Clients discriminate on `__typename`.
 *
 * GraphQL schema:
 *   type ErrorResponse {
 *     statusCode: Int!
 *     success:    Boolean!
 *     message:    String!
 *     errors:     [FieldError!]
 *     timestamp:  DateTime!
 *   }
 */
@Directive('@shareable')
@ObjectType({ description: 'Returned when an operation fails for any reason' })
export class ErrorResponse {
  /** Always false for ErrorResponse. Enables quick client-side branching. */
  @Field(() => Boolean, { description: 'Always false for error responses' })
  success: boolean;

  /** Top-level human-readable error description. */
  @Field(() => String, { description: 'Human-readable error summary' })
  message: string;

  /**
   * HTTP-equivalent status code.
   * 400 — validation failure
   * 404 — resource not found
   * 409 — conflict (e.g. duplicate email)
   * 500 — unexpected server error
   */
  @Field(() => Int, { description: 'HTTP-equivalent status code' })
  statusCode: number;

  /** ISO 8601 timestamp of when the response was generated (server clock). */
  @Field(() => DateTimeScalar, { description: 'Server-side response timestamp' })
  timestamp: Date;

  /**
   * Field-level validation errors.
   * Present only when statusCode === 400 and class-validator caught failures.
   * Null for all other error types.
   */
  @Field(() => [FieldError], {
    nullable: true,
    description: 'Field-level validation errors (present on status 400 only)',
  })
  errors?: FieldError[];
}
