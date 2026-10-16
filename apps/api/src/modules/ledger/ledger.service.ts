import { Injectable } from '@nestjs/common';
import { type LedgerSystemCode, type LedgerTransaction, type LedgerTxType, Prisma } from '@prisma/client';
import { type Balance, D } from '@nexora/contracts';
import { type EntryInput, requestHash, reverseEntries, validateEntries } from '../../domain/ledger-rules';
import { PrismaService } from '../../infra/database/prisma.service';
import { AppError } from '../../shared/app-error';

type Tx = Prisma.TransactionClient;

export interface PostCommand {
  /** Idempotency scope: the owner's session id, or "system". */
  scope: string;
  idempotencyKey: string;
  type: LedgerTxType;
  memo?: string;
  entries: EntryInput[];
  reversalOfId?: string;
  /** Demo scenario OPERATION_FAILURE: fail after the first posting to prove the whole operation rolls back. */
  failAfterFirstEntry?: boolean;
}

export interface PostResult {
  transaction: LedgerTransaction;
  replayed: boolean;
}

export const START_BALANCE_USD = '50000';
const FIAT_PLACES: Record<string, number> = { USD: 2, EUR: 2, GBP: 2 };

/** Decimal string with at least the asset's display precision; never rounds the stored value. */
export function balanceString(value: Prisma.Decimal | string | number, asset: string): string {
  const d = new D(value.toString());
  const min = FIAT_PLACES[asset] ?? 0;
  return d.decimalPlaces() >= min ? d.toFixed() : d.toFixed(min);
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bucket of a user account for one asset (created on first use). */
  async userBucket(tx: Tx, accountId: string, asset: string) {
    return tx.ledgerAccount.upsert({ where: { accountId_asset: { accountId, asset } }, create: { accountId, asset }, update: {} });
  }

  /** System counterpart bucket (DEMO_FUNDING, DEMO_PNL, FEES) for one asset. */
  async systemBucket(tx: Tx, systemCode: LedgerSystemCode, asset: string) {
    return tx.ledgerAccount.upsert({ where: { systemCode_asset: { systemCode, asset } }, create: { systemCode, asset }, update: {} });
  }

  /**
   * Posts one operation atomically and idempotently.
   * - same scope + key + same body → returns the existing transaction (replayed: true), no new postings;
   * - same scope + key + different body → 409 IDEMPOTENCY_CONFLICT;
   * - any failure between postings rolls back the transaction and all its postings.
   * Pass `tx` to join an outer transaction (e.g. funding during account creation).
   */
  async post(cmd: PostCommand, tx?: Tx): Promise<PostResult> {
    const violation = validateEntries(cmd.entries);
    if (violation) throw new AppError(violation.code, violation.code === 'LEDGER_UNBALANCED' ? 422 : 400, violation.message);
    if (!/^[A-Za-z0-9:_\-.]{8,128}$/.test(cmd.idempotencyKey)) throw new AppError('VALIDATION_FAILED', 400, 'Некорректный ключ идемпотентности');
    const hash = requestHash(cmd);
    const run = (t: Tx) => this.postIn(t, cmd, hash);
    if (tx) return run(tx);
    try {
      return await this.prisma.$transaction(run);
    } catch (e) {
      // Two identical commands raced: the loser hits the unique (scope, key) index — answer with the winner.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.prisma.$transaction((t) => this.postIn(t, cmd, hash));
      throw e;
    }
  }

  private async postIn(tx: Tx, cmd: PostCommand, hash: string): Promise<PostResult> {
    const existing = await tx.ledgerTransaction.findUnique({ where: { scope_idempotencyKey: { scope: cmd.scope, idempotencyKey: cmd.idempotencyKey } } });
    if (existing) {
      if (existing.requestHash !== hash) throw new AppError('IDEMPOTENCY_CONFLICT', 409, 'Этот ключ операции уже использован для другой команды');
      return { transaction: existing, replayed: true };
    }
    // The bucket's asset must equal the entry's asset (also enforced by a composite FK in the database).
    const buckets = await tx.ledgerAccount.findMany({ where: { id: { in: cmd.entries.map((e) => e.ledgerAccountId) } } });
    for (const e of cmd.entries) {
      const b = buckets.find((x) => x.id === e.ledgerAccountId);
      if (!b) throw new AppError('VALIDATION_FAILED', 400, 'Неизвестный счёт проводки');
      if (b.asset !== e.asset) throw new AppError('LEDGER_ASSET_MISMATCH', 422, `Проводку в ${e.asset} нельзя записать на счёт в ${b.asset}`);
    }
    const transaction = await tx.ledgerTransaction.create({
      data: { scope: cmd.scope, idempotencyKey: cmd.idempotencyKey, requestHash: hash, type: cmd.type, memo: cmd.memo, reversalOfId: cmd.reversalOfId },
    });
    let n = 0;
    for (const e of cmd.entries) {
      await tx.ledgerEntry.create({ data: { transactionId: transaction.id, ledgerAccountId: e.ledgerAccountId, asset: e.asset, amount: e.amount } });
      if (cmd.failAfterFirstEntry && ++n === 1) throw new AppError('DEMO_OPERATION_FAILED', 503, 'Демосценарий «сбой операции»: операция не проведена, изменений нет');
    }
    return { transaction, replayed: false };
  }

  /** Correction = linked opposite transaction; the original postings are never modified. */
  async reverse(scope: string, transactionId: string, idempotencyKey: string, memo?: string): Promise<PostResult> {
    const original = await this.prisma.ledgerTransaction.findFirst({ where: { id: transactionId, scope }, include: { entries: true } });
    if (!original) throw new AppError('NOT_FOUND', 404, 'Операция не найдена');
    const entries = reverseEntries(original.entries.map((e) => ({ ledgerAccountId: e.ledgerAccountId, asset: e.asset, amount: e.amount.toString() })));
    return this.post({ scope, idempotencyKey, type: 'REVERSAL', memo: memo ?? `reversal of ${original.id}`, reversalOfId: original.id, entries });
  }

  /** Balance per asset = sum of postings. Assets are reported separately, never added together. */
  async balances(accountId: string, tx: Tx | PrismaService = this.prisma): Promise<Balance[]> {
    const rows = await tx.$queryRaw<{ asset: string; amount: Prisma.Decimal | null }[]>`
      SELECT la."asset" AS asset, COALESCE(SUM(e."amount"), 0) AS amount
        FROM "ledger_account" la
        LEFT JOIN "ledger_entry" e ON e."ledgerAccountId" = la."id"
       WHERE la."accountId" = ${accountId}::uuid
       GROUP BY la."asset"
       ORDER BY la."asset"`;
    return rows.map((r) => ({ asset: r.asset, amount: balanceString(r.amount ?? 0, r.asset) }));
  }

  /** Postings of a virtual credit: user bucket +amount, DEMO_FUNDING −amount (same asset). */
  async creditEntries(accountId: string, asset: string, amount: string): Promise<EntryInput[]> {
    const [user, sys] = await this.prisma.$transaction(async (tx) => [await this.userBucket(tx, accountId, asset), await this.systemBucket(tx, 'DEMO_FUNDING', asset)]);
    return [
      { ledgerAccountId: user.id, asset, amount },
      { ledgerAccountId: sys.id, asset, amount: new D(amount).negated().toFixed() },
    ];
  }

  /** Initial virtual funds for a new account: user +50 000 USD, DEMO_FUNDING −50 000 USD. */
  async fundNewAccount(tx: Tx, account: { id: string; sessionId: string; currency: string }) {
    const user = await this.userBucket(tx, account.id, account.currency);
    const sys = await this.systemBucket(tx, 'DEMO_FUNDING', account.currency);
    await this.post(
      {
        scope: account.sessionId,
        idempotencyKey: `funding:${account.id}`,
        type: 'DEMO_FUNDING',
        memo: 'Стартовые виртуальные средства',
        entries: [
          { ledgerAccountId: user.id, asset: account.currency, amount: START_BALANCE_USD },
          { ledgerAccountId: sys.id, asset: account.currency, amount: '-' + START_BALANCE_USD },
        ],
      },
      tx,
    );
  }
}
