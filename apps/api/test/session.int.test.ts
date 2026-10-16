import { type INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agent, startApp } from './app';

describe('demo sessions and isolation (D03)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  beforeAll(async () => {
    app = await startApp();
    prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('creates a session with an HttpOnly cookie, profile and a USD account', async () => {
    const a = agent(app);
    const res = await a.post('/demo/session').send({}).expect(200);
    expect(res.body.session.resumed).toBe(false);
    expect(res.body.accounts).toHaveLength(1);
    expect(res.body.accounts[0]).toMatchObject({ kind: 'MAIN', currency: 'USD', status: 'ACTIVE' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/nexora_demo=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    // only the hash is stored
    const token = /nexora_demo=([^;]+)/.exec(cookie)![1]!;
    const stored = await prisma.demoSession.findUniqueOrThrow({ where: { id: res.body.session.id } });
    expect(stored.tokenHash).not.toContain(token);
    expect(stored.tokenHash).toHaveLength(64);
  });

  it('resumes the same session when the cookie is valid', async () => {
    const a = agent(app);
    const first = await a.post('/demo/session').send({}).expect(200);
    const again = await a.post('/demo/session').send({}).expect(200);
    expect(again.body.session.resumed).toBe(true);
    expect(again.body.session.id).toBe(first.body.session.id);
    expect(again.body.accounts[0].id).toBe(first.body.accounts[0].id);
  });

  it('two independent browser contexts get different accounts', async () => {
    const a = agent(app);
    const b = agent(app);
    const ra = await a.post('/demo/session').send({}).expect(200);
    const rb = await b.post('/demo/session').send({}).expect(200);
    expect(ra.body.session.id).not.toBe(rb.body.session.id);
    expect(ra.body.accounts[0].id).not.toBe(rb.body.accounts[0].id);
    const la = await a.get('/me/accounts').expect(200);
    expect(la.body.items.map((x: { id: string }) => x.id)).toEqual([ra.body.accounts[0].id]);
  });

  it("someone else's accountId does not open their data (404, same as non-existent)", async () => {
    const a = agent(app);
    const b = agent(app);
    await a.post('/demo/session').send({}).expect(200);
    const rb = await b.post('/demo/session').send({}).expect(200);
    const foreign = await a.get(`/me/accounts/${rb.body.accounts[0].id}`).expect(404);
    expect(foreign.body.code).toBe('ACCOUNT_NOT_FOUND');
    const missing = await a.get('/me/accounts/00000000-0000-4000-8000-000000000000').expect(404);
    expect(missing.body.code).toBe('ACCOUNT_NOT_FOUND');
    await a.get('/me/accounts/not-a-uuid').expect(404);
    await b.get(`/me/accounts/${rb.body.accounts[0].id}`).expect(200);
  });

  it('no cookie → 401 SESSION_REQUIRED; forged cookie → 401', async () => {
    const r1 = await request(app.getHttpServer()).get('/demo/session').expect(401);
    expect(r1.body.code).toBe('SESSION_REQUIRED');
    const r2 = await request(app.getHttpServer()).get('/me/accounts').set('Cookie', 'nexora_demo=' + 'A'.repeat(43)).expect(401);
    expect(r2.body.code).toBe('SESSION_REQUIRED');
  });

  it('an expired session returns 401 SESSION_EXPIRED and clears the cookie', async () => {
    const a = agent(app);
    const res = await a.post('/demo/session').send({}).expect(200);
    await prisma.demoSession.update({ where: { id: res.body.session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await a.get('/me/accounts').expect(401);
    expect(r.body.code).toBe('SESSION_EXPIRED');
    expect(String(r.headers['set-cookie'])).toMatch(/nexora_demo=;/);
    // entering the demo again gives a new session
    const fresh = await agent(app).post('/demo/session').send({}).expect(200);
    expect(fresh.body.session.id).not.toBe(res.body.session.id);
  });

  it('leaving revokes the session', async () => {
    const a = agent(app);
    await a.post('/demo/session').send({}).expect(200);
    await a.delete('/demo/session').expect(204);
    await a.get('/demo/session').expect(401);
  });

  it('profile patch validates input and persists', async () => {
    const a = agent(app);
    await a.post('/demo/session').send({}).expect(200);
    const bad = await a.patch('/me/profile').send({ displayName: 'x' }).expect(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
    expect(bad.body.fieldErrors.displayName).toBeDefined();
    const ok = await a.patch('/me/profile').send({ displayName: 'Тестовый трейдер', locale: 'en' }).expect(200);
    expect(ok.body.profile).toMatchObject({ displayName: 'Тестовый трейдер', locale: 'en' });
  });
});
