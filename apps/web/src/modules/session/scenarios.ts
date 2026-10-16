import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Scenario, ScenarioSchema, SessionStateSchema } from '@nexora/contracts';
import { z } from 'zod';
import { apiClient, newIdempotencyKey } from '../../shared/lib/api-client';
import { sessionKeys } from './api';

const ScenarioListSchema = z.object({ items: z.array(z.object({ id: ScenarioSchema, title: z.string(), description: z.string(), resets: z.boolean() })) });
const CreditResultSchema = z.object({ transactionId: z.string(), replayed: z.boolean(), balances: z.array(z.object({ asset: z.string(), amount: z.string() })) });

export function useScenarios() {
  return useQuery({ queryKey: ['demo', 'scenarios'], queryFn: () => apiClient.get('/demo/scenarios', { schema: ScenarioListSchema }), staleTime: Infinity });
}

/**
 * Reset only this session's account. Afterwards every cached server response is dropped (no stale balances).
 * resetQueries (not clear()) keeps mounted observers attached, so visible screens refetch immediately.
 */
export function useResetDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scenario: Scenario) => apiClient.post('/demo/reset', { confirm: true, scenario }, { schema: SessionStateSchema }),
    onSuccess: async (state) => {
      qc.setQueryData(sessionKeys.current, state);
      await qc.resetQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
    },
  });
}

export function useSetScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scenario: Scenario) => apiClient.put('/demo/scenario', { scenario }, { schema: SessionStateSchema }),
    onSuccess: (state) => {
      qc.setQueryData(sessionKeys.current, state);
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
    },
  });
}

/** Test operation "+100 USD". One key per click: a double click within the same request is one operation. */
export function useTestOperation(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string | undefined) => apiClient.post(`/me/accounts/${accountId}/demo-credit`, { amount: '100.00' }, { schema: CreditResultSchema, idempotencyKey: key ?? newIdempotencyKey() }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });
}
