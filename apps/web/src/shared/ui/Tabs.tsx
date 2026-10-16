import { type KeyboardEvent, useId, useRef } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
}

/** WAI-ARIA tablist: ←/→ move between tabs, Home/End jump; the panel is rendered by the caller (aria ids provided). */
export function Tabs<T extends string>({ items, value, onChange, label, size }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string; size?: 'sm' }) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items.filter((i) => !i.disabled);
  const move = (e: KeyboardEvent, idx: number) => {
    const order = enabled.map((i) => items.indexOf(i));
    const pos = order.indexOf(idx);
    let next: number | undefined;
    if (e.key === 'ArrowRight') next = order[(pos + 1) % order.length];
    if (e.key === 'ArrowLeft') next = order[(pos - 1 + order.length) % order.length];
    if (e.key === 'Home') next = order[0];
    if (e.key === 'End') next = order[order.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next]!.id);
  };
  return (
    <div className={'tabs' + (size === 'sm' ? ' sm' : '')} role="tablist" aria-label={label}>
      {items.map((it, i) => (
        <button
          key={it.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${base}-tab-${it.id}`}
          aria-selected={it.id === value}
          aria-controls={`${base}-panel-${it.id}`}
          tabIndex={it.id === value ? 0 : -1}
          disabled={it.disabled}
          className={it.id === value ? 'tab active' : 'tab'}
          onClick={() => onChange(it.id)}
          onKeyDown={(e) => move(e, i)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
