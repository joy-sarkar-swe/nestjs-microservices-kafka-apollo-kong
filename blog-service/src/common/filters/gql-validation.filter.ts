import { Catch, ArgumentsHost, BadRequestException } from '@nestjs/common';
import { GqlExceptionFilter, GqlArgumentsHost } from '@nestjs/graphql';
import { transformValidationErrors } from '../validators/validation.util';
import { ResponseFactory } from '../responses/response.factory';
import { FieldError } from '../responses/field-error.type';

/**
 * @filter GqlValidationFilter  (blog-service)
 * Identical in behaviour to user-service GqlValidationFilter.
 * Catches BadRequestException from ValidationPipe and returns
 * a structured ErrorResponse instead of a raw GraphQL error.
 *
 * Registered globally in main.ts via app.useGlobalFilters().
 */
@Catch(BadRequestException)
export class GqlValidationFilter implements GqlExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    GqlArgumentsHost.create(host);
    const exceptionResponse = exception.getResponse() as any;
    let fieldErrors: FieldError[] = [];

    if (Array.isArray(exceptionResponse?.message)) {
      const raw = exceptionResponse.message;
      if (raw.length > 0 && typeof raw[0] === 'object') {
        fieldErrors = transformValidationErrors(raw);
      } else {
        fieldErrors = raw.map((msg: string) => {
          const fe = new FieldError(); fe.field = 'unknown'; fe.message = msg; return fe;
        });
      }
    } else if (typeof exceptionResponse?.message === 'string') {
      const fe = new FieldError(); fe.field = 'unknown'; fe.message = exceptionResponse.message;
      fieldErrors = [fe];
    }

    return ResponseFactory.validationError(fieldErrors);
  }
}
