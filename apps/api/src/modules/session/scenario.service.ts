import { Injectable } from '@nestjs/common';
import { type Scenario } from '@nexora/contracts';
import { PrismaService } from '../../infra/database/prisma.service';
import { SessionService } from './session.service';

export const SCENARIO_INFO: Record<Scenario, { title: string; description: string; resets: boolean }> = {
  STARTER: { title: 'Стартовый', description: 'Новый счёт $50 000 виртуальных средств, обычные котировки.', resets: true },
  EMPTY_PORTFOLIO: { title: 'Пустой портфель', description: '$50 000, ни одной позиции или заявки — для проверки пустых состояний.', resets: true },
  QUOTES_UNAVAILABLE: { title: 'Котировки недоступны', description: 'Цены для вашей сессии не приходят: экраны показывают «—» и статус «недоступно», а не ноль.', resets: false },
  OPERATION_FAILURE: { title: 'Сбой операции', description: 'Денежные операции завершаются ошибкой и полностью откатываются — баланс не меняется.', resets: false },
};

@Injectable()
export class ScenarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Resets ONLY the caller's demo account: active accounts are archived (their append-only journal stays),
   * a fresh main account is funded with 50 000 USD. Other sessions are not touched.
   */
  async reset(sessionId: string, scenario: Scenario = 'STARTER') {
    await this.prisma.$transaction(async (tx) => {
      // Row lock on the session serialises concurrent resets of the same session.
      await tx.$executeRaw`SELECT 1 FROM "demo_session" WHERE "id" = ${sessionId}::uuid FOR UPDATE`;
      await tx.account.updateMany({ where: { sessionId, status: 'ACTIVE' }, data: { status: 'ARCHIVED' } });
      await this.sessions.createMainAccount(tx, sessionId);
      await tx.demoSession.update({ where: { id: sessionId }, data: { scenario, resetCount: { increment: 1 } } });
    });
  }

  /** Switches the behaviour scenario without touching money (QUOTES_UNAVAILABLE / OPERATION_FAILURE / back). */
  async setScenario(sessionId: string, scenario: Scenario) {
    await this.prisma.demoSession.update({ where: { id: sessionId }, data: { scenario } });
  }
}
