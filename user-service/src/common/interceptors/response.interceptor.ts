/**
 * @fileoverview Global response interceptor for the NestJS application.
 * Intercepts all outgoing responses to ensure they conform to a standardized
 * RestResponse envelope format, providing consistency across all API endpoints.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { RestResponse } from "../responses/rest-response.interface";

/**
 * Global interceptor to wrap all API responses in a consistent RestResponse format.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<RestResponse> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    // Skip if not an HTTP request (e.g., GraphQL or Kafka)
    if (!req || !res || typeof res.status !== "function") {
      return next.handle() as Observable<any>;
    }

    const method = req.method;
    const url = req.originalUrl || req.url || "";

    // Skip wrapping for root API path or health checks if needed
    if (url === "/" || url === "/api" || url === "/api/") {
      return next.handle() as Observable<any>;
    }

    return next.handle().pipe(
      map((data: unknown): RestResponse => {
        // Already full RestResponse → return as-is
        if (this.isRestResponse(data)) {
          const typed = data as RestResponse;

          if (typeof typed.statusCode !== "number") {
            typed.statusCode = res.statusCode ?? 200;
          }

          return typed;
        }

        // Determine status code
        let statusCode = res.statusCode ?? 200;

        if (
          data &&
          typeof data === "object" &&
          data !== null &&
          "statusCode" in data &&
          typeof (data as any).statusCode === "number"
        ) {
          statusCode = (data as { statusCode: number }).statusCode;
        }

        if (res.statusCode !== statusCode) {
          res.status(statusCode);
        }

        // Extract message & payload intelligently
        let message = "Request successful";
        let payload: unknown = data;

        if (data && typeof data === "object" && data !== null) {
          const obj = data as Record<string, unknown>;

          // Case: { message: "...", data: {...} } → business response
          if ("message" in obj && typeof obj.message === "string") {
            message = obj.message;

            if ("data" in obj) {
              payload = obj.data;
            } else {
              // Case: only { message: "..." } → no real payload
              payload = null;
            }
          }
          // Case: plain object without message → use it as payload
          else if (Object.keys(obj).length > 0) {
            payload = obj;
          }
        }

        // Build final standardized response
        return {
          success: statusCode >= 200 && statusCode < 300,
          message,
          method,
          endpoint: url,
          statusCode,
          timestamp: new Date().toISOString(),
          data: payload,
        };
      }),
    );
  }

  private isRestResponse(value: unknown): value is RestResponse {
    return (
      value != null &&
      typeof value === "object" &&
      "success" in value &&
      "timestamp" in value &&
      "statusCode" in value
    );
  }
}
