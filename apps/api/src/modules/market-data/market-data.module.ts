import { Module } from '@nestjs/common';
import { InstrumentsModule } from '../instruments/instruments.module';
import { LedgerModule } from '../ledger/ledger.module';
import { SessionModule } from '../session/session.module';
import { MarketClock } from './market-clock';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { MarketTicker } from './market-ticker';

@Module({
  imports: [InstrumentsModule, SessionModule, LedgerModule],
  controllers: [MarketDataController],
  providers: [MarketClock, MarketDataService, MarketTicker],
  exports: [MarketDataService, MarketClock],
})
export class MarketDataModule {}
