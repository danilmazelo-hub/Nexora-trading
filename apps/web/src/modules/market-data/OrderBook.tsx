import { useQuery } from '@tanstack/react-query';
import { formatPrice, type Instrument, type OrderBook as Book, OrderBookSchema } from '@nexora/contracts';
import { apiClient } from '../../shared/lib/api-client';
import { EmptyState, ErrorState, Skeleton, Table } from '../../shared/ui';
import { sourceLabel } from './QuoteCard';

type Level = Book['bids'][number];

export function useOrderBook(id: string, depth = 10) {
  return useQuery({
    queryKey: ['orderbook', id, depth],
    queryFn: () => apiClient.get(`/market/instruments/${encodeURIComponent(id)}/orderbook`, { query: { depth }, schema: OrderBookSchema }),
    refetchInterval: 2_000,
    placeholderData: undefined,
  });
}

/** Best bids/asks of the live feed (Binance for crypto). Without a live feed the book is unavailable, never invented. */
export function OrderBook({ instrument }: { instrument: Pick<Instrument, 'id' | 'symbol' | 'tickSize'> }) {
  const book = useOrderBook(instrument.id);
  const side = (name: string, rows: Level[], tone: 'up' | 'down') => (
    <div>
      <h3 className={'small ' + tone}>{name}</h3>
      <Table
        caption={`${name} ${instrument.symbol}`}
        rows={rows}
        rowKey={(r) => r.price}
        columns={[
          { key: 'price', header: 'Цена', align: 'right', render: (r) => <span className={tone}>{formatPrice(r.price, instrument.tickSize)}</span> },
          { key: 'qty', header: 'Количество', align: 'right', render: (r) => r.quantity },
        ]}
      />
    </div>
  );
  return (
    <section className="panel" aria-label={`Стакан ${instrument.symbol}`} data-testid="order-book">
      <header className="panel-head">
        <h2>Стакан</h2>
        {book.data?.status === 'live' ? <span className="muted small">{sourceLabel(book.data.source)} · {new Date(book.data.observedAt!).toLocaleTimeString('ru-RU')}</span> : null}
      </header>
      {book.isPending ? (
        <Skeleton lines={5} />
      ) : book.isError ? (
        <ErrorState error={book.error} onRetry={() => void book.refetch()} title="Стакан не загрузился" />
      ) : book.data.status !== 'live' ? (
        <EmptyState title="Стакан недоступен">Для этого инструмента сейчас нет живого источника заявок. Значения не подставляются.</EmptyState>
      ) : (
        <div className="grid-2">
          {side('Покупка (bid)', book.data.bids, 'up')}
          {side('Продажа (ask)', book.data.asks, 'down')}
        </div>
      )}
      <p className="muted small">Справочные заявки биржи. Демосделки по ним не исполняются.</p>
    </section>
  );
}
