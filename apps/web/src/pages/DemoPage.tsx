import { useNavigate, useSearchParams } from 'react-router';
import { useEnterDemo, useLeaveDemo, useSession } from '../modules/session/api';
import { Button, ErrorState, Skeleton } from '../shared/ui';
import { ApiError } from '../shared/lib/api-client';
import { DemoAccountPanel } from '../modules/session/DemoAccountPanel';

/** /demo — create or resume a personal demo session (D03); account, reset and scenarios (D05–D06). */
export function DemoPage() {
  const session = useSession();
  const enter = useEnterDemo();
  const leave = useLeaveDemo();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const reason = params.get('reason');

  const start = () =>
    enter.mutate(undefined, {
      onSuccess: () => navigate(next, { replace: true }),
    });

  return (
    <main className="demo-page" aria-labelledby="demo-title">
      <div className="demo-card">
        <div className="brand-row">
          <img src="/logo-n.png" alt="" width={40} height={40} />
          <div>
            <div className="wordmark">NEXORA</div>
            <div className="muted small">TRADING · ДЕМО</div>
          </div>
        </div>
        <h1 id="demo-title">Демосчёт NEXORA Trading</h1>
        <p className="muted">
          Личная демосессия со счётом $50 000 в виртуальных средствах. Котировки симулированы, реальных сделок и платежей нет.
          Пароль не нужен — сессия хранится в защищённой cookie этого браузера.
        </p>
        {reason === 'expired' ? (
          <p className="notice warn" role="status">
            Демосессия истекла. Войдите в демо снова — будет создан новый счёт.
          </p>
        ) : null}

        {session.isPending ? (
          <Skeleton lines={2} />
        ) : session.isError ? (
          <ErrorState error={session.error} onRetry={() => void session.refetch()} title="Не удалось проверить сессию" />
        ) : session.data ? (
          <>
            <p className="notice ok" role="status">
              Найдена ваша демосессия · действует до {new Date(session.data.session.expiresAt).toLocaleString('ru-RU')}
            </p>
            <div className="row gap">
              <Button variant="primary" onClick={() => navigate(next)}>
                Продолжить
              </Button>
              <Button variant="ghost" loading={leave.isPending} onClick={() => leave.mutate()}>
                Выйти из демо
              </Button>
            </div>
            <DemoAccountPanel state={session.data} />
          </>
        ) : (
          <>
            <Button variant="primary" size="md" loading={enter.isPending} onClick={start}>
              {enter.isPending ? 'Создаём демосчёт…' : 'Войти в демо'}
            </Button>
            {enter.isError ? (
              <p className="notice err" role="alert">
                {enter.error instanceof ApiError ? enter.error.message : 'Не удалось создать демосессию.'}{' '}
                {enter.error instanceof ApiError && enter.error.requestId ? <span className="muted small">Код запроса: {enter.error.requestId}</span> : null}
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

/** Only same-app relative paths are accepted as a redirect target. */
function safeNext(v: string | null): string {
  if (!v || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/demo')) return '/markets';
  return v;
}
