/**
 * @interface RestResponse
 * @description Standardized REST API response envelope.
 *
 * All REST endpoints wrap their domain data in this structure via
 * the `ResponseInterceptor`.
 */
export interface RestResponse<T = any> {
  /** Success flag (true for 2xx status codes) */
  success: boolean;

  /** Human-readable response summary */
  message: string;

  /** HTTP method of the request (GET, POST, etc.) */
  method: string;

  /** The full requested endpoint path */
  endpoint: string;

  /** HTTP status code */
  statusCode: number;

  /** ISO 8601 timestamp of when the response was generated */
  timestamp: string;

  /** The primary payload (domain entity, list, or null) */
  data?: T;

  /** Field-level validation errors (present on status 400 only) */
  errors?: { field: string; message: string }[];

  /** Top-level error description (present on failure only) */
  error?: string;
}
