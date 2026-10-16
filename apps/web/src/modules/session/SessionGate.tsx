import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { setUnauthorizedHandler } from '../../shared/lib/api-client';
import { ErrorState } from '../../shared/ui/ErrorState';
import { useSession } from './api';

/** Protected area: without a live session the user is sent to /demo?next=<path>. */
export function SessionGate({ children }: { children: ReactNode }) {
  const q = useSession();
  const loc = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Any 401 SESSION_* from any request (e.g. the session expired while the page was open) → clear cache, go to /demo.
  useEffect(() => {
    setUnauthorizedHandler((e) => {
      qc.clear();
      navigate('/demo?reason=' + (e.code === 'SESSION_EXPIRED' ? 'expired' : 'required') + '&next=' + encodeURIComponent(location.pathname + location.search), { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, qc]);

  if (q.isPending) return <div className="boot" role="status">Проверяем демосессию…</div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Не удалось проверить сессию" />;
  if (!q.data) return <Navigate to={'/demo?next=' + encodeURIComponent(loc.pathname + loc.search)} replace />;
  return <>{children}</>;
}
