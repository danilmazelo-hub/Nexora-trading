import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Resolves the integration-test database URL and refuses anything that is not a *_test database. */
export function testDatabaseUrl(): string {
  const file = resolve(__dirname, '../.env');
  if (existsSync(file)) process.loadEnvFile(file);
  const url = process.env.DATABASE_URL_TEST ?? 'postgresql://nexora:nexora@localhost:5433/nexora_test?schema=public';
  const db = new URL(url).pathname.replace(/^\//, '');
  if (!db.endsWith('_test')) throw new Error(`Refusing to run integration tests against database "${db}" (name must end with _test)`);
  return url;
}
