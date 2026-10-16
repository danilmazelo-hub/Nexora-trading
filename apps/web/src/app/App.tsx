import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { HealthLiveSchema } from '@nexora/contracts';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ApiGate } from '../modules/health/ApiGate';
import { apiClient } from '../shared/lib/api-client';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function StartPage() {
  const live = useQuery({ queryKey: ['health', 'live'], queryFn: () => apiClient.get('/health/live', { schema: HealthLiveSchema }) });
  return (
    <main className="start">
      <h1>NEXORA Trading</h1>
      <p>Каркас приложения. Демо-режим, виртуальные средства.</p>
      <p>API: {live.isPending ? 'проверяем…' : live.isError ? 'недоступен' : `работает, версия ${live.data.version}`}</p>
    </main>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiGate>
        <BrowserRouter>
          <Routes>
            <Route path="*" element={<StartPage />} />
          </Routes>
        </BrowserRouter>
      </ApiGate>
    </QueryClientProvider>
  );
}
