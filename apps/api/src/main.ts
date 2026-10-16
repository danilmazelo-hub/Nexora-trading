import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { loadEnv } from './config/env';

async function main() {
  let env;
  try {
    env = loadEnv();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  const { createApp } = await import('./bootstrap');
  const app = await createApp();
  await app.listen(env.PORT, '127.0.0.1');
  Logger.log(`API: http://localhost:${env.PORT}  (health: /health/live, /health/ready)`, 'Bootstrap');
}

void main();
