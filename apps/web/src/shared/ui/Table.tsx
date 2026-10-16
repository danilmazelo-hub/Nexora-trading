import { type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

/** Semantic table; on narrow screens rows become cards with the header shown as a label (data-label). */
export function Table<T>({ columns, rows, rowKey, caption, onRowClick, selectedKey }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; caption: string; onRowClick?: (r: T) => void; selectedKey?: string }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.align === 'right' ? 'num' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = rowKey(r);
            return (
              <tr key={k} className={[onRowClick ? 'clickable' : '', k === selectedKey ? 'selected' : ''].join(' ')} onClick={onRowClick ? () => onRowClick(r) : undefined} aria-selected={onRowClick ? k === selectedKey : undefined}>
                {columns.map((c) => (
                  <td key={c.key} data-label={c.header} className={c.align === 'right' ? 'num' : undefined}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
