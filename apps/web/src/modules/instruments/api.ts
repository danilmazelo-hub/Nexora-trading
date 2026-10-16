import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type InstrumentQuery, InstrumentPageSchema, InstrumentSchema, MarketSummarySchema } from '@nexora/contracts';
import { z } from 'zod';
import { apiClient } from '../../shared/lib/api-client';

export const instrumentKeys = {
  markets: ['markets'] as const,
  list: (q: InstrumentQuery) => ['instruments', 'list', q] as const,
  one: (id: string) => ['instruments', 'one', id] as const,
};

const MarketsSchema = z.object({ items: z.array(MarketSummarySchema) });

export function useMarkets() {
  return useQuery({ queryKey: instrumentKeys.markets, queryFn: () => apiClient.get('/markets', { schema: MarketsSchema }), staleTime: 5 * 60_000 });
}

export function useInstruments(q: InstrumentQuery, enabled = true) {
  return useQuery({
    queryKey: instrumentKeys.list(q),
    queryFn: () => apiClient.get('/instruments', { query: { ...q }, schema: InstrumentPageSchema }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useInstrument(id: string | null) {
  return useQuery({
    queryKey: instrumentKeys.one(id ?? ''),
    queryFn: () => apiClient.get(`/instruments/${encodeURIComponent(id!)}`, { schema: InstrumentSchema }),
    enabled: !!id,
    staleTime: 5 * 60_000,
    retry: (n, e) => !(e && 'status' in e && (e as { status: number }).status === 404) && n < 1,
  });
}
