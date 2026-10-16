import { Logger } from '@nestjs/common';
import { type Instrument } from '@prisma/client';
import { type Interval, INTERVAL_MS } from '@nexora/contracts';
import { type RawQuote } from '../provider';
import { FeedHttpError, type FetchJson, fetchJson } from './http';
import { type Demand, type LiveCandle, type LiveFeed, within } from './live-feed';

const MIN = 60_000;
const DAY = 86_400_000;
const SCHEDULE_MS = 5_000;
/** A pair stays "open on a chart" this long after its last candle request. */
const FOCUS_FOR_MS = 10 * MIN;
const STREAM_FOR_MS = MIN;
const REQUEST_FOR_MS = 10 * MIN;
/** Refresh periods below the open pair: other streamed pairs, pairs only read via REST. */
const STREAM_REFRESH_MS = 15 * MIN;
const REQUEST_REFRESH_MS = 30 * MIN;
/** Credits of the day kept for the open pair and charts; the rest of the list stops refreshing beyond this share. */
const BACKGROUND_DAILY_SHARE = 0.6;
/** A cached quote older than this is reported as stale. */
const STALE_MS = 45 * MIN;
const TD_INTERVAL: Record<Interval, string> = { '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week' };
const CANDLE_TTL: Record<Interval, number> = { '5m': 5 * MIN, '15m': 10 * MIN, '1h': 15 * MIN, '4h': 30 * MIN, '1d': 60 * MIN, '1w': 60 * MIN };

type Priority = 0 | 1 | 2;

/**
 * Credit budget of the Twelve Data plan: one credit per symbol per request, a per-minute and a per-day limit
 * (the day resets at 00:00 UTC). Counting is local and conservative (sliding minute window); a 429 from the
 * provider pauses all requests until the window it names is over.
 */
export class CreditBudget {
  private spent: number[] = [];
  private day = -1;
  private dayUsed = 0;
  private pausedUntil = 0;

  constructor(
    readonly minuteLimit: number,
    readonly dailyLimit: number,
    private readonly now: () => number = Date.now,
  ) {}

  private roll() {
    const t = this.now();
    this.spent = this.spent.filter((s) => t - s < MIN);
    const d = Math.floor(t / DAY);
    if (d !== this.day) {
      this.day = d;
      this.dayUsed = 0;
    }
    return t;
  }

  /** Credits that may be spent right now by a request of this priority (0 = open pair / chart). */
  available(priority: Priority): number {
    const t = this.roll();
    if (t < this.pausedUntil) return 0;
    const minute = this.minuteLimit - this.spent.length;
    const dayCap = priority === 0 ? this.dailyLimit : Math.floor(this.dailyLimit * BACKGROUND_DAILY_SHARE);
    return Math.max(0, Math.min(minute, dayCap - this.dayUsed));
  }

  spend(n: number) {
    const t = this.roll();
    for (let i = 0; i < n; i++) this.spent.push(t);
    this.dayUsed += n;
  }

  pause(untilMs: number) {
    this.pausedUntil = Math.max(this.pausedUntil, untilMs);
  }

  snapshot() {
    const t = this.roll();
    return { minuteUsed: this.spent.length, minuteLimit: this.minuteLimit, dayUsed: this.dayUsed, dailyLimit: this.dailyLimit, pausedUntil: t < this.pausedUntil ? new Date(this.pausedUntil).toISOString() : null };
  }
}

interface TdQuote {
  symbol?: string;
  close?: string;
  previous_close?: string;
  last_quote_at?: number;
  timestamp?: number;
  code?: number;
  message?: string;
  status?: string;
}

/**
 * Twelve Data (Basic plan) for Forex. The pair open on a chart is refreshed first (every focusRefreshMs); other
 * pairs shown in a stream are refreshed every 15 min, pairs only read once every 30 min — all from the server
 * cache in between, within the credit budget. Quotes are reference prices refreshed about once a minute at best,
 * so they are reported as "delayed", never as a live tick feed. Twelve Data gives no bid/ask: the demo spread
 * is applied around the price.
 */
export class TwelveDataFeed implements LiveFeed {
  readonly source = 'twelvedata';
  readonly market = 'forex' as const;
  readonly budget: CreditBudget;
  private readonly log = new Logger('TwelveDataFeed');
  private readonly cache = new Map<string, RawQuote & { fetchedAt: number }>();
  private readonly demand = { focus: new Map<string, Seen>(), stream: new Map<string, Seen>(), request: new Map<string, Seen>() };
  private readonly candleCache = new Map<string, { at: number; first: number; bars: LiveCandle[] }>();
  private timer: NodeJS.Timeout | null = null;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    opts: { minuteLimit: number; dailyLimit: number; focusRefreshMs: number },
    private readonly get: FetchJson = fetchJson,
    private readonly now: () => number = Date.now,
  ) {
    this.budget = new CreditBudget(opts.minuteLimit, opts.dailyLimit, now);
    this.focusRefreshMs = opts.focusRefreshMs;
  }
  private readonly focusRefreshMs: number;

  symbolOf(inst: Instrument): string | null {
    return inst.market === 'forex' && /^[A-Z]{3}$/.test(inst.baseAsset) && /^[A-Z]{3}$/.test(inst.quoteAsset) ? `${inst.baseAsset}/${inst.quoteAsset}` : null;
  }

  supports(inst: Instrument): boolean {
    return inst.status === 'ACTIVE' && this.symbolOf(inst) != null;
  }

  quote(inst: Instrument, demand: Demand): RawQuote | null {
    if (demand !== 'background') {
      this.demand[demand].set(inst.id, { inst, at: this.now() });
      this.ensureScheduling();
    }
    const q = this.cache.get(inst.id);
    if (!q) return null;
    const { fetchedAt, ...raw } = q;
    return { ...raw, status: this.now() - fetchedAt > STALE_MS ? 'stale' : 'delayed' };
  }

  /** The pair whose chart is open: refreshed first. */
  focus(inst: Instrument) {
    this.demand.focus.set(inst.id, { inst, at: this.now() });
    this.ensureScheduling();
  }

  async prime(insts: Instrument[], timeoutMs: number): Promise<void> {
    if (insts.every((i) => this.cache.has(i.id))) return;
    await within(this.run(), timeoutMs);
  }

  usage() {
    return { ...this.budget.snapshot(), cachedPairs: this.cache.size, openPairs: [...this.demand.focus.keys()] };
  }

  private ensureScheduling() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.run(), SCHEDULE_MS);
    this.timer.unref();
  }

  run(): Promise<void> {
    this.inflight ??= this.schedule().finally(() => (this.inflight = null));
    return this.inflight;
  }

  /** Picks the pairs due for a refresh by priority and fetches as many as the budget allows in one request. */
  private async schedule() {
    const t = this.now();
    prune(this.demand.focus, t, FOCUS_FOR_MS);
    prune(this.demand.stream, t, STREAM_FOR_MS);
    prune(this.demand.request, t, REQUEST_FOR_MS);
    const due = new Map<string, { inst: Instrument; prio: Priority; age: number }>();
    const consider = (m: Map<string, Seen>, prio: Priority, every: number) => {
      for (const { inst } of m.values()) {
        if (due.has(inst.id)) continue;
        const fetched = this.cache.get(inst.id)?.fetchedAt;
        const age = fetched == null ? Infinity : t - fetched;
        if (age >= every) due.set(inst.id, { inst, prio, age });
      }
    };
    consider(this.demand.focus, 0, this.focusRefreshMs);
    // a pair just opened (no value yet) is fetched like the open pair, then refreshed at its own pace
    consider(this.demand.stream, 1, STREAM_REFRESH_MS);
    consider(this.demand.request, 2, REQUEST_REFRESH_MS);
    if (!due.size) {
      if (!this.demand.focus.size && !this.demand.stream.size && !this.demand.request.size && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }
    const ordered = [...due.values()].sort((a, b) => effective(a) - effective(b) || b.age - a.age);
    const pick: Instrument[] = [];
    for (const d of ordered) {
      if (this.budget.available(effective(d)) - pick.length <= 0) break;
      pick.push(d.inst);
    }
    if (!pick.length) return;
    const symbols = pick.map((i) => this.symbolOf(i) ?? '');
    this.budget.spend(symbols.length);
    try {
      const body = (await this.get(`${this.baseUrl}/quote?symbol=${encodeURIComponent(symbols.join(','))}&timezone=UTC&apikey=${encodeURIComponent(this.apiKey)}`, 'twelvedata')) as TdQuote | Record<string, TdQuote>;
      this.checkError(body as TdQuote);
      const rows: Record<string, TdQuote> = symbols.length === 1 ? { [symbols[0] ?? '']: body as TdQuote } : (body as Record<string, TdQuote>);
      const received = this.now();
      pick.forEach((inst, i) => {
        const r = rows[symbols[i] ?? ''];
        if (!r || r.status === 'error' || !r.close || !r.previous_close) return;
        this.cache.set(inst.id, {
          mid: r.close,
          reference: r.previous_close,
          changePeriod: 'prev_close',
          observedAt: Math.min((r.last_quote_at ?? r.timestamp ?? received / 1000) * 1000, received),
          fetchedAt: received,
        });
      });
    } catch (e) {
      this.onError(e);
    }
  }

  async candles(inst: Instrument, interval: Interval, first: number, last: number): Promise<LiveCandle[] | null> {
    const symbol = this.symbolOf(inst);
    if (!symbol) return null;
    this.focus(inst);
    const key = `${symbol}:${interval}`;
    const t = this.now();
    const hit = this.candleCache.get(key);
    if (hit && hit.first <= first && t - hit.at < CANDLE_TTL[interval]) return slice(hit.bars, first, last);
    if (this.budget.available(0) < 1) return hit ? slice(hit.bars, first, last) : null; // limit: last known bars, or nothing
    this.budget.spend(1);
    const outputsize = Math.min(5000, Math.ceil((last - first) / INTERVAL_MS[interval]) + 2);
    try {
      const body = (await this.get(
        `${this.baseUrl}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${TD_INTERVAL[interval]}&start_date=${encodeURIComponent(tdDate(first))}&end_date=${encodeURIComponent(tdDate(last + INTERVAL_MS[interval] - 1))}&outputsize=${outputsize}&order=ASC&timezone=UTC&apikey=${encodeURIComponent(this.apiKey)}`,
        'twelvedata',
      )) as { status?: string; code?: number; message?: string; values?: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[] };
      // "no data for this range" is a valid empty answer (e.g. a weekend), anything else is an error
      if (body.status === 'error' && body.code === 400 && /no data/i.test(body.message ?? '')) return [];
      this.checkError(body as TdQuote);
      const bars = (body.values ?? []).map((v) => ({ start: parseTdDate(v.datetime), o: v.open, h: v.high, l: v.low, c: v.close, v: v.volume ?? '0' })).filter((b) => Number.isFinite(b.start));
      this.candleCache.set(key, { at: t, first, bars });
      return slice(bars, first, last);
    } catch (e) {
      this.onError(e);
      return hit ? slice(hit.bars, first, last) : null;
    }
  }

  /** Twelve Data reports errors with HTTP 200 and {status:"error", code, message}. */
  private checkError(b: TdQuote | null) {
    if (b && b.status === 'error') throw new FeedHttpError('twelvedata', b.code ?? 0, b.code ?? null, String(b.message ?? 'error').slice(0, 160));
  }

  private onError(e: unknown) {
    const err = e as FeedHttpError;
    if (err instanceof FeedHttpError && (err.status === 429 || err.code === 429)) {
      // minute limit → wait for the next minute; day limit → until 00:00 UTC
      const t = this.now();
      this.budget.pause(/day/i.test(err.message) ? (Math.floor(t / DAY) + 1) * DAY : t + MIN);
    }
    this.log.warn((e as Error).message); // never contains the URL / API key
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const m of Object.values(this.demand)) m.clear();
  }
}

interface Seen {
  inst: Instrument;
  at: number;
}

/** Pairs without any value yet are fetched with the open pair's priority (the user is waiting for them). */
function effective(d: { prio: Priority; age: number }): Priority {
  return d.age === Infinity ? 0 : d.prio;
}

function prune(m: Map<string, Seen>, t: number, keep: number) {
  for (const [id, s] of m) if (t - s.at > keep) m.delete(id);
}

function slice(bars: LiveCandle[], first: number, last: number) {
  return bars.filter((b) => b.start >= first && b.start <= last);
}

/** "YYYY-MM-DD HH:mm:ss" in UTC (requests use timezone=UTC). */
export function tdDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

export function parseTdDate(s: string) {
  return Date.parse(s.length <= 10 ? `${s}T00:00:00Z` : `${s.replace(' ', 'T')}Z`);
}
