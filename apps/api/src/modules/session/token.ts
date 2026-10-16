import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'nexora_demo';

/** 256-bit random token for the cookie; the database only ever sees its SHA-256. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Rejects malformed cookie values before they reach the database. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}
