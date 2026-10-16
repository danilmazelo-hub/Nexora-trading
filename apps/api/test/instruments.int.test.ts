import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp } from './app';

describe('instrument reference data (D04, D12)', () => {
  let app: INestApplication;
  const get = (url: string) => request(app.getHttpServer()).get(url);
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['BTC-USD', { market: 'crypto', symbol: 'BTC/USD', baseAsset: 'BTC', quoteAsset: 'USD', tickSize: '0.01', quantityStep: '0.00001', contractMultiplier: '1', maxLeverage: 10 }],
    ['AAPL', { market: 'stocks', symbol: 'AAPL', quoteAsset: 'USD', tickSize: '0.01', quantityStep: '0.001', unit: 'sh', maxLeverage: 5 }],
    ['SPX', { market: 'indices', name: 'S&P 500', tickSize: '0.01', quantityStep: '0.01', unit: 'pt', maxLeverage: 20 }],
    ['EUR-USD', { market: 'forex', baseAsset: 'EUR', quoteAsset: 'USD', tickSize: '0.00001', quantityStep: '1', maxLeverage: 30 }],
    ['XAU-USD', { market: 'commodities', name: 'Gold', categories: ['metals'], unit: 'oz' }],
  ])('%s has correct metadata as decimal strings', async (id, expected) => {
    const res = await get(`/instruments/${id}`).expect(200);
    expect(res.body).toMatchObject({ id, status: 'ACTIVE', source: 'simulator', ...expected });
    for (const k of ['tickSize', 'quantityStep', 'contractMultiplier']) expect(typeof res.body[k]).toBe('string');
  });

  it('Live Cattle is livestock, not metals (QA-12 / A14)', async () => {
    const res = await get('/instruments/LE').expect(200);
    expect(res.body.categories).toEqual(['livestock']);
    const metals = await get('/instruments?market=commodities&category=metals&pageSize=100').expect(200);
    expect(metals.body.items.map((i: { id: string }) => i.id)).not.toContain('LE');
  });

  it('unknown instrument → clear 404', async () => {
    const res = await get('/instruments/NOPE-USD').expect(404);
    expect(res.body).toMatchObject({ code: 'INSTRUMENT_NOT_FOUND', message: expect.stringContaining('NOPE-USD') });
    await get('/instruments/' + encodeURIComponent('<script>')).expect(404);
  });

  it('markets list: five tradable markets with counts and coming-soon categories', async () => {
    const res = await get('/markets').expect(200);
    const byId = Object.fromEntries(res.body.items.map((m: { id: string }) => [m.id, m]));
    expect(byId.crypto).toMatchObject({ status: 'active', instrumentCount: 50 });
    expect(byId.forex).toMatchObject({ status: 'active', instrumentCount: 63 });
    expect(byId.bonds).toMatchObject({ status: 'coming_soon', instrumentCount: 0 });
  });

  it('search "BTC" finds Bitcoin first; search by name works', async () => {
    const res = await get('/instruments?q=BTC').expect(200);
    expect(res.body.items[0]).toMatchObject({ id: 'BTC-USD', name: 'Bitcoin' });
    const byName = await get('/instruments?q=bitcoin').expect(200);
    expect(byName.body.items.map((i: { id: string }) => i.id)).toContain('BTC-USD');
  });

  it('results of different markets differ', async () => {
    const c = await get('/instruments?market=crypto&pageSize=100').expect(200);
    const s = await get('/instruments?market=stocks&pageSize=100').expect(200);
    expect(c.body.items.every((i: { market: string }) => i.market === 'crypto')).toBe(true);
    expect(s.body.items.every((i: { market: string }) => i.market === 'stocks')).toBe(true);
    expect(c.body.total).toBe(50);
    expect(s.body.total).toBe(49);
  });

  it('pagination and sorting', async () => {
    const p1 = await get('/instruments?market=forex&pageSize=20&page=1&sort=symbol&dir=asc').expect(200);
    const p2 = await get('/instruments?market=forex&pageSize=20&page=2&sort=symbol&dir=asc').expect(200);
    expect(p1.body).toMatchObject({ total: 63, pages: 4, page: 1, pageSize: 20 });
    expect(p1.body.items).toHaveLength(20);
    const syms = [...p1.body.items, ...p2.body.items].map((i: { symbol: string }) => i.symbol);
    expect(syms).toEqual([...syms].sort());
    expect(new Set(syms).size).toBe(40);
    const desc = await get('/instruments?market=forex&pageSize=5&sort=symbol&dir=desc').expect(200);
    expect(desc.body.items[0].symbol > desc.body.items[4].symbol).toBe(true);
  });

  it('invalid query → VALIDATION_FAILED', async () => {
    const res = await get('/instruments?pageSize=1000').expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    await get('/instruments?market=bonds').expect(400);
  });
});
