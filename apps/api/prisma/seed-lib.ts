import { type PrismaClient } from '@prisma/client';
import { CATALOG } from './catalog';

/**
 * Idempotent seed: upserts reference data only. It never deletes rows and never touches demo sessions,
 * so it can run repeatedly (D06: "после двух запусков seed нет дублей").
 */
export async function seedCatalog(prisma: PrismaClient): Promise<{ instruments: number }> {
  for (const i of CATALOG) {
    const data = { ...i, categories: { set: i.categories } };
    await prisma.instrument.upsert({ where: { id: i.id }, create: { ...i }, update: { ...data, id: undefined } });
  }
  return { instruments: CATALOG.length };
}

export async function seedAll(prisma: PrismaClient) {
  const catalog = await seedCatalog(prisma);
  return { ...catalog };
}
