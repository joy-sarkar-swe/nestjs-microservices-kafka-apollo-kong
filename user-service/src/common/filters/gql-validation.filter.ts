import { Catch, ArgumentsHost } from "@nestjs/common";
import { GqlExceptionFilter, GqlArgumentsHost } from "@nestjs/graphql";
import { BadRequestException } from "@nestjs/common";
import { transformValidationErrors } from "../validators/validation.util";
import { ResponseFactory } from "../responses/response.factory";
import { FieldError } from "../responses/field-error.type";

/**
 * @filter GqlValidationFilter
 * @description GraphQL exception filter that intercepts BadRequestException
 *   (thrown by NestJS ValidationPipe when class-validator fails) and converts
 *   the raw error into a structured ErrorResponse via ResponseFactory.
 *
 * WHY A FILTER?
 * -------------
 * Without this filter, a class-validator failure in a GraphQL mutation results
 * in a raw GraphQL `errors` array entry — not an ApiResponse union member.
 * The filter intercepts BEFORE Apollo serialises the response, swaps the
 * exception for a proper ErrorResponse, and returns it as the resolver result.
 *
 * HOW IT WORKS
 * -------------
 * 1. NestJS ValidationPipe runs class-validator on the incoming input.
 * 2. Validation fails → ValidationPipe throws BadRequestException({ message: [...] }).
 * 3. This filter catches that exception.
 * 4. It extracts the class-validator error array from the exception response.
 * 5. Calls transformValidationErrors() to build FieldError[].
 * 6. Returns ResponseFactory.validationError(fieldErrors) as the resolver result.
 * 7. Apollo receives a valid ErrorResponse object — no raw GraphQL error.
 *
 * REGISTRATION
 * ------------
 * Applied globally in main.ts via:
 *   app.useGlobalFilters(new GqlValidationFilter());
 *
 * NOTE: This filter handles BadRequestException from ValidationPipe only.
 * Other exceptions (NotFoundException, ConflictException) are caught with
 * try/catch inside each resolver and handled via ResponseFactory.fromException().
 */
@Catch(BadRequestException)
export class GqlValidationFilter implements GqlExceptionFilter {
  /**
   * @method catch
   * @param exception - The BadRequestException thrown by ValidationPipe.
   * @param host      - The arguments host (used to get the GQL context).
   * @returns         - An ErrorResponse object (part of ApiResponse union).
   */
  catch(exception: BadRequestException, host: ArgumentsHost) {
    // Switch to GraphQL context so we're operating in the right request scope
    GqlArgumentsHost.create(host);

    // Extract the raw validation response from the exception
    const exceptionResponse = exception.getResponse() as any;

    let fieldErrors: FieldError[] = [];

    // ValidationPipe with transform: true wraps class-validator errors in this shape:
    // { message: ValidationError[], error: "Bad Request", statusCode: 400 }
    // ValidationPipe with no options wraps them as string arrays.
    if (Array.isArray(exceptionResponse?.message)) {
      const rawErrors = exceptionResponse.message;

      // Detect if the array contains class-validator ValidationError objects
      // (they have a `constraints` or `children` property) vs plain strings.
      if (rawErrors.length > 0 && typeof rawErrors[0] === "object") {
        // Full ValidationError objects — transform them
        fieldErrors = transformValidationErrors(rawErrors);
      } else {
        // Plain string array — wrap each as a FieldError with unknown field
        fieldErrors = rawErrors.map((msg: string) => {
          const fe = new FieldError();
          fe.field = "unknown";
          fe.message = msg;
          return fe;
        });
      }
    } else if (typeof exceptionResponse?.message === "string") {
      // Single string message — wrap as a FieldError
      const fe = new FieldError();
      fe.field = "unknown";
      fe.message = exceptionResponse.message;
      fieldErrors = [fe];
    }

    // Return the structured ErrorResponse — Apollo uses this as the resolver return value
    return ResponseFactory.validationError(fieldErrors);
  }
}
