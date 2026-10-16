import { Injectable } from '@nestjs/common';
import { type Instrument as DbInstrument, type Prisma } from '@prisma/client';
import {
  COMING_SOON_MARKETS,
  type Instrument,
  type InstrumentPage,
  type InstrumentQuerySchema,
  MARKET_CATEGORIES,
  type MarketSummary,
  TRADABLE_MARKETS,
  toDecimalString,
} from '@nexora/contracts';
import { type z } from 'zod';
import { PrismaService } from '../../infra/database/prisma.service';
import { AppError } from '../../shared/app-error';

type Query = z.output<typeof InstrumentQuerySchema>;

export function toInstrumentDto(i: DbInstrument): Instrument {
  return {
    id: i.id,
    market: i.market,
    symbol: i.symbol,
    name: i.name,
    baseAsset: i.baseAsset,
    quoteAsset: i.quoteAsset,
    tickSize: toDecimalString(i.tickSize.toString()),
    quantityStep: toDecimalString(i.quantityStep.toString()),
    contractMultiplier: toDecimalString(i.contractMultiplier.toString()),
    maxLeverage: i.maxLeverage,
    categories: i.categories,
    unit: i.unit,
    status: i.status,
    source: i.source,
  };
}

@Injectable()
export class InstrumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async markets(): Promise<MarketSummary[]> {
    const rows = await this.prisma.instrument.findMany({ where: { status: { not: 'DISABLED' } }, select: { market: true, categories: true } });
    const tradable = TRADABLE_MARKETS.map((m) => {
      const own = rows.filter((r) => r.market === m);
      return {
        id: m,
        status: 'active' as const,
        instrumentCount: own.length,
        categories: MARKET_CATEGORIES[m].map((c) => ({ id: c, count: own.filter((r) => r.categories.includes(c)).length })).filter((c) => c.count > 0),
      };
    });
    const soon = COMING_SOON_MARKETS.map((m) => ({ id: m, status: 'coming_soon' as const, instrumentCount: 0, categories: [] }));
    return [...tradable, ...soon];
  }

  async list(q: Query): Promise<InstrumentPage> {
    const where: Prisma.InstrumentWhereInput = { status: { not: 'DISABLED' } };
    if (q.market) where.market = q.market;
    if (q.category) where.categories = { has: q.category };
    if (q.q) {
      const term = q.q.trim();
      where.OR = [
        { symbol: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
        { id: { contains: term, mode: 'insensitive' } },
        { baseAsset: { equals: term, mode: 'insensitive' } },
      ];
    }
    const orderBy: Prisma.InstrumentOrderByWithRelationInput[] =
      q.sort === 'market' ? [{ market: q.dir }, { sortOrder: 'asc' }] : q.sort === 'name' ? [{ name: q.dir }, { id: 'asc' }] : [{ symbol: q.dir }, { id: 'asc' }];
    const total = await this.prisma.instrument.count({ where });
    const pages = Math.max(1, Math.ceil(total / q.pageSize));
    const page = Math.min(q.page, pages);
    const items = await this.prisma.instrument.findMany({ where, orderBy, skip: (page - 1) * q.pageSize, take: q.pageSize });
    // Exact symbol/base matches first so "BTC" lists Bitcoin before BTC-paired coins.
    if (q.q) {
      const t = q.q.trim().toUpperCase();
      items.sort((a, b) => rank(b, t) - rank(a, t));
    }
    return { items: items.map(toInstrumentDto), total, page, pageSize: q.pageSize, pages };
  }

  async get(id: string): Promise<DbInstrument> {
    const i = /^[A-Za-z0-9.-]{1,32}$/.test(id) ? await this.prisma.instrument.findUnique({ where: { id } }) : null;
    if (!i || i.status === 'DISABLED') throw new AppError('INSTRUMENT_NOT_FOUND', 404, `Инструмент «${id.slice(0, 32)}» не найден`);
    return i;
  }

  async getMany(ids: string[]): Promise<DbInstrument[]> {
    return this.prisma.instrument.findMany({ where: { id: { in: ids }, status: { not: 'DISABLED' } } });
  }
}

function rank(i: DbInstrument, t: string): number {
  if (i.baseAsset.toUpperCase() === t || i.symbol.toUpperCase() === t) return 2;
  if (i.symbol.toUpperCase().startsWith(t)) return 1;
  return 0;
}
