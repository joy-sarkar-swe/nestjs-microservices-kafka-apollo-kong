import { ValidationError } from 'class-validator';
import { FieldError } from '../responses/field-error.type';

/**
 * @util transformValidationErrors  (blog-service)
 * Converts class-validator ValidationError[] into flat FieldError[].
 * Handles nested InputType objects by recursively joining field paths with ".".
 */
export function transformValidationErrors(
  errors: ValidationError[],
  prefix = '',
): FieldError[] {
  const result: FieldError[] = [];
  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        const fe = new FieldError();
        fe.field = path;
        fe.message = message;
        result.push(fe);
      }
    }
    if (error.children?.length) {
      result.push(...transformValidationErrors(error.children, path));
    }
  }
  return result;
}
