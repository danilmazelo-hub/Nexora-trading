import { Body, Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { type AccountBalances, D, DecimalStringSchema, IDEMPOTENCY_HEADER, isDecimalString } from '@nexora/contracts';
import { z } from 'zod';
import { AppError } from '../../shared/app-error';
import { parse } from '../../shared/zod';
import { AccountsService } from '../session/accounts.service';
import { CurrentSession, SessionGuard } from '../session/session.guard';
import { type DemoSessionContext } from '../session/session.types';
import { DemoScenarioPolicy } from './scenario-policy';
import { LedgerService } from './ledger.service';

const CreditSchema = z.object({
  // zod runs refine even when the regex failed, so guard the Decimal parse.
  amount: DecimalStringSchema.refine((v) => isDecimalString(v) && new D(v).gte('0.01') && new D(v).lte('10000') && new D(v).decimalPlaces() <= 2, 'Сумма от 0.01 до 10 000 USD, не более 2 знаков'),
});

@Controller('me/accounts/:id')
@UseGuards(SessionGuard)
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly accounts: AccountsService,
    private readonly policy: DemoScenarioPolicy,
  ) {}

  /** Balance derived from the journal; the browser can only read it. */
  @Get('balances')
  async balances(@CurrentSession() s: DemoSessionContext, @Param('id') id: string): Promise<AccountBalances> {
    const acc = await this.accounts.getOwned(s.id, id);
    return { accountId: acc.id, currency: acc.currency, balances: await this.ledger.balances(acc.id), asOf: new Date().toISOString() };
  }

  /**
   * Demo test operation "+N USD of virtual funds" (scenario panel). The browser sends a command and an
   * Idempotency-Key, never a balance. Repeating the same key + body returns the same operation.
   */
  @Post('demo-credit')
  @HttpCode(200)
  async demoCredit(@CurrentSession() s: DemoSessionContext, @Param('id') id: string, @Headers(IDEMPOTENCY_HEADER) key: string | undefined, @Body() body: unknown) {
    if (!key) throw new AppError('VALIDATION_FAILED', 400, 'Нужен заголовок Idempotency-Key', { 'idempotency-key': ['обязателен'] });
    const { amount } = parse(CreditSchema, body);
    const acc = await this.accounts.getOwned(s.id, id);
    const failAfterFirstEntry = await this.policy.operationsFail(s.id);
    const res = await this.ledger.post({
      scope: s.id,
      idempotencyKey: `demo-credit:${key}`,
      type: 'DEMO_TEST_CREDIT',
      memo: 'Тестовая демо-операция',
      failAfterFirstEntry,
      entries: await this.ledger.creditEntries(acc.id, acc.currency, amount),
    });
    return {
      transactionId: res.transaction.id,
      replayed: res.replayed,
      balances: await this.ledger.balances(acc.id),
    };
  }
}
