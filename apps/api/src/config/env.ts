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
    .pipe(z.array(z.enum(['binance', 'twelvedata', 'massive', 'fred', 'eia']), { message: 'MARKET_LIVE_FEEDS: допустимы binance, twelvedata, massive, fred, eia или off' })),
  BINANCE_BASE_URL: z.string().url().default('https://data-api.binance.vision'),
  TWELVEDATA_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  TWELVEDATA_BASE_URL: z.string().url().default('https://api.twelvedata.com'),
  /** What Twelve Data serves: forex pairs, US stocks, precious metals (XAU/XAG/XPT/XPD vs USD). */
  TWELVEDATA_MARKETS: z
    .string()
    .default('forex,stocks,metals')
    .transform((v) => [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))])
    .pipe(z.array(z.enum(['forex', 'stocks', 'metals']), { message: 'TWELVEDATA_MARKETS: допустимы forex, stocks, metals' })),
  /** Massive (indices, end of day; free plan: 5 requests per minute). */
  MASSIVE_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  MASSIVE_BASE_URL: z.string().url().default('https://api.massive.com'),
  /** FRED public CSV download (index closes, no key). */
  FRED_BASE_URL: z.string().url().default('https://fred.stlouisfed.org'),
  /** EIA open data (daily energy spot prices). */
  EIA_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  EIA_BASE_URL: z.string().url().default('https://api.eia.gov'),
  /** Basic plan: 8 credits per minute, 800 per day (one credit per symbol per request). */
  TWELVEDATA_MINUTE_LIMIT: z.coerce.number().int().min(1).default(8),
  TWELVEDATA_DAILY_LIMIT: z.coerce.number().int().min(1).default(800),
  /** Refresh period of the pair open on a chart; other pairs are refreshed much less often. */
  TWELVEDATA_FOCUS_REFRESH_SEC: z.coerce.number().int().min(15).default(60),
})
  .refine((e) => !e.MARKET_LIVE_FEEDS.includes('twelvedata') || !!e.TWELVEDATA_API_KEY, {
    path: ['TWELVEDATA_API_KEY'],
    message: 'обязателен, если в MARKET_LIVE_FEEDS указан twelvedata',
  })
  .refine((e) => !e.MARKET_LIVE_FEEDS.includes('massive') || !!e.MASSIVE_API_KEY, {
    path: ['MASSIVE_API_KEY'],
    message: 'обязателен, если в MARKET_LIVE_FEEDS указан massive',
  })
  .refine((e) => !e.MARKET_LIVE_FEEDS.includes('eia') || !!e.EIA_API_KEY, {
    path: ['EIA_API_KEY'],
    message: 'обязателен, если в MARKET_LIVE_FEEDS указан eia',
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
