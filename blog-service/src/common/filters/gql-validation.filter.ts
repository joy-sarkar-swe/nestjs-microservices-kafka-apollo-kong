import { Catch, ArgumentsHost, BadRequestException } from '@nestjs/common';
import { GqlExceptionFilter, GqlArgumentsHost } from '@nestjs/graphql';
import { transformValidationErrors } from '../validators/validation.util';
import { ResponseFactory } from '../responses/response.factory';
import { FieldError } from '../responses/field-error.type';

/**
 * @filter GqlValidationFilter  (blog-service)
 * @description GraphQL exception filter that intercepts BadRequestException
 * (thrown by NestJS ValidationPipe when class-validator fails) and converts
 * the raw error into a structured ErrorResponse via ResponseFactory.
 *
 * Without this filter, a class-validator failure returns a raw GraphQL `errors`
 * array entry — not a BlogResponse union member. This filter intercepts BEFORE
 * Apollo serialises the response and returns a proper ErrorResponse instead.
 *
 * Behaviour is identical to user-service GqlValidationFilter.
 * Registered globally in main.ts via app.useGlobalFilters().
 *
 * @see {@link ResponseFactory.validationError}
 * @see {@link transformValidationErrors}
 */
@Catch(BadRequestException)
export class GqlValidationFilter implements GqlExceptionFilter {
  /**
   * Intercepts a BadRequestException thrown by NestJS ValidationPipe,
   * extracts the class-validator error details, and returns a structured
   * ErrorResponse as the resolver result.
   *
   * @param {BadRequestException} exception - The exception thrown by ValidationPipe.
   * @param {ArgumentsHost} host - The NestJS arguments host; switched to GQL context internally.
   * @returns {ErrorResponse} A structured error response (part of the BlogResponse union).
   */
  catch(exception: BadRequestException, host: ArgumentsHost) {
    GqlArgumentsHost.create(host);
    const exceptionResponse = exception.getResponse() as any;
    let fieldErrors: FieldError[] = [];

    if (Array.isArray(exceptionResponse?.message)) {
      const raw = exceptionResponse.message;
      if (raw.length > 0 && typeof raw[0] === 'object') {
        // Full class-validator ValidationError objects — transform to FieldError[]
        fieldErrors = transformValidationErrors(raw);
      } else {
        // Plain string array — wrap each as a FieldError with unknown field
        fieldErrors = raw.map((msg: string) => {
          const fe = new FieldError(); fe.field = 'unknown'; fe.message = msg; return fe;
        });
      }
    } else if (typeof exceptionResponse?.message === 'string') {
      // Single string message — wrap as a single FieldError
      const fe = new FieldError(); fe.field = 'unknown'; fe.message = exceptionResponse.message;
      fieldErrors = [fe];
    }

    return ResponseFactory.validationError(fieldErrors);
  }
}
