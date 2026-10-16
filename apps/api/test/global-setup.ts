import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { seedAll } from '../prisma/seed-lib';
import { testDatabaseUrl } from './test-db';

/** Applies committed migrations to the clean test database and empties all tables. */
export default async function setup() {
  const url = testDatabaseUrl();
  execSync('pnpm exec prisma migrate deploy', { cwd: resolve(__dirname, '..'), env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
    await seedAll(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
