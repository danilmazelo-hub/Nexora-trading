import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApiGate } from '../modules/health/ApiGate';
import { SessionGate } from '../modules/session/SessionGate';
import { QuoteStreamProvider } from '../modules/market-data/QuoteStreamProvider';
import { DemoPage } from '../pages/DemoPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ToastProvider } from '../shared/ui';
import { ROUTES } from './routes';
import { Shell } from './Shell';

export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

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
                element={
                  <SessionGate>
                    <QuoteStreamProvider>
                      <Shell />
                    </QuoteStreamProvider>
                  </SessionGate>
                }
              >
                {ROUTES.map((r) => (
                  <Route key={r.path} path={r.path} element={r.element} />
                ))}
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ApiGate>
      </ToastProvider>
    </QueryClientProvider>
  );
}
