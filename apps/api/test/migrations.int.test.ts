import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * D09: all committed migrations apply to a completely empty database; foreign keys, unique/check constraints
 * and ledger triggers exist. Uses a throwaway database (<test db>_clean) that is dropped afterwards.
 */
describe('migrations on a clean database (D09)', () => {
  const base = new URL(process.env.DATABASE_URL!);
  const cleanName = base.pathname.replace(/^\//, '') + '_clean';
  const cleanUrl = new URL(base.toString());
  cleanUrl.pathname = '/' + cleanName;
  const admin = new PrismaClient({ datasourceUrl: base.toString() });
  let clean: PrismaClient;

  beforeAll(async () => {
    expect(cleanName.endsWith('_test_clean')).toBe(true);
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${cleanName}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${cleanName}"`);
    execSync('pnpm exec prisma migrate deploy', { cwd: resolve(__dirname, '..'), env: { ...process.env, DATABASE_URL: cleanUrl.toString() }, stdio: 'pipe' });
    clean = new PrismaClient({ datasourceUrl: cleanUrl.toString() });
  }, 120_000);

  afterAll(async () => {
    await clean?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${cleanName}" WITH (FORCE)`);
    await admin.$disconnect();
  });

  it('every migration is applied and none failed', async () => {
    const rows = await clean.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.every((r) => r.finished_at && !r.rolled_back_at)).toBe(true);
  });

  it('owner and ledger foreign keys exist', async () => {
    const fks = await clean.$queryRaw<{ conname: string }[]>`SELECT conname FROM pg_constraint WHERE contype = 'f' ORDER BY conname`;
    const names = fks.map((f) => f.conname);
    for (const fk of ['account_sessionId_fkey', 'demo_profile_sessionId_fkey', 'ledger_account_accountId_fkey', 'ledger_entry_transactionId_fkey', 'ledger_entry_ledgerAccountId_asset_fkey', 'ledger_transaction_reversalOfId_fkey']) {
      expect(names, fk).toContain(fk);
    }
  });

  it('check constraints and ledger triggers exist', async () => {
    const checks = (await clean.$queryRaw<{ conname: string }[]>`SELECT conname FROM pg_constraint WHERE contype = 'c'`).map((c) => c.conname);
    expect(checks).toEqual(expect.arrayContaining(['instrument_tick_size_positive', 'instrument_quantity_step_positive', 'ledger_account_single_owner', 'ledger_entry_amount_nonzero']));
    const triggers = (await clean.$queryRaw<{ tgname: string }[]>`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`).map((t) => t.tgname);
    expect(triggers).toEqual(expect.arrayContaining(['ledger_entries_balanced', 'ledger_entry_append_only', 'ledger_transaction_append_only']));
  });

  it('candle range index exists and the database stores time in UTC (D13)', async () => {
    const idx = await clean.$queryRaw<{ indexname: string; indexdef: string }[]>`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'candle'`;
    const range = idx.find((i) => i.indexname === 'candle_instrumentId_interval_openTime_idx');
    expect(range?.indexdef).toMatch(/\("instrumentId", "interval", "openTime" DESC\)/);
    // a new connection picks up the database-level setting
    const fresh = new PrismaClient({ datasourceUrl: cleanUrl.toString() });
    const [tz] = await fresh.$queryRaw<{ TimeZone: string }[]>`SHOW timezone`;
    await fresh.$disconnect();
    expect(Object.values(tz!)[0]).toBe('UTC');
  });

  it('a foreign key really rejects an orphan account', async () => {
    await expect(clean.account.create({ data: { sessionId: '00000000-0000-4000-8000-000000000000', currency: 'USD' } })).rejects.toThrow();
  });
});
