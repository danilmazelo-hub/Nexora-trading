import { type INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { agent, startApp } from './app';

describe('virtual money ledger (D05)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ledger: LedgerService;
  beforeAll(async () => {
    app = await startApp();
    prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    ledger = app.get(LedgerService);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  async function newSession() {
    const a = agent(app);
    const res = await a.post('/demo/session').send({}).expect(200);
    return { a, sessionId: res.body.session.id as string, accountId: res.body.accounts[0].id as string };
  }

  it('a new account is funded with 50 000 USD through a balanced transaction', async () => {
    const { a, accountId, sessionId } = await newSession();
    const res = await a.get(`/me/accounts/${accountId}/balances`).expect(200);
    expect(res.body.balances).toEqual([{ asset: 'USD', amount: '50000.00' }]);
    const txs = await prisma.ledgerTransaction.findMany({ where: { scope: sessionId }, include: { entries: true } });
    expect(txs).toHaveLength(1);
    expect(txs[0]!.entries.map((e) => e.amount.toString()).sort()).toEqual(['-50000', '50000']);
  });

  it('two identical commands create ONE operation (A04)', async () => {
    const { a, accountId, sessionId } = await newSession();
    const send = () => a.post(`/me/accounts/${accountId}/demo-credit`).set('Idempotency-Key', 'k-same-0001').send({ amount: '100.00' });
    const [r1, r2] = await Promise.all([send(), send()]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.transactionId).toBe(r2.body.transactionId);
    expect([r1.body.replayed, r2.body.replayed].sort()).toEqual([false, true]);
    const r3 = await send().expect(200);
    expect(r3.body.replayed).toBe(true);
    const credits = await prisma.ledgerTransaction.count({ where: { scope: sessionId, type: 'DEMO_TEST_CREDIT' } });
    expect(credits).toBe(1);
    expect(r3.body.balances).toEqual([{ asset: 'USD', amount: '50100.00' }]);
  });

  it('a different command with the same key is rejected with 409', async () => {
    const { a, accountId } = await newSession();
    await a.post(`/me/accounts/${accountId}/demo-credit`).set('Idempotency-Key', 'k-conflict-1').send({ amount: '10.00' }).expect(200);
    const res = await a.post(`/me/accounts/${accountId}/demo-credit`).set('Idempotency-Key', 'k-conflict-1').send({ amount: '20.00' }).expect(409);
    expect(res.body.code).toBe('IDEMPOTENCY_CONFLICT');
    const bal = await a.get(`/me/accounts/${accountId}/balances`).expect(200);
    expect(bal.body.balances[0].amount).toBe('50010.00');
  });

  it('the same key in another session is an independent operation (scope = owner)', async () => {
    const s1 = await newSession();
    const s2 = await newSession();
    const r1 = await s1.a.post(`/me/accounts/${s1.accountId}/demo-credit`).set('Idempotency-Key', 'k-shared-01').send({ amount: '5.00' }).expect(200);
    const r2 = await s2.a.post(`/me/accounts/${s2.accountId}/demo-credit`).set('Idempotency-Key', 'k-shared-01').send({ amount: '7.00' }).expect(200);
    expect(r1.body.transactionId).not.toBe(r2.body.transactionId);
  });

  it('cannot credit or read someone else’s account', async () => {
    const s1 = await newSession();
    const s2 = await newSession();
    await s1.a.post(`/me/accounts/${s2.accountId}/demo-credit`).set('Idempotency-Key', 'k-foreign-1').send({ amount: '5.00' }).expect(404);
    await s1.a.get(`/me/accounts/${s2.accountId}/balances`).expect(404);
  });

  it('validates amount and requires an Idempotency-Key', async () => {
    const { a, accountId } = await newSession();
    await a.post(`/me/accounts/${accountId}/demo-credit`).send({ amount: '1.00' }).expect(400);
    for (const amount of ['0', '-5', '10000.01', '1.001', 'abc', '1e3']) {
      const r = await a.post(`/me/accounts/${accountId}/demo-credit`).set('Idempotency-Key', 'k-val-' + amount.replace(/\W/g, 'x')).send({ amount });
      expect(r.status, amount).toBe(400);
    }
  });

  it('a failure between postings rolls back everything (A03)', async () => {
    const { accountId, sessionId } = await newSession();
    const entries = await ledger.creditEntries(accountId, 'USD', '25');
    await expect(ledger.post({ scope: sessionId, idempotencyKey: 'k-rollback-1', type: 'DEMO_TEST_CREDIT', entries, failAfterFirstEntry: true })).rejects.toMatchObject({ code: 'DEMO_OPERATION_FAILED' });
    expect(await prisma.ledgerTransaction.count({ where: { scope: sessionId, idempotencyKey: 'k-rollback-1' } })).toBe(0);
    expect(await ledger.balances(accountId)).toEqual([{ asset: 'USD', amount: '50000.00' }]);
  });

  it('USD and BTC cannot be summed: unbalanced per asset → rejected', async () => {
    const { accountId, sessionId } = await newSession();
    const usd = await prisma.ledgerAccount.findFirstOrThrow({ where: { accountId, asset: 'USD' } });
    const btcSys = await prisma.ledgerAccount.upsert({ where: { systemCode_asset: { systemCode: 'DEMO_FUNDING', asset: 'BTC' } }, create: { systemCode: 'DEMO_FUNDING', asset: 'BTC' }, update: {} });
    await expect(
      ledger.post({ scope: sessionId, idempotencyKey: 'k-mix-0001', type: 'DEMO_TEST_CREDIT', entries: [{ ledgerAccountId: usd.id, asset: 'USD', amount: '1' }, { ledgerAccountId: btcSys.id, asset: 'BTC', amount: '-1' }] }),
    ).rejects.toMatchObject({ code: 'LEDGER_UNBALANCED' });
    // a BTC posting onto the USD bucket is refused by the service and by the composite FK
    await expect(
      ledger.post({ scope: sessionId, idempotencyKey: 'k-mix-0002', type: 'DEMO_TEST_CREDIT', entries: [{ ledgerAccountId: usd.id, asset: 'BTC', amount: '1' }, { ledgerAccountId: btcSys.id, asset: 'BTC', amount: '-1' }] }),
    ).rejects.toMatchObject({ code: 'LEDGER_ASSET_MISMATCH' });
  });

  it('the database itself refuses unbalanced, mismatched or edited postings', async () => {
    const { accountId } = await newSession();
    const usd = await prisma.ledgerAccount.findFirstOrThrow({ where: { accountId, asset: 'USD' } });
    // unbalanced transaction written directly → deferred trigger fails at COMMIT
    await expect(
      prisma.$transaction(async (tx) => {
        const t = await tx.ledgerTransaction.create({ data: { scope: 'raw-test', idempotencyKey: 'raw-unbalanced', requestHash: 'x'.repeat(64), type: 'DEMO_TEST_CREDIT' } });
        await tx.ledgerEntry.create({ data: { transactionId: t.id, ledgerAccountId: usd.id, asset: 'USD', amount: '1' } });
      }),
    ).rejects.toThrow();
    expect(await prisma.ledgerTransaction.count({ where: { idempotencyKey: 'raw-unbalanced' } })).toBe(0);
    // asset mismatch → composite foreign key violation
    await expect(
      prisma.$transaction(async (tx) => {
        const t = await tx.ledgerTransaction.create({ data: { scope: 'raw-test', idempotencyKey: 'raw-mismatch', requestHash: 'x'.repeat(64), type: 'DEMO_TEST_CREDIT' } });
        await tx.ledgerEntry.create({ data: { transactionId: t.id, ledgerAccountId: usd.id, asset: 'BTC', amount: '1' } });
      }),
    ).rejects.toThrow();
    // append-only
    const entry = await prisma.ledgerEntry.findFirstOrThrow({ where: { ledgerAccountId: usd.id } });
    await expect(prisma.ledgerEntry.update({ where: { id: entry.id }, data: { amount: '1' } })).rejects.toThrow();
    await expect(prisma.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
  });

  it('correction is a linked reversal; the original stays untouched', async () => {
    const { a, accountId, sessionId } = await newSession();
    const credit = await a.post(`/me/accounts/${accountId}/demo-credit`).set('Idempotency-Key', 'k-reverse-1').send({ amount: '40.00' }).expect(200);
    const rev = await ledger.reverse(sessionId, credit.body.transactionId, 'reverse:k-reverse-1');
    expect(rev.transaction.reversalOfId).toBe(credit.body.transactionId);
    const again = await ledger.reverse(sessionId, credit.body.transactionId, 'reverse:k-reverse-1');
    expect(again.replayed).toBe(true);
    expect(await ledger.balances(accountId)).toEqual([{ asset: 'USD', amount: '50000.00' }]);
    const original = await prisma.ledgerEntry.findMany({ where: { transactionId: credit.body.transactionId } });
    expect(original.map((e) => e.amount.toString()).sort()).toEqual(['-40', '40']);
  });
});
