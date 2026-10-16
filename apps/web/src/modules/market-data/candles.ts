import { useQuery } from '@tanstack/react-query';
import { type ChartPeriod, CandlesResponseSchema, PERIOD_SPEC } from '@nexora/contracts';
import { apiClient } from '../../shared/lib/api-client';

export const candleKeys = { one: (id: string, period: ChartPeriod) => ['candles', id, period] as const };

/** Candles for a chart period (one interval + look-back window per period, see PERIOD_SPEC). */
export function useCandles(id: string | null, period: ChartPeriod) {
  return useQuery({
    queryKey: candleKeys.one(id ?? '', period),
    queryFn: () => {
      const spec = PERIOD_SPEC[period];
      const from = spec.lookbackMs ? new Date(Date.now() - spec.lookbackMs).toISOString() : undefined;
      return apiClient.get(`/market/instruments/${encodeURIComponent(id!)}/candles`, { query: { interval: spec.interval, from, limit: 1000 }, schema: CandlesResponseSchema });
    },
    enabled: !!id,
    staleTime: 60_000,
    // Never show the previous instrument's/period's candles while the new ones load.
    placeholderData: undefined,
  });
}
