import { normal, hashStr, uniform } from './rng';

/**
 * Deterministic market simulator — the single demo price source (ported from the legacy NEXORA demo).
 * price = f(seed, instrument, time). Model:
 *  1. daily closes: mean-reverting log random walk anchored at the reference price on ANCHOR_DAY;
 *  2. 5-minute slots: Brownian bridge between consecutive daily closes;
 *  3. slot high/low excursions and 2-second ticks travelling open → high/low → close inside the slot.
 * Larger intervals are exact aggregations of 5-minute slots, so quote, candles and every view agree.
 * Internally float64 (it is a price generator, not money arithmetic); outputs are rounded to the tick size
 * and serialised as decimal strings by the market-data service.
 */
export const DAY = 86_400_000;
export const SLOT = 300_000;
export const SLOTS = 288;
export const TICK = 2_000;
const TICKS = SLOT / TICK;
const ANCHOR_DAY = Math.floor(Date.UTC(2026, 9, 15) / DAY);

export interface SimInstrument {
  id: string;
  refPrice: number;
  /** Daily volatility as a fraction (0.028 = 2.8 %). */
  dailyVolatility: number;
  liquidityUsd: number;
  market: string;
}

export interface Ohlcv {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface Slot extends Ohlcv {
  hiFirst: boolean;
  f1: number;
  f2: number;
  d: number;
  k: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class MarketSimulator {
  private readonly seeds = new Map<string, number>();
  private readonly daily = new Map<string, { fwd: number[]; bwd: number[]; lnBase: number }>();
  private readonly bridges = new Map<string, Float64Array>();
  private readonly dayAggCache = new Map<string, Ohlcv>();

  constructor(readonly seed: number) {}

  private seedOf(inst: SimInstrument) {
    let s = this.seeds.get(inst.id);
    if (s === undefined) {
      s = (hashStr(inst.id) ^ this.seed) >>> 0;
      this.seeds.set(inst.id, s);
    }
    return s;
  }

  private kappa(inst: SimInstrument) {
    return inst.id === 'VIX' ? 0.08 : inst.market === 'forex' ? 0.02 : 0.012;
  }

  /** Log of the daily close of UTC day d. */
  lnClose(inst: SimInstrument, d: number): number {
    let c = this.daily.get(inst.id);
    if (!c) {
      const ln = Math.log(inst.refPrice);
      c = { fwd: [ln], bwd: [ln], lnBase: ln };
      this.daily.set(inst.id, c);
    }
    const s = this.seedOf(inst);
    const sig = inst.dailyVolatility;
    const k = this.kappa(inst);
    if (d >= ANCHOR_DAY) {
      const i = d - ANCHOR_DAY;
      while (c.fwd.length <= i) {
        const n = c.fwd.length;
        const prev = c.fwd[n - 1]!;
        c.fwd.push(prev + sig * normal(s, ANCHOR_DAY + n, 7) - k * (prev - c.lnBase));
      }
      return c.fwd[i]!;
    }
    const i = ANCHOR_DAY - d;
    while (c.bwd.length <= i) {
      const n = c.bwd.length;
      const next = c.bwd[n - 1]!;
      c.bwd.push(next - sig * normal(s, ANCHOR_DAY - n + 1, 7) - k * (next - c.lnBase));
    }
    return c.bwd[i]!;
  }

  private dayBridge(inst: SimInstrument, d: number): Float64Array {
    const key = inst.id + ':' + d;
    const hit = this.bridges.get(key);
    if (hit) return hit;
    const s = this.seedOf(inst);
    const sig5 = inst.dailyVolatility / Math.sqrt(SLOTS);
    const a = this.lnClose(inst, d - 1);
    const z = this.lnClose(inst, d);
    const w = new Float64Array(SLOTS + 1);
    for (let k = 1; k <= SLOTS; k++) w[k] = w[k - 1]! + sig5 * normal(s, d, 1000 + k);
    const b = new Float64Array(SLOTS + 1);
    const drift = w[SLOTS]! - (z - a);
    for (let k = 0; k <= SLOTS; k++) b[k] = a + w[k]! - (k / SLOTS) * drift;
    b[0] = a;
    b[SLOTS] = z;
    if (this.bridges.size > 20_000) this.bridges.clear();
    this.bridges.set(key, b);
    return b;
  }

  private slot(inst: SimInstrument, d: number, k: number): Slot {
    const s = this.seedOf(inst);
    const sig5 = inst.dailyVolatility / Math.sqrt(SLOTS);
    const b = this.dayBridge(inst, d);
    const o = Math.exp(b[k]!);
    const c = Math.exp(b[k + 1]!);
    const h = Math.max(o, c) * Math.exp(Math.abs(normal(s, d, 5000 + k)) * sig5 * 0.55);
    const l = Math.min(o, c) * Math.exp(-Math.abs(normal(s, d, 6000 + k)) * sig5 * 0.55);
    const hiFirst = uniform(s, d, 7000 + k) < 0.5;
    const f1 = 0.12 + 0.33 * uniform(s, d, 8000 + k);
    const f2 = f1 + 0.12 + (0.76 - f1) * uniform(s, d, 9000 + k);
    const mid = (o + c) / 2;
    const v = (inst.liquidityUsd / mid / SLOTS) * (0.45 + 1.1 * uniform(s, d, 10000 + k)) * (1 + (0.8 * Math.abs(Math.log(c / o))) / sig5);
    return { o, h, l, c, v, hiFirst, f1, f2, d, k };
  }

  private tick(inst: SimInstrument, sl: Slot, j: number): number {
    if (j <= 0) return sl.o;
    if (j >= TICKS) return sl.c;
    const u = j / TICKS;
    const p1 = sl.hiFirst ? sl.h : sl.l;
    const p2 = sl.hiFirst ? sl.l : sl.h;
    let a0: number, a1: number, v0: number, v1: number;
    if (u <= sl.f1) [a0, a1, v0, v1] = [0, sl.f1, sl.o, p1];
    else if (u <= sl.f2) [a0, a1, v0, v1] = [sl.f1, sl.f2, p1, p2];
    else [a0, a1, v0, v1] = [sl.f2, 1, p2, sl.c];
    const p = (u - a0) / (a1 - a0);
    const noise = (sl.h - sl.l) * 0.18 * normal(this.seedOf(inst), sl.d * SLOTS + sl.k, 20000 + j) * Math.sin(Math.PI * p);
    return clamp(v0 + (v1 - v0) * p + noise, sl.l, sl.h);
  }

  /** Price at time t (ms, UTC). Constant within each 2-second tick. */
  priceAt(inst: SimInstrument, t: number): number {
    const d = Math.floor(t / DAY);
    const ms = t - d * DAY;
    const k = Math.floor(ms / SLOT);
    const j = Math.floor((ms - k * SLOT) / TICK);
    return this.tick(inst, this.slot(inst, d, k), j);
  }

  /** Close of UTC day d (exact end-of-day price). */
  dayClose(inst: SimInstrument, d: number): number {
    return Math.exp(this.lnClose(inst, d));
  }

  /** OHLCV of the 5-minute slot as of time t (partial when t is inside the slot). */
  private slotAsOf(inst: SimInstrument, d: number, k: number, t: number): Ohlcv {
    const sl = this.slot(inst, d, k);
    const start = d * DAY + k * SLOT;
    if (t >= start + SLOT) return { o: sl.o, h: sl.h, l: sl.l, c: sl.c, v: sl.v };
    const jNow = Math.max(0, Math.floor((t - start) / TICK));
    let h = sl.o;
    let l = sl.o;
    let c = sl.o;
    for (let j = 1; j <= jNow; j++) {
      c = this.tick(inst, sl, j);
      if (c > h) h = c;
      if (c < l) l = c;
    }
    return { o: sl.o, h, l, c, v: sl.v * (jNow / TICKS) };
  }

  private aggregateSlots(inst: SimInstrument, d: number, k0: number, k1: number, t: number): Ohlcv | null {
    let out: Ohlcv | null = null;
    for (let k = k0; k < k1; k++) {
      if (d * DAY + k * SLOT > t) break;
      const sc = this.slotAsOf(inst, d, k, t);
      if (!out) out = { ...sc };
      else {
        if (sc.h > out.h) out.h = sc.h;
        if (sc.l < out.l) out.l = sc.l;
        out.c = sc.c;
        out.v += sc.v;
      }
    }
    return out;
  }

  private dayAgg(inst: SimInstrument, d: number, t: number): Ohlcv | null {
    if (t < d * DAY + DAY) return this.aggregateSlots(inst, d, 0, SLOTS, t);
    const key = inst.id + ':' + d;
    const hit = this.dayAggCache.get(key);
    if (hit) return hit;
    const r = this.aggregateSlots(inst, d, 0, SLOTS, t);
    if (r) {
      if (this.dayAggCache.size > 200_000) this.dayAggCache.clear();
      this.dayAggCache.set(key, r);
    }
    return r;
  }

  /**
   * Candle of [start, start+ms) as known at time t (t bounds the data: nothing after t is used).
   * ms must be one of 5m/15m/1h/4h (slot multiples), 1d or 1w (start = Monday 00:00 UTC).
   */
  candle(inst: SimInstrument, start: number, ms: number, t: number): Ohlcv | null {
    if (start > t) return null;
    if (ms === 7 * DAY) {
      let out: Ohlcv | null = null;
      for (let d = start / DAY; d < start / DAY + 7; d++) {
        if (d * DAY > t) break;
        const a = this.dayAgg(inst, d, t);
        if (!a) continue;
        if (!out) out = { ...a };
        else {
          if (a.h > out.h) out.h = a.h;
          if (a.l < out.l) out.l = a.l;
          out.c = a.c;
          out.v += a.v;
        }
      }
      return out;
    }
    if (ms === DAY) return this.dayAgg(inst, start / DAY, t);
    const d = Math.floor(start / DAY);
    const k0 = Math.round((start - d * DAY) / SLOT);
    return this.aggregateSlots(inst, d, k0, k0 + ms / SLOT, t);
  }
}

/** Monday 00:00 UTC of the week containing t. */
export function weekStart(t: number): number {
  const d = Math.floor(t / DAY);
  return (Math.floor((d + 3) / 7) * 7 - 3) * DAY;
}

/** Start of the interval bucket containing t (weeks are Monday-aligned). */
export function bucketStart(t: number, ms: number): number {
  return ms === 7 * DAY ? weekStart(t) : Math.floor(t / ms) * ms;
}
