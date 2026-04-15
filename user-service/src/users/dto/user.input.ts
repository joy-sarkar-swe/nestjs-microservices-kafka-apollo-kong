import { InputType, Field, ID } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, IsString, IsUUID, IsOptional } from 'class-validator';

/**
 * @dto CreateUserInput
 * @description Payload for creating a new user.
 *   Used by both the GraphQL mutation and the REST POST /users endpoint.
 *   class-validator decorators enforce correctness at the transport boundary.
 */
@InputType()
export class CreateUserInput {
  /** Full display name — required, non-empty string. */
  @Field()
  @IsNotEmpty({ message: 'name must not be empty' })
  @IsString()
  name: string;

  /** Email — required, valid RFC 5322 format. */
  @Field()
  @IsEmail({}, { message: 'email must be a valid address' })
  email: string;
}

/**
 * @dto UpdateUserInput
 * @description Payload for partially updating an existing user.
 *   `id` is always required; `name` and `email` are optional.
 *   Applies to both GraphQL mutation and REST PUT /users/:id.
 */
@InputType()
export class UpdateUserInput {
  /** UUID of the user record to update. */
  @Field(() => ID)
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;

  /** Optional new display name. */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  /** Optional new email address. */
  @Field({ nullable: true })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid address' })
  email?: string;
}

/**
 * @dto DeleteUserInput
 * @description Minimal payload to identify the user to remove.
 *   Used by the GraphQL mutation only; REST uses a URL param.
 */
@InputType()
export class DeleteUserInput {
  /** UUID of the user to delete. */
  @Field(() => ID)
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;
}
