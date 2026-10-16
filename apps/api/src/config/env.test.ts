import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('environment validation (D02)', () => {
  it('fails with a clear message naming the missing variable, without values', () => {
    expect(() => loadEnv({ PORT: '3001' })).toThrow(/DATABASE_URL/);
  });
  it('rejects a non-postgres url', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://u:secret@h/db' })).toThrow(/postgresql/);
    try {
      loadEnv({ DATABASE_URL: 'mysql://u:secret@h/db' });
    } catch (e) {
      expect((e as Error).message).not.toContain('secret');
    }
  });
  it('applies defaults', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5433/db' });
    expect(env.PORT).toBe(3001);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.SESSION_TTL_HOURS).toBe(168);
  });
});
