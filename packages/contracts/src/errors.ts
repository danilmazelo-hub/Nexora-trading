import { z } from 'zod';

/** Stable error codes shared by API and web. Messages are human-readable, never internal details. */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'ROUTE_NOT_FOUND',
  'SESSION_REQUIRED',
  'SESSION_EXPIRED',
  'ACCOUNT_NOT_FOUND',
  'INSTRUMENT_NOT_FOUND',
  'IDEMPOTENCY_CONFLICT',
  'LEDGER_UNBALANCED',
  'LEDGER_ASSET_MISMATCH',
  'RESET_NOT_CONFIRMED',
  'DEMO_OPERATION_FAILED',
  'QUOTES_UNAVAILABLE',
  'RANGE_TOO_LARGE',
  'DB_UNAVAILABLE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  // client-side only (produced by the web api client)
  'NETWORK_ERROR',
  'BAD_RESPONSE',
  'TIMEOUT',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  requestId: z.string(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

export const REQUEST_ID_HEADER = 'x-request-id';
export const IDEMPOTENCY_HEADER = 'idempotency-key';
