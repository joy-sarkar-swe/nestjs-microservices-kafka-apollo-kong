import { HttpStatus } from "@nestjs/common";
import { ErrorResponse } from "./error-response.type.js";
import { BaseResponse } from "./base-response.type.js";
import { UserSuccessResponse, UsersSuccessResponse } from "./user-success-response.type.js";
import { FieldError } from "./field-error.type.js";
import { User } from "../../users/entities/user.entity.js";

/**
 * @factory ResponseFactory
 * @description Centralised factory for constructing all ApiResponse variants.
 *
 * Design rationale
 * ----------------
 * Every resolver delegates response construction to this factory.
 * This guarantees:
 *   1. Consistent shape — no resolver can accidentally omit `timestamp` etc.
 *   2. Consistent status codes — mapping is defined exactly once.
 *   3. Correct __typename — objects are constructed via `new ConcreteType()`
 *      so Apollo's resolveType() always receives a properly shaped value.
 *   4. Centralised timestamp — server clock called in one place only.
 *
 * Usage in resolvers
 * ------------------
 *   // Success
 *   return ResponseFactory.user(user, 'User created', HttpStatus.CREATED);
 *
 *   // Validation error (from filter)
 *   return ResponseFactory.validationError(fieldErrors);
 *
 *   // Not found
 *   return ResponseFactory.notFound('User "abc" not found');
 *
 *   // Deleted
 *   return ResponseFactory.deleted('User deleted successfully');
 */
export class ResponseFactory {
  // ── HELPERS ────────────────────────────────────────────────────────────────

  /** Returns current server time. Called once per response construction. */
  private static now(): Date {
    return new Date();
  }

  // ── SUCCESS RESPONSES ──────────────────────────────────────────────────────

  /**
   * @method user
   * Builds a UserSuccessResponse wrapping a single User entity.
   *
   * @param data       - The resolved User entity.
   * @param message    - Human-readable success message.
   * @param statusCode - HTTP-equivalent code (default 200).
   */
  static user(
    data: User,
    message = "Success",
    statusCode: number = HttpStatus.OK,
  ): UserSuccessResponse {
    const r = new UserSuccessResponse();
    r.statusCode = statusCode;
    r.success = true;
    r.message = message;
    r.data = data;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  /**
   * @method users
   * Builds a UsersSuccessResponse wrapping a User array.
   *
   * @param data       - Array of resolved User entities.
   * @param message    - Human-readable success message.
   * @param statusCode - HTTP-equivalent code (default 200).
   */
  static users(
    data: User[],
    message = "Success",
    statusCode: number = HttpStatus.OK,
  ): UsersSuccessResponse {
    const r = new UsersSuccessResponse();
    r.statusCode = statusCode;
    r.success = true;
    r.message = message;
    r.data = data;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  /**
   * @method deleted
   * Builds a BaseResponse confirming a successful deletion.
   * No data payload — the entity no longer exists.
   *
   * @param message - Human-readable confirmation.
   */
  static deleted(message = "Deleted successfully"): BaseResponse {
    const r = new BaseResponse();
    r.statusCode = HttpStatus.OK;
    r.success = true;
    r.message = message;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  // ── ERROR RESPONSES ────────────────────────────────────────────────────────

  /**
   * @method validationError
   * Builds an ErrorResponse for class-validator failures (HTTP 400).
   * Populates the `errors` array with field-level FieldError objects.
   *
   * @param errors  - Array of { field, message } objects from the validation filter.
   * @param message - Top-level summary (default: 'Validation failed').
   */
  static validationError(
    errors: FieldError[],
    message = "Validation failed",
  ): ErrorResponse {
    const r = new ErrorResponse();
    r.statusCode = HttpStatus.BAD_REQUEST;
    r.success = false;
    r.message = message;
    r.errors = errors;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  /**
   * @method notFound
   * Builds an ErrorResponse for missing resources (HTTP 404).
   *
   * @param message - Description of what was not found.
   */
  static notFound(message: string): ErrorResponse {
    const r = new ErrorResponse();
    r.statusCode = HttpStatus.NOT_FOUND;
    r.success = false;
    r.message = message;
    r.errors = null;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  /**
   * @method conflict
   * Builds an ErrorResponse for duplicate / conflict scenarios (HTTP 409).
   *
   * @param message - Description of the conflict.
   */
  static conflict(message: string): ErrorResponse {
    const r = new ErrorResponse();
    r.statusCode = HttpStatus.CONFLICT;
    r.success = false;
    r.message = message;
    r.errors = null;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  /**
   * @method internalError
   * Builds an ErrorResponse for unexpected server errors (HTTP 500).
   * The raw error message is NOT forwarded to the client for security.
   *
   * @param message - Safe, generic description of the failure.
   */
  static internalError(message = "An unexpected error occurred"): ErrorResponse {
    const r = new ErrorResponse();
    r.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    r.success = false;
    r.message = message;
    r.errors = null;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  /**
   * @method fromException
   * Converts any caught exception into the appropriate ApiResponse variant.
   * Resolvers catch exceptions in try/catch and delegate here instead of
   * letting them propagate as raw GraphQL errors.
   *
   * Mapping
   * ─────────────────────────────────────────────────────────
   * NotFoundException   (status 404) → notFound()
   * ConflictException   (status 409) → conflict()
   * Everything else                  → internalError()
   *
   * @param error - Any caught exception (typed as any for flexibility).
   */
  static fromException(error: any): ErrorResponse {
    const status: number = error?.status ?? error?.statusCode ?? 500;
    const message: string = error?.message ?? "An unexpected error occurred";

    switch (status) {
      case HttpStatus.NOT_FOUND:
        return ResponseFactory.notFound(message);
      case HttpStatus.CONFLICT:
        return ResponseFactory.conflict(message);
      case HttpStatus.BAD_REQUEST:
        return ResponseFactory.validationError([], message);
      default:
        return ResponseFactory.internalError();
    }
  }
}
