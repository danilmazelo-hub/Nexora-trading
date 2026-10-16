import { Logger } from '@nestjs/common';
import { type Instrument } from '@prisma/client';
import { bucketStart, type Interval, INTERVAL_MS } from '@nexora/contracts';
import { type RawQuote } from '../provider';
import { FeedHttpError, type FetchJson, fetchJson } from './http';
import { type Demand, type LiveCandle, type LiveFeed, within } from './live-feed';

const DAY = 86_400_000;
/** Catalogue symbol → Massive index ticker (US indices of the "Indices Basic" plan). */
export const MASSIVE_TICKERS: Record<string, string> = { SPX: 'I:SPX', NDX: 'I:NDX', DJI: 'I:DJI', IXIC: 'I:COMP', RUT: 'I:RUT', VIX: 'I:VIX' };
/** End-of-day data: one history request per index every 6 h is enough. */
const REFRESH_MS = 6 * 3_600_000;
/** Free plan: 5 requests per minute. */
const PER_MINUTE = 5;
/** A refusal (plan not active) is retried after this long, so activating the plan needs no restart. */
const REFUSED_FOR_MS = 30 * 60_000;
const HISTORY_FROM = '2022-01-01';

interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

/**
 * Massive indices, end of day: the quote is the last session close (status "eod", «по итогам дня») with the change
 * vs. the session before; charts have daily/weekly bars only — intraday periods are reported as empty, never
 * simulated. A ticker the plan does not cover goes to the simulator (and is retried later).
 */
export class MassiveIndicesFeed implements LiveFeed {
  readonly source = 'massive';
  readonly markets = ['indices'] as const;
  private readonly log = new Logger('MassiveFeed');
  private readonly hist = new Map<string, { at: number; bars: Bar[] }>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly refusedUntil = new Map<string, number>();
  private calls: number[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly get: FetchJson = fetchJson,
    private readonly now: () => number = Date.now,
  ) {}

  supports(inst: Instrument): boolean {
    const ticker = MASSIVE_TICKERS[inst.symbol];
    return inst.status === 'ACTIVE' && inst.market === 'indices' && !!ticker && (this.refusedUntil.get(ticker) ?? 0) <= this.now();
  }

  private load(inst: Instrument): Promise<void> {
    const h = this.hist.get(inst.id);
    if (h && this.now() - h.at < REFRESH_MS) return Promise.resolve();
    const running = this.loading.get(inst.id);
    if (running) return running;
    const t = this.now();
    this.calls = this.calls.filter((c) => t - c < 60_000);
    if (this.calls.length >= PER_MINUTE) return Promise.resolve(); // over the minute limit: next request retries
    this.calls.push(t);
    const p = this.fetchHistory(inst).finally(() => this.loading.delete(inst.id));
    this.loading.set(inst.id, p);
    return p;
  }

  private async fetchHistory(inst: Instrument) {
    const ticker = MASSIVE_TICKERS[inst.symbol];
    if (!ticker) return;
    const to = new Date(this.now()).toISOString().slice(0, 10);
    try {
      const body = (await this.get(`${this.baseUrl}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${HISTORY_FROM}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${encodeURIComponent(this.apiKey)}`, 'massive')) as { status?: string; message?: string; results?: Bar[] };
      if (body.status === 'NOT_AUTHORIZED') throw new FeedHttpError('massive', 403, null, body.message ?? 'not authorized');
      const bars = (body.results ?? []).filter((b) => Number.isFinite(b.t) && Number.isFinite(b.c));
      if (!bars.length) throw new FeedHttpError('massive', 0, null, `no bars for ${ticker}`);
      this.hist.set(inst.id, { at: this.now(), bars });
    } catch (e) {
      const err = e as FeedHttpError;
      if (err instanceof FeedHttpError && (err.status === 401 || err.status === 403 || /not entitled|not_authorized/i.test(err.message))) {
        this.refusedUntil.set(ticker, this.now() + REFUSED_FOR_MS);
        this.log.warn(`${ticker}: not available on this Massive plan (activate "Indices Basic"), simulator is used`);
      } else this.log.warn(`${ticker}: ${err.message}`);
    }
  }

  quote(inst: Instrument, demand: Demand): RawQuote | null {
    if (demand !== 'background') void this.load(inst);
    const bars = this.hist.get(inst.id)?.bars;
    const last = bars?.at(-1);
    const prev = bars?.at(-2);
    if (!last || !prev) return null;
    // the bar time is the session start; the value is that session's close
    return { mid: String(last.c), reference: String(prev.c), changePeriod: 'prev_close', observedAt: Math.min(last.t, this.now()), status: 'eod' };
  }

  async prime(insts: Instrument[], timeoutMs: number): Promise<void> {
    await within(Promise.all(insts.map((i) => this.load(i))), timeoutMs);
  }

  async candles(inst: Instrument, interval: Interval, first: number, last: number): Promise<LiveCandle[] | null> {
    await this.load(inst);
    const bars = this.hist.get(inst.id)?.bars;
    if (!bars) return null;
    if (interval !== '1d' && interval !== '1w') return []; // end-of-day data: no intraday bars
    const ms = INTERVAL_MS[interval];
    const out = new Map<number, LiveCandle>();
    for (const b of bars) {
      const start = bucketStart(Math.floor(b.t / DAY) * DAY, ms);
      if (start < first || start > last) continue;
      const cur = out.get(start);
      if (!cur) out.set(start, { start, o: String(b.o), h: String(b.h), l: String(b.l), c: String(b.c), v: String(b.v ?? 0) });
      else {
        // weekly: aggregate the sessions of the week (Monday 00:00 UTC buckets)
        cur.h = String(Math.max(Number(cur.h), b.h));
        cur.l = String(Math.min(Number(cur.l), b.l));
        cur.c = String(b.c);
      }
    }
    return [...out.values()].sort((a, b) => a.start - b.start);
  }

  usage() {
    return { refused: [...this.refusedUntil].filter(([, u]) => u > this.now()).map(([t]) => t), loaded: [...this.hist.keys()] };
  }

  stop() {
    this.loading.clear();
  }
}
