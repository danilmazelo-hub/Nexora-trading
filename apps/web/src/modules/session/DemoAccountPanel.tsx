import { type SessionState } from '@nexora/contracts';
import { AccountBalance } from '../accounts/AccountBalance';

/** Account summary on /demo. Reset and scenarios are added in D06. */
export function DemoAccountPanel({ state }: { state: SessionState }) {
  const acc = state.accounts[0];
  return (
    <section className="panel" aria-labelledby="acc-title">
      <h2 id="acc-title">Ваш демосчёт</h2>
      {acc ? (
        <>
          <AccountBalance accountId={acc.id} />
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Счёт</dt>
            <dd className="mono">{acc.id.slice(0, 8)}…</dd>
            <dt>Валюта</dt>
            <dd>{acc.currency}</dd>
            <dt>Профиль</dt>
            <dd>{state.profile.displayName}</dd>
          </dl>
        </>
      ) : (
        <p className="muted">Активного счёта нет.</p>
      )}
    </section>
  );
}
