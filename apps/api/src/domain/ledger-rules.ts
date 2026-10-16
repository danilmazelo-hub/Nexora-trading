import { createHash } from 'node:crypto';
import { D, isDecimalString } from '@nexora/contracts';

/** Pure ledger rules (no Prisma/Nest): validation and request fingerprint for idempotency. */
export interface EntryInput {
  ledgerAccountId: string;
  asset: string;
  /** Signed decimal string: credit to the bucket is positive, debit negative. */
  amount: string;
}

export type LedgerRuleViolation =
  | { code: 'LEDGER_UNBALANCED'; message: string }
  | { code: 'VALIDATION_FAILED'; message: string };

/** Checks shape and the zero-sum invariant per asset. Assets are never added together across currencies. */
export function validateEntries(entries: readonly EntryInput[]): LedgerRuleViolation | null {
  if (entries.length < 2) return { code: 'VALIDATION_FAILED', message: 'Операция должна содержать минимум две проводки' };
  const perAsset = new Map<string, InstanceType<typeof D>>();
  for (const e of entries) {
    if (!isDecimalString(e.amount)) return { code: 'VALIDATION_FAILED', message: 'Сумма проводки должна быть десятичным числом' };
    const a = new D(e.amount);
    if (a.isZero()) return { code: 'VALIDATION_FAILED', message: 'Нулевая проводка недопустима' };
    if (a.decimalPlaces() > 18) return { code: 'VALIDATION_FAILED', message: 'Слишком высокая точность суммы' };
    if (!/^[A-Z0-9]{2,16}$/.test(e.asset)) return { code: 'VALIDATION_FAILED', message: 'Некорректный код актива' };
    perAsset.set(e.asset, (perAsset.get(e.asset) ?? new D(0)).plus(a));
  }
  for (const [asset, sum] of perAsset) {
    if (!sum.isZero()) return { code: 'LEDGER_UNBALANCED', message: `Проводки по ${asset} не сбалансированы (сумма ${sum.toFixed()})` };
  }
  return null;
}

/** Canonical fingerprint of a command: same key + same body ⇒ same hash; entry order does not matter. */
export function requestHash(cmd: { type: string; memo?: string | null; reversalOfId?: string | null; entries: readonly EntryInput[] }): string {
  const entries = cmd.entries
    .map((e) => ({ a: e.ledgerAccountId, s: e.asset, v: new D(e.amount).toFixed() }))
    .sort((x, y) => (x.a + x.s + x.v < y.a + y.s + y.v ? -1 : 1));
  const canonical = JSON.stringify({ t: cmd.type, m: cmd.memo ?? null, r: cmd.reversalOfId ?? null, e: entries });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Opposite postings for a reversal. */
export function reverseEntries(entries: readonly EntryInput[]): EntryInput[] {
  return entries.map((e) => ({ ...e, amount: new D(e.amount).negated().toFixed() }));
}
