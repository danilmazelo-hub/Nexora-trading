import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatPercent, formatPrice, QuoteSchema } from '@nexora/contracts';
import { useState } from 'react';
import { useInstrument } from '../../modules/instruments/api';
import { quoteKey } from '../../modules/market-data/quote-stream';
import { QuoteCard } from '../../modules/market-data/QuoteCard';
import { useQuoteStream, useStreamState } from '../../modules/market-data/QuoteStreamProvider';
import { apiClient } from '../../shared/lib/api-client';
import { Badge, Button, ErrorState, Field, Select, Skeleton } from '../../shared/ui';

const CHOICES = [
  { value: 'BTC-USD', label: 'Bitcoin (крипта, изменение за 24 ч)' },
  { value: 'AAPL', label: 'Apple (акция, к закрытию дня)' },
  { value: 'EUR-USD', label: 'EUR/USD (Forex)' },
  { value: 'XPT-USD', label: 'Platinum (сырьё)' },
  { value: 'LBS', label: 'Lumber — котировка недоступна' },
];

/** /dev/quotes — D10 test card: one quote from the stream cache next to a direct API read of the same instrument. */
export function QuotesLabPage() {
  const [id, setId] = useState('BTC-USD');
  const inst = useInstrument(id);
  const stream = useQuoteStream();
  const state = useStreamState();
  const qc = useQueryClient();
  const direct = useQuery({ queryKey: ['quote-direct', id], queryFn: () => apiClient.get(`/market/quotes/${id}`, { schema: QuoteSchema }), enabled: false });
  const cached = qc.getQueryData<{ last: string | null; observedAt: string | null }>(quoteKey(id));
  return (
    <div className="page">
      <header className="page-head">
        <h1>Котировки: тестовая карточка</h1>
        <Badge tone="info">D10–D11</Badge>
      </header>
      <section className="panel">
        <div className="grid-2">
          <Field label="Инструмент">
            <Select value={id} onChange={(e) => setId(e.target.value)} options={CHOICES} />
          </Field>
          <div className="row gap" style={{ alignItems: 'end' }}>
            <Button onClick={() => void direct.refetch()}>Сравнить с API</Button>
            <Button variant="ghost" onClick={() => stream.dropConnection()}>
              Разорвать поток
            </Button>
            <span className="muted small">Поток: {state}</span>
          </div>
        </div>
      </section>
      <div className="grid-2">
        {inst.isPending ? <Skeleton lines={4} /> : inst.isError ? <ErrorState error={inst.error} /> : <QuoteCard instrument={inst.data} />}
        <section className="panel" aria-label="Ответ API">
          <h2>Прямой запрос к API</h2>
          {direct.isFetching ? (
            <Skeleton lines={3} />
          ) : direct.data && inst.data ? (
            <dl className="kv">
              <dt>last (API)</dt>
              <dd className="num" data-testid="api-last">{formatPrice(direct.data.last, inst.data.tickSize)}</dd>
              <dt>last (карточка)</dt>
              <dd className="num">{formatPrice(cached?.last ?? null, inst.data.tickSize)}</dd>
              <dt>изменение</dt>
              <dd className="num">{formatPercent(direct.data.changePct)}</dd>
              <dt>observedAt</dt>
              <dd className="mono small">{direct.data.observedAt ?? '—'}</dd>
              <dt>статус</dt>
              <dd>{direct.data.status}</dd>
            </dl>
          ) : (
            <p className="muted">Нажмите «Сравнить с API»: значение и время совпадут с карточкой в пределах одного 2-секундного тика.</p>
          )}
        </section>
      </div>
    </div>
  );
}
