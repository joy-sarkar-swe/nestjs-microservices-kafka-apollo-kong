import { ObjectType, Field, ID, Directive } from "@nestjs/graphql";

/**
 * @entity User  (stub — blog-service)
 * @description Minimal User reference in blog-service.
 *
 * Federation directives:
 *   @extends        — type is owned by user-service subgraph
 *   @key(fields:"id") — id is the federation linking key
 *   @external (id)  — blog-service does not own this field
 *
 * When a client queries `author { id name email }`:
 *   1. blog-service resolver returns `{ id: blog.authorId }` (this stub)
 *   2. Apollo Router sees User @key(fields:"id")
 *   3. Router sends _entities batch to user-service: { __typename:"User", id }
 *   4. user-service resolveReference() returns the full User
 *   5. Router stitches name/email into the response
 *
 * The author field resolves perfectly to every Blog because:
 *   - @ResolveField author() always returns { id: blog.authorId }
 *   - The Router always has the id needed to dispatch the _entities request
 *   - Even if the blog store has 1000 blogs, the Router batches all _entities
 *     calls in a single round-trip to user-service (DataLoader-style)
 */
@ObjectType({ description: "User reference stub (owned by user-service)" })
@Directive("@extends")
@Directive("@key(fields: \"id\")")
export class User {
  /**
   * User UUID — serves as the Apollo Federation @key linking this stub to the
   * full User entity in user-service. Marked @external because blog-service
   * does not own or store User data beyond this id.
   */
  @Field(() => ID, { description: "User UUID — federation linking key" })
  @Directive("@external")
  id: string;
}

/**
 * @entity Blog
 * @description Primary entity owned by blog-service.
 *
 * @key(fields: "id") — blog-service owns this entity.
 *   Apollo Router routes _entities requests for Blog back here.
 *
 * Fields
 * ──────────────────────────────────────────────────────────────
 * id       — UUID primary key (federation @key)
 * title    — post headline
 * content  — post body text
 * authorId — UUID of the author (stored internally; used for federation join)
 * author   — federated User reference; resolved by @ResolveField + Apollo Router
 *
 * How author resolution works per Blog
 * ──────────────────────────────────────────────────────────────
 * The resolver's @ResolveField author() returns { id: blog.authorId } for
 * EVERY Blog in the result set. Apollo Router collects all these User stubs
 * into a single _entities batch query to user-service — so resolving 100
 * blogs still costs only ONE round-trip to user-service, not 100.
 */
@ObjectType({ description: "A blog post owned by blog-service" })
@Directive("@key(fields: \"id\")")
export class Blog {
  /** UUID v4 primary key — doubles as the Apollo Federation @key. */
  @Field(() => ID, { description: "Unique blog post identifier (UUID v4)" })
  id: string;

  /** Headline / title of the blog post. */
  @Field(() => String, { description: "Post headline" })
  title: string;

  /** Full body text of the blog post. */
  @Field(() => String, { description: "Post body text" })
  content: string;

  /**
   * UUID of the author — references User.id in user-service.
   * Stored as a plain string; referential integrity is maintained via
   * Kafka events (user.deleted triggers orphan post cleanup).
   */
  @Field(() => ID, { description: "UUID of the author — references User.id in user-service" })
  authorId: string;

  /**
   * @field author
   * Federation User reference.
   * Set by @ResolveField to { id: blog.authorId }.
   * Router resolves full User fields from user-service via _entities.
   * Nullable because REST consumers receive flat JSON (no author field).
   */
  @Field(() => User, {
    nullable: true,
    description: "Author resolved from user-service via Apollo Federation",
  })
  author?: User;
}
