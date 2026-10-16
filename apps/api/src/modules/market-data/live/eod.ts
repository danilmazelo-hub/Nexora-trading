import { bucketStart, type Interval, INTERVAL_MS } from '@nexora/contracts';
import { type LiveCandle } from './live-feed';

const DAY = 86_400_000;

/** One end-of-day session: t = session start (ms UTC), prices as numbers from the provider. */
export interface EodBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

/**
 * Daily / weekly candles from end-of-day bars (weeks start Monday 00:00 UTC). End-of-day data has no intraday
 * bars: other intervals give an empty list, never simulated candles.
 */
export function eodCandles(bars: EodBar[], interval: Interval, first: number, last: number): LiveCandle[] {
  if (interval !== '1d' && interval !== '1w') return [];
  const ms = INTERVAL_MS[interval];
  const out = new Map<number, LiveCandle>();
  for (const b of bars) {
    const start = bucketStart(Math.floor(b.t / DAY) * DAY, ms);
    if (start < first || start > last) continue;
    const cur = out.get(start);
    if (!cur) out.set(start, { start, o: String(b.o), h: String(b.h), l: String(b.l), c: String(b.c), v: String(b.v ?? 0) });
    else {
      cur.h = String(Math.max(Number(cur.h), b.h));
      cur.l = String(Math.min(Number(cur.l), b.l));
      cur.c = String(b.c);
    }
  }
  return [...out.values()].sort((a, b) => a.start - b.start);
}
