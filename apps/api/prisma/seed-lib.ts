import { type PrismaClient } from '@prisma/client';
import { CATALOG } from './catalog';

export const DEFAULT_MARKET_SEED = 20261015;

/**
 * Idempotent seed: upserts reference data only. It never deletes rows and never touches demo sessions,
 * so it can run repeatedly (D06: "после двух запусков seed нет дублей").
 */
export async function seedCatalog(prisma: PrismaClient): Promise<{ instruments: number }> {
  for (const i of CATALOG) {
    const { id, ...rest } = i;
    await prisma.instrument.upsert({ where: { id }, create: i, update: { ...rest, categories: { set: i.categories } } });
  }
  return { instruments: CATALOG.length };
}

/** Fixed market seed and clock. Created once; an existing row (e.g. a fixed demo clock) is left as is. */
export async function seedMarketSettings(prisma: PrismaClient, seed = Number(process.env.MARKET_SEED) || DEFAULT_MARKET_SEED) {
  return prisma.marketSettings.upsert({ where: { id: 'default' }, create: { id: 'default', seed, clockMode: 'REALTIME' }, update: {} });
}

export async function seedAll(prisma: PrismaClient) {
  const catalog = await seedCatalog(prisma);
  const market = await seedMarketSettings(prisma);
  return { ...catalog, marketSeed: market.seed, clockMode: market.clockMode };
}
