import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agent, startApp } from './app';

/** D08: one error format everywhere — { code, message, fieldErrors?, requestId } and nothing internal. */
describe('unified API error format (D08)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const allowed = ['code', 'fieldErrors', 'message', 'requestId'];
  const expectShape = (body: Record<string, unknown>) => {
    expect(Object.keys(body).every((k) => allowed.includes(k))).toBe(true);
    expect(typeof body.code).toBe('string');
    expect(typeof body.message).toBe('string');
    expect(typeof body.requestId).toBe('string');
    expect(JSON.stringify(body)).not.toMatch(/stack|prisma|at \w+ \(|node_modules|SELECT|ZodError/i);
  };

  it('validation error lists field errors and echoes the request id', async () => {
    const a = agent(app);
    await a.post('/demo/session').send({}).expect(200);
    const res = await a.patch('/me/profile').set('x-request-id', 'test-req-0001').send({ displayName: 'x', locale: 'de' }).expect(400);
    expectShape(res.body);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.fieldErrors).sort()).toEqual(['displayName', 'locale']);
    expect(res.body.requestId).toBe('test-req-0001');
    expect(res.headers['x-request-id']).toBe('test-req-0001');
  });

  it('malformed JSON body gives a readable 400, not a parser message', async () => {
    const res = await request(app.getHttpServer()).post('/demo/session').set('Content-Type', 'application/json').send('{"locale": ').expect(400);
    expectShape(res.body);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.message).not.toMatch(/JSON|Unexpected/);
  });

  it('unsafe incoming request ids are replaced', async () => {
    const res = await request(app.getHttpServer()).get('/instruments/NOPE').set('x-request-id', '<script>').expect(404);
    expectShape(res.body);
    expect(res.body.requestId).toMatch(/^req_/);
  });

  it.each([
    ['GET', '/no-route', 404, 'ROUTE_NOT_FOUND'],
    ['GET', '/instruments/NOPE', 404, 'INSTRUMENT_NOT_FOUND'],
    ['GET', '/me/accounts', 401, 'SESSION_REQUIRED'],
    ['GET', '/instruments?page=0', 400, 'VALIDATION_FAILED'],
  ])('%s %s → %i %s', async (method, url, status, code) => {
    const res = await request(app.getHttpServer())[method.toLowerCase() as 'get'](url).expect(status);
    expectShape(res.body);
    expect(res.body.code).toBe(code);
  });
});
