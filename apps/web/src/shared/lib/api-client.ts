import { ApiErrorSchema, IDEMPOTENCY_HEADER, REQUEST_ID_HEADER } from '@nexora/contracts';
import { type ZodType } from 'zod';

/** Error shown to the user: always a known code and readable message, never parser/stack text. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const API_BASE = '/api';
const TIMEOUT_MS = 15_000;

type Query = Record<string, string | number | boolean | null | undefined>;
interface RequestOptions<T> {
  query?: Query;
  body?: unknown;
  schema?: ZodType<T>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** The caller handles 401 itself (e.g. the session probe) — skip the global "back to /demo" handler. */
  handle401?: boolean;
}

type UnauthorizedHandler = (e: ApiError) => void;
let onUnauthorized: UnauthorizedHandler | null = null;
/** Registered by the app: 401 SESSION_* clears the cache and returns to /demo. */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  onUnauthorized = fn;
}

export function buildUrl(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return API_BASE + path + (s ? '?' + s : '');
}

async function request<T>(method: string, path: string, opts: RequestOptions<T> = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), opts.timeoutMs ?? TIMEOUT_MS);
  const onAbort = () => ctrl.abort(opts.signal?.reason);
  opts.signal?.addEventListener('abort', onAbort);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers[IDEMPOTENCY_HEADER] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      credentials: 'include',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    const timedOut = ctrl.signal.reason instanceof DOMException && ctrl.signal.reason.name === 'TimeoutError';
    throw timedOut
      ? new ApiError(0, 'TIMEOUT', 'Сервер не ответил вовремя. Проверьте соединение и повторите.', null)
      : new ApiError(0, 'NETWORK_ERROR', 'Нет связи с сервером. Проверьте, что API запущен, и повторите.', null);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
  const requestId = res.headers.get(REQUEST_ID_HEADER);
  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // HTML error page from a proxy, truncated body, etc. — never show parser text (QA-07).
      throw new ApiError(res.status, 'BAD_RESPONSE', res.ok ? 'Сервер вернул некорректный ответ. Повторите позже.' : 'Сервис временно недоступен. Повторите позже.', requestId);
    }
  }
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(json);
    const err = parsed.success
      ? new ApiError(res.status, parsed.data.code, parsed.data.message, parsed.data.requestId, parsed.data.fieldErrors)
      : new ApiError(res.status, 'BAD_RESPONSE', 'Сервис временно недоступен. Повторите позже.', requestId);
    if (res.status === 401 && err.code.startsWith('SESSION_') && !opts.handle401) onUnauthorized?.(err);
    throw err;
  }
  if (!opts.schema) return json as T;
  const out = opts.schema.safeParse(json);
  if (!out.success) {
    console.error('[api] response does not match contract', path, out.error.issues);
    throw new ApiError(res.status, 'BAD_RESPONSE', 'Сервер вернул данные в неожиданном формате.', requestId);
  }
  return out.data;
}

export const apiClient = {
  get: <T>(path: string, opts?: Omit<RequestOptions<T>, 'body'>) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions<T>) => request<T>('POST', path, { ...opts, body: body ?? {} }),
  patch: <T>(path: string, body: unknown, opts?: RequestOptions<T>) => request<T>('PATCH', path, { ...opts, body }),
  put: <T>(path: string, body: unknown, opts?: RequestOptions<T>) => request<T>('PUT', path, { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOptions<T>) => request<T>('DELETE', path, opts),
};

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
