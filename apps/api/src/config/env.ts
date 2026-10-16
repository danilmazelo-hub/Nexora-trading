import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL обязателен (см. apps/api/.env.example)' })
    .min(1, 'DATABASE_URL обязателен (см. apps/api/.env.example)')
    .refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://'), 'DATABASE_URL должен начинаться с postgresql://'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(168),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MARKET_SEED: z.coerce.number().int().default(20261015),
  MARKET_FIXED_TIME: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), 'MARKET_FIXED_TIME должен быть датой ISO-8601'),
});
export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Loads apps/api/.env (if present, without overriding real env vars) and validates required variables. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  if (source === process.env) {
    const file = resolve(process.cwd(), '.env');
    if (existsSync(file)) process.loadEnvFile(file);
  }
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Only variable names and rule messages are printed — never values.
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error('Некорректная конфигурация окружения:\n' + lines.join('\n'));
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

export function resetEnvCache() {
  cached = null;
}
