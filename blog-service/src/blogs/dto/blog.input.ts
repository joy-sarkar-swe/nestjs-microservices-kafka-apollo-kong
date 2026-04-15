import { InputType, Field, ID } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsUUID, IsOptional } from 'class-validator';

/**
 * @dto CreateBlogInput
 * @description Input for creating a new blog post.
 *   Shared between the GraphQL mutation (@Args) and the REST POST /blogs
 *   endpoint (@Body) — class-validator runs in both paths via the global
 *   ValidationPipe configured in main.ts.
 */
@InputType()
export class CreateBlogInput {
  /** Post headline — required, non-empty. */
  @Field()
  @IsNotEmpty({ message: 'title must not be empty' })
  @IsString()
  title: string;

  /** Post body text — required, non-empty. */
  @Field()
  @IsNotEmpty({ message: 'content must not be empty' })
  @IsString()
  content: string;

  /**
   * UUID of the existing user who is authoring this post.
   * blog-service stores this as a plain id (no FK constraint — in-memory store).
   * Apollo Router resolves the full User object from user-service at query time.
   */
  @Field(() => ID)
  @IsUUID('4', { message: 'authorId must be a valid UUID v4' })
  authorId: string;
}

/**
 * @dto UpdateBlogInput
 * @description Input for partially updating an existing blog post.
 *   `id` is always required; `title` and `content` are optional.
 *
 * Used by GraphQL mutation — for REST, `id` comes from the URL param
 * and is merged into this shape inside the controller.
 */
@InputType()
export class UpdateBlogInput {
  /** UUID of the blog post to update. */
  @Field(() => ID)
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;

  /** Optional new title. */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  title?: string;

  /** Optional new body content. */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  content?: string;
}

/**
 * @dto DeleteBlogInput
 * @description Minimal payload to identify the blog post to remove.
 *   Used by the GraphQL mutation only; REST uses a URL param.
 */
@InputType()
export class DeleteBlogInput {
  /** UUID of the blog post to delete. */
  @Field(() => ID)
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;
}
