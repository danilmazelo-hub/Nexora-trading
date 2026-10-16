import { formatMoney } from '@nexora/contracts';

/**
 * Displays a server decimal string with its currency. Never computes: formatting only, so the stored value is
 * unchanged; tiny non-zero values show as "<$0.01" instead of 0.00 / −0.00.
 */
export function Money({ amount, currency, className }: { amount: string | null | undefined; currency: string; className?: string }) {
  return (
    <span className={['num', className].filter(Boolean).join(' ')} title={amount ? `${amount} ${currency}` : undefined}>
      {formatMoney(amount, currency, 'ru')}
    </span>
  );
}
