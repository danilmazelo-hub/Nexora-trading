import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './shared/api-error.filter';
import { requestId } from './shared/request-id';

/** Builds the configured Nest app (shared by main.ts and integration tests). */
export async function createApp(opts: { logger?: false } = {}): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: opts.logger ?? ['log', 'warn', 'error'] });
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(cookieParser());
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableShutdownHooks();
  return app;
}
