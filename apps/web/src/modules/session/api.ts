import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SessionState, SessionStateSchema } from '@nexora/contracts';
import { ApiError, apiClient } from '../../shared/lib/api-client';

export const sessionKeys = { current: ['session', 'current'] as const };

/** Current session or null when there is none / it expired (401). Other errors surface as errors. */
export async function fetchSession(): Promise<SessionState | null> {
  try {
    return await apiClient.get('/demo/session', { schema: SessionStateSchema, handle401: true });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function useSession() {
  return useQuery({ queryKey: sessionKeys.current, queryFn: fetchSession, staleTime: 60_000, retry: false });
}

/** Create a new demo session or resume the one in the cookie. */
export function useEnterDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post('/demo/session', { locale: 'ru' }, { schema: SessionStateSchema }),
    onSuccess: (state) => {
      qc.setQueryData(sessionKeys.current, state);
    },
  });
}

export function useLeaveDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete('/demo/session'),
    onSuccess: async () => {
      qc.setQueryData(sessionKeys.current, null);
      await qc.resetQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
    },
  });
}
