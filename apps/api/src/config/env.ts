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
  // Live reference feeds (ADR 0005): comma list of binance, twelvedata; empty / "off" = simulator only.
  MARKET_LIVE_FEEDS: z
    .string()
    .optional()
    .transform((v) => (!v || v.trim() === 'off' ? [] : [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))]))
    .pipe(z.array(z.enum(['binance', 'twelvedata']), { message: 'MARKET_LIVE_FEEDS: допустимы binance, twelvedata или off' })),
  BINANCE_BASE_URL: z.string().url().default('https://data-api.binance.vision'),
  TWELVEDATA_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  TWELVEDATA_BASE_URL: z.string().url().default('https://api.twelvedata.com'),
  /** Basic plan: 8 credits per minute, 800 per day (one credit per symbol per request). */
  TWELVEDATA_MINUTE_LIMIT: z.coerce.number().int().min(1).default(8),
  TWELVEDATA_DAILY_LIMIT: z.coerce.number().int().min(1).default(800),
  /** Refresh period of the pair open on a chart; other pairs are refreshed much less often. */
  TWELVEDATA_FOCUS_REFRESH_SEC: z.coerce.number().int().min(15).default(60),
}).refine((e) => !e.MARKET_LIVE_FEEDS.includes('twelvedata') || !!e.TWELVEDATA_API_KEY, {
  path: ['TWELVEDATA_API_KEY'],
  message: 'обязателен, если в MARKET_LIVE_FEEDS указан twelvedata',
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
