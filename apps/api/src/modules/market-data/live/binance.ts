import { Logger } from '@nestjs/common';
import { type Instrument } from '@prisma/client';
import { type Interval, INTERVAL_MS, STALE_AFTER_MS } from '@nexora/contracts';
import { type RawQuote } from '../provider';
import { FeedHttpError, type FetchJson, fetchJson } from './http';
import { type Demand, type LiveCandle, type LiveFeed, type LiveOrderBook, within } from './live-feed';

const POLL_MS = 2_000;
/** An instrument nobody asked for during this long is no longer polled. */
const WANTED_FOR_MS = 60_000;
/** /ticker/24hr costs 40 weight for 21–100 symbols; the IP limit is 6000 weight per minute. */
const BATCH = 100;
const BOOK_TTL_MS = 1_000;
const BOOK_LIMITS = [5, 10, 20, 50, 100];

interface Ticker24h {
  symbol: string;
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  openPrice: string;
  closeTime: number;
}

/**
 * Binance Spot public market data (no key): crypto quotes from the rolling 24h ticker (real best bid/ask, change
 * vs. the price 24 h ago), klines for charts and the order book. Catalogue instruments are quoted in USD; Binance
 * pairs are quoted in USDT, which the UI states next to the source.
 */
export class BinanceFeed implements LiveFeed {
  readonly source = 'binance';
  readonly markets = ['crypto'] as const;
  private readonly log = new Logger('BinanceFeed');
  private readonly cache = new Map<string, RawQuote>();
  private readonly wanted = new Map<string, { inst: Instrument; at: number }>();
  private readonly books = new Map<string, { at: number; book: LiveOrderBook }>();
  private timer: NodeJS.Timeout | null = null;
  private inflight: Promise<void> | null = null;
  private failures = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly get: FetchJson = fetchJson,
    private readonly now: () => number = Date.now,
  ) {}

  symbolOf(inst: Instrument): string | null {
    return inst.market === 'crypto' && inst.quoteAsset === 'USD' && /^[A-Z0-9]{2,12}$/.test(inst.baseAsset) ? `${inst.baseAsset}USDT` : null;
  }

  supports(inst: Instrument): boolean {
    return inst.status === 'ACTIVE' && this.symbolOf(inst) != null;
  }

  quote(inst: Instrument, demand: Demand): RawQuote | null {
    if (demand !== 'background') {
      this.wanted.set(inst.id, { inst, at: this.now() });
      this.ensurePolling();
    }
    const q = this.cache.get(inst.id);
    if (!q) return null;
    return { ...q, status: this.now() - q.observedAt > STALE_AFTER_MS ? 'stale' : 'live' };
  }

  async prime(insts: Instrument[], timeoutMs: number): Promise<void> {
    const fresh = (i: Instrument) => {
      const q = this.cache.get(i.id);
      return !!q && this.now() - q.observedAt <= STALE_AFTER_MS;
    };
    if (insts.every(fresh)) return;
    for (const i of insts) this.wanted.set(i.id, { inst: i, at: this.now() });
    await within(this.refresh(), timeoutMs);
  }

  private ensurePolling() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.refresh(), POLL_MS);
    this.timer.unref();
    void this.refresh(); // resume at once: the cache may be minutes old after an idle period
  }

  /** One refresh at a time; concurrent callers share it. */
  refresh(): Promise<void> {
    this.inflight ??= this.doRefresh().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async doRefresh() {
    const t = this.now();
    for (const [id, w] of this.wanted) if (t - w.at > WANTED_FOR_MS) this.wanted.delete(id);
    if (!this.wanted.size) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    const bySymbol = new Map<string, string>();
    for (const { inst } of this.wanted.values()) {
      const s = this.symbolOf(inst);
      if (s) bySymbol.set(s, inst.id);
    }
    const symbols = [...bySymbol.keys()];
    for (let i = 0; i < symbols.length; i += BATCH) {
      const part = symbols.slice(i, i + BATCH);
      try {
        const rows = (await this.get(`${this.baseUrl}/api/v3/ticker/24hr?type=FULL&symbols=${encodeURIComponent(JSON.stringify(part))}`, 'binance')) as Ticker24h[];
        for (const r of rows) {
          const id = bySymbol.get(r.symbol);
          if (id) this.cache.set(id, parseTicker(r, t));
        }
        this.failures = 0;
      } catch (e) {
        // cached values age into "stale" on their own; log once per outage, not every 2 s
        if (this.failures++ === 0) this.log.warn(`ticker refresh failed: ${(e as Error).message}`);
      }
    }
  }

  async candles(inst: Instrument, interval: Interval, first: number, last: number): Promise<LiveCandle[] | null> {
    const symbol = this.symbolOf(inst);
    if (!symbol) return null;
    const limit = Math.min(1000, Math.max(1, Math.round((last - first) / INTERVAL_MS[interval]) + 1));
    const url = `${this.baseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${first}&endTime=${last}&limit=${limit}`;
    try {
      // one retry on a network failure / timeout (status 0); provider errors are not retried
      const rows = (await this.get(url, 'binance').catch((e: unknown) => {
        if (e instanceof FeedHttpError && e.status === 0) return this.get(url, 'binance');
        throw e;
      })) as unknown[][];
      return rows
        .map((k) => ({ start: Number(k[0]), o: String(k[1]), h: String(k[2]), l: String(k[3]), c: String(k[4]), v: String(k[5]) }))
        .filter((c) => c.start >= first && c.start <= last);
    } catch (e) {
      this.log.warn(`klines ${symbol} ${interval} failed: ${(e as Error).message}`);
      return null;
    }
  }

  async orderBook(inst: Instrument, depth: number): Promise<LiveOrderBook | null> {
    const symbol = this.symbolOf(inst);
    if (!symbol) return null;
    const limit = BOOK_LIMITS.find((l) => l >= depth) ?? 100;
    const key = `${symbol}:${limit}`;
    const hit = this.books.get(key);
    if (hit && this.now() - hit.at < BOOK_TTL_MS) return trim(hit.book, depth);
    try {
      const r = (await this.get(`${this.baseUrl}/api/v3/depth?symbol=${symbol}&limit=${limit}`, 'binance')) as { bids: [string, string][]; asks: [string, string][] };
      const book = { bids: r.bids, asks: r.asks, observedAt: this.now() };
      this.books.set(key, { at: this.now(), book });
      return trim(book, depth);
    } catch (e) {
      this.log.warn(`depth ${symbol} failed: ${(e as Error).message}`);
      return null;
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.wanted.clear();
  }
}

function parseTicker(r: Ticker24h, receivedAt: number): RawQuote {
  return {
    mid: r.lastPrice,
    bid: r.bidPrice,
    ask: r.askPrice,
    reference: r.openPrice,
    changePeriod: '24h',
    // closeTime is the end of the rolling window (≈ the last update); never in the future of our clock
    observedAt: Math.min(Number(r.closeTime) || receivedAt, receivedAt),
  };
}

function trim(b: LiveOrderBook, depth: number): LiveOrderBook {
  return { bids: b.bids.slice(0, depth), asks: b.asks.slice(0, depth), observedAt: b.observedAt };
}
