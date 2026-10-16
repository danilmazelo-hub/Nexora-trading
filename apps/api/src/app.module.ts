import { Module } from '@nestjs/common';
import { DatabaseModule } from './infra/database/database.module';
import { HealthController } from './modules/health/health.controller';
import { InstrumentsModule } from './modules/instruments/instruments.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { SessionModule } from './modules/session/session.module';

@Module({
  imports: [DatabaseModule, SessionModule, InstrumentsModule, LedgerModule],
  controllers: [HealthController],
})
export class AppModule {}
