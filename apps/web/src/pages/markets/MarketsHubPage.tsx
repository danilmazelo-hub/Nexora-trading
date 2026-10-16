import { Link, useNavigate } from 'react-router';
import { useMarkets } from '../../modules/instruments/api';
import { AssetPicker } from '../../modules/instruments/AssetPicker';
import { CATEGORY_LABEL, MARKET_LABEL } from '../../modules/instruments/labels';
import { Badge, ErrorState, Skeleton } from '../../shared/ui';
import { Icon } from '../../shared/ui/Icon';

/** /markets — hub of the five demo markets plus explicitly unavailable "coming soon" categories, and a global search. */
export function MarketsHubPage() {
  const markets = useMarkets();
  const navigate = useNavigate();
  return (
    <div className="page">
      <header className="page-head">
        <h1>Рынки</h1>
        <Badge tone="accent">Демо · источник цены указан у инструмента</Badge>
      </header>
      {markets.isPending ? (
        <Skeleton lines={4} />
      ) : markets.isError ? (
        <ErrorState error={markets.error} onRetry={() => void markets.refetch()} title="Не удалось загрузить рынки" />
      ) : (
        <>
          <section aria-labelledby="mk-active">
            <h2 id="mk-active" className="sr-only">
              Доступные рынки
            </h2>
            <div className="market-grid">
              {markets.data.items
                .filter((m) => m.status === 'active')
                .map((m) => (
                  <Link key={m.id} to={`/markets/${m.id}`} className="market-card" aria-label={`${MARKET_LABEL[m.id]}: ${m.instrumentCount} инструментов`}>
                    <span className="market-icon">
                      <Icon name={m.id} size={22} />
                    </span>
                    <b>{MARKET_LABEL[m.id]}</b>
                    <span className="muted small">{m.instrumentCount} инструментов</span>
                    <span className="chips">
                      {m.categories.map((c) => (
                        <span key={c.id} className="chip">
                          {CATEGORY_LABEL[c.id] ?? c.id} · {c.count}
                        </span>
                      ))}
                    </span>
                  </Link>
                ))}
            </div>
          </section>
          <section className="panel" aria-labelledby="mk-soon">
            <h2 id="mk-soon">Скоро</h2>
            <p className="muted small">Эти категории в демо недоступны: торговых терминалов для них нет.</p>
            <ul className="soon-list">
              {markets.data.items
                .filter((m) => m.status === 'coming_soon')
                .map((m) => (
                  <li key={m.id} className="soon" aria-disabled="true">
                    {MARKET_LABEL[m.id] ?? m.id} <Badge>Скоро</Badge>
                  </li>
                ))}
            </ul>
          </section>
        </>
      )}
      <section className="panel" aria-labelledby="mk-search">
        <h2 id="mk-search">Поиск по всем рынкам</h2>
        <AssetPicker selectedId={null} onSelect={(i) => navigate(`/markets/${i.market}?symbol=${encodeURIComponent(i.id)}`)} />
      </section>
    </div>
  );
}
