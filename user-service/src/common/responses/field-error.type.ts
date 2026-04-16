import { ObjectType, Field, Directive } from '@nestjs/graphql';

/**
 * @type FieldError
 * @description Represents a single field-level validation failure.
 *
 * Produced by class-validator when an InputType fails validation.
 * Collected into an array on ErrorResponse so the client knows exactly
 * which fields to highlight in the UI.
 *
 * GraphQL schema:
 *   type FieldError {
 *     field:   String!
 *     message: String!
 *   }
 *
 * Example value:
 *   { field: "email", message: "email must be a valid address" }
 */
@Directive('@shareable')
@ObjectType({ description: 'A single field-level validation error' })
export class FieldError {
  /**
   * @field field
   * The name of the input field that failed validation.
   * Matches the property name on the InputType DTO.
   */
  @Field(() => String, {
    description: 'The input field that failed validation',
  })
  field: string;

  /**
   * @field message
   * Human-readable description of the validation failure.
   * Sourced directly from the class-validator message option.
   */
  @Field(() => String, {
    description: 'Human-readable description of the failure',
  })
  message: string;
}
