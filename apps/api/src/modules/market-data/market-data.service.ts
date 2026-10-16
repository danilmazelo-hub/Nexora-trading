import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type Instrument } from '@prisma/client';
import { type Candle, type CandlesResponse, D, HISTORY_START, type Interval, INTERVAL_MS, type OrderBook, percentChange, placesOf, type Quote, toDecimalString, type TradableMarket } from '@nexora/contracts';
import Decimal from 'decimal.js';
import { loadEnv } from '../../config/env';
import { bucketStart } from '../../domain/market-sim/simulator';
import { PrismaService } from '../../infra/database/prisma.service';
import { AppError } from '../../shared/app-error';
import { InstrumentsService } from '../instruments/instruments.service';
import { createFeeds } from './live/feeds';
import { type Demand, type LiveFeed } from './live/live-feed';
import { MarketClock } from './market-clock';
import { type MarketDataProvider, SimulatorProvider } from './provider';

/** Full bid–ask spread in basis points per market (demo; also applied around live prices without bid/ask). */
const SPREAD_BPS: Record<string, number> = { crypto: 6, stocks: 3, indices: 2, forex: 1.2, commodities: 5 };
const HISTORY_START_MS = Date.parse(HISTORY_START);
const QUOTE_FLUSH_MS = 10_000;
/** How long a request waits for the very first value of a live instrument. */
const PRIME_MS = 4_000;

export interface QuoteOpts {
  unavailable?: boolean;
  t?: number;
  /** stream = shown in an SSE stream, request = REST read, background = internal (does not keep feeds polling). */
  demand?: Demand;
  /** Wait for the first value of live instruments (false for SSE updates: they never block a tick). */
  prime?: boolean;
}

@Injectable()
export class MarketDataService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('MarketData');
  private provider: MarketDataProvider | null = null;
  private instruments = new Map<string, Instrument>();
  private instrumentsAt = 0;
  private readonly recent = new Map<string, number>();
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly feeds: Map<TradableMarket, LiveFeed[]> = createFeeds(loadEnv());
  /** Every distinct feed once (Twelve Data serves several markets). */
  private get allFeeds(): LiveFeed[] {
    return [...new Set([...this.feeds.values()].flat())];
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: MarketClock,
    private readonly catalog: InstrumentsService,
  ) {}

  onModuleInit() {
    this.flushTimer = setInterval(() => void this.flushQuotes().catch(() => undefined), QUOTE_FLUSH_MS);
    this.flushTimer.unref();
  }
  onModuleDestroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    for (const f of this.allFeeds) f.stop();
  }

  /**
   * The live reference feed of this instrument's market, if one is enabled and supports it. Live feeds follow
   * real time only: with a fixed market clock (demo scenarios, tests) every market uses the simulator.
   */
  private async liveFeedOf(inst: Instrument): Promise<LiveFeed | null> {
    const feed = this.feeds.get(inst.market as TradableMarket)?.find((f) => f.supports(inst));
    if (!feed) return null;
    return (await this.clock.refresh()).mode === 'REALTIME' ? feed : null;
  }

  async providerFor(): Promise<MarketDataProvider> {
    const { seed } = await this.clock.refresh();
    if (!this.provider || (this.provider instanceof SimulatorProvider && this.provider.seed !== seed)) this.provider = new SimulatorProvider(seed);
    return this.provider;
  }

  private async instrument(id: string): Promise<Instrument> {
    const cached = await this.loadInstruments();
    const i = cached.get(id);
    if (i) return i;
    return this.catalog.get(id); // throws INSTRUMENT_NOT_FOUND
  }

  private async loadInstruments(): Promise<Map<string, Instrument>> {
    if (Date.now() - this.instrumentsAt > 60_000 || this.instruments.size === 0) {
      const rows = await this.prisma.instrument.findMany({ where: { status: { not: 'DISABLED' } } });
      this.instruments = new Map(rows.map((r) => [r.id, r]));
      this.instrumentsAt = Date.now();
    }
    return this.instruments;
  }

  async knownIds(ids: string[]): Promise<string[]> {
    const m = await this.loadInstruments();
    return ids.filter((id) => m.has(id));
  }

  /**
   * Quote as of market time t. Missing data stays missing: unavailable instruments (or the session scenario
   * QUOTES_UNAVAILABLE) return null prices and status "unavailable", never 0 / +0.00 %.
   */
  async quote(id: string, opts: QuoteOpts = {}): Promise<Quote> {
    const inst = await this.instrument(id);
    const t = opts.t ?? (await this.clock.now());
    const state = await this.clock.refresh();
    const feed = await this.liveFeedOf(inst);
    const provider = feed ?? (await this.providerFor());
    const demand = opts.demand ?? 'request';
    const receivedAt = new Date().toISOString();
    if (demand !== 'background') this.recent.set(id, Date.now());
    let raw = null;
    if (!opts.unavailable) {
      if (feed) {
        raw = feed.quote(inst, demand);
        // nothing yet, or an old value from an idle period: wait (bounded) for a fresh one first
        if ((!raw || raw.status === 'stale') && demand !== 'background' && opts.prime !== false) {
          await feed.prime([inst], PRIME_MS);
          raw = feed.quote(inst, 'background');
        }
        // the provider's plan refused this symbol: it is served by the simulator from now on
        if (!raw && !feed.supports(inst)) return this.quote(id, opts);
      } else raw = (provider as MarketDataProvider).quote(inst, t);
    }
    const changePeriod = inst.market === 'crypto' ? '24h' : 'prev_close';
    if (!raw) return { instrumentId: id, source: provider.source, status: 'unavailable', bid: null, ask: null, last: null, change: null, changePct: null, changePeriod, observedAt: null, receivedAt };
    const places = placesOf(toDecimalString(inst.tickSize.toString()));
    const mid = new D(raw.mid);
    const half = mid.times(SPREAD_BPS[inst.market] ?? 5).div(20_000);
    const last = mid.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
    const reference = new D(raw.reference).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
    // real best bid/ask when the feed has them, otherwise the demo spread around the price
    const bid = raw.bid && raw.ask ? new D(raw.bid) : mid.minus(half);
    const ask = raw.bid && raw.ask ? new D(raw.ask) : mid.plus(half);
    return {
      instrumentId: id,
      source: provider.source,
      status: raw.status ?? (state.mode === 'FIXED' ? 'delayed' : 'live'),
      bid: bid.toDecimalPlaces(places, Decimal.ROUND_DOWN).toFixed(places),
      ask: ask.toDecimalPlaces(places, Decimal.ROUND_UP).toFixed(places),
      last: last.toFixed(places),
      change: last.minus(reference).toFixed(places),
      changePct: percentChange(last.toFixed(places), reference.toFixed(places), 4),
      changePeriod: raw.changePeriod,
      observedAt: new Date(raw.observedAt).toISOString(),
      receivedAt,
    };
  }

  async quotes(ids: string[], opts: QuoteOpts = {}): Promise<Quote[]> {
    const t = opts.t ?? (await this.clock.now());
    const known = await this.knownIds(ids);
    const demand = opts.demand ?? 'request';
    if (!opts.unavailable && demand !== 'background' && opts.prime !== false) {
      // one batched first fetch per feed instead of one per instrument
      const byFeed = new Map<LiveFeed, Instrument[]>();
      for (const id of known) {
        const inst = await this.instrument(id);
        const feed = await this.liveFeedOf(inst);
        if (feed) byFeed.set(feed, [...(byFeed.get(feed) ?? []), inst]);
      }
      await Promise.all(
        [...byFeed].map(([feed, list]) => {
          for (const i of list) feed.quote(i, demand);
          return feed.prime(list, PRIME_MS);
        }),
      );
    }
    return Promise.all(known.map((id) => this.quote(id, { ...opts, t, prime: false })));
  }

  /** Writes the latest quotes of recently requested instruments to the Quote cache table. */
  async flushQuotes() {
    const since = Date.now() - 60_000;
    const ids = [...this.recent.entries()].filter(([, at]) => at >= since).map(([id]) => id);
    for (const [id, at] of this.recent) if (at < since) this.recent.delete(id);
    if (!ids.length) return;
    const qs = await this.quotes(ids, { demand: 'background' });
    await this.prisma.$transaction(
      qs.map((q) => {
        const data = { bid: q.bid, ask: q.ask, last: q.last, changePct: q.changePct, changePeriod: q.changePeriod, observedAt: q.observedAt ? new Date(q.observedAt) : null, receivedAt: new Date(q.receivedAt) };
        return this.prisma.quote.upsert({ where: { instrumentId_source: { instrumentId: q.instrumentId, source: q.source } }, create: { instrumentId: q.instrumentId, source: q.source, ...data }, update: data });
      }),
    );
  }

  /**
   * Candles of one interval within [from, to] (UTC). Never returns candles from the future: the last candle is
   * the one containing "now" and is marked isClosed=false. Closed candles are served from / stored to the Candle
   * cache. At most `limit` candles (the most recent ones); `truncated` tells the client there is more history.
   */
  async candles(id: string, interval: Interval, q: { from?: string; to?: string; limit: number; unavailable?: boolean }): Promise<CandlesResponse> {
    const inst = await this.instrument(id);
    const feed = await this.liveFeedOf(inst);
    const provider = feed ?? (await this.providerFor());
    const now = await this.clock.now();
    const ms = INTERVAL_MS[interval];
    const toT = Math.min(q.to ? Date.parse(q.to) : now, now);
    let fromT = q.from ? Date.parse(q.from) : toT - q.limit * ms;
    if (fromT > toT) throw new AppError('VALIDATION_FAILED', 400, 'Начало диапазона позже конца', { from: ['должно быть не позже to'] });
    fromT = Math.max(fromT, HISTORY_START_MS);
    let first = bucketStart(fromT, ms);
    if (first < HISTORY_START_MS) first += ms;
    const last = bucketStart(toT, ms);
    let truncated = false;
    if (last >= first && (last - first) / ms + 1 > q.limit) {
      first = last - (q.limit - 1) * ms;
      truncated = true;
    }
    const base = { instrumentId: id, source: provider.source, interval, from: new Date(first).toISOString(), to: new Date(toT).toISOString(), truncated };
    if (q.unavailable || inst.status !== 'ACTIVE' || last < first) return { ...base, candles: [] };

    const places = placesOf(toDecimalString(inst.tickSize.toString()));
    const px = (v: string) => new D(v).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
    if (feed) {
      // real history from the feed (Binance: every call; Twelve Data: cached in the feed to save credits)
      const bars = await feed.candles(inst, interval, first, last);
      if (!bars && !feed.supports(inst)) return this.candles(id, interval, q); // refused by the plan → simulator
      if (!bars) throw new AppError('QUOTES_UNAVAILABLE', 503, 'Источник цен сейчас не отдаёт историю (лимит запросов или сбой связи). Повторите через минуту.');
      const candles = bars.map((b) => ({
        openTime: new Date(b.start).toISOString(),
        closeTime: new Date(b.start + ms).toISOString(),
        open: px(b.o),
        high: px(b.h),
        low: px(b.l),
        close: px(b.c),
        volume: new D(b.v).toDecimalPlaces(8).toFixed(),
        isClosed: b.start + ms <= now,
      }));
      return { ...base, candles };
    }
    const sim = provider as MarketDataProvider;
    const lastClosedStart = last + ms <= now ? last : last - ms;
    const cached = lastClosedStart >= first
      ? await this.prisma.candle.findMany({ where: { instrumentId: id, source: provider.source, interval, openTime: { gte: new Date(first), lte: new Date(lastClosedStart) } }, orderBy: { openTime: 'asc' } })
      : [];
    const byStart = new Map(cached.map((c) => [c.openTime.getTime(), c]));
    const out: Candle[] = [];
    const toStore: { openTime: Date; closeTime: Date; open: string; high: string; low: string; close: string; volume: string }[] = [];
    const fmt = (v: number) => new D(v).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
    const fmtS = (v: string) => new D(v).toFixed(places);
    let computed = 0;
    for (let start = first; start <= last; start += ms) {
      const closed = start + ms <= now;
      const hit = closed ? byStart.get(start) : undefined;
      if (hit) {
        out.push({ openTime: hit.openTime.toISOString(), closeTime: hit.closeTime.toISOString(), open: fmtS(hit.open.toString()), high: fmtS(hit.high.toString()), low: fmtS(hit.low.toString()), close: fmtS(hit.close.toString()), volume: new D(hit.volume.toString()).toFixed(), isClosed: true });
        continue;
      }
      // Long histories are CPU-heavy on first computation: yield to other requests regularly.
      if (++computed % 25 === 0) await new Promise((r) => setImmediate(r));
      const c = sim.candle(inst, start, ms, now);
      if (!c) continue;
      const row = { openTime: new Date(start), closeTime: new Date(start + ms), open: fmt(c.o), high: fmt(c.h), low: fmt(c.l), close: fmt(c.c), volume: new D(c.v).toDecimalPlaces(8).toFixed() };
      out.push({ ...row, openTime: row.openTime.toISOString(), closeTime: row.closeTime.toISOString(), isClosed: closed });
      if (closed) toStore.push(row);
    }
    if (toStore.length) {
      try {
        await this.prisma.candle.createMany({ data: toStore.map((r) => ({ instrumentId: id, source: provider.source, interval, ...r })), skipDuplicates: true });
      } catch (e) {
        this.log.warn(`candle cache write failed: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    return { ...base, candles: out };
  }

  /** Current market time (tick-aligned). */
  now(): Promise<number> {
    return this.clock.now();
  }

  /** Order book from the live feed (crypto via Binance); without one the book is reported unavailable, never faked. */
  async orderBook(id: string, depth: number, unavailable = false): Promise<OrderBook> {
    const inst = await this.instrument(id);
    const feed = await this.liveFeedOf(inst);
    const none: OrderBook = { instrumentId: id, source: feed?.source ?? 'none', status: 'unavailable', bids: [], asks: [], observedAt: null };
    if (unavailable || !feed?.orderBook) return none;
    const book = await feed.orderBook(inst, depth);
    if (!book) return none;
    const places = placesOf(toDecimalString(inst.tickSize.toString()));
    const level = ([p, q]: [string, string]) => ({ price: new D(p).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places), quantity: new D(q).toFixed() });
    return { instrumentId: id, source: feed.source, status: 'live', bids: book.bids.map(level), asks: book.asks.map(level), observedAt: new Date(book.observedAt).toISOString() };
  }

  async status() {
    const s = await this.clock.refresh();
    const live = s.mode === 'REALTIME';
    const feeds = Object.fromEntries([...this.feeds].map(([market, list]) => [market, list.map((f) => ({ source: f.source, active: live, ...(f.usage ? { usage: f.usage() } : {}) }))]));
    return { source: (await this.providerFor()).source, seed: s.seed, clockMode: s.mode, now: new Date(await this.clock.now()).toISOString(), feeds };
  }

  /** "simulator", or "simulator+binance+twelvedata" when live reference feeds are enabled. */
  priceSource(): string {
    return ['simulator', ...this.allFeeds.map((f) => f.source)].join('+');
  }
}
