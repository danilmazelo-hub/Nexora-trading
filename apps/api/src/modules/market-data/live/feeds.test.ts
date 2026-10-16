import { type Instrument } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { BinanceFeed } from './binance';
import { FeedHttpError } from './http';
import { CreditBudget, parseTdDate, tdDate, TwelveDataFeed } from './twelve-data';

const inst = (id: string, market: string, base: string, quote: string, status = 'ACTIVE') => ({ id, market, baseAsset: base, quoteAsset: quote, status }) as unknown as Instrument;
const BTC = inst('BTC-USD', 'crypto', 'BTC', 'USD');
const ETH = inst('ETH-USD', 'crypto', 'ETH', 'USD');
const EUR = inst('EUR-USD', 'forex', 'EUR', 'USD');
const GBP = inst('GBP-USD', 'forex', 'GBP', 'USD');
const JPY = inst('USD-JPY', 'forex', 'USD', 'JPY');

function clock(start = Date.parse('2026-10-16T12:00:00Z')) {
  const c = { t: start, now: () => c.t, advance: (ms: number) => (c.t += ms) };
  return c;
}

const feeds: { stop(): void }[] = [];
afterEach(() => {
  for (const f of feeds.splice(0)) f.stop();
});

describe('BinanceFeed', () => {
  const ticker = (symbol: string, last: string, t: number) => ({ symbol, lastPrice: last, bidPrice: '82318.01000000', askPrice: '82318.02000000', openPrice: '80990.01000000', closeTime: t });

  it('serves the rolling 24h ticker from its cache with real bid/ask', async () => {
    const c = clock();
    const urls: string[] = [];
    const feed = new BinanceFeed('https://b', async (url) => {
      urls.push(url);
      return [ticker('BTCUSDT', '82318.02000000', c.t), ticker('ETHUSDT', '3000.10000000', c.t)];
    }, c.now);
    feeds.push(feed);
    expect(feed.quote(BTC, 'stream')).toBeNull(); // nothing yet → unavailable, never 0
    await feed.prime([BTC, ETH], 1000);
    expect(urls[0]).toContain('/api/v3/ticker/24hr?type=FULL&symbols=');
    expect(decodeURIComponent(urls[0] ?? '')).toContain('"BTCUSDT"');
    expect(feed.quote(BTC, 'stream')).toMatchObject({ mid: '82318.02000000', bid: '82318.01000000', ask: '82318.02000000', reference: '80990.01000000', changePeriod: '24h', status: 'live' });
  });

  it('a quote that stops updating turns stale; background reads do not keep polling alive', async () => {
    const c = clock();
    let fail = false;
    const feed = new BinanceFeed('https://b', async () => {
      if (fail) throw new FeedHttpError('binance', 0, null, 'network error');
      return [ticker('BTCUSDT', '82000.00000000', c.t)];
    }, c.now);
    feeds.push(feed);
    await feed.prime([BTC], 1000);
    fail = true;
    c.advance(31_000);
    await feed.refresh();
    expect(feed.quote(BTC, 'background')?.status).toBe('stale');
  });

  it('only USD-quoted crypto maps to a USDT pair', () => {
    const feed = new BinanceFeed('https://b');
    expect(feed.symbolOf(BTC)).toBe('BTCUSDT');
    expect(feed.supports(EUR)).toBe(false);
    expect(feed.supports(inst('X-USD', 'crypto', 'X', 'USD', 'UNAVAILABLE'))).toBe(false);
  });

  it('klines become candles within the requested range', async () => {
    const start = Date.parse('2026-10-16T11:00:00Z');
    const feed = new BinanceFeed('https://b', async (url) => {
      expect(url).toContain('interval=1h');
      return [
        [start - 3_600_000, '1', '2', '0.5', '1.5', '10'],
        [start, '1.5', '3', '1', '2.5', '12.5'],
      ];
    });
    const bars = await feed.candles(BTC, '1h', start, start);
    expect(bars).toEqual([{ start, o: '1.5', h: '3', l: '1', c: '2.5', v: '12.5' }]);
  });

  it('a failed history request returns null (the API answers 503), not an empty chart', async () => {
    const feed = new BinanceFeed('https://b', async () => {
      throw new FeedHttpError('binance', 418, -1003, 'banned');
    });
    expect(await feed.candles(BTC, '1h', 0, 1)).toBeNull();
  });
});

describe('CreditBudget', () => {
  it('respects the minute limit and keeps a share of the day for the open pair', () => {
    const c = clock();
    const b = new CreditBudget(8, 10, c.now);
    expect(b.available(0)).toBe(8);
    expect(b.available(2)).toBe(6); // 60 % of 10
    b.spend(6);
    expect(b.available(1)).toBe(0); // background share used up
    expect(b.available(0)).toBe(2); // minute: 8 - 6
    c.advance(60_000);
    expect(b.available(0)).toBe(4); // day: 10 - 6
  });

  it('a pause stops all spending until it ends; a new UTC day resets the daily count', () => {
    const c = clock(Date.parse('2026-10-16T23:59:00Z'));
    const b = new CreditBudget(8, 8, c.now);
    b.spend(8);
    b.pause(c.t + 30_000);
    c.advance(10_000);
    expect(b.available(0)).toBe(0);
    c.advance(60_000); // 2026-10-17
    expect(b.available(0)).toBe(8);
  });
});

describe('TwelveDataFeed', () => {
  const quoteRow = (close: string, at: number) => ({ close, previous_close: '1.12000', last_quote_at: Math.floor(at / 1000), timestamp: Math.floor(at / 1000) });
  function setup(opts: { minuteLimit?: number; dailyLimit?: number } = {}) {
    const c = clock();
    const calls: string[][] = [];
    let respond: (symbols: string[]) => unknown = (symbols) =>
      symbols.length === 1 ? quoteRow('1.12462', c.t) : Object.fromEntries(symbols.map((s) => [s, quoteRow('1.5', c.t)]));
    const feed = new TwelveDataFeed(
      'https://td',
      'SECRET-KEY',
      { minuteLimit: opts.minuteLimit ?? 8, dailyLimit: opts.dailyLimit ?? 800, focusRefreshMs: 60_000 },
      async (url) => {
        const symbols = decodeURIComponent(/symbol=([^&]+)/.exec(url)?.[1] ?? '').split(',');
        if (url.includes('/quote?')) calls.push(symbols);
        return respond(symbols);
      },
      c.now,
    );
    feeds.push(feed);
    return { c, feed, calls, setRespond: (f: typeof respond) => (respond = f) };
  }

  it('parses single and batch answers into delayed quotes vs. the previous close', async () => {
    const { feed, calls } = setup();
    feed.quote(EUR, 'stream');
    await feed.prime([EUR], 1000);
    expect(calls).toEqual([['EUR/USD']]);
    expect(feed.quote(EUR, 'stream')).toMatchObject({ mid: '1.12462', reference: '1.12000', changePeriod: 'prev_close', status: 'delayed' });
    feed.quote(GBP, 'stream');
    feed.quote(JPY, 'stream');
    await feed.run();
    expect(calls[1]?.sort()).toEqual(['GBP/USD', 'USD/JPY']);
    expect(feed.quote(GBP, 'background')?.mid).toBe('1.5');
  });

  it('the pair open on a chart is refreshed first; the rest of the list waits and is cached', async () => {
    const { c, feed, calls, setRespond } = setup();
    setRespond((symbols) => Object.fromEntries(symbols.map((s) => [s, quoteRow('1.1', c.t)])));
    for (const i of [EUR, GBP, JPY]) feed.quote(i, 'stream');
    await feed.run(); // first values for all three
    feed.focus(EUR);
    setRespond(() => quoteRow('1.2', c.t));
    c.advance(61_000);
    for (const i of [EUR, GBP, JPY]) feed.quote(i, 'stream');
    await feed.run();
    expect(calls.at(-1)).toEqual(['EUR/USD']); // only the open pair is due
    c.advance(5_000);
    await feed.run();
    expect(calls).toHaveLength(2); // nothing else is due: no credits spent
    expect(feed.quote(GBP, 'background')?.status).toBe('delayed');
  });

  it('never spends more credits per minute than the plan allows', async () => {
    const { feed, calls } = setup({ minuteLimit: 2 });
    for (const i of [EUR, GBP, JPY]) feed.quote(i, 'stream');
    await feed.run();
    await feed.run();
    expect(calls.flat()).toHaveLength(2);
    expect(feed.usage()).toMatchObject({ minuteUsed: 2, minuteLimit: 2 });
  });

  it('a 429 from the provider pauses requests; the key never appears in errors', async () => {
    const { feed, calls, setRespond } = setup();
    setRespond(() => ({ status: 'error', code: 429, message: 'You have run out of API credits for the current minute.' }));
    feed.quote(EUR, 'stream');
    await feed.run();
    expect(feed.usage().pausedUntil).not.toBeNull();
    await feed.run();
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(feed.usage())).not.toContain('SECRET-KEY');
  });

  it('caches history per pair and interval to save credits', async () => {
    const c = clock();
    let n = 0;
    const feed = new TwelveDataFeed('https://td', 'K', { minuteLimit: 8, dailyLimit: 800, focusRefreshMs: 60_000 }, async (url) => {
      if (url.includes('/time_series')) {
        n++;
        expect(url).toContain('interval=1h');
        expect(url).toContain('timezone=UTC');
        return { status: 'ok', values: [{ datetime: '2026-10-16 10:00:00', open: '1', high: '2', low: '0.5', close: '1.5' }] };
      }
      return quoteRow('1.1', c.t);
    }, c.now);
    feeds.push(feed);
    const from = Date.parse('2026-10-16T09:00:00Z');
    const to = Date.parse('2026-10-16T11:00:00Z');
    const a = await feed.candles(EUR, '1h', from, to);
    const b = await feed.candles(EUR, '1h', from, to);
    expect(n).toBe(1);
    expect(a).toEqual([{ start: Date.parse('2026-10-16T10:00:00Z'), o: '1', h: '2', l: '0.5', c: '1.5', v: '0' }]);
    expect(b).toEqual(a);
  });

  it('dates are exchanged in UTC', () => {
    expect(tdDate(Date.parse('2026-10-16T09:05:00Z'))).toBe('2026-10-16 09:05:00');
    expect(parseTdDate('2026-10-12')).toBe(Date.parse('2026-10-12T00:00:00Z'));
    expect(parseTdDate('2026-10-16 09:05:00')).toBe(Date.parse('2026-10-16T09:05:00Z'));
  });
});
