import { formatPercent, formatPrice, type Instrument, type Quote, STALE_AFTER_MS } from '@nexora/contracts';
import { useEffect, useState } from 'react';
import { Badge, ErrorState, Skeleton } from '../../shared/ui';
import { InstrumentIcon } from '../instruments/InstrumentIcon';
import { useLiveQuote, useStreamState } from './QuoteStreamProvider';

export type DisplayStatus = Quote['status'];

/** Status as shown: a "live" quote that stopped updating becomes "stale" (never silently old). */
export function displayStatus(q: Quote, now: number): DisplayStatus {
  if (q.status === 'live' && q.observedAt && now - Date.parse(q.observedAt) > STALE_AFTER_MS) return 'stale';
  return q.status;
}

const STATUS: Record<DisplayStatus, { label: string; tone: 'up' | 'warn' | 'down' | 'info' }> = {
  live: { label: 'Онлайн', tone: 'up' },
  delayed: { label: 'С задержкой', tone: 'info' },
  stale: { label: 'Устарела', tone: 'warn' },
  unavailable: { label: 'Недоступно', tone: 'down' },
};

const isSimulator = (source: string) => source.startsWith('simulator');

/** "delayed" of the simulator means a fixed market clock (demo scenario); of a live feed — a periodic refresh. */
export function statusLabel(st: DisplayStatus, source: string) {
  return st === 'delayed' && isSimulator(source) ? 'Фиксированное время' : STATUS[st].label;
}

export const PERIOD_LABEL = { '24h': 'за 24 ч', prev_close: 'к закрытию пред. дня (UTC)' } as const;

export function useNow(everyMs = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

const SOURCES: Record<string, string> = {
  binance: 'Binance · справочная цена (USDT ≈ USD)',
  twelvedata: 'Twelve Data · справочная цена, обновление ~1 мин',
};

export function sourceLabel(source: string) {
  return isSimulator(source) ? 'Симулятор NEXORA (демо)' : (SOURCES[source] ?? source);
}

/** Page-level badge: simulated prices, or real reference prices with demo trading. */
export function sourceBadge(source: string): { label: string; tone: 'accent' | 'info' } {
  if (isSimulator(source)) return { label: 'Симулированные котировки', tone: 'accent' };
  const name = source === 'binance' ? 'Binance' : source === 'twelvedata' ? 'Twelve Data' : source;
  return { label: `Реальные цены ${name} · сделки демо`, tone: 'info' };
}

/** Price card: last, bid/ask, change with its period, source, observed time and status. Missing data → «—». */
export function QuoteCard({ instrument, compact }: { instrument: Pick<Instrument, 'id' | 'symbol' | 'name' | 'tickSize' | 'market' | 'baseAsset' | 'quoteAsset'>; compact?: boolean }) {
  const q = useLiveQuote(instrument.id);
  const stream = useStreamState();
  const now = useNow();
  if (q.isPending) return <div className={'quote-card' + (compact ? ' compact' : '')}><Skeleton lines={2} /></div>;
  if (q.isError) return <div className="quote-card"><ErrorState error={q.error} onRetry={() => void q.refetch()} title="Котировка не загрузилась" /></div>;
  const d = q.data;
  const st = displayStatus(d, now);
  const dir = d.changePct == null ? '' : d.changePct.startsWith('-') ? 'down' : Number(d.changePct) > 0 ? 'up' : '';
  return (
    <article className={'quote-card' + (compact ? ' compact' : '')} aria-label={`Котировка ${instrument.symbol}`} data-instrument={instrument.id}>
      <header className="qc-head">
        <div>
          <span className="qc-title">
            <InstrumentIcon instrument={instrument} size={compact ? 'xs' : 'md'} />
            <b className="mono">{instrument.symbol}</b>
          </span>
          {!compact ? <div className="muted small">{instrument.name}</div> : null}
        </div>
        <Badge tone={STATUS[st].tone}>{statusLabel(st, d.source)}</Badge>
      </header>
      <div className="qc-price num" data-testid="quote-last">
        {formatPrice(d.last, instrument.tickSize)} <span className="muted small">{d.last ? instrument.quoteAsset : ''}</span>
      </div>
      <div className={'qc-change num ' + dir} data-testid="quote-change">
        {formatPercent(d.changePct)} <span className="muted small">{PERIOD_LABEL[d.changePeriod]}</span>
      </div>
      {!compact ? (
        <dl className="kv qc-meta">
          <dt>Bid / Ask</dt>
          <dd className="num">
            {formatPrice(d.bid, instrument.tickSize)} / {formatPrice(d.ask, instrument.tickSize)}
          </dd>
          <dt>Источник</dt>
          <dd>{sourceLabel(d.source)}</dd>
          <dt>Время цены</dt>
          <dd className="num" data-testid="quote-observed">
            {d.observedAt ? new Date(d.observedAt).toLocaleTimeString('ru-RU') : '—'}
          </dd>
          <dt>Поток</dt>
          <dd>{stream === 'open' ? 'подключён' : stream === 'reconnecting' ? 'переподключение…' : stream === 'connecting' ? 'подключение…' : 'нет подписки'}</dd>
        </dl>
      ) : null}
      {st === 'unavailable' ? <p className="muted small">Цена недоступна — значение не подставляется нулём.</p> : null}
    </article>
  );
}
