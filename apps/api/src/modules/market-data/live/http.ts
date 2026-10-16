/** Error of an external feed request. The message never contains the URL (it may carry an API key). */
export class FeedHttpError extends Error {
  constructor(
    readonly feed: string,
    readonly status: number,
    readonly code: number | null,
    message: string,
  ) {
    super(`${feed}: ${message}`);
  }
}

export type FetchJson = (url: string, feed: string) => Promise<unknown>;

/** GET + JSON with a timeout. Non-2xx answers become FeedHttpError with the provider's own code/message. */
export const fetchJson: FetchJson = async (url, feed) => {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { Accept: 'application/json' } });
  } catch (e) {
    throw new FeedHttpError(feed, 0, null, (e as Error).name === 'TimeoutError' ? 'timeout' : 'network error');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const b = body as { code?: number; msg?: string; message?: string } | null;
    throw new FeedHttpError(feed, res.status, typeof b?.code === 'number' ? b.code : null, String(b?.msg ?? b?.message ?? `HTTP ${res.status}`).slice(0, 160));
  }
  return body;
};

export type FetchText = (url: string, feed: string, timeoutMs?: number) => Promise<string>;

/** GET as text (CSV downloads) with a timeout; same error rules as fetchJson. */
export const fetchText: FetchText = async (url, feed, timeoutMs = 20_000) => {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new FeedHttpError(feed, 0, null, (e as Error).name === 'TimeoutError' ? 'timeout' : 'network error');
  }
  if (!res.ok) throw new FeedHttpError(feed, res.status, null, `HTTP ${res.status}`);
  return res.text();
};
