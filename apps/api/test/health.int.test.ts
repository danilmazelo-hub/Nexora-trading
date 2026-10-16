import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../src/config/env';
import { startApp } from './app';

describe('health (D01–D02)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('live answers without touching the database', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['x-request-id']).toMatch(/^req_/);
  });

  it('ready reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('unknown route uses the unified error format', async () => {
    const res = await request(app.getHttpServer()).get('/no-such-route').expect(404);
    expect(res.body).toMatchObject({ code: 'ROUTE_NOT_FOUND', requestId: expect.any(String) });
    expect(Object.keys(res.body).sort()).toEqual(['code', 'message', 'requestId']);
  });
});

describe('health with the database down (D02)', () => {
  let app: INestApplication;
  const saved = process.env.DATABASE_URL;
  beforeAll(async () => {
    // Nothing listens on port 1: simulates a stopped database.
    process.env.DATABASE_URL = 'postgresql://nexora:nexora@127.0.0.1:1/nexora_test?connect_timeout=1';
    resetEnvCache();
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
    process.env.DATABASE_URL = saved;
    resetEnvCache();
  });

  it('live still answers 200', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });

  it('ready answers 503 without leaking host, user or error text', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(res.body).toEqual({ status: 'unavailable', checks: { database: 'down' } });
    expect(JSON.stringify(res.body)).not.toMatch(/127\.0\.0\.1|nexora:|password|P1001/);
  });
});
