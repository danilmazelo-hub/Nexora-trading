import { useParams } from 'react-router';
import { AccountBalance } from '../modules/accounts/AccountBalance';
import { Watchlist } from '../modules/market-data/Watchlist';
import { useSession } from '../modules/session/api';
import { InDevelopment } from './InDevelopment';
import { NotFoundPage } from './NotFoundPage';

/** Placeholders for sections of the screen map whose features belong to later tasks (D19+). */
export function FinanceAccountPage() {
  const s = useSession();
  const acc = s.data?.accounts[0];
  return (
    <InDevelopment title="Финансы · Счёт" tasks={['D25', 'D27']} planned={['Вкладки Overview / History', 'Активы и промокарточки', 'Периоды и динамика счёта', 'Окна Deposit / Receive / Withdraw / Swap (D28–D31)']}>
      <section className="panel" aria-label="Остаток демосчёта">
        <h2>Остаток</h2>
        {acc ? <AccountBalance accountId={acc.id} /> : null}
        <p className="muted small">Баланс выводится из серверного журнала операций (D05).</p>
      </section>
      <section className="panel" aria-labelledby="wl-title">
        <h2 id="wl-title">Котировки</h2>
        <Watchlist />
      </section>
    </InDevelopment>
  );
}
export const FinancePnlPage = () => <InDevelopment title="Финансы · PnL" tasks={['D26']} planned={['Statistics', 'Profit by Market', 'Trading History', 'Фильтры и периоды с подписанным знаменателем']} />;
export const VerificationPage = () => <InDevelopment title="Финансы · Верификация" tasks={['D36']} planned={['Уровни Basic / Intermediate / Advanced / Business', 'Прогресс и повторная подача (демо, без реальных документов)']} />;
export const SubscriptionPage = () => <InDevelopment title="Подписка" tasks={['D32']} planned={['Тарифы Assistant / Analyst / Agent', 'Сравнение, активация и отмена (виртуально)']} />;
export const ActivityPage = () => <InDevelopment title="Активность" tasks={['D19']} planned={['Positions / Pending / History', 'Источник All / AI / Client', 'Фильтры']} />;
export const VenturesPage = () => <InDevelopment title="Ventures" tasks={['D35']} planned={['Состояния locked / empty / active', 'Funding / Withdraw / History', 'Корзина']} />;
export function AiPage() {
  const { chatId } = useParams();
  return <InDevelopment title={chatId ? `AI · беседа ${chatId}` : 'AI-ассистент'} tasks={['D33', 'D34']} planned={['Список бесед, New, история', 'Выбор модели/уровня', 'Предложения действий с явным подтверждением']} />;
}
const SETTINGS: Record<string, { title: string; task: string; planned: string[] }> = {
  profile: { title: 'Настройки · Профиль', task: 'D37', planned: ['Имя, аватар, демотелефон', 'Update с проверкой «нет изменений»'] },
  security: { title: 'Настройки · Безопасность', task: 'D38', planned: ['Email / пароль (демо)', 'MFA / passkey / устройства — только демонстрация'] },
  notifications: { title: 'Настройки · Уведомления', task: 'D40', planned: ['Предпочтения email / push', 'Сохранение'] },
  language: { title: 'Настройки · Язык', task: 'D39', planned: ['RU / EN полностью', 'Прочие языки — preview/disabled'] },
};
export function SettingsPage({ tab }: { tab: string }) {
  const s = SETTINGS[tab];
  if (!s) return <NotFoundPage />;
  return <InDevelopment title={s.title} tasks={[s.task]} planned={s.planned} />;
}
