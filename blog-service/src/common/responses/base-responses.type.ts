import { Directive, Field, Int, ObjectType } from "@nestjs/graphql";
import { DateTimeScalar } from "../graphql/scalars.js";
import { FieldError } from "./field-error.type.js";

/**
 * @type ErrorResponse
 * @description Unified error response envelope for all failure scenarios in blog-service.
 *
 * Returned for: validation failures (400), not found (404), conflicts (409),
 * and unexpected server errors (500). Clients discriminate on `__typename`.
 *
 * @shareable — required by Apollo Federation v2 when the same type name
 * (ErrorResponse) appears in multiple subgraphs. Without @shareable, the
 * Router would reject the composed supergraph.
 *
 * GraphQL schema:
 *   type ErrorResponse {
 *     success: Boolean!
 *     message: String!
 *     statusCode: Int!
 *     timestamp: DateTime!
 *     errors: [FieldError!]
 *   }
 */
@Directive("@shareable")
@ObjectType({ description: "Returned when a blog-service operation fails" })
export class ErrorResponse {
  /** Always false for ErrorResponse. Enables quick client-side branching on `success`. */
  @Field(() => Boolean, { description: "Always false for error responses" })
  success: boolean;

  /** Top-level human-readable description of the failure. */
  @Field(() => String, { description: "Human-readable error summary" })
  message: string;

  /**
   * HTTP-equivalent status code.
   * 400 — validation failure (errors array populated)
   * 404 — blog or referenced resource not found
   * 409 — conflict (e.g. immutable field change attempt)
   * 500 — unexpected server error
   */
  @Field(() => Int, { description: "HTTP-equivalent status code" })
  statusCode: number;

  /** ISO 8601 timestamp of when the response was generated (server clock). */
  @Field(() => DateTimeScalar, {
    description: "Server-side response timestamp",
  })
  timestamp: Date;

  /**
   * Field-level validation errors from class-validator.
   * Populated only when statusCode === 400; null for all other error types.
   */
  @Field(() => [FieldError], {
    nullable: true,
    description: "Field-level validation errors (present on status 400 only)",
  })
  errors?: FieldError[];
}

/**
 * @type BaseResponse
 * @description Generic success confirmation without a data payload.
 *
 * Returned by `deleteBlog` — the entity no longer exists after deletion,
 * so returning the deleted Blog would be misleading. Clients receive
 * a confirmation message and status code instead.
 *
 * @shareable — see ErrorResponse above for rationale.
 *
 * GraphQL schema:
 *   type BaseResponse {
 *     success: Boolean!   message: String!   statusCode: Int!   timestamp: DateTime!
 *   }
 */
@Directive("@shareable")
@ObjectType({
  description: "Generic success confirmation without a data payload",
})
export class BaseResponse {
  /** Always true for BaseResponse. */
  @Field(() => Boolean, { description: "Always true for success responses" })
  success: boolean;

  /** Human-readable confirmation message (e.g. "Blog post deleted successfully"). */
  @Field(() => String, { description: "Human-readable success message" })
  message: string;

  /** HTTP-equivalent status code. Typically 200 for successful deletions. */
  @Field(() => Int, { description: "HTTP-equivalent status code" })
  statusCode: number;

  /** ISO 8601 timestamp of when the response was generated (server clock). */
  @Field(() => DateTimeScalar, {
    description: "Server-side response timestamp",
  })
  timestamp: Date;
}
