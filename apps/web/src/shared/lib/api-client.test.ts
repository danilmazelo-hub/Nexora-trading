import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, apiClient, setUnauthorizedHandler } from './api-client';

function mockFetch(status: number, body: string, headers: Record<string, string> = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers })));
}

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected the request to fail');
}

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe('apiClient error handling (A09 / QA-07)', () => {
  it('HTML 502 from a proxy becomes a readable error without parser text', async () => {
    mockFetch(502, '<!DOCTYPE html><html>Bad gateway</html>');
    const err = await failure(apiClient.get('/x'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('BAD_RESPONSE');
    expect(err.message).not.toMatch(/JSON|token|DOCTYPE/);
  });

  it('parses the unified error body with requestId and fieldErrors', async () => {
    mockFetch(400, JSON.stringify({ code: 'VALIDATION_FAILED', message: 'Проверьте', fieldErrors: { q: ['слишком длинно'] }, requestId: 'req_abc12345' }));
    const err = await failure(apiClient.get('/x'));
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.requestId).toBe('req_abc12345');
    expect(err.fieldErrors).toEqual({ q: ['слишком длинно'] });
  });

  it('network failure becomes NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const err = await failure(apiClient.get('/x'));
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('times out with TIMEOUT', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));
    const err = await failure(apiClient.get('/x', { timeoutMs: 20 }));
    expect(err.code).toBe('TIMEOUT');
  });

  it('401 SESSION_EXPIRED triggers the unauthorized handler', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch(401, JSON.stringify({ code: 'SESSION_EXPIRED', message: 'Сессия истекла', requestId: 'req_abc12345' }));
    await apiClient.get('/x').catch(() => undefined);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('validates the response against the contract schema', async () => {
    mockFetch(200, JSON.stringify({ a: 1 }));
    await expect(apiClient.get('/x', { schema: z.object({ a: z.number() }) })).resolves.toEqual({ a: 1 });
    mockFetch(200, JSON.stringify({ a: 'no' }));
    const err = await failure(apiClient.get('/x', { schema: z.object({ a: z.number() }) }));
    expect(err.code).toBe('BAD_RESPONSE');
  });
});
