import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge } from '../shared/ui';

/**
 * Honest placeholder for a route whose functionality is not built yet: shows the planned content and the
 * task ids. Such a screen must never be counted as a finished feature.
 */
export function InDevelopment({ title, tasks, planned, children }: { title: string; tasks: string[]; planned: string[]; children?: ReactNode }) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>{title}</h1>
        <Badge tone="warn">В разработке · {tasks.join(', ')}</Badge>
      </header>
      {children}
      <section className="panel in-dev" aria-label="Статус раздела">
        <h2>Раздел ещё не реализован</h2>
        <p className="muted">
          Маршрут и навигация готовы, функции появятся в задачах {tasks.join(', ')}. Кнопки этого раздела пока не выполняют действий.
        </p>
        <h3>Что здесь будет</h3>
        <ul>
          {planned.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p>
          <Link to="/markets">Перейти к рынкам</Link> — котировки и графики уже работают.
        </p>
      </section>
    </div>
  );
}
