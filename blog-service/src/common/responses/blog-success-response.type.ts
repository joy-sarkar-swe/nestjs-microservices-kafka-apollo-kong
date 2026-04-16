import { ObjectType, Field, Int } from '@nestjs/graphql';
import { DateTimeScalar } from '../graphql/scalars';
import { Blog } from '../../blogs/entities/blog.entity';

/**
 * @type BlogSuccessResponse
 * @description Specific success response wrapping a single Blog entity.
 *
 * The `data` field contains the full Blog object including the federation
 * `author` stub `{ id }` — Apollo Router resolves full User fields from
 * user-service when the client queries `data { author { name email } }`.
 *
 * GraphQL schema:
 *   type BlogSuccessResponse {
 *     statusCode: Int!  success: Boolean!  message: String!
 *     data: Blog!  timestamp: DateTime!
 *   }
 */
@ObjectType({ description: 'Success response wrapping a single Blog entity' })
export class BlogSuccessResponse {
  @Field(() => Int, { description: 'HTTP-equivalent status code' })
  statusCode: number;

  @Field(() => Boolean, { description: 'Always true' })
  success: boolean;

  @Field(() => String, { description: 'Human-readable success message' })
  message: string;

  /** The resolved Blog entity — author field is a federation stub { id }. */
  @Field(() => Blog, { description: 'The resolved Blog entity' })
  data: Blog;

  @Field(() => DateTimeScalar, { description: 'Server-side response timestamp' })
  timestamp: Date;
}

/**
 * @type BlogsSuccessResponse
 * @description Specific success response wrapping a Blog array.
 *
 * GraphQL schema:
 *   type BlogsSuccessResponse {
 *     statusCode: Int!  success: Boolean!  message: String!
 *     data: [Blog!]!  timestamp: DateTime!
 *   }
 */
@ObjectType({ description: 'Success response wrapping a list of Blog entities' })
export class BlogsSuccessResponse {
  @Field(() => Int)
  statusCode: number;

  @Field(() => Boolean)
  success: boolean;

  @Field(() => String)
  message: string;

  @Field(() => [Blog], { description: 'The resolved Blog list' })
  data: Blog[];

  @Field(() => DateTimeScalar)
  timestamp: Date;
}
