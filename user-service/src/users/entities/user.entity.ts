import { ObjectType, Field, ID, Directive } from '@nestjs/graphql';

/**
 * @entity User
 * @description Apollo Federation v2 entity owned by user-service.
 *
 * Federation key: `id` (UUID v4)
 * Apollo Router uses @key to route cross-service entity resolution back here.
 *
 * This class is also used by:
 *   - UserSuccessResponse.data field
 *   - UsersSuccessResponse.data field
 *   - blog-service's User stub (@extends @external)
 *   - REST controllers (serialised to JSON)
 *
 * GraphQL schema (generated):
 *   type User @key(fields: "id") {
 *     id:    ID!
 *     name:  String!
 *     email: String!
 *   }
 */
@ObjectType({ description: 'A registered user in the system' })
@Directive('@key(fields: "id")')
export class User {
  /** UUID v4 primary key — Apollo Federation @key. */
  @Field(() => ID, { description: 'Unique user identifier (UUID v4)' })
  id: string;

  /** Full display name. */
  @Field(() => String, { description: 'Full display name' })
  name: string;

  /** Unique email address. */
  @Field(() => String, { description: 'Unique email address' })
  email: string;
}
