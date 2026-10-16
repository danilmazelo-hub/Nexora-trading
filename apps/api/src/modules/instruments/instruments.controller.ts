import { Controller, Get, Param, Query } from '@nestjs/common';
import { type Instrument, type InstrumentPage, InstrumentQuerySchema, type MarketSummary } from '@nexora/contracts';
import { parse } from '../../shared/zod';
import { InstrumentsService, toInstrumentDto } from './instruments.service';

/** Reference data is public (no session needed): markets, filtered instrument list, instrument card. */
@Controller()
export class InstrumentsController {
  constructor(private readonly instruments: InstrumentsService) {}

  @Get('markets')
  async markets(): Promise<{ items: MarketSummary[] }> {
    return { items: await this.instruments.markets() };
  }

  @Get('instruments')
  list(@Query() query: unknown): Promise<InstrumentPage> {
    return this.instruments.list(parse(InstrumentQuerySchema, query));
  }

  @Get('instruments/:id')
  async get(@Param('id') id: string): Promise<Instrument> {
    return toInstrumentDto(await this.instruments.get(id));
  }
}
