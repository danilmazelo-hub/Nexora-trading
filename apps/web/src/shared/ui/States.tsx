import { type ReactNode } from 'react';
import { ApiError } from '../lib/api-client';
import { Button } from './Button';

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state empty">
      <div className="state-icon" aria-hidden="true">
        ◌
      </div>
      <h3>{title}</h3>
      {children ? <p className="muted">{children}</p> : null}
      {action}
    </div>
  );
}

/** Readable error with requestId and Retry; never a stack trace or parser message. */
export function ErrorState({ error, onRetry, title = 'Не удалось загрузить данные' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const msg = error instanceof ApiError ? error.message : 'Произошла непредвиденная ошибка. Повторите попытку.';
  const reqId = error instanceof ApiError ? error.requestId : null;
  return (
    <div className="state error" role="alert">
      <div className="state-icon" aria-hidden="true">
        !
      </div>
      <h3>{title}</h3>
      <p>{msg}</p>
      {reqId ? <p className="muted small">Код запроса: {reqId}</p> : null}
      {onRetry ? (
        <Button variant="primary" onClick={onRetry}>
          Повторить
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" role="status" aria-label="Загрузка">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="sk-line" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'up' | 'down' | 'warn' | 'info' | 'accent'; children: ReactNode }) {
  return <span className={'badge ' + tone}>{children}</span>;
}
