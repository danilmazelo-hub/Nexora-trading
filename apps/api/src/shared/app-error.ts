import { type ErrorCode } from '@nexora/contracts';

/** The only way business code reports an expected failure. Rendered by ApiErrorFilter. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (code: ErrorCode, message: string) => new AppError(code, 404, message);
