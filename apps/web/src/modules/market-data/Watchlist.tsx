import { ErrorState, Skeleton } from '../../shared/ui';
import { useInstrument } from '../instruments/api';
import { QuoteCard } from './QuoteCard';

export const DEFAULT_WATCHLIST = ['BTC-USD', 'ETH-USD', 'AAPL', 'EUR-USD', 'XAU-USD', 'SPX'];

function WatchItem({ id }: { id: string }) {
  const inst = useInstrument(id);
  if (inst.isPending) return <div className="quote-card compact"><Skeleton lines={2} /></div>;
  if (inst.isError) return <ErrorState error={inst.error} />;
  return <QuoteCard instrument={inst.data} compact />;
}

/** Compact cards fed by the shared quote stream (the same cache the market pages use). */
export function Watchlist({ ids = DEFAULT_WATCHLIST }: { ids?: string[] }) {
  return (
    <div className="watchlist">
      {ids.map((id) => (
        <WatchItem key={id} id={id} />
      ))}
    </div>
  );
}
