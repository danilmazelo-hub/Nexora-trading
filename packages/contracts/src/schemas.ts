import { z } from 'zod';
import { DecimalStringSchema } from './decimal';
import { CHART_PERIODS, INTERVALS, TRADABLE_MARKETS } from './market';

const Iso = z.string().datetime({ offset: false });
const Dec = DecimalStringSchema;

/* ---------- health (D01–D02) ---------- */
export const HealthLiveSchema = z.object({ status: z.literal('ok'), uptimeSec: z.number(), version: z.string() });
export const HealthReadySchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  checks: z.object({ database: z.enum(['up', 'down']) }),
});
export type HealthLive = z.infer<typeof HealthLiveSchema>;
export type HealthReady = z.infer<typeof HealthReadySchema>;

/* ---------- session, profile, accounts (D03, D05, D06) ---------- */
export const SCENARIOS = ['STARTER', 'EMPTY_PORTFOLIO', 'QUOTES_UNAVAILABLE', 'OPERATION_FAILURE'] as const;
export const ScenarioSchema = z.enum(SCENARIOS);
export type Scenario = z.infer<typeof ScenarioSchema>;

export const LocaleSchema = z.enum(['ru', 'en']);
export const BalanceSchema = z.object({ asset: z.string(), amount: Dec });
export type Balance = z.infer<typeof BalanceSchema>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['MAIN']),
  currency: z.string(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  createdAt: Iso,
});
export type Account = z.infer<typeof AccountSchema>;

export const AccountBalancesSchema = z.object({ accountId: z.string().uuid(), currency: z.string(), balances: z.array(BalanceSchema), asOf: Iso });
export type AccountBalances = z.infer<typeof AccountBalancesSchema>;

export const ProfileSchema = z.object({ displayName: z.string(), locale: LocaleSchema, updatedAt: Iso });
export type Profile = z.infer<typeof ProfileSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  createdAt: Iso,
  expiresAt: Iso,
  scenario: ScenarioSchema,
  resumed: z.boolean(),
});
export const SessionStateSchema = z.object({
  session: SessionSchema,
  profile: ProfileSchema,
  accounts: z.array(AccountSchema),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const ResetRequestSchema = z.object({ confirm: z.literal(true), scenario: ScenarioSchema.optional() });
export const ScenarioRequestSchema = z.object({ scenario: ScenarioSchema });
export const ProfilePatchSchema = z.object({ displayName: z.string().trim().min(2).max(40).optional(), locale: LocaleSchema.optional() });

/* ---------- instruments (D04, D12) ---------- */
export const MarketIdSchema = z.enum(TRADABLE_MARKETS);
export const InstrumentStatusSchema = z.enum(['ACTIVE', 'UNAVAILABLE', 'DISABLED']);
export const InstrumentSchema = z.object({
  id: z.string(),
  market: MarketIdSchema,
  symbol: z.string(),
  name: z.string(),
  baseAsset: z.string(),
  quoteAsset: z.string(),
  tickSize: Dec,
  quantityStep: Dec,
  contractMultiplier: Dec,
  maxLeverage: z.number().int().positive(),
  categories: z.array(z.string()),
  unit: z.string().nullable(),
  status: InstrumentStatusSchema,
  source: z.string(),
});
export type Instrument = z.infer<typeof InstrumentSchema>;

export const InstrumentPageSchema = z.object({
  items: z.array(InstrumentSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  pages: z.number().int(),
});
export type InstrumentPage = z.infer<typeof InstrumentPageSchema>;

export const INSTRUMENT_SORTS = ['symbol', 'name', 'market'] as const;
export const InstrumentQuerySchema = z.object({
  market: MarketIdSchema.optional(),
  category: z.string().max(32).optional(),
  q: z.string().trim().max(64).optional(),
  sort: z.enum(INSTRUMENT_SORTS).default('symbol'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type InstrumentQuery = z.input<typeof InstrumentQuerySchema>;

export const MarketSummarySchema = z.object({
  id: z.string(),
  status: z.enum(['active', 'coming_soon']),
  instrumentCount: z.number().int(),
  categories: z.array(z.object({ id: z.string(), count: z.number().int() })),
});
export type MarketSummary = z.infer<typeof MarketSummarySchema>;

/* ---------- market data (D10–D13) ---------- */
export const QuoteSchema = z.object({
  instrumentId: z.string(),
  source: z.string(),
  status: z.enum(['live', 'delayed', 'stale', 'unavailable']),
  bid: Dec.nullable(),
  ask: Dec.nullable(),
  last: Dec.nullable(),
  change: Dec.nullable(),
  /** Percent points (0.97 = 0.97 %). */
  changePct: Dec.nullable(),
  changePeriod: z.enum(['24h', 'prev_close']),
  observedAt: Iso.nullable(),
  receivedAt: Iso,
});
export type Quote = z.infer<typeof QuoteSchema>;
export const QuoteListSchema = z.object({ items: z.array(QuoteSchema), asOf: Iso });

/** SSE payloads. `seq` is monotonic per stream: duplicates/out-of-order events are dropped by the client. */
export const QuoteEventSchema = z.object({ seq: z.number().int(), kind: z.enum(['snapshot', 'update']), quotes: z.array(QuoteSchema) });
export type QuoteEvent = z.infer<typeof QuoteEventSchema>;

export const IntervalSchema = z.enum(INTERVALS);
export const ChartPeriodSchema = z.enum(CHART_PERIODS);
export const CandleSchema = z.object({
  openTime: Iso,
  closeTime: Iso,
  open: Dec,
  high: Dec,
  low: Dec,
  close: Dec,
  volume: Dec,
  isClosed: z.boolean(),
});
export type Candle = z.infer<typeof CandleSchema>;
export const CandlesQuerySchema = z.object({
  interval: IntervalSchema,
  from: Iso.optional(),
  to: Iso.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
export const CandlesResponseSchema = z.object({
  instrumentId: z.string(),
  source: z.string(),
  interval: IntervalSchema,
  from: Iso,
  to: Iso,
  truncated: z.boolean(),
  candles: z.array(CandleSchema),
});
export type CandlesResponse = z.infer<typeof CandlesResponseSchema>;

/* ---------- capabilities (D07) ---------- */
export const SectionSchema = z.object({
  id: z.string(),
  path: z.string(),
  status: z.enum(['available', 'in_development', 'coming_soon']),
  simulated: z.boolean(),
  tasks: z.array(z.string()),
});
export const CapabilitiesSchema = z.object({
  mode: z.literal('demo'),
  realMoney: z.literal(false),
  priceSource: z.string(),
  sections: z.array(SectionSchema),
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;
