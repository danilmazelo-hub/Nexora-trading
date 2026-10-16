import { Link, useLocation } from 'react-router';

export function NotFoundPage() {
  const loc = useLocation();
  return (
    <div className="page">
      <section className="panel not-found" aria-labelledby="nf-title">
        <p className="nf-code" aria-hidden="true">
          404
        </p>
        <h1 id="nf-title">Страница не найдена</h1>
        <p className="muted">
          Адреса <span className="mono">{loc.pathname}</span> нет в NEXORA Trading. Проверьте ссылку или вернитесь к рынкам.
        </p>
        <Link className="btn primary" to="/markets">
          К рынкам
        </Link>
      </section>
    </div>
  );
}
