/** Markets, intervals and chart periods shared by API and web. */
export const TRADABLE_MARKETS = ['crypto', 'stocks', 'indices', 'forex', 'commodities'] as const;
export type TradableMarket = (typeof TRADABLE_MARKETS)[number];

/** Shown as explicitly unavailable categories (no terminal in the demo scope). */
export const COMING_SOON_MARKETS = ['metals', 'bonds', 'etfs', 'nfts', 'options', 'defi', 'sports-betting', 'binary-options'] as const;
export type ComingSoonMarket = (typeof COMING_SOON_MARKETS)[number];

export const MARKET_CATEGORIES: Record<TradableMarket, readonly string[]> = {
  crypto: ['l1', 'l2', 'defi', 'meme', 'ai'],
  stocks: ['tech', 'finance', 'health', 'consumer', 'energy', 'industrial'],
  indices: ['americas', 'europe', 'asia'],
  forex: ['majors', 'crosses', 'exotics'],
  commodities: ['metals', 'energy', 'agriculture', 'livestock', 'softs'],
};

export const INTERVALS = ['5m', '15m', '1h', '4h', '1d', '1w'] as const;
export type Interval = (typeof INTERVALS)[number];
export const INTERVAL_MS: Record<Interval, number> = {
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
};

/** Max candles per response; larger ranges must be paged by the client. */
export const MAX_CANDLES = 1000;
/** Earliest simulated history, UTC (instrument "listing" in the demo). */
export const HISTORY_START = '2022-01-03T00:00:00.000Z';

export const CHART_PERIODS = ['24h', '1W', '1M', '1Y', 'All'] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];
/** Each period maps to one interval and a look-back window (null = from HISTORY_START). */
export const PERIOD_SPEC: Record<ChartPeriod, { interval: Interval; lookbackMs: number | null }> = {
  '24h': { interval: '5m', lookbackMs: 86_400_000 },
  '1W': { interval: '1h', lookbackMs: 7 * 86_400_000 },
  '1M': { interval: '4h', lookbackMs: 30 * 86_400_000 },
  '1Y': { interval: '1d', lookbackMs: 365 * 86_400_000 },
  All: { interval: '1w', lookbackMs: null },
};

export type QuoteStatus = 'live' | 'delayed' | 'stale' | 'unavailable';
/** Change period label: crypto trades 24/7 (rolling 24h), others vs previous UTC session close. */
export type ChangePeriod = '24h' | 'prev_close';
/** A quote older than this (by observedAt) is reported as stale. */
export const STALE_AFTER_MS = 30_000;
