import { ObjectType, Field, ID, Directive } from '@nestjs/graphql';

/**
 * @entity User  (stub — blog-service)
 * @description A minimal representation of the User entity used within
 *   blog-service solely to model the cross-service relationship.
 *
 * Federation directives
 * ─────────────────────
 * @extends  — declares that this type is defined in another subgraph (user-service).
 * @key(fields: "id")  — `id` is the linking key between subgraphs.
 * @external (on `id` field) — blog-service does NOT own this field; it only
 *   borrows it to express the relationship.
 *
 * At query time: when a client requests `author { id name email }`, Apollo
 * Router sees the @extends + @key, sends an `_entities` batch request to
 * user-service with `{ __typename: "User", id }`, and stitches the result.
 */
@ObjectType()
@Directive('@extends')
@Directive('@key(fields: "id")')
export class User {
  /**
   * @field id
   * External key — owned by user-service, referenced here only.
   */
  @Field(() => ID)
  @Directive('@external')
  id: string;
}

/**
 * @entity Blog
 * @description The primary entity owned by blog-service.
 *
 * @key(fields: "id") — Apollo Router uses this to route entity-resolution
 *   requests for Blog back to blog-service when another subgraph references it.
 *
 * Fields
 * ──────
 * id       — UUID primary key
 * title    — post headline
 * content  — post body text
 * authorId — UUID of the author; used internally to build the User reference
 * author   — virtual field resolved via Apollo Federation from user-service
 */
@ObjectType()
@Directive('@key(fields: "id")')
export class Blog {
  /** UUID primary key — doubles as the Apollo Federation @key. */
  @Field(() => ID)
  id: string;

  /** Headline of the post. */
  @Field()
  title: string;

  /** Full body text. */
  @Field()
  content: string;

  /**
   * UUID of the author.
   * Stored internally; returned via REST so clients can join manually if needed.
   * Via GraphQL the `author` field is preferred (resolved cross-service by Router).
   */
  @Field(() => ID)
  authorId: string;

  /**
   * Federated User object.
   * Populated by the `author` @ResolveField resolver which returns { id: authorId }.
   * Apollo Router then fetches full User fields from user-service via _entities.
   * Marked nullable because REST consumers never see this field.
   */
  @Field(() => User, { nullable: true })
  author?: User;
}
