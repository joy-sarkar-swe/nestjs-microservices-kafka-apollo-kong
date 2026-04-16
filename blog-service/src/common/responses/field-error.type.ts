import { ObjectType, Field, Directive } from '@nestjs/graphql';

/**
 * @type FieldError
 * Identical to user-service FieldError — each subgraph defines its own
 * copy because Apollo Federation subgraphs are independently deployable
 * and must not share code across service boundaries.
 *
 * GraphQL schema:
 *   type FieldError { field: String!  message: String! }
 */
@Directive('@shareable')
@ObjectType({ description: 'A single field-level validation error' })
export class FieldError {
  @Field(() => String, { description: 'The input field that failed validation' })
  field: string;

  @Field(() => String, { description: 'Human-readable description of the failure' })
  message: string;
}
