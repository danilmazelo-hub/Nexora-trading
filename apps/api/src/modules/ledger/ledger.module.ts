import { Module, type OnModuleInit } from '@nestjs/common';
import { SessionModule } from '../session/session.module';
import { SessionService } from '../session/session.service';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { DemoScenarioPolicy } from './scenario-policy';

@Module({
  imports: [SessionModule],
  controllers: [LedgerController],
  providers: [LedgerService, DemoScenarioPolicy],
  exports: [LedgerService, DemoScenarioPolicy],
})
export class LedgerModule implements OnModuleInit {
  constructor(
    private readonly sessions: SessionService,
    private readonly ledger: LedgerService,
  ) {}

  /** Every new main account receives its starting virtual funds inside the creation transaction. */
  onModuleInit() {
    this.sessions.registerAccountInitializer((tx, account) => this.ledger.fundNewAccount(tx, account));
  }
}
