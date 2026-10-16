import { type Instrument } from '@prisma/client';
import { type Interval, type TradableMarket } from '@nexora/contracts';
import { type RawQuote } from '../provider';

/** One OHLCV bar of an external feed, prices as decimal strings exactly as the provider sent them. */
export interface LiveCandle {
  start: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

export interface LiveOrderBook {
  bids: [string, string][];
  asks: [string, string][];
  observedAt: number;
}

/** Why an instrument is wanted: shown in a live stream, opened on a chart, or only read once via REST. */
export type Demand = 'stream' | 'request' | 'background';

/**
 * A reference price feed for one market (ADR 0005). Quotes are served from the feed's own server-side cache, so
 * an SSE tick never waits for the network; the feed refreshes wanted instruments in the background within the
 * provider's limits. A feed is a price reference only: it never executes or confirms trades.
 */
export interface LiveFeed {
  readonly source: string;
  readonly market: TradableMarket;
  supports(inst: Instrument): boolean;
  /** Cached quote (null while nothing was received yet); records the demand unless it is "background". */
  quote(inst: Instrument, demand: Demand): RawQuote | null;
  /** Waits (bounded) until instruments without any cached value got their first one. */
  prime(insts: Instrument[], timeoutMs: number): Promise<void>;
  /** Bars whose start is within [first, last]; null when the provider cannot answer now (limits, outage). */
  candles(inst: Instrument, interval: Interval, first: number, last: number): Promise<LiveCandle[] | null>;
  orderBook?(inst: Instrument, depth: number): Promise<LiveOrderBook | null>;
  usage?(): Record<string, unknown>;
  stop(): void;
}

/** Waits for p at most ms; never rejects. */
export function within(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
    p.then(
      () => {
        clearTimeout(t);
        resolve();
      },
      () => {
        clearTimeout(t);
        resolve();
      },
    );
  });
}
