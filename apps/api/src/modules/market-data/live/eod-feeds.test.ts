import { type Instrument } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { EiaFeed } from './eia';
import { FeedHttpError } from './http';
import { MassiveIndicesFeed } from './massive';

const DAY = 86_400_000;
const inst = (symbol: string, market: string, refPrice: number) =>
  ({ id: symbol, symbol, market, status: 'ACTIVE', refPrice, dailyVolatility: 0.02, liquidityUsd: 1e9, baseAsset: symbol, quoteAsset: 'USD' }) as unknown as Instrument;
const OIL = inst('USOIL', 'commodities', 76.45);

describe('EiaFeed', () => {
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const rows = [
    { period: '2026-10-12', value: '99.50' },
    { period: '2026-10-13', value: '100.70' },
    { period: '2026-10-14', value: '101.91' },
  ];
  function feed(now: number, data: unknown = { response: { data: rows } }) {
    const urls: string[] = [];
    const f = new EiaFeed('https://eia', 'KEY', 20261015, async (url) => {
      urls.push(url);
      if (data instanceof Error) throw data;
      return data;
    }, () => now);
    return { f, urls };
  }

  it('daily candles close exactly at the real EIA closes; the level is real, not the catalogue anchor', async () => {
    const now = day('2026-10-16') + 12 * 3_600_000;
    const { f, urls } = feed(now);
    const bars = await f.candles(OIL, '1d', day('2026-10-12'), day('2026-10-16'));
    expect(decodeURIComponent(urls[0] ?? '')).toContain('facets[series][]=RWTC');
    const close = (iso: string) => Number(bars?.find((b) => b.start === day(iso))?.c);
    expect(close('2026-10-12')).toBeCloseTo(99.5, 6);
    expect(close('2026-10-13')).toBeCloseTo(100.7, 6);
    expect(close('2026-10-14')).toBeCloseTo(101.91, 6);
    // after the last real close the simulated path continues from that level (not ~76 of the catalogue)
    expect(Number(bars?.at(-1)?.c)).toBeGreaterThan(85);
  });

  it('the running quote is simulated around the real level and marked as such by the source', async () => {
    const now = day('2026-10-16') + 12 * 3_600_000;
    const { f } = feed(now);
    expect(f.quote(OIL, 'stream')).toBeNull(); // history not loaded yet → unavailable, never 0
    await f.prime([OIL], 1000);
    const q = f.quote(OIL, 'stream');
    expect(f.source).toBe('eia-sim');
    expect(Number(q?.mid)).toBeGreaterThan(85);
    expect(q?.changePeriod).toBe('prev_close');
  });

  it('only mapped energy symbols are supported; a failed download yields no data instead of fake history', async () => {
    const { f } = feed(Date.now(), new FeedHttpError('eia', 500, null, 'boom'));
    expect(f.supports(inst('ZC', 'commodities', 4))).toBe(false);
    expect(f.supports(OIL)).toBe(true);
    expect(await f.candles(OIL, '1d', 0, DAY)).toBeNull();
  });
});

describe('MassiveIndicesFeed', () => {
  const SPX = inst('SPX', 'indices', 5800);
  const bars = [
    { t: Date.parse('2026-10-13T04:00:00Z'), o: 6700, h: 6750, l: 6680, c: 6740 },
    { t: Date.parse('2026-10-14T04:00:00Z'), o: 6740, h: 6790, l: 6720, c: 6780 },
    { t: Date.parse('2026-10-15T04:00:00Z'), o: 6780, h: 6800, l: 6700, c: 6710 },
  ];
  const now = Date.parse('2026-10-16T12:00:00Z');

  it('quote = last session close vs. the session before, status "eod"', async () => {
    const f = new MassiveIndicesFeed('https://m', 'K', async (url) => {
      expect(url).toContain('/v2/aggs/ticker/I%3ASPX/range/1/day/');
      return { status: 'OK', results: bars };
    }, () => now);
    await f.prime([SPX], 1000);
    expect(f.quote(SPX, 'stream')).toMatchObject({ mid: '6710', reference: '6780', status: 'eod', changePeriod: 'prev_close' });
  });

  it('daily and weekly bars only; intraday periods are empty, not simulated', async () => {
    const f = new MassiveIndicesFeed('https://m', 'K', async () => ({ status: 'OK', results: bars }), () => now);
    const daily = await f.candles(SPX, '1d', Date.parse('2026-10-13T00:00:00Z'), Date.parse('2026-10-16T00:00:00Z'));
    expect(daily?.map((b) => new Date(b.start).toISOString().slice(0, 10))).toEqual(['2026-10-13', '2026-10-14', '2026-10-15']);
    const weekly = await f.candles(SPX, '1w', Date.parse('2026-10-12T00:00:00Z'), Date.parse('2026-10-12T00:00:00Z'));
    expect(weekly).toEqual([{ start: Date.parse('2026-10-12T00:00:00Z'), o: '6700', h: '6800', l: '6680', c: '6710', v: '0' }]);
    expect(await f.candles(SPX, '1h', 0, now)).toEqual([]);
  });

  it('a plan without indices ("not entitled") hands the ticker to the simulator for a while', async () => {
    let t = now;
    const f = new MassiveIndicesFeed('https://m', 'K', async () => ({ status: 'NOT_AUTHORIZED', message: 'You are not entitled to this data.' }), () => t);
    expect(f.supports(SPX)).toBe(true);
    await f.prime([SPX], 1000);
    expect(f.supports(SPX)).toBe(false);
    t += 31 * 60_000;
    expect(f.supports(SPX)).toBe(true); // retried later: activating the plan needs no restart
  });

  it('European/Asian indices are not mapped (simulator)', () => {
    const f = new MassiveIndicesFeed('https://m', 'K');
    expect(f.supports(inst('GDAXI', 'indices', 18000))).toBe(false);
  });
});
