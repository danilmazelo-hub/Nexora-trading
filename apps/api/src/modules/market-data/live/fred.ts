import { Logger } from '@nestjs/common';
import { type Instrument } from '@prisma/client';
import { type Interval } from '@nexora/contracts';
import { type RawQuote } from '../provider';
import { type EodBar, eodCandles } from './eod';
import { type FetchText, fetchText } from './http';
import { type Demand, type LiveCandle, type LiveFeed, within } from './live-feed';

/** Catalogue symbol → FRED daily series (index close). */
export const FRED_SERIES: Record<string, string> = { SPX: 'SP500', DJI: 'DJIA', IXIC: 'NASDAQCOM', NDX: 'NASDAQ100', VIX: 'VIXCLS', N225: 'NIKKEI225' };
const REFRESH_MS = 6 * 3_600_000;
/** After a failed download, wait this long before the next try (the CSV endpoint occasionally times out). */
const RETRY_MS = 10 * 60_000;
const HISTORY_FROM = '2022-01-01';

/**
 * FRED (Federal Reserve Bank of St. Louis), public CSV download, no key: index closes by session. Only the close is
 * published, so a daily candle is drawn from the previous close to this close (open = previous close, high/low =
 * the larger/smaller of the two). Quote status "eod"; intraday periods are empty (see eodCandles).
 */
export class FredIndicesFeed implements LiveFeed {
  readonly source = 'fred';
  readonly markets = ['indices'] as const;
  private readonly log = new Logger('FredFeed');
  private readonly hist = new Map<string, { at: number; bars: EodBar[] }>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly failedAt = new Map<string, number>();

  constructor(
    private readonly baseUrl: string,
    private readonly get: FetchText = fetchText,
    private readonly now: () => number = Date.now,
  ) {}

  supports(inst: Instrument): boolean {
    return inst.status === 'ACTIVE' && inst.market === 'indices' && !!FRED_SERIES[inst.symbol];
  }

  private load(inst: Instrument): Promise<void> {
    const h = this.hist.get(inst.id);
    const t = this.now();
    if (h && t - h.at < REFRESH_MS) return Promise.resolve();
    if (t - (this.failedAt.get(inst.id) ?? 0) < RETRY_MS) return Promise.resolve();
    const running = this.loading.get(inst.id);
    if (running) return running;
    const p = this.fetchHistory(inst).finally(() => this.loading.delete(inst.id));
    this.loading.set(inst.id, p);
    return p;
  }

  private async fetchHistory(inst: Instrument) {
    const series = FRED_SERIES[inst.symbol];
    if (!series) return;
    try {
      const csv = await this.get(`${this.baseUrl}/graph/fredgraph.csv?id=${series}&cosd=${HISTORY_FROM}`, 'fred');
      const bars = parseFredCsv(csv);
      if (!bars.length) throw new Error(`no observations for ${series}`);
      this.hist.set(inst.id, { at: this.now(), bars });
      this.failedAt.delete(inst.id);
    } catch (e) {
      this.failedAt.set(inst.id, this.now());
      this.log.warn(`${series}: ${(e as Error).message}`);
    }
  }

  quote(inst: Instrument, demand: Demand): RawQuote | null {
    if (demand !== 'background') void this.load(inst);
    const bars = this.hist.get(inst.id)?.bars;
    const last = bars?.at(-1);
    const prev = bars?.at(-2);
    if (!last || !prev) return null;
    return { mid: String(last.c), reference: String(prev.c), changePeriod: 'prev_close', observedAt: Math.min(last.t, this.now()), status: 'eod' };
  }

  async prime(insts: Instrument[], timeoutMs: number): Promise<void> {
    await within(Promise.all(insts.map((i) => this.load(i))), timeoutMs);
  }

  async candles(inst: Instrument, interval: Interval, first: number, last: number): Promise<LiveCandle[] | null> {
    await this.load(inst);
    const bars = this.hist.get(inst.id)?.bars;
    if (!bars) return null;
    return eodCandles(bars, interval, first, last);
  }

  usage() {
    return { loaded: [...this.hist.keys()], failing: [...this.failedAt.keys()] };
  }

  stop() {
    this.loading.clear();
  }
}

/** "observation_date,SERIES\n2026-10-15,7744.06\n2026-10-13,\n…" → bars; empty or "." values (holidays) are skipped. */
export function parseFredCsv(csv: string): EodBar[] {
  const bars: EodBar[] = [];
  let prev: number | null = null;
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [date, raw] = line.split(',');
    const c = Number(raw);
    const t = Date.parse(`${date}T00:00:00Z`);
    if (!raw || raw === '.' || !Number.isFinite(c) || !Number.isFinite(t)) continue;
    const o = prev ?? c;
    bars.push({ t, o, h: Math.max(o, c), l: Math.min(o, c), c });
    prev = c;
  }
  return bars;
}
