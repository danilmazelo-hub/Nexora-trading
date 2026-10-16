import { bucketStart, type ChartPeriod, CHART_PERIODS, formatPrice, type Instrument, INTERVAL_MS, PERIOD_SPEC, placesOf } from '@nexora/contracts';
import { CandlestickSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { EmptyState, ErrorState, Spinner, Tabs } from '../../shared/ui';
import { useCandles } from './candles';
import { sourceLabel } from './QuoteCard';
import { useLiveQuote } from './QuoteStreamProvider';

export const PERIOD_LABEL: Record<ChartPeriod, string> = { '24h': '24 ч', '1W': '1 нед', '1M': '1 мес', '1Y': '1 год', All: 'Всё' };
const INTERVAL_LABEL = { '5m': '5 мин', '15m': '15 мин', '1h': '1 час', '4h': '4 часа', '1d': '1 день', '1w': '1 неделя' } as const;

interface Bar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

const fmtDate = (iso: string, withTime: boolean) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'UTC' }).format(new Date(iso));

/**
 * Candlestick chart of one instrument and period. The chart object is created per instrument+period and destroyed
 * on change, so a previous instrument's candles can never remain on screen. The forming candle follows the live quote.
 */
export function PriceChart({ instrument, period, onPeriod }: { instrument: Pick<Instrument, 'id' | 'symbol' | 'tickSize'>; period: ChartPeriod; onPeriod: (p: ChartPeriod) => void }) {
  const candles = useCandles(instrument.id, period);
  const quote = useLiveQuote(instrument.id);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lastBar = useRef<Bar | null>(null);
  const spec = PERIOD_SPEC[period];
  const intervalMs = INTERVAL_MS[spec.interval];

  // (re)create the chart for this instrument + period
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const precision = placesOf(instrument.tickSize);
    const c = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#b9cbe0', fontFamily: 'Inter, system-ui, sans-serif', attributionLogo: false },
      grid: { vertLines: { color: 'rgba(34,64,95,.45)' }, horzLines: { color: 'rgba(34,64,95,.45)' } },
      rightPriceScale: { borderColor: '#22405f' },
      timeScale: { borderColor: '#22405f', timeVisible: intervalMs < 86_400_000, secondsVisible: false },
      localization: { locale: 'ru-RU', priceFormatter: (p: number) => formatPrice(p.toFixed(precision), instrument.tickSize) },
    });
    const s = c.addSeries(CandlestickSeries, {
      upColor: '#18d27c',
      downColor: '#ff5a6e',
      wickUpColor: '#18d27c',
      wickDownColor: '#ff5a6e',
      borderVisible: false,
      priceFormat: { type: 'price', precision, minMove: Number(instrument.tickSize) },
    });
    chart.current = c;
    series.current = s;
    lastBar.current = null;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
      lastBar.current = null;
    };
  }, [instrument.id, instrument.tickSize, period, intervalMs]);

  // data for the current chart
  useEffect(() => {
    const s = series.current;
    if (!s || !candles.data || candles.data.instrumentId !== instrument.id) return;
    const bars: Bar[] = candles.data.candles.map((c) => ({ time: (Date.parse(c.openTime) / 1000) as UTCTimestamp, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close) }));
    s.setData(bars);
    lastBar.current = bars.at(-1) ?? null;
    chart.current?.timeScale().fitContent();
  }, [candles.data, instrument.id]);

  // live: the forming candle follows the shared quote
  const last = quote.data?.last;
  const observedAt = quote.data?.observedAt;
  useEffect(() => {
    const s = series.current;
    const lb = lastBar.current;
    if (!s || !lb || !last || !observedAt) return;
    const p = Number(last);
    const t = (bucketStart(Date.parse(observedAt), intervalMs) / 1000) as UTCTimestamp;
    if (t < lb.time) return;
    const bar: Bar = t === lb.time ? { ...lb, high: Math.max(lb.high, p), low: Math.min(lb.low, p), close: p } : { time: t, open: lb.close, high: Math.max(lb.close, p), low: Math.min(lb.close, p), close: p };
    s.update(bar);
    lastBar.current = bar;
  }, [last, observedAt, intervalMs]);

  const data = candles.data && candles.data.instrumentId === instrument.id ? candles.data : null;
  const first = data?.candles[0];
  const final = data?.candles.at(-1);
  const withTime = intervalMs < 86_400_000;
  return (
    <section className="panel chart-panel" aria-labelledby={`chart-${instrument.id}`}>
      <div className="panel-head">
        <h2 id={`chart-${instrument.id}`}>График {instrument.symbol}</h2>
        <Tabs label="Период графика" size="sm" value={period} onChange={onPeriod} items={CHART_PERIODS.map((p) => ({ id: p, label: PERIOD_LABEL[p] }))} />
      </div>
      <p className="muted small chart-legend" data-testid="chart-range" data-first={first?.openTime ?? ''} data-last={final?.openTime ?? ''} data-count={data?.candles.length ?? 0} data-instrument={instrument.id}>
        {data && first && final ? `${PERIOD_LABEL[period]} · свечи ${INTERVAL_LABEL[spec.interval]} · ${fmtDate(first.openTime, withTime)} — ${fmtDate(final.closeTime, withTime)} (UTC) · ${data.candles.length} свечей` : `${PERIOD_LABEL[period]} · свечи ${INTERVAL_LABEL[spec.interval]}`}
      </p>
      <div className="chart-box">
        <div ref={box} className="chart-canvas" role="img" aria-label={`Свечной график ${instrument.symbol}, период ${PERIOD_LABEL[period]}`} />
        {candles.isPending ? (
          <div className="chart-overlay">
            <Spinner label="Загружаем свечи…" />
          </div>
        ) : candles.isError ? (
          <div className="chart-overlay">
            <ErrorState error={candles.error} onRetry={() => void candles.refetch()} title="Не удалось загрузить график" />
          </div>
        ) : data && data.candles.length === 0 ? (
          <div className="chart-overlay">
            <EmptyState title="Нет данных за период">Для этого инструмента история цен недоступна.</EmptyState>
          </div>
        ) : null}
      </div>
      <p className="muted small chart-attrib">
        {data ? (data.source.startsWith('simulator') ? 'Цены симулированы (демо).' : `История цен: ${sourceLabel(data.source)}.`) : null} Графики:{' '}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer noopener">
          TradingView Lightweight Charts™
        </a>{' '}
        © TradingView, Inc.
      </p>
    </section>
  );
}
