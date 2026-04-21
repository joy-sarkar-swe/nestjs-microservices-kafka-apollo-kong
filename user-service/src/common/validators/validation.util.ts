import { ValidationError } from "class-validator";
import { FieldError } from "../responses/field-error.type.js";

/**
 * @util transformValidationErrors
 * @description Converts an array of class-validator `ValidationError` objects
 *   into a flat `FieldError[]` array suitable for the ApiResponse error envelope.
 *
 * Why flatten?
 * ------------
 * class-validator returns a tree structure to handle nested objects.
 * GraphQL clients expect a flat list of `{ field, message }` pairs —
 * nested paths are joined with "." (e.g. "address.street").
 *
 * @param errors  - Raw ValidationError[] from class-validator.
 * @param prefix  - Used internally for recursive nesting (do not pass externally).
 * @returns       - Flat FieldError[] with one entry per constraint violation.
 *
 * @example
 *   // Input DTO has name="" and email="not-an-email"
 *   // class-validator produces:
 *   [
 *     ValidationError { property: "name",  constraints: { isNotEmpty: "name must not be empty" } },
 *     ValidationError { property: "email", constraints: { isEmail: "email must be a valid address" } },
 *   ]
 *
 *   // transformValidationErrors() returns:
 *   [
 *     { field: "name",  message: "name must not be empty" },
 *     { field: "email", message: "email must be a valid address" },
 *   ]
 */
export function transformValidationErrors(
  errors: ValidationError[],
  prefix = "",
): FieldError[] {
  const fieldErrors: FieldError[] = [];

  for (const error of errors) {
    // Build the field path: top-level "email", nested "address.street"
    const fieldPath = prefix ? `${prefix}.${error.property}` : error.property;

    if (error.constraints) {
      // Each constraint is a separate violation on the same field.
      // We collect all messages for the field (typically just one).
      for (const message of Object.values(error.constraints)) {
        const fe = new FieldError();
        fe.field = fieldPath;
        fe.message = message;
        fieldErrors.push(fe);
      }
    }

    // Recurse into nested validation errors (e.g. nested InputType objects)
    if (error.children && error.children.length > 0) {
      const nested = transformValidationErrors(error.children, fieldPath);
      fieldErrors.push(...nested);
    }
  }

  return fieldErrors;
}
