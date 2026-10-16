import { type ReactNode } from 'react';
import { ComponentsPage } from '../pages/dev/ComponentsPage';
import { QuotesLabPage } from '../pages/dev/QuotesLabPage';
import { MarketPage } from '../pages/markets/MarketPage';
import { MarketsHubPage } from '../pages/markets/MarketsHubPage';
import { ActivityPage, AiPage, FinanceAccountPage, FinancePnlPage, SettingsPage, SubscriptionPage, VenturesPage, VerificationPage } from '../pages/sections';

export interface AppRoute {
  path: string;
  title: string;
  element: ReactNode;
  /** Shown in the sidebar under this group. */
  nav?: { group: NavGroup; label: string; icon: string };
  /** Representative URL for tests/navigation when the path has parameters. */
  sample?: string;
}
export type NavGroup = 'markets' | 'finance' | 'workspace' | 'settings' | 'dev';
export const NAV_GROUPS: Record<NavGroup, string> = { markets: 'Рынки', finance: 'Финансы', workspace: 'Работа', settings: 'Настройки', dev: 'Для разработки' };

/** Single source of the screen map (docs/screen-inventory.md): router, sidebar and e2e tests use this list. */
export const ROUTES: AppRoute[] = [
  { path: '/markets', title: 'Рынки', element: <MarketsHubPage />, nav: { group: 'markets', label: 'Все рынки', icon: 'markets' } },
  { path: '/markets/crypto', title: 'Криптовалюты', element: <MarketPage market="crypto" />, nav: { group: 'markets', label: 'Криптовалюты', icon: 'crypto' } },
  { path: '/markets/stocks', title: 'Акции', element: <MarketPage market="stocks" />, nav: { group: 'markets', label: 'Акции', icon: 'stocks' } },
  { path: '/markets/indices', title: 'Индексы', element: <MarketPage market="indices" />, nav: { group: 'markets', label: 'Индексы', icon: 'indices' } },
  { path: '/markets/forex', title: 'Forex', element: <MarketPage market="forex" />, nav: { group: 'markets', label: 'Forex', icon: 'forex' } },
  { path: '/markets/commodities', title: 'Сырьё', element: <MarketPage market="commodities" />, nav: { group: 'markets', label: 'Сырьё', icon: 'commodities' } },
  { path: '/finance/account', title: 'Финансы · Счёт', element: <FinanceAccountPage />, nav: { group: 'finance', label: 'Счёт', icon: 'finance' } },
  { path: '/finance/pnl', title: 'Финансы · PnL', element: <FinancePnlPage />, nav: { group: 'finance', label: 'PnL', icon: 'pnl' } },
  { path: '/finance/verification', title: 'Верификация', element: <VerificationPage />, nav: { group: 'finance', label: 'Верификация', icon: 'shield' } },
  { path: '/subscription', title: 'Подписка', element: <SubscriptionPage />, nav: { group: 'finance', label: 'Подписка', icon: 'star' } },
  { path: '/activity', title: 'Активность', element: <ActivityPage />, nav: { group: 'workspace', label: 'Активность', icon: 'activity' } },
  { path: '/ai', title: 'AI-ассистент', element: <AiPage />, nav: { group: 'workspace', label: 'AI-ассистент', icon: 'ai' } },
  { path: '/ai/:chatId', title: 'AI · беседа', element: <AiPage />, sample: '/ai/demo-chat' },
  { path: '/ventures', title: 'Ventures', element: <VenturesPage />, nav: { group: 'workspace', label: 'Ventures', icon: 'ventures' } },
  { path: '/settings/profile', title: 'Профиль', element: <SettingsPage tab="profile" />, nav: { group: 'settings', label: 'Профиль', icon: 'user' } },
  { path: '/settings/security', title: 'Безопасность', element: <SettingsPage tab="security" />, nav: { group: 'settings', label: 'Безопасность', icon: 'lock' } },
  { path: '/settings/notifications', title: 'Уведомления', element: <SettingsPage tab="notifications" />, nav: { group: 'settings', label: 'Уведомления', icon: 'bell' } },
  { path: '/settings/language', title: 'Язык', element: <SettingsPage tab="language" />, nav: { group: 'settings', label: 'Язык', icon: 'globe' } },
  { path: '/dev/components', title: 'Компоненты', element: <ComponentsPage />, nav: { group: 'dev', label: 'Компоненты UI', icon: 'code' } },
  { path: '/dev/quotes', title: 'Котировки (тест)', element: <QuotesLabPage />, nav: { group: 'dev', label: 'Котировки (тест)', icon: 'code' } },
];

/** Bottom navigation on narrow screens. "Ещё" opens the full sidebar drawer. */
export const BOTTOM_NAV = [
  { to: '/markets', label: 'Рынки', icon: 'markets' },
  { to: '/finance/account', label: 'Финансы', icon: 'finance' },
  { to: '/activity', label: 'Активность', icon: 'activity' },
  { to: '/ai', label: 'AI', icon: 'ai' },
];
