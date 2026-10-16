import { type ZodTypeAny, type z } from 'zod';

/** Validates untrusted input; a ZodError becomes VALIDATION_FAILED with fieldErrors in ApiErrorFilter. */
export function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  return schema.parse(value);
}
