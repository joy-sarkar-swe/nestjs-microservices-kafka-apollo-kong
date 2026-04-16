import { HttpStatus } from '@nestjs/common';
import { ErrorResponse, BaseResponse } from './base-responses.type';
import { BlogSuccessResponse, BlogsSuccessResponse } from './blog-success-response.type';
import { FieldError } from './field-error.type';
import { Blog } from '../../blogs/entities/blog.entity';
import { ApiResponseType } from './api-response.union';

/**
 * @factory ResponseFactory  (blog-service)
 * @description Centralised factory for all ApiResponse variants in blog-service.
 *
 * Identical API surface to user-service ResponseFactory — each subservice
 * owns its own factory so they can be deployed and evolved independently.
 *
 * Usage in resolvers:
 *   return ResponseFactory.blog(blog, 'Blog created', HttpStatus.CREATED);
 *   return ResponseFactory.validationError(fieldErrors);
 *   return ResponseFactory.fromException(error);
 */
export class ResponseFactory {
  private static now(): Date { return new Date(); }

  // ── SUCCESS ────────────────────────────────────────────────────────────────

  /**
   * Wraps a single Blog in BlogSuccessResponse.
   * @param data       The resolved Blog entity (author is a federation stub { id }).
   * @param message    Human-readable success message.
   * @param statusCode HTTP-equivalent code (default 200).
   */
  static blog(
    data: Blog,
    message = 'Success',
    statusCode = HttpStatus.OK,
  ): BlogSuccessResponse {
    const r = new BlogSuccessResponse();
    r.statusCode = statusCode;
    r.success = true;
    r.message = message;
    r.data = data;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  /**
   * Wraps a Blog array in BlogsSuccessResponse.
   */
  static blogs(
    data: Blog[],
    message = 'Success',
    statusCode = HttpStatus.OK,
  ): BlogsSuccessResponse {
    const r = new BlogsSuccessResponse();
    r.statusCode = statusCode;
    r.success = true;
    r.message = message;
    r.data = data;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  /**
   * Confirmation for delete operations — no data payload.
   */
  static deleted(message = 'Deleted successfully'): BaseResponse {
    const r = new BaseResponse();
    r.statusCode = HttpStatus.OK;
    r.success = true;
    r.message = message;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  // ── ERROR ──────────────────────────────────────────────────────────────────

  /** 400 — class-validator field failures. */
  static validationError(errors: FieldError[], message = 'Validation failed'): ErrorResponse {
    const r = new ErrorResponse();
    r.statusCode = HttpStatus.BAD_REQUEST;
    r.success = false;
    r.message = message;
    r.errors = errors;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  /** 404 — resource not found. */
  static notFound(message: string): ErrorResponse {
    const r = new ErrorResponse();
    r.statusCode = HttpStatus.NOT_FOUND;
    r.success = false;
    r.message = message;
    r.errors = null;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  /** 409 — conflict (duplicate, immutable field change, etc.). */
  static conflict(message: string): ErrorResponse {
    const r = new ErrorResponse();
    r.statusCode = HttpStatus.CONFLICT;
    r.success = false;
    r.message = message;
    r.errors = null;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  /** 500 — unexpected server error (raw message NOT forwarded). */
  static internalError(message = 'An unexpected error occurred'): ErrorResponse {
    const r = new ErrorResponse();
    r.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    r.success = false;
    r.message = message;
    r.errors = null;
    r.timestamp = ResponseFactory.now();
    return r;
  }

  /**
   * Converts any caught exception into the correct ApiResponse variant.
   * Resolvers use try/catch and call this instead of rethrowing.
   */
  static fromException(error: any): ApiResponseType {
    const status: number = error?.status ?? error?.statusCode ?? 500;
    const message: string = error?.message ?? 'An unexpected error occurred';
    switch (status) {
      case HttpStatus.NOT_FOUND:    return ResponseFactory.notFound(message);
      case HttpStatus.CONFLICT:     return ResponseFactory.conflict(message);
      case HttpStatus.BAD_REQUEST:  return ResponseFactory.validationError([], message);
      default:                      return ResponseFactory.internalError();
    }
  }
}
