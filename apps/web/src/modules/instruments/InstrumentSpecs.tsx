import { type Instrument } from '@nexora/contracts';
import { Badge } from '../../shared/ui';
import { CATEGORY_LABEL, MARKET_LABEL, UNIT_LABEL } from './labels';

/** Contract units of an instrument (no trading form): what one quantity step and one tick mean. */
export function InstrumentSpecs({ instrument: i }: { instrument: Instrument }) {
  const unit = i.unit ? (UNIT_LABEL[i.unit] ?? i.unit) : i.market === 'forex' ? `единица ${i.baseAsset}` : i.baseAsset;
  return (
    <section className="panel" aria-labelledby={`specs-${i.id}`}>
      <div className="panel-head">
        <h3 id={`specs-${i.id}`}>Параметры инструмента</h3>
        {i.status !== 'ACTIVE' ? <Badge tone="warn">Котировка недоступна</Badge> : <Badge tone="accent">Демо</Badge>}
      </div>
      <dl className="kv">
        <dt>Рынок</dt>
        <dd>{MARKET_LABEL[i.market] ?? i.market}</dd>
        <dt>Категория</dt>
        <dd>{i.categories.map((c) => CATEGORY_LABEL[c] ?? c).join(', ')}</dd>
        <dt>Символ</dt>
        <dd className="mono">{i.symbol}</dd>
        <dt>База / котировка</dt>
        <dd className="mono">
          {i.baseAsset} / {i.quoteAsset}
        </dd>
        <dt>Шаг цены</dt>
        <dd className="num">
          {i.tickSize} {i.quoteAsset}
        </dd>
        <dt>Шаг количества</dt>
        <dd className="num">
          {i.quantityStep} ({unit})
        </dd>
        <dt>Множитель контракта</dt>
        <dd className="num">{i.contractMultiplier}</dd>
        <dt>Макс. плечо (демо)</dt>
        <dd className="num">1:{i.maxLeverage}</dd>
        <dt>Источник цены</dt>
        <dd>{i.source === 'simulator' ? 'Симулятор NEXORA (демо)' : i.source}</dd>
      </dl>
    </section>
  );
}
