// `pnpm db:seed` — idempotent reference data (instruments, market settings). Safe to run repeatedly.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { seedAll } from './seed-lib';

async function main() {
  const env = resolve(__dirname, '../.env');
  if (existsSync(env)) process.loadEnvFile(env);
  const prisma = new PrismaClient();
  try {
    const res = await seedAll(prisma);
    console.info('seed done:', res);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
