import { ObjectType, Field, Directive } from "@nestjs/graphql";

/**
 * @type FieldError
 * @description Represents a single field-level validation failure.
 *
 * Produced by class-validator when a blog-service InputType fails validation.
 * Collected into `ErrorResponse.errors[]` so the client knows exactly which
 * fields to highlight in the UI.
 *
 * Each service owns its own copy of FieldError because Apollo Federation
 * subgraphs are independently deployable and must not share code across
 * service boundaries. The `@shareable` directive allows the same type name
 * to appear in multiple subgraphs without causing composition errors.
 *
 * GraphQL schema:
 *   type FieldError { field: String!  message: String! }
 *
 * Example value:
 *   { field: "title", message: "title must not be empty" }
 */
@Directive("@shareable")
@ObjectType({ description: "A single field-level validation error" })
export class FieldError {
  /**
   * The name of the input field that failed validation.
   * Matches the property name on the InputType DTO (e.g. "title", "authorId").
   * Nested fields are represented with dot notation (e.g. "address.street").
   */
  @Field(() => String, { description: "The input field that failed validation" })
  field: string;

  /**
   * Human-readable description of the validation failure.
   * Sourced directly from the class-validator `message` option on the decorator.
   */
  @Field(() => String, { description: "Human-readable description of the failure" })
  message: string;
}
