import { Logger } from '@nestjs/common';
import { type Instrument } from '@prisma/client';
import { type Interval, INTERVAL_MS } from '@nexora/contracts';
import { DAY, MarketSimulator, TICK } from '../../../domain/market-sim/simulator';
import { type RawQuote, toSim } from '../provider';
import { type FetchJson, fetchJson } from './http';
import { type Demand, type LiveCandle, type LiveFeed, within } from './live-feed';

/** Catalogue symbol → EIA daily spot series (dollars per unit of the instrument). */
export const EIA_SERIES: Record<string, { route: string; series: string }> = {
  USOIL: { route: 'petroleum/pri/spt', series: 'RWTC' }, // Cushing, OK WTI spot, $/bbl
  BRENT: { route: 'petroleum/pri/spt', series: 'RBRTE' }, // Europe Brent spot, $/bbl
  NATGAS: { route: 'natural-gas/pri/fut', series: 'RNGWHHD' }, // Henry Hub spot, $/MMBtu
  RB: { route: 'petroleum/pri/spt', series: 'EER_EPMRU_PF4_Y35NY_DPG' }, // NY Harbor conventional gasoline, $/gal
  HO: { route: 'petroleum/pri/spt', series: 'EER_EPD2F_PF4_Y35NY_DPG' }, // NY Harbor No. 2 heating oil, $/gal
};
const REFRESH_MS = 6 * 3_600_000;
const HISTORY_FROM = '2021-12-01';

interface History {
  at: number;
  /** UTC day index → real daily close. */
  close: Map<number, number>;
  days: number[];
}

/**
 * Energy commodities: real daily closes from the EIA open-data API (published with a lag of a day or two) and a
 * clearly labelled simulator in between. The simulated path is scaled so that it ends every real day exactly at
 * the EIA close and keeps the last known level afterwards: daily charts show real closes, the running quote and
 * intraday candles are simulated (source "eia-sim"). Demo trades use this simulated price.
 */
export class EiaFeed implements LiveFeed {
  readonly source = 'eia-sim';
  readonly markets = ['commodities'] as const;
  private readonly log = new Logger('EiaFeed');
  private readonly sim: MarketSimulator;
  private readonly hist = new Map<string, History>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly factors = new Map<string, number>();

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    seed: number,
    private readonly get: FetchJson = fetchJson,
    private readonly now: () => number = Date.now,
  ) {
    this.sim = new MarketSimulator(seed);
  }

  supports(inst: Instrument): boolean {
    return inst.status === 'ACTIVE' && inst.market === 'commodities' && !!EIA_SERIES[inst.symbol];
  }

  private load(inst: Instrument): Promise<void> {
    const h = this.hist.get(inst.id);
    if (h && this.now() - h.at < REFRESH_MS) return Promise.resolve();
    const running = this.loading.get(inst.id);
    if (running) return running;
    const p = this.fetchHistory(inst).finally(() => this.loading.delete(inst.id));
    this.loading.set(inst.id, p);
    return p;
  }

  private async fetchHistory(inst: Instrument) {
    const s = EIA_SERIES[inst.symbol];
    if (!s) return;
    const q = `api_key=${encodeURIComponent(this.apiKey)}&frequency=daily&data%5B0%5D=value&facets%5Bseries%5D%5B%5D=${s.series}&start=${HISTORY_FROM}&sort%5B0%5D%5Bcolumn%5D=period&sort%5B0%5D%5Bdirection%5D=asc&length=5000`;
    try {
      const body = (await this.get(`${this.baseUrl}/v2/${s.route}/data/?${q}`, 'eia')) as { response?: { data?: { period: string; value: string | number | null }[] } };
      const close = new Map<number, number>();
      for (const r of body.response?.data ?? []) {
        const v = Number(r.value);
        const d = Date.parse(`${r.period}T00:00:00Z`);
        if (Number.isFinite(v) && v > 0 && Number.isFinite(d)) close.set(Math.floor(d / DAY), v);
      }
      if (!close.size) throw new Error(`no data for ${s.series}`);
      this.hist.set(inst.id, { at: this.now(), close, days: [...close.keys()].sort((a, b) => a - b) });
      for (const k of this.factors.keys()) if (k.startsWith(inst.id + ':')) this.factors.delete(k);
    } catch (e) {
      // keep the previous history if there was one; retry on the next request
      this.log.warn(`${s.series}: ${(e as Error).message}`);
    }
  }

  /** Scale at the end of UTC day d: real close / simulated close of the latest real day ≤ d (or the first one). */
  private factorEnd(inst: Instrument, h: History, d: number): number {
    let lo = 0;
    let hi = h.days.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if ((h.days[mid] ?? 0) <= d) {
        idx = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const day = h.days[Math.max(0, idx)] ?? 0;
    const key = `${inst.id}:${day}`;
    let f = this.factors.get(key);
    if (f == null) {
      f = (h.close.get(day) ?? 1) / this.sim.dayClose(toSim(inst), day);
      this.factors.set(key, f);
    }
    return f;
  }

  /** Scale at time t: moves linearly within a day from the previous day's factor to this day's one. */
  private factorAt(inst: Instrument, h: History, t: number): number {
    const d = Math.floor(t / DAY);
    const f0 = this.factorEnd(inst, h, d - 1);
    const f1 = this.factorEnd(inst, h, d);
    return f0 + (f1 - f0) * ((t - d * DAY) / DAY);
  }

  quote(inst: Instrument, demand: Demand): RawQuote | null {
    if (demand !== 'background') void this.load(inst);
    const h = this.hist.get(inst.id);
    if (!h) return null;
    const t = Math.floor(this.now() / TICK) * TICK;
    const s = toSim(inst);
    const d = Math.floor(t / DAY);
    return {
      mid: this.sim.priceAt(s, t) * this.factorAt(inst, h, t),
      reference: this.sim.dayClose(s, d - 1) * this.factorEnd(inst, h, d - 1),
      changePeriod: 'prev_close',
      observedAt: t,
      status: 'live',
    };
  }

  async prime(insts: Instrument[], timeoutMs: number): Promise<void> {
    await within(Promise.all(insts.map((i) => this.load(i))), timeoutMs);
  }

  async candles(inst: Instrument, interval: Interval, first: number, last: number): Promise<LiveCandle[] | null> {
    await this.load(inst);
    const h = this.hist.get(inst.id);
    if (!h) return null;
    const ms = INTERVAL_MS[interval];
    const now = this.now();
    const s = toSim(inst);
    const out: LiveCandle[] = [];
    let n = 0;
    for (let start = first; start <= last; start += ms) {
      if (++n % 25 === 0) await new Promise((r) => setImmediate(r)); // long histories: let other requests run
      const c = this.sim.candle(s, start, ms, now);
      if (!c) continue;
      const end = Math.min(start + ms, now);
      const fo = this.factorAt(inst, h, start);
      const fc = this.factorAt(inst, h, end);
      // high/low with the mid-candle scale (scaling them by the extreme factors would widen the range artificially)
      const fm = this.factorAt(inst, h, (start + end) / 2);
      const o = c.o * fo;
      const cl = c.c * fc;
      out.push({ start, o: num(o), h: num(Math.max(o, cl, c.h * fm)), l: num(Math.min(o, cl, c.l * fm)), c: num(cl), v: num(c.v) });
    }
    return out;
  }

  usage() {
    const last = Object.fromEntries([...this.hist].map(([id, h]) => [id, new Date((h.days.at(-1) ?? 0) * DAY).toISOString().slice(0, 10)]));
    return { lastRealClose: last };
  }

  stop() {
    this.loading.clear();
  }
}

const num = (v: number) => v.toPrecision(12);
