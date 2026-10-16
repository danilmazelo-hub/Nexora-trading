import { type Instrument } from '@prisma/client';
import { DAY, MarketSimulator, type Ohlcv, type SimInstrument } from '../../domain/market-sim/simulator';

/** Raw provider output, still in float64; MarketDataService rounds to the tick size and serialises. */
export interface RawQuote {
  mid: number;
  /** Reference price for the change: 24h ago (crypto) or previous UTC session close (others). */
  reference: number;
  changePeriod: '24h' | 'prev_close';
  observedAt: number;
}

/**
 * Every price source (the demo simulator now, licensed feeds in stage 2) sits behind this interface, so a
 * quote, a candle and a later position valuation always come from the same provider.
 */
export interface MarketDataProvider {
  readonly source: string;
  quote(inst: Instrument, t: number): RawQuote | null;
  candle(inst: Instrument, start: number, ms: number, asOf: number): Ohlcv | null;
}

export function toSim(i: Instrument): SimInstrument {
  return { id: i.id, refPrice: Number(i.refPrice), dailyVolatility: Number(i.dailyVolatility), liquidityUsd: Number(i.liquidityUsd), market: i.market };
}

/** Deterministic adapter: same seed + same time ⇒ same numbers in every process. */
export class SimulatorProvider implements MarketDataProvider {
  readonly source: string;
  private readonly sim: MarketSimulator;
  constructor(readonly seed: number) {
    this.sim = new MarketSimulator(seed);
    this.source = `simulator:${seed}`;
  }

  quote(inst: Instrument, t: number): RawQuote | null {
    if (inst.status !== 'ACTIVE') return null; // no feed → unavailable, never a zero price
    const s = toSim(inst);
    const mid = this.sim.priceAt(s, t);
    const crypto = inst.market === 'crypto';
    const reference = crypto ? this.sim.priceAt(s, t - DAY) : this.sim.dayClose(s, Math.floor(t / DAY) - 1);
    return { mid, reference, changePeriod: crypto ? '24h' : 'prev_close', observedAt: t };
  }

  candle(inst: Instrument, start: number, ms: number, asOf: number): Ohlcv | null {
    if (inst.status !== 'ACTIVE') return null;
    return this.sim.candle(toSim(inst), start, ms, asOf);
  }
}
