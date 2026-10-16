import http from 'node:http';
import { type AddressInfo } from 'node:net';
import { type INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../src/config/env';
import { MarketDataService } from '../src/modules/market-data/market-data.service';
import { agent, startApp } from './app';

const FIXED = '2026-10-16T12:00:00.000Z';

/** Reads SSE events from a real HTTP connection until `count` events arrived. */
function readSse(port: number, path: string, count: number, headers: Record<string, string> = {}): Promise<{ id: string; data: { seq: number; kind: string; quotes: { instrumentId: string; last: string | null }[] } }[]> {
  return new Promise((resolve, reject) => {
    const events: { id: string; data: never }[] = [];
    const req = http.get({ host: '127.0.0.1', port, path, headers: { Accept: 'text/event-stream', ...headers } }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const id = /^id: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (id && data) events.push({ id, data: JSON.parse(data) as never });
          if (events.length >= count) {
            req.destroy();
            resolve(events);
          }
        }
      });
    });
    req.on('error', (e) => (events.length >= count ? undefined : reject(e)));
    setTimeout(() => {
      req.destroy();
      reject(new Error(`timeout: ${events.length}/${count} events`));
    }, 15_000);
  });
}

describe('market data with a fixed clock (D10)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  beforeAll(async () => {
    process.env.MARKET_FIXED_TIME = FIXED;
    resetEnvCache();
    app = await startApp();
    prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    delete process.env.MARKET_FIXED_TIME;
    resetEnvCache();
    await prisma.$disconnect();
    await app.close();
  });
  const get = (u: string) => request(app.getHttpServer()).get(u);

  it('same seed + same time → identical quotes; the card endpoint equals the list endpoint', async () => {
    const a = (await get('/market/quotes/BTC-USD').expect(200)).body;
    const b = (await get('/market/quotes/BTC-USD').expect(200)).body;
    const list = (await get('/market/quotes?ids=BTC-USD,AAPL').expect(200)).body.items;
    const strip = (q: Record<string, unknown>) => ({ ...q, receivedAt: undefined });
    expect(strip(a)).toEqual(strip(b));
    expect(strip(list[0])).toEqual(strip(a));
    expect(a).toMatchObject({ instrumentId: 'BTC-USD', status: 'delayed', changePeriod: '24h', observedAt: FIXED, source: 'simulator:20261015' });
    expect(Number(a.bid)).toBeLessThan(Number(a.last));
    expect(Number(a.ask)).toBeGreaterThan(Number(a.last));
    expect(a.last).toMatch(/^\d+\.\d{2}$/);
  });

  it('percent change is in percent points and consistent with the reference price', async () => {
    const q = (await get('/market/quotes/EUR-USD').expect(200)).body;
    expect(q.changePeriod).toBe('prev_close');
    const ref = Number(q.last) - Number(q.change);
    expect(Number(q.changePct)).toBeCloseTo(((Number(q.last) - ref) / ref) * 100, 2);
    // a daily move of a major pair is well below 10 % — a fraction mis-scaled ×100 would break this
    expect(Math.abs(Number(q.changePct))).toBeLessThan(10);
  });

  it('missing price stays missing: Lumber is unavailable with null fields (A13)', async () => {
    const q = (await get('/market/quotes/LBS').expect(200)).body;
    expect(q).toMatchObject({ status: 'unavailable', bid: null, ask: null, last: null, change: null, changePct: null, observedAt: null });
    const c = (await get('/market/instruments/LBS/candles?interval=1d').expect(200)).body;
    expect(c.candles).toEqual([]);
  });

  it('unknown instrument → 404; bad ids → 400', async () => {
    expect((await get('/market/quotes/NOPE').expect(404)).body.code).toBe('INSTRUMENT_NOT_FOUND');
    await get('/market/quotes?ids=').expect(400);
  });

  it('QUOTES_UNAVAILABLE scenario affects only that session', async () => {
    const a = agent(app);
    const b = agent(app);
    await a.post('/demo/session').send({}).expect(200);
    await b.post('/demo/session').send({}).expect(200);
    await a.put('/demo/scenario').send({ scenario: 'QUOTES_UNAVAILABLE' }).expect(200);
    expect((await a.get('/market/quotes/BTC-USD').expect(200)).body).toMatchObject({ status: 'unavailable', last: null });
    expect((await b.get('/market/quotes/BTC-USD').expect(200)).body.status).toBe('delayed');
  });

  it('the latest quote is cached in the Quote table', async () => {
    await get('/market/quotes/AAPL').expect(200);
    await app.get(MarketDataService).flushQuotes();
    const row = await prisma.quote.findFirstOrThrow({ where: { instrumentId: 'AAPL' } });
    const api = (await get('/market/quotes/AAPL').expect(200)).body;
    expect(row.last?.toFixed(2)).toBe(api.last);
    expect(row.observedAt?.toISOString()).toBe(FIXED);
  });

  it('a quote without a price never overwrites the last stored one', async () => {
    await get('/market/quotes/LBS').expect(200); // no feed → unavailable
    await app.get(MarketDataService).flushQuotes();
    expect(await prisma.quote.count({ where: { instrumentId: 'LBS' } })).toBe(0);
  });

  it('candles: ordered, unique, no future, last one forming; intervals differ (D13)', async () => {
    const now = Date.parse(FIXED);
    for (const [interval, ms] of [['5m', 300_000], ['1h', 3_600_000], ['1d', 86_400_000], ['1w', 604_800_000]] as const) {
      const r = (await get(`/market/instruments/BTC-USD/candles?interval=${interval}&limit=300`).expect(200)).body;
      const opens = r.candles.map((c: { openTime: string }) => Date.parse(c.openTime));
      expect(opens.length, interval).toBeGreaterThan(5);
      expect(new Set(opens).size).toBe(opens.length);
      expect([...opens].sort((x, y) => x - y)).toEqual(opens);
      expect(Math.max(...opens)).toBeLessThanOrEqual(now);
      for (let i = 1; i < opens.length; i++) expect(opens[i] - opens[i - 1]).toBe(ms);
      const lastC = r.candles.at(-1);
      expect(lastC.isClosed).toBe(false);
      expect(Date.parse(lastC.closeTime) - Date.parse(lastC.openTime)).toBe(ms);
      expect(r.candles.slice(0, -1).every((c: { isClosed: boolean }) => c.isClosed)).toBe(true);
      for (const c of r.candles) expect(Number(c.low)).toBeLessThanOrEqual(Math.min(Number(c.open), Number(c.close)));
    }
    const day = (await get('/market/instruments/BTC-USD/candles?interval=5m&limit=288').expect(200)).body;
    const year = (await get('/market/instruments/BTC-USD/candles?interval=1d&limit=365').expect(200)).body;
    expect(Date.parse(day.candles[0].openTime)).toBeGreaterThan(Date.parse(year.candles[0].openTime) + 300 * 86_400_000);
  });

  it('the forming candle closes at the current quote price', async () => {
    const q = (await get('/market/quotes/BTC-USD').expect(200)).body;
    const c = (await get('/market/instruments/BTC-USD/candles?interval=1h&limit=3').expect(200)).body;
    expect(c.candles.at(-1).close).toBe(q.last);
  });

  it('range and limit: truncation flag, from > to rejected, history start respected, cache persisted', async () => {
    const r = (await get('/market/instruments/AAPL/candles?interval=5m&limit=10&from=2026-10-01T00:00:00.000Z').expect(200)).body;
    expect(r.candles).toHaveLength(10);
    expect(r.truncated).toBe(true);
    await get('/market/instruments/AAPL/candles?interval=1h&from=2026-10-10T00:00:00.000Z&to=2026-10-01T00:00:00.000Z').expect(400);
    await get('/market/instruments/AAPL/candles?interval=1h&limit=5000').expect(400);
    const all = (await get('/market/instruments/AAPL/candles?interval=1w&limit=1000').expect(200)).body;
    expect(Date.parse(all.candles[0].openTime)).toBeGreaterThanOrEqual(Date.parse('2022-01-03T00:00:00.000Z'));
    expect(await prisma.candle.count({ where: { instrumentId: 'AAPL', interval: '5m' } })).toBeGreaterThanOrEqual(9);
    const again = (await get('/market/instruments/AAPL/candles?interval=5m&limit=10&from=2026-10-01T00:00:00.000Z').expect(200)).body;
    expect(again.candles).toEqual(r.candles);
  });
});

describe('quote stream (D11)', () => {
  let app: INestApplication;
  let port: number;
  beforeAll(async () => {
    app = await startApp();
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  });
  afterAll(async () => {
    await app.close();
  });

  it('first event is a snapshot, then monotonic updates without duplicates', async () => {
    const ev = await readSse(port, '/market/stream?ids=BTC-USD,EUR-USD', 3);
    expect(ev[0]!.data.kind).toBe('snapshot');
    expect(ev[0]!.data.quotes.map((q) => q.instrumentId).sort()).toEqual(['BTC-USD', 'EUR-USD']);
    expect(ev.slice(1).every((e) => e.data.kind === 'update')).toBe(true);
    const seqs = ev.map((e) => e.data.seq);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!);
    expect(ev.map((e) => e.id)).toEqual(seqs.map(String));
  }, 20_000);

  it('reconnect with Last-Event-ID starts with a fresh snapshot', async () => {
    const first = await readSse(port, '/market/stream?ids=BTC-USD', 1);
    const again = await readSse(port, '/market/stream?ids=BTC-USD', 1, { 'Last-Event-ID': first[0]!.id });
    expect(again[0]!.data.kind).toBe('snapshot');
    expect(again[0]!.data.seq).toBeGreaterThanOrEqual(first[0]!.data.seq);
  }, 20_000);

  it('closed connections are released (no leaking streams)', async () => {
    await readSse(port, '/market/stream?ids=AAPL', 1);
    await new Promise((r) => setTimeout(r, 300));
    const st = (await request(app.getHttpServer()).get('/market/status').expect(200)).body;
    expect(st.streams).toBe(0);
  }, 20_000);
});
