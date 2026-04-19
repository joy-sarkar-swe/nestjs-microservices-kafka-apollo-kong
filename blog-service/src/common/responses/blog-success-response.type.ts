import { Field, Int, ObjectType } from "@nestjs/graphql";
import { Blog } from "../../blogs/entities/blog.entity";
import { DateTimeScalar } from "../graphql/scalars";

/**
 * @type BlogSuccessResponse
 * @description Success response wrapping a single Blog entity.
 *
 * The `data.author` field is a federation stub `{ id }` in GraphQL responses —
 * Apollo Router resolves the full User from user-service when the client
 * queries `data { author { name email } }`.
 *
 * In REST responses, `author` is fully resolved by BlogsRestController via
 * UserServiceClient before being serialised — REST consumers receive a
 * complete `BlogWithAuthor` shape (not this GraphQL type directly).
 *
 * Part of the `BlogResponse` union. Clients discriminate on `__typename`.
 *
 * GraphQL schema:
 *   type BlogSuccessResponse {
 *     success:    Boolean!
 *     message:    String!
 *     statusCode: Int!
 *     timestamp:  DateTime!
 *     data:       Blog!
 *   }
 */
@ObjectType({ description: "Success response wrapping a single Blog entity" })
export class BlogSuccessResponse {
  /** Always true for BlogSuccessResponse. */
  @Field(() => Boolean, { description: "Always true" })
  success: boolean;

  /** Human-readable success message. */
  @Field(() => String, { description: "Human-readable success message" })
  message: string;

  /** HTTP-equivalent status code. Typically 200 (fetch/update) or 201 (create). */
  @Field(() => Int, { description: "HTTP-equivalent status code" })
  statusCode: number;

  /** ISO 8601 timestamp of when the response was generated (server clock). */
  @Field(() => DateTimeScalar, {
    description: "Server-side response timestamp",
  })
  timestamp: Date;

  /** The resolved Blog entity — author field is a federation stub { id } in GraphQL. */
  @Field(() => Blog, { description: "The resolved Blog entity" })
  data: Blog;
}

/**
 * @type BlogsSuccessResponse
 * @description Success response wrapping a Blog array.
 *
 * Returned by the `getBlogs` query when the operation succeeds.
 * Each Blog in `data` carries an author federation stub `{ id }` in GraphQL;
 * Apollo Router resolves full User fields per-blog via a single batched
 * `_entities` request to user-service.
 *
 * Clients discriminate on `__typename === 'BlogsSuccessResponse'`.
 *
 * GraphQL schema:
 *   type BlogsSuccessResponse {
 *     success:    Boolean!
 *     message:    String!
 *     statusCode: Int!
 *     timestamp:  DateTime!
 *     data:       [Blog!]!
 *   }
 */
@ObjectType({
  description: "Success response wrapping a list of Blog entities",
})
export class BlogsSuccessResponse {
  /** Always true for BlogsSuccessResponse. */
  @Field(() => Boolean)
  success: boolean;

  /** Human-readable success message. */
  @Field(() => String)
  message: string;

  /** HTTP-equivalent status code. Typically 200. */
  @Field(() => Int)
  statusCode: number;

  /** ISO 8601 timestamp of when the response was generated (server clock). */
  @Field(() => DateTimeScalar)
  timestamp: Date;

  /** The resolved Blog list. Empty array when no blog posts exist. */
  @Field(() => [Blog], { description: "The resolved Blog list" })
  data: Blog[];
}
