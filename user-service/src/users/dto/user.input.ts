import { InputType, Field, ID } from '@nestjs/graphql';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsUUID,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * @dto CreateUserInput
 * @description Payload for creating a new user.
 *
 * Validated by class-validator via the global ValidationPipe.
 * On failure, GqlValidationFilter converts violations to ErrorResponse.
 *
 * GraphQL schema:
 *   input CreateUserInput {
 *     name:  String!
 *     email: String!
 *   }
 */
@InputType({ description: 'Input for creating a new user' })
export class CreateUserInput {
  /**
   * Full display name.
   * Min 2 characters, max 100 characters.
   */
  @Field(() => String, { description: 'Full display name (2–100 characters)' })
  @IsNotEmpty({ message: 'name must not be empty' })
  @IsString({ message: 'name must be a string' })
  @MinLength(2, { message: 'name must be at least 2 characters' })
  @MaxLength(100, { message: 'name must be at most 100 characters' })
  name: string;

  /**
   * Email address — must be valid RFC 5322 format.
   * Uniqueness is enforced at the service layer.
   */
  @Field(() => String, { description: 'Valid email address' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;
}

/**
 * @dto UpdateUserInput
 * @description Payload for partially updating an existing user.
 *
 * `id` is always required. `name` and `email` are optional —
 * only provided fields are applied (patch semantics).
 *
 * GraphQL schema:
 *   input UpdateUserInput {
 *     id:    ID!
 *     name:  String
 *     email: String
 *   }
 */
@InputType({ description: 'Input for partially updating a user' })
export class UpdateUserInput {
  /** UUID of the user record to update. */
  @Field(() => ID, { description: 'UUID of the user to update' })
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;

  /** Optional new display name. */
  @Field(() => String, { nullable: true, description: 'New display name' })
  @IsOptional()
  @IsString({ message: 'name must be a string' })
  @MinLength(2, { message: 'name must be at least 2 characters' })
  @MaxLength(100, { message: 'name must be at most 100 characters' })
  name?: string;

  /** Optional new email address. */
  @Field(() => String, { nullable: true, description: 'New email address' })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;
}

/**
 * @dto DeleteUserInput
 * @description Minimal payload to identify the user to remove.
 *
 * GraphQL schema:
 *   input DeleteUserInput {
 *     id: ID!
 *   }
 */
@InputType({ description: 'Input for deleting a user' })
export class DeleteUserInput {
  /** UUID of the user to delete. */
  @Field(() => ID, { description: 'UUID of the user to delete' })
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;
}

/**
 * @dto GetUserArgs
 * @description Argument for fetching a single user.
 */
@InputType({ description: 'Arguments for fetching a user by ID' })
export class GetUserArgs {
  @Field(() => ID, { description: 'UUID of the user to fetch' })
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;
}
