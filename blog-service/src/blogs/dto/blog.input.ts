import { InputType, Field, ID } from '@nestjs/graphql';
import {
  IsNotEmpty, IsString, IsUUID, IsOptional,
  MinLength, MaxLength,
} from 'class-validator';

/**
 * @dto CreateBlogInput
 * Validated by class-validator via the global ValidationPipe.
 * On failure, GqlValidationFilter converts violations to ErrorResponse.
 *
 * GraphQL schema:
 *   input CreateBlogInput { title: String!  content: String!  authorId: ID! }
 */
@InputType({ description: 'Input for creating a new blog post' })
export class CreateBlogInput {
  @Field(() => String, { description: 'Post headline (2–200 characters)' })
  @IsNotEmpty({ message: 'title must not be empty' })
  @IsString({ message: 'title must be a string' })
  @MinLength(2, { message: 'title must be at least 2 characters' })
  @MaxLength(200, { message: 'title must be at most 200 characters' })
  title: string;

  @Field(() => String, { description: 'Post body text (min 10 characters)' })
  @IsNotEmpty({ message: 'content must not be empty' })
  @IsString({ message: 'content must be a string' })
  @MinLength(10, { message: 'content must be at least 10 characters' })
  content: string;

  /**
   * UUID of the author in user-service.
   * blog-service stores this raw — no FK constraint (in-memory store).
   * Apollo Router resolves full User fields from user-service at query time.
   */
  @Field(() => ID, { description: 'UUID of the author (must exist in user-service)' })
  @IsUUID('4', { message: 'authorId must be a valid UUID v4' })
  authorId: string;
}

/**
 * @dto UpdateBlogInput
 * Only title and content are updatable. authorId is immutable after creation.
 *
 * GraphQL schema:
 *   input UpdateBlogInput { id: ID!  title: String  content: String }
 */
@InputType({ description: 'Input for partially updating a blog post' })
export class UpdateBlogInput {
  @Field(() => ID, { description: 'UUID of the blog post to update' })
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;

  @Field(() => String, { nullable: true, description: 'New headline' })
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  @MinLength(2, { message: 'title must be at least 2 characters' })
  @MaxLength(200, { message: 'title must be at most 200 characters' })
  title?: string;

  @Field(() => String, { nullable: true, description: 'New body text' })
  @IsOptional()
  @IsString({ message: 'content must be a string' })
  @MinLength(10, { message: 'content must be at least 10 characters' })
  content?: string;
}

/**
 * @dto DeleteBlogInput
 * GraphQL schema:
 *   input DeleteBlogInput { id: ID! }
 */
@InputType({ description: 'Input for deleting a blog post' })
export class DeleteBlogInput {
  @Field(() => ID, { description: 'UUID of the blog post to delete' })
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;
}
