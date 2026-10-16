import { useQuery } from '@tanstack/react-query';
import { HealthReadySchema } from '@nexora/contracts';
import { type ReactNode } from 'react';
import { ApiError, apiClient } from '../../shared/lib/api-client';

export const healthKeys = { ready: ['health', 'ready'] as const };

/** Reads /health/ready; a 503 body is a valid "unavailable" answer, not a crash. */
async function fetchReady() {
  try {
    return await apiClient.get('/health/ready', { schema: HealthReadySchema, timeoutMs: 5000 });
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) return { status: 'unavailable' as const, checks: { database: 'down' as const } };
    throw e;
  }
}

/**
 * Blocks the app with an explanatory screen while the API or its database is unavailable (D02).
 * Re-checks automatically every 5 s and on "Повторить".
 */
export function ApiGate({ children }: { children: ReactNode }) {
  const q = useQuery({ queryKey: healthKeys.ready, queryFn: fetchReady, retry: false, refetchInterval: (query) => (query.state.data?.status === 'ok' ? 30_000 : 5_000) });
  if (q.isPending) return <div className="boot" role="status">Подключаемся к NEXORA Trading…</div>;
  const down = q.isError || q.data.status !== 'ok';
  if (!down) return <>{children}</>;
  const apiDown = q.isError;
  return (
    <main className="unavailable" aria-labelledby="unavail-title">
      <img src="/logo-n.png" alt="" width={48} height={48} />
      <h1 id="unavail-title">{apiDown ? 'API недоступен' : 'База данных недоступна'}</h1>
      <p>
        {apiDown
          ? 'Не удаётся связаться с сервером NEXORA. Убедитесь, что API запущен (pnpm dev), и повторите.'
          : 'Сервер работает, но база данных не отвечает. Запустите её (pnpm db:start или docker compose up -d db) и повторите.'}
      </p>
      {q.error instanceof ApiError && q.error.requestId ? <p className="muted">Код запроса: {q.error.requestId}</p> : null}
      <button type="button" className="btn primary" onClick={() => void q.refetch()} disabled={q.isFetching}>
        {q.isFetching ? 'Проверяем…' : 'Повторить'}
      </button>
      <p className="muted small">Проверка повторяется автоматически каждые 5 секунд.</p>
    </main>
  );
}
