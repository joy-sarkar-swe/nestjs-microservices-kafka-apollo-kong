import { ObjectType, Field, ID, Directive } from '@nestjs/graphql';

/**
 * @entity User
 * @description Apollo Federation entity for the user-service subgraph.
 *
 * Federation decorators
 * ---------------------
 * @key(fields: "id")  — declares `id` as the primary key that Apollo Router
 *   uses to route cross-service entity-resolution requests back to this subgraph.
 *
 * REST representation
 * -------------------
 * The same class is returned as JSON by REST controllers, so field names must
 * be stable (camelCase matches both GraphQL convention and JSON serialisation).
 */
@ObjectType()
@Directive('@key(fields: "id")')
export class User {
  /**
   * @field id
   * UUID v4 primary key — serves as the Apollo Federation @key.
   */
  @Field(() => ID)
  id: string;

  /**
   * @field name
   * Human-readable display name.
   */
  @Field()
  name: string;

  /**
   * @field email
   * Unique email address — enforced at the service level.
   */
  @Field()
  email: string;
}
