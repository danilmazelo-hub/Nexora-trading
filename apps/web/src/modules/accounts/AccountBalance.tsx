import { ErrorState, Skeleton } from '../../shared/ui';
import { Money } from '../../shared/ui/Money';
import { useBalances } from './api';

/** Balance of one account, one line per asset (assets are never summed together). */
export function AccountBalance({ accountId, size = 'lg' }: { accountId: string; size?: 'lg' | 'sm' }) {
  const q = useBalances(accountId);
  if (q.isPending) return <Skeleton lines={1} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Не удалось получить остаток" />;
  const main = q.data.balances.find((b) => b.asset === q.data.currency);
  const others = q.data.balances.filter((b) => b.asset !== q.data.currency);
  return (
    <div className={'balance ' + size} aria-live="polite">
      <span className="balance-label muted small">Баланс (виртуальные {q.data.currency})</span>
      <Money amount={main?.amount ?? '0'} currency={q.data.currency} className="balance-main" />
      {others.map((b) => (
        <Money key={b.asset} amount={b.amount} currency={b.asset} className="balance-extra" />
      ))}
    </div>
  );
}
