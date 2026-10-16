import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Quote, QuoteSchema } from '@nexora/contracts';
import { createContext, type ReactNode, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { apiClient } from '../../shared/lib/api-client';
import { quoteKey, QuoteStreamManager, type StreamState } from './quote-stream';

const Ctx = createContext<QuoteStreamManager | null>(null);

/** Owns the single quote stream of this tab (created once per QueryClient). */
export function QuoteStreamProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [manager] = useState(() => new QuoteStreamManager(qc));
  useEffect(() => {
    (window as unknown as { __nexoraStream?: QuoteStreamManager }).__nexoraStream = manager;
    return () => manager.dispose();
  }, [manager]);
  return <Ctx.Provider value={manager}>{children}</Ctx.Provider>;
}

export function useQuoteStream(): QuoteStreamManager {
  const m = useContext(Ctx);
  if (!m) throw new Error('useQuoteStream outside QuoteStreamProvider');
  return m;
}

export function useStreamState(): StreamState {
  const m = useQuoteStream();
  return useSyncExternalStore(
    (cb) => m.onState(cb) as () => void,
    () => m.state,
    () => m.state,
  );
}

/**
 * Live quote of one instrument from the shared cache. The initial value comes from GET /market/quotes/:id,
 * then the stream keeps the same cache entry fresh. Unsubscribes when the component unmounts.
 */
export function useLiveQuote(id: string | null) {
  const m = useQuoteStream();
  useEffect(() => (id ? m.subscribe(id) : undefined), [m, id]);
  return useQuery<Quote>({
    queryKey: quoteKey(id ?? ''),
    queryFn: () => apiClient.get(`/market/quotes/${encodeURIComponent(id!)}`, { schema: QuoteSchema }),
    enabled: !!id,
    staleTime: Infinity,
    gcTime: 60_000,
  });
}
