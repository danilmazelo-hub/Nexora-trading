import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap';

export async function startApp(): Promise<INestApplication> {
  const app = await createApp({ logger: false });
  await app.init();
  return app;
}

/** A supertest agent keeps cookies: one agent = one browser context. */
export function agent(app: INestApplication) {
  return request.agent(app.getHttpServer());
}
