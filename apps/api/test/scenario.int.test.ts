import { type INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAll } from '../prisma/seed-lib';
import { agent, startApp } from './app';

describe('reproducible data, scenarios and reset (D06)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  beforeAll(async () => {
    app = await startApp();
    prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  async function session() {
    const a = agent(app);
    const res = await a.post('/demo/session').send({}).expect(200);
    return { a, sessionId: res.body.session.id as string, accountId: res.body.accounts[0].id as string };
  }
  const usd = async (a: ReturnType<typeof agent>, accountId: string) => (await a.get(`/me/accounts/${accountId}/balances`).expect(200)).body.balances[0].amount;

  it('running the seed twice creates no duplicates and keeps sessions', async () => {
    const { sessionId } = await session();
    const before = { i: await prisma.instrument.count(), m: await prisma.marketSettings.count(), s: await prisma.demoSession.count() };
    await seedAll(prisma);
    await seedAll(prisma);
    expect(await prisma.instrument.count()).toBe(before.i);
    expect(before.i).toBe(204);
    expect(await prisma.marketSettings.count()).toBe(1);
    expect(await prisma.demoSession.count()).toBe(before.s);
    expect(await prisma.demoSession.findUnique({ where: { id: sessionId } })).not.toBeNull();
    const ms = await prisma.marketSettings.findUniqueOrThrow({ where: { id: 'default' } });
    expect(ms).toMatchObject({ seed: 20261015, clockMode: 'REALTIME' });
  });

  it('reset requires confirmation', async () => {
    const { a } = await session();
    const r = await a.post('/demo/reset').send({}).expect(400);
    expect(r.body.code).toBe('RESET_NOT_CONFIRMED');
    await a.post('/demo/reset').send({ confirm: 'yes' }).expect(400);
  });

  it('reset returns 50 000 and clean data only for the own session; the second user is unchanged', async () => {
    const u1 = await session();
    const u2 = await session();
    await u1.a.post(`/me/accounts/${u1.accountId}/demo-credit`).set('Idempotency-Key', 'k-reset-u1-1').send({ amount: '250.00' }).expect(200);
    await u2.a.post(`/me/accounts/${u2.accountId}/demo-credit`).set('Idempotency-Key', 'k-reset-u2-1').send({ amount: '75.00' }).expect(200);
    expect(await usd(u1.a, u1.accountId)).toBe('50250.00');

    const res = await u1.a.post('/demo/reset').send({ confirm: true, scenario: 'EMPTY_PORTFOLIO' }).expect(200);
    const newAccount = res.body.accounts[0].id as string;
    expect(newAccount).not.toBe(u1.accountId);
    expect(res.body.accounts).toHaveLength(1);
    expect(res.body.session.scenario).toBe('EMPTY_PORTFOLIO');
    expect(await usd(u1.a, newAccount)).toBe('50000.00');
    // the old account is archived (no longer listed / reachable), its journal is preserved
    await u1.a.get(`/me/accounts/${u1.accountId}`).expect(404);
    expect((await prisma.account.findUniqueOrThrow({ where: { id: u1.accountId } })).status).toBe('ARCHIVED');
    expect(await prisma.ledgerTransaction.count({ where: { scope: u1.sessionId } })).toBe(3);
    // second user untouched
    expect(await usd(u2.a, u2.accountId)).toBe('50075.00');
    const s2 = await u2.a.get('/demo/session').expect(200);
    expect(s2.body.accounts[0].id).toBe(u2.accountId);
    expect(s2.body.session.scenario).toBe('STARTER');
  });

  it('OPERATION_FAILURE scenario: operations fail and nothing changes; switching back works', async () => {
    const { a, accountId } = await session();
    const set = await a.put('/demo/scenario').send({ scenario: 'OPERATION_FAILURE' }).expect(200);
    expect(set.body.session.scenario).toBe('OPERATION_FAILURE');
    const r = await a.post(`/me/accounts/${accountId}/demo-credit`).set('Idempotency-Key', 'k-fail-0001').send({ amount: '10.00' }).expect(503);
    expect(r.body.code).toBe('DEMO_OPERATION_FAILED');
    expect(await usd(a, accountId)).toBe('50000.00');
    await a.put('/demo/scenario').send({ scenario: 'STARTER' }).expect(200);
    // the same key can be used after the failed attempt: nothing was recorded for it
    await a.post(`/me/accounts/${accountId}/demo-credit`).set('Idempotency-Key', 'k-fail-0001').send({ amount: '10.00' }).expect(200);
    expect(await usd(a, accountId)).toBe('50010.00');
  });

  it('scenarios are listed and validated', async () => {
    const { a } = await session();
    const list = await a.get('/demo/scenarios').expect(200);
    expect(list.body.items.map((x: { id: string }) => x.id)).toEqual(['STARTER', 'EMPTY_PORTFOLIO', 'QUOTES_UNAVAILABLE', 'OPERATION_FAILURE']);
    await a.put('/demo/scenario').send({ scenario: 'HACK' }).expect(400);
  });
});
