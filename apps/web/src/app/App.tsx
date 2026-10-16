import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApiGate } from '../modules/health/ApiGate';
import { SessionGate } from '../modules/session/SessionGate';
import { useSession } from '../modules/session/api';
import { DemoPage } from '../pages/DemoPage';
import { ToastProvider } from '../shared/ui';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function Home() {
  const s = useSession();
  return (
    <main className="start">
      <h1>NEXORA Trading</h1>
      <p>Вы в демо: {s.data?.profile.displayName}. Разделы появятся в D07.</p>
    </main>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ApiGate>
          <BrowserRouter>
            <Routes>
              <Route path="/demo" element={<DemoPage />} />
              <Route path="/" element={<Navigate to="/markets" replace />} />
              <Route
                path="*"
                element={
                  <SessionGate>
                    <Home />
                  </SessionGate>
                }
              />
            </Routes>
          </BrowserRouter>
        </ApiGate>
      </ToastProvider>
    </QueryClientProvider>
  );
}
