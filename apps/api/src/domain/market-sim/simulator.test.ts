import { describe, expect, it } from 'vitest';
import { bucketStart, DAY, MarketSimulator, SLOT, TICK, weekStart } from './simulator';

const BTC = { id: 'BTC-USD', refPrice: 83408.01, dailyVolatility: 0.028, liquidityUsd: 28e9, market: 'crypto' };
const T = Date.UTC(2026, 9, 16, 12, 0, 0);

describe('deterministic simulator (D10)', () => {
  it('same seed + same time → identical prices, across instances', () => {
    const a = new MarketSimulator(20261015);
    const b = new MarketSimulator(20261015);
    for (let i = 0; i < 50; i++) expect(a.priceAt(BTC, T + i * 7919)).toBe(b.priceAt(BTC, T + i * 7919));
  });

  it('a different seed gives a different path', () => {
    expect(new MarketSimulator(1).priceAt(BTC, T)).not.toBe(new MarketSimulator(2).priceAt(BTC, T));
  });

  it('price is constant within a 2-second tick and stays near the reference on the anchor day', () => {
    const s = new MarketSimulator(20261015);
    const t0 = Math.floor(T / TICK) * TICK;
    expect(s.priceAt(BTC, t0)).toBe(s.priceAt(BTC, t0 + TICK - 1));
    const p = s.priceAt(BTC, Date.UTC(2026, 9, 15, 23, 0));
    expect(p / BTC.refPrice).toBeGreaterThan(0.8);
    expect(p / BTC.refPrice).toBeLessThan(1.25);
  });

  it('candles aggregate consistently: a closed hour equals its twelve 5-minute slots', () => {
    const s = new MarketSimulator(20261015);
    const hour = Date.UTC(2026, 9, 16, 9);
    const h = s.candle(BTC, hour, 12 * SLOT, T)!;
    const parts = Array.from({ length: 12 }, (_, i) => s.candle(BTC, hour + i * SLOT, SLOT, T)!);
    expect(h.o).toBe(parts[0]!.o);
    expect(h.c).toBe(parts[11]!.c);
    expect(h.h).toBe(Math.max(...parts.map((p) => p.h)));
    expect(h.l).toBe(Math.min(...parts.map((p) => p.l)));
    expect(h.l).toBeLessThanOrEqual(Math.min(h.o, h.c));
    expect(h.h).toBeGreaterThanOrEqual(Math.max(h.o, h.c));
  });

  it('the current price equals the close of the forming candle (quote and chart agree)', () => {
    const s = new MarketSimulator(20261015);
    const start = bucketStart(T + 37_000, 12 * SLOT);
    expect(s.candle(BTC, start, 12 * SLOT, T + 37_000)!.c).toBe(s.priceAt(BTC, T + 37_000));
  });

  it('no data from the future: a candle starting after t does not exist', () => {
    const s = new MarketSimulator(20261015);
    expect(s.candle(BTC, T + SLOT, SLOT, T)).toBeNull();
  });

  it('daily close equals the end-of-day price', () => {
    const s = new MarketSimulator(20261015);
    const d = Math.floor(T / DAY) - 3;
    const c = s.candle(BTC, d * DAY, DAY, T)!;
    expect(c.c).toBeCloseTo(s.dayClose(BTC, d), 6);
  });

  it('weeks are Monday-aligned in UTC', () => {
    const w = weekStart(T);
    expect(new Date(w).getUTCDay()).toBe(1);
    expect(new Date(w).getUTCHours()).toBe(0);
  });
});
