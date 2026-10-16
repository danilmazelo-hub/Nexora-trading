import { type Scenario, type SessionState } from '@nexora/contracts';
import { useId, useState } from 'react';
import { ApiError } from '../../shared/lib/api-client';
import { Badge, Button, Dialog, ErrorState, Skeleton, useToast } from '../../shared/ui';
import { AccountBalance } from '../accounts/AccountBalance';
import { useResetDemo, useScenarios, useSetScenario, useTestOperation } from './scenarios';

/** /demo account card: balance, reset with confirmation, scenario panel and a test money operation (D05–D06). */
export function DemoAccountPanel({ state }: { state: SessionState }) {
  const acc = state.accounts[0];
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetTo, setResetTo] = useState<Scenario>('STARTER');
  const scenarios = useScenarios();
  const reset = useResetDemo();
  const setScenario = useSetScenario();
  const testOp = useTestOperation(acc?.id);
  const groupId = useId();
  const current = state.session.scenario;

  const doReset = () =>
    reset.mutate(resetTo, {
      onSuccess: () => {
        setConfirmOpen(false);
        toast('Демосчёт сброшен: $50 000 виртуальных средств', 'success');
      },
      onError: (e) => toast(e instanceof ApiError ? e.message : 'Не удалось сбросить демосчёт', 'error'),
    });

  const choose = (s: Scenario, resets: boolean) => {
    if (resets) {
      setResetTo(s);
      setConfirmOpen(true);
    } else {
      setScenario.mutate(s, { onSuccess: () => toast(`Сценарий: ${scenarios.data?.items.find((x) => x.id === s)?.title ?? s}`, 'info') });
    }
  };

  const runTestOp = () =>
    testOp.mutate(undefined, {
      onSuccess: (r) => toast(r.replayed ? 'Повтор: операция уже была проведена' : 'Тестовая операция проведена: +$100,00', 'success'),
      onError: (e) => toast(e instanceof ApiError ? e.message : 'Операция не выполнена', 'error'),
    });

  return (
    <>
      <section className="panel" aria-labelledby="acc-title">
        <div className="panel-head">
          <h2 id="acc-title">Ваш демосчёт</h2>
          <Badge tone="accent">Демо · виртуальные средства</Badge>
        </div>
        {acc ? (
          <>
            <AccountBalance accountId={acc.id} />
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Счёт</dt>
              <dd className="mono">{acc.id.slice(0, 8)}…</dd>
              <dt>Профиль</dt>
              <dd>{state.profile.displayName}</dd>
            </dl>
            <div className="row gap" style={{ marginTop: 16 }}>
              <Button onClick={runTestOp} loading={testOp.isPending}>
                Тестовая операция +$100
              </Button>
              <Button variant="danger" onClick={() => choose('STARTER', true)}>
                Сбросить демосчёт
              </Button>
            </div>
          </>
        ) : (
          <p className="muted">Активного счёта нет.</p>
        )}
      </section>

      <section className="panel" aria-labelledby={groupId}>
        <h2 id={groupId}>Демосценарии</h2>
        <p className="muted small">Сценарий действует только для вашей сессии. «Стартовый» и «Пустой портфель» пересоздают счёт.</p>
        {scenarios.isPending ? (
          <Skeleton lines={3} />
        ) : scenarios.isError ? (
          <ErrorState error={scenarios.error} onRetry={() => void scenarios.refetch()} />
        ) : (
          <ul className="scenario-list" aria-label="Сценарии">
            {scenarios.data.items.map((s) => (
              <li key={s.id} className={'scenario' + (s.id === current ? ' current' : '')}>
                <div>
                  <b>{s.title}</b> {s.id === current ? <Badge tone="up">Текущий</Badge> : null}
                  <p className="muted small">{s.description}</p>
                </div>
                <Button size="sm" variant={s.id === current ? 'ghost' : 'secondary'} disabled={setScenario.isPending} onClick={() => choose(s.id, s.resets)} aria-label={`Включить сценарий «${s.title}»`}>
                  {s.resets ? 'Применить со сбросом' : s.id === current ? 'Включён' : 'Включить'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={confirmOpen}
        title="Сбросить демосчёт?"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Отмена
            </Button>
            <Button variant="danger" loading={reset.isPending} onClick={doReset}>
              Сбросить
            </Button>
          </>
        }
      >
        <p>Баланс вернётся к $50 000 виртуальных средств. Текущий счёт будет архивирован вместе с историей операций.</p>
        <p className="muted small">Сбрасывается только ваша демосессия; другие пользователи и окна с другими сессиями не затрагиваются.</p>
        {reset.isError ? <ErrorState error={reset.error} title="Сброс не выполнен" /> : null}
      </Dialog>
    </>
  );
}
