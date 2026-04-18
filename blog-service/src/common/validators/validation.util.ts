import { ValidationError } from 'class-validator';
import { FieldError } from '../responses/field-error.type';

/**
 * @util transformValidationErrors  (blog-service)
 * @description Converts an array of class-validator `ValidationError` objects
 * into a flat `FieldError[]` array suitable for the ErrorResponse envelope.
 *
 * Why flatten?
 * ─────────────
 * class-validator returns a tree structure when validating nested objects.
 * The ErrorResponse schema expects a flat list of `{ field, message }` pairs.
 * Nested field paths are represented with dot notation (e.g. "meta.tags").
 *
 * @param {ValidationError[]} errors - Raw ValidationError array from class-validator.
 * @param {string} [prefix=''] - Internal accumulator for nested field paths; do not pass externally.
 * @returns {FieldError[]} Flat array with one FieldError entry per constraint violation.
 *
 * @example
 * // Blog DTO with title="" and authorId="not-a-uuid"
 * // class-validator produces:
 * [
 *   ValidationError { property: "title",    constraints: { isNotEmpty: "title must not be empty" } },
 *   ValidationError { property: "authorId", constraints: { isUuid: "authorId must be a valid UUID v4" } },
 * ]
 *
 * // transformValidationErrors() returns:
 * [
 *   { field: "title",    message: "title must not be empty" },
 *   { field: "authorId", message: "authorId must be a valid UUID v4" },
 * ]
 */
export function transformValidationErrors(
  errors: ValidationError[],
  prefix = '',
): FieldError[] {
  const result: FieldError[] = [];

  for (const error of errors) {
    // Build the field path: top-level "title", nested "meta.tags"
    const path = prefix ? `${prefix}.${error.property}` : error.property;

    if (error.constraints) {
      // Each key in constraints is a failed rule; each value is its message
      for (const message of Object.values(error.constraints)) {
        const fe = new FieldError();
        fe.field = path;
        fe.message = message;
        result.push(fe);
      }
    }

    // Recurse into nested InputType validation errors
    if (error.children?.length) {
      result.push(...transformValidationErrors(error.children, path));
    }
  }

  return result;
}
