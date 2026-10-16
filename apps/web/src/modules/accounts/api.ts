import { useQuery } from '@tanstack/react-query';
import { AccountBalancesSchema } from '@nexora/contracts';
import { apiClient } from '../../shared/lib/api-client';

export const accountKeys = {
  all: ['accounts'] as const,
  balances: (accountId: string) => ['accounts', accountId, 'balances'] as const,
};

/** Balance comes from the server journal; the client never sets or computes it. */
export function useBalances(accountId: string | undefined) {
  return useQuery({
    queryKey: accountKeys.balances(accountId ?? ''),
    queryFn: () => apiClient.get(`/me/accounts/${accountId}/balances`, { schema: AccountBalancesSchema }),
    enabled: !!accountId,
  });
}
