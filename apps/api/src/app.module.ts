import { Module } from '@nestjs/common';
import { DatabaseModule } from './infra/database/database.module';
import { CapabilitiesController } from './modules/capabilities/capabilities.controller';
import { HealthController } from './modules/health/health.controller';
import { InstrumentsModule } from './modules/instruments/instruments.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { SessionModule } from './modules/session/session.module';

@Module({
  imports: [DatabaseModule, SessionModule, InstrumentsModule, LedgerModule, MarketDataModule],
  controllers: [HealthController, CapabilitiesController],
})
export class AppModule {}
