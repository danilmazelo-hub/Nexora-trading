import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type Instrument } from '@prisma/client';
import { type Candle, type CandlesResponse, D, HISTORY_START, type Interval, INTERVAL_MS, percentChange, placesOf, type Quote, toDecimalString } from '@nexora/contracts';
import Decimal from 'decimal.js';
import { bucketStart } from '../../domain/market-sim/simulator';
import { PrismaService } from '../../infra/database/prisma.service';
import { AppError } from '../../shared/app-error';
import { InstrumentsService } from '../instruments/instruments.service';
import { MarketClock } from './market-clock';
import { type MarketDataProvider, SimulatorProvider } from './provider';

/** Full bid–ask spread in basis points per market (demo). */
const SPREAD_BPS: Record<string, number> = { crypto: 6, stocks: 3, indices: 2, forex: 1.2, commodities: 5 };
const HISTORY_START_MS = Date.parse(HISTORY_START);
const QUOTE_FLUSH_MS = 10_000;

@Injectable()
export class MarketDataService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('MarketData');
  private provider: MarketDataProvider | null = null;
  private instruments = new Map<string, Instrument>();
  private instrumentsAt = 0;
  private readonly recent = new Map<string, number>();
  private flushTimer: NodeJS.Timeout | null = null;

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
  async quote(id: string, opts: { unavailable?: boolean; t?: number } = {}): Promise<Quote> {
    const inst = await this.instrument(id);
    const t = opts.t ?? (await this.clock.now());
    const state = await this.clock.refresh();
    const provider = await this.providerFor();
    const receivedAt = new Date().toISOString();
    this.recent.set(id, Date.now());
    const raw = opts.unavailable ? null : provider.quote(inst, t);
    const changePeriod = inst.market === 'crypto' ? '24h' : 'prev_close';
    if (!raw) return { instrumentId: id, source: provider.source, status: 'unavailable', bid: null, ask: null, last: null, change: null, changePct: null, changePeriod, observedAt: null, receivedAt };
    const places = placesOf(toDecimalString(inst.tickSize.toString()));
    const mid = new D(raw.mid);
    const half = mid.times(SPREAD_BPS[inst.market] ?? 5).div(20_000);
    const last = mid.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
    const reference = new D(raw.reference).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
    return {
      instrumentId: id,
      source: provider.source,
      status: state.mode === 'FIXED' ? 'delayed' : 'live',
      bid: mid.minus(half).toDecimalPlaces(places, Decimal.ROUND_DOWN).toFixed(places),
      ask: mid.plus(half).toDecimalPlaces(places, Decimal.ROUND_UP).toFixed(places),
      last: last.toFixed(places),
      change: last.minus(reference).toFixed(places),
      changePct: percentChange(last.toFixed(places), reference.toFixed(places), 4),
      changePeriod: raw.changePeriod,
      observedAt: new Date(raw.observedAt).toISOString(),
      receivedAt,
    };
  }

  async quotes(ids: string[], opts: { unavailable?: boolean; t?: number } = {}): Promise<Quote[]> {
    const t = opts.t ?? (await this.clock.now());
    const known = await this.knownIds(ids);
    return Promise.all(known.map((id) => this.quote(id, { ...opts, t })));
  }

  /** Writes the latest quotes of recently requested instruments to the Quote cache table. */
  async flushQuotes() {
    const since = Date.now() - 60_000;
    const ids = [...this.recent.entries()].filter(([, at]) => at >= since).map(([id]) => id);
    for (const [id, at] of this.recent) if (at < since) this.recent.delete(id);
    if (!ids.length) return;
    const qs = await this.quotes(ids);
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
    const provider = await this.providerFor();
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
    const lastClosedStart = last + ms <= now ? last : last - ms;
    const cached = lastClosedStart >= first
      ? await this.prisma.candle.findMany({ where: { instrumentId: id, source: provider.source, interval, openTime: { gte: new Date(first), lte: new Date(lastClosedStart) } }, orderBy: { openTime: 'asc' } })
      : [];
    const byStart = new Map(cached.map((c) => [c.openTime.getTime(), c]));
    const out: Candle[] = [];
    const toStore: { openTime: Date; closeTime: Date; open: string; high: string; low: string; close: string; volume: string }[] = [];
    const fmt = (v: number) => new D(v).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
    const fmtS = (v: string) => new D(v).toFixed(places);
    for (let start = first; start <= last; start += ms) {
      const closed = start + ms <= now;
      const hit = closed ? byStart.get(start) : undefined;
      if (hit) {
        out.push({ openTime: hit.openTime.toISOString(), closeTime: hit.closeTime.toISOString(), open: fmtS(hit.open.toString()), high: fmtS(hit.high.toString()), low: fmtS(hit.low.toString()), close: fmtS(hit.close.toString()), volume: new D(hit.volume.toString()).toFixed(), isClosed: true });
        continue;
      }
      const c = provider.candle(inst, start, ms, now);
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

  async status() {
    const s = await this.clock.refresh();
    return { source: (await this.providerFor()).source, seed: s.seed, clockMode: s.mode, now: new Date(await this.clock.now()).toISOString() };
  }
}
