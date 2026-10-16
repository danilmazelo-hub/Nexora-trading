import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../../config/env';

/**
 * Single Prisma client. The connection is lazy: the API must start (and /health/live must answer)
 * even when the database is down; /health/ready reports the database state.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Prisma');

  constructor() {
    super({ datasourceUrl: loadEnv().DATABASE_URL, log: ['warn', 'error'] });
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch {
      this.log.warn('База данных недоступна при старте; /health/ready сообщит состояние, подключение будет повторено при запросе.');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
