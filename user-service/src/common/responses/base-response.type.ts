import { ObjectType, Field, Int, Directive } from '@nestjs/graphql';
import { DateTimeScalar } from '../graphql/scalars';

/**
 * @type BaseResponse
 * @description Generic success response without a data payload.
 *
 * Used for operations that don't return a domain entity, e.g.:
 *   - deleteUser  (returns confirmation, not a User)
 *   - deleteBlog  (returns confirmation, not a Blog)
 *
 * Part of the `ApiResponse` union type.  Clients discriminate on `__typename`.
 *
 * GraphQL schema:
 *   type BaseResponse {
 *     statusCode: Int!
 *     success:    Boolean!
 *     message:    String!
 *     timestamp:  DateTime!
 *   }
 */
@Directive('@shareable')
@ObjectType({ description: 'Generic success confirmation without a data payload' })
export class BaseResponse {
  /** HTTP-equivalent status code. Typically 200 or 204. */
  @Field(() => Int, { description: 'HTTP-equivalent status code' })
  statusCode: number;

  /** Always true for BaseResponse. */
  @Field(() => Boolean, { description: 'Always true for success responses' })
  success: boolean;

  /** Human-readable confirmation message. */
  @Field(() => String, { description: 'Human-readable success message' })
  message: string;

  /** ISO 8601 timestamp of when the response was generated (server clock). */
  @Field(() => DateTimeScalar, { description: 'Server-side response timestamp' })
  timestamp: Date;
}
