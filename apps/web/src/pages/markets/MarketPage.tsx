import { ChartPeriodSchema, type ChartPeriod, type TradableMarket } from '@nexora/contracts';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useInstrument } from '../../modules/instruments/api';
import { AssetPicker } from '../../modules/instruments/AssetPicker';
import { InstrumentIcon } from '../../modules/instruments/InstrumentIcon';
import { InstrumentSpecs } from '../../modules/instruments/InstrumentSpecs';
import { MARKET_LABEL } from '../../modules/instruments/labels';
import { PriceChart } from '../../modules/market-data/PriceChart';
import { OrderBook } from '../../modules/market-data/OrderBook';
import { QuoteCard, sourceBadge } from '../../modules/market-data/QuoteCard';
import { useLiveQuote } from '../../modules/market-data/QuoteStreamProvider';
import { ApiError } from '../../shared/lib/api-client';
import { Badge, EmptyState, ErrorState, Skeleton, Tabs } from '../../shared/ui';

/** Default instrument when the URL has no symbol yet (written into the URL, visible and shareable). */
export const DEFAULT_SYMBOL: Record<TradableMarket, string> = { crypto: 'BTC-USD', stocks: 'AAPL', indices: 'SPX', forex: 'EUR-USD', commodities: 'XAU-USD' };

const VIEWS: Record<TradableMarket, { id: string; label: string; task?: string }[]> = {
  crypto: [{ id: 'charts', label: 'Charts' }, { id: 'performance', label: 'Performance', task: 'D20' }, { id: 'book', label: 'Order Book', task: 'D20' }, { id: 'top', label: 'Top Crypto', task: 'D20' }],
  stocks: [{ id: 'charts', label: 'Charts' }, { id: 'heatmap', label: 'Heatmap', task: 'D21' }, { id: 'performance', label: 'Performance', task: 'D21' }],
  indices: [{ id: 'charts', label: 'Charts' }, { id: 'heatmap', label: 'Heatmap', task: 'D22' }, { id: 'performance', label: 'Performance', task: 'D22' }],
  forex: [{ id: 'charts', label: 'Charts' }, { id: 'quotes', label: 'Quotes', task: 'D23' }, { id: 'performance', label: 'Performance', task: 'D23' }],
  commodities: [{ id: 'charts', label: 'Charts' }, { id: 'heatmap', label: 'Heatmap', task: 'D24' }, { id: 'performance', label: 'Performance', task: 'D24' }],
};

/**
 * /markets/:market?symbol=<id>&period=<24h|1W|1M|1Y|All> — the selected instrument lives in the URL; every block
 * (header, quote, chart, specs) reads the same id. An unknown symbol is reported, never replaced by the first asset.
 */
export function MarketPage({ market }: { market: TradableMarket }) {
  const [params, setParams] = useSearchParams();
  const symbol = params.get('symbol');
  const period: ChartPeriod = ChartPeriodSchema.safeParse(params.get('period')).data ?? '24h';
  const inst = useInstrument(symbol);

  useEffect(() => {
    if (!symbol) setParams((p) => ({ ...Object.fromEntries(p), symbol: DEFAULT_SYMBOL[market] }), { replace: true });
  }, [symbol, market, setParams]);

  const select = (id: string) => setParams((p) => ({ ...Object.fromEntries(p), symbol: id }));
  const setPeriod = (p: ChartPeriod) => setParams((cur) => ({ ...Object.fromEntries(cur), period: p }));
  const notFound = inst.error instanceof ApiError && inst.error.status === 404;
  const otherMarket = inst.data && inst.data.market !== market ? inst.data.market : null;
  const views = VIEWS[market];

  return (
    <div className="page">
      <header className="page-head">
        <h1>{MARKET_LABEL[market]}</h1>
        <SourceBadge id={inst.data && inst.data.market === market ? inst.data.id : null} />
      </header>
      <Tabs label="Представление рынка" value="charts" onChange={() => undefined} items={views.map((v) => ({ id: v.id, label: v.task ? `${v.label} (${v.task})` : v.label, disabled: !!v.task }))} />
      <div className="market-layout">
        <aside className="panel market-picker" aria-label="Выбор инструмента">
          <AssetPicker market={market} selectedId={inst.data?.id ?? symbol} onSelect={(i) => select(i.id)} />
        </aside>
        <div className="market-main">
          {!symbol || inst.isPending ? (
            <div className="panel">
              <Skeleton lines={4} />
            </div>
          ) : notFound ? (
            <div className="panel" role="alert">
              <EmptyState title={`Инструмент «${symbol}» не найден`}>Такого символа нет в справочнике. Выберите инструмент из списка слева — первый актив автоматически не подставляется.</EmptyState>
            </div>
          ) : inst.isError ? (
            <div className="panel">
              <ErrorState error={inst.error} onRetry={() => void inst.refetch()} />
            </div>
          ) : otherMarket ? (
            <div className="panel notice warn" role="alert">
              <p>
                {inst.data!.symbol} относится к рынку «{MARKET_LABEL[otherMarket]}».{' '}
                <Link to={`/markets/${otherMarket}?symbol=${encodeURIComponent(inst.data!.id)}`}>Открыть на нужном рынке</Link>
              </p>
            </div>
          ) : (
            <>
              <div className="instrument-head">
                <h2 data-testid="instrument-title">
                  <InstrumentIcon instrument={inst.data!} size="lg" />
                  {inst.data!.name} <span className="mono muted">{inst.data!.symbol}</span>
                </h2>
              </div>
              <div className="grid-2 market-top">
                <QuoteCard key={inst.data!.id} instrument={inst.data!} />
                <InstrumentSpecs instrument={inst.data!} />
              </div>
              <PriceChart key={inst.data!.id} instrument={inst.data!} period={period} onPeriod={setPeriod} />
              {market === 'crypto' ? <OrderBook key={'book-' + inst.data!.id} instrument={inst.data!} /> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Where the prices of the selected instrument come from (simulator or a live reference feed). */
function SourceBadge({ id }: { id: string | null }) {
  const q = useLiveQuote(id);
  if (!id || !q.data) return <Badge tone="accent">Демо</Badge>;
  const b = sourceBadge(q.data.source);
  return <Badge tone={b.tone}>{b.label}</Badge>;
}
