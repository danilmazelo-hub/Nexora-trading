import { type Instrument, type TradableMarket } from '@nexora/contracts';
import { useDeferredValue, useId, useState } from 'react';
import { EmptyState, ErrorState, Input, Skeleton } from '../../shared/ui';
import { useInstruments } from './api';
import { CATEGORY_LABEL } from './labels';
import { InstrumentIcon } from './InstrumentIcon';

interface Props {
  market?: TradableMarket;
  selectedId: string | null;
  onSelect: (i: Instrument) => void;
}

/** Search by name or symbol within a market (or all markets); selection is reported, never auto-picked. */
export function AssetPicker({ market, selectedId, onSelect }: Props) {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const listId = useId();
  const inputId = useId();
  const list = useInstruments({ market, q: deferred || undefined, pageSize: 100, sort: 'symbol', dir: 'asc' });
  return (
    <div className="picker">
      <label htmlFor={inputId} className="picker-label">
        Поиск инструмента
      </label>
      <Input id={inputId} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например, BTC или Apple" autoComplete="off" aria-controls={listId} />
      <div id={listId} className="picker-list" role="listbox" aria-label="Инструменты">
        {list.isPending ? (
          <Skeleton lines={5} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} title="Не удалось загрузить инструменты" />
        ) : list.data.items.length === 0 ? (
          <EmptyState title="Ничего не найдено">Проверьте написание символа или названия.</EmptyState>
        ) : (
          list.data.items.map((i) => (
            <button
              key={i.id}
              type="button"
              role="option"
              aria-selected={i.id === selectedId}
              className={'picker-item' + (i.id === selectedId ? ' selected' : '')}
              onClick={() => onSelect(i)}
            >
              <InstrumentIcon instrument={i} size="sm" />
              <span className="picker-sym mono">{i.symbol}</span>
              <span className="picker-name">{i.name}</span>
              <span className="picker-cat muted small">{i.categories.map((c) => CATEGORY_LABEL[c] ?? c).join(', ')}</span>
            </button>
          ))
        )}
      </div>
      {list.data && list.data.total > list.data.items.length ? <p className="muted small">Показано {list.data.items.length} из {list.data.total}. Уточните поиск.</p> : null}
    </div>
  );
}
