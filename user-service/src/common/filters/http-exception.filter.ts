/**
 * @fileoverview Global HTTP exception filter for the NestJS application.
 * Catches all exceptions thrown within the application context, including standard HTTP
 * exceptions and custom errors, transforming them into a standardized JSON response format.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * HttpExceptionFilter is responsible for processing exceptions and formatting the API's error responses.
 * It ensures that all errors, whether expected or unexpected, follow the same response structure.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  /**
   * Handles any caught exception and transforms it into a standardized response.
   *
   * @param exception - The caught exception or error object.
   * @param host - The arguments host, providing access to the current request and response objects.
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Skip if not an HTTP request (e.g., GraphQL or Kafka)
    if (!request || !response || typeof response.status !== "function") {
      return;
    }

    let status: number =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = "Internal server error";
    let errors: { field: string; message: string }[] | undefined;
    let error: string | undefined;

    /* Validation-pipe errors arrive as a raw array or wrapped in HttpException */
    if (Array.isArray(exception)) {
      status = HttpStatus.BAD_REQUEST;
      message = "Validation failed";
      errors = this.formatValidationErrors(exception);
    } else if (exception instanceof HttpException) {
      const body = exception.getResponse();
      let isRouteNotFound = false;

      if (typeof body === "string") {
        message = body;
        error = body;
        isRouteNotFound = body.startsWith("Cannot ");
      } else if (Array.isArray(body)) {
        status = HttpStatus.BAD_REQUEST;
        message = "Validation failed";
        errors = this.formatValidationErrors(body);
      } else if (body && typeof body === "object") {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string) || message;
        error = obj.error as string | undefined;
        
        if (Array.isArray(obj.message)) {
          errors = this.formatValidationErrors(obj.message);
          message = "Validation failed";
        } else {
          errors =
            (obj.errors as { field: string; message: string }[] | undefined) ||
            errors;
        }

        isRouteNotFound =
          typeof obj.message === "string" && obj.message.startsWith("Cannot ");
      }

      if (status === (HttpStatus.NOT_FOUND as number) && isRouteNotFound) {
        message = "Path not found";
        error = "Path not found";
      }
    }

    const payload = {
      success: false,
      message,
      method: request?.method,
      endpoint: request?.originalUrl || request?.url || "",
      statusCode: status,
      timestamp: new Date().toISOString(),
      ...(errors && { errors }),
      ...(error && !errors && { error }),
    };

    response.status(status).json(payload);
  }

  private formatValidationErrors(errors: any[]): { field: string; message: string }[] {
    return errors.flatMap((err) => {
      const field: string = err.property || "unknown";
      const constraints: string[] = err.constraints
        ? Object.values(err.constraints as Record<string, string>)
        : typeof err === "string" 
          ? [err]
          : ["Invalid value"];
      return constraints.map((msg) => ({ field, message: msg }));
    });
  }
}
