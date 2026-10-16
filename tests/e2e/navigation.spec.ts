import { expect, test } from '@playwright/test';
import { enterDemo } from './helpers';

// Mirrors apps/web/src/app/routes.tsx (one entry per route of the screen map).
const ROUTES: [string, string][] = [
  ['/markets', 'Рынки'],
  ['/markets/crypto', 'Криптовалюты'],
  ['/markets/stocks', 'Акции'],
  ['/markets/indices', 'Индексы'],
  ['/markets/forex', 'Forex'],
  ['/markets/commodities', 'Сырьё'],
  ['/finance/account', 'Финансы · Счёт'],
  ['/finance/pnl', 'Финансы · PnL'],
  ['/finance/verification', 'Верификация'],
  ['/subscription', 'Подписка'],
  ['/activity', 'Активность'],
  ['/ai', 'AI-ассистент'],
  ['/ai/demo-chat', 'AI · беседа'],
  ['/ventures', 'Ventures'],
  ['/settings/profile', 'Профиль'],
  ['/settings/security', 'Безопасность'],
  ['/settings/notifications', 'Уведомления'],
  ['/settings/language', 'Язык'],
  ['/dev/components', 'Компоненты'],
  ['/dev/quotes', 'Котировки (тест)'],
];

test.describe('D07 navigation map', () => {
  test.beforeEach(async ({ page }) => {
    await enterDemo(page);
  });

  test('every route opens directly by URL and survives a refresh', async ({ page }) => {
    for (const [path, title] of ROUTES) {
      await page.goto(path);
      await expect(page, path).toHaveTitle(`${title} · NEXORA Trading`);
      await expect(page.locator('.topbar-title')).toHaveText(title);
      await page.reload();
      // market pages add ?symbol= of the selected instrument (D12)
      await expect(page, path + ' after reload').toHaveURL(new RegExp(path.replace(/\//g, '\\/') + '(\\?.*)?$'));
      await expect(page).toHaveTitle(`${title} · NEXORA Trading`);
    }
  });

  test('sidebar links lead to their sections; Back/Forward keep the route', async ({ page }) => {
    await page.goto('/markets');
    const nav = page.getByRole('navigation', { name: 'Основная навигация' }).or(page.locator('nav.nav'));
    await nav.getByRole('link', { name: 'Акции' }).click();
    await expect(page).toHaveURL(/\/markets\/stocks\?symbol=AAPL$/);
    await expect(nav.getByRole('link', { name: 'Акции' })).toHaveClass(/active/);
    await nav.getByRole('link', { name: 'PnL' }).click();
    await expect(page).toHaveURL(/\/finance\/pnl$/);
    await nav.getByRole('link', { name: 'Безопасность' }).click();
    await expect(page).toHaveURL(/\/settings\/security$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/finance\/pnl$/);
    await expect(page.locator('.topbar-title')).toHaveText('Финансы · PnL');
    await page.goBack();
    await expect(page).toHaveURL(/\/markets\/stocks\?symbol=AAPL$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/finance\/pnl$/);
  });

  test('unknown URL shows 404 inside the shell', async ({ page }) => {
    await page.goto('/no/such/page');
    await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
    await expect(page).toHaveTitle('Страница не найдена · NEXORA Trading');
    await page.getByRole('link', { name: 'К рынкам' }).click();
    await expect(page).toHaveURL(/\/markets$/);
  });

  test('unfinished screens are labelled as in development', async ({ page }) => {
    await page.goto('/activity');
    await expect(page.getByText('В разработке · D19')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Раздел ещё не реализован' })).toBeVisible();
  });

  test('mobile: bottom navigation and drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/markets');
    const bottom = page.getByRole('navigation', { name: 'Нижняя навигация' });
    await expect(bottom).toBeVisible();
    await bottom.getByRole('link', { name: 'Финансы' }).click();
    await expect(page).toHaveURL(/\/finance\/account$/);
    await bottom.getByRole('button', { name: 'Ещё' }).click();
    await page.locator('#sidebar').getByRole('link', { name: 'Ventures' }).click();
    await expect(page).toHaveURL(/\/ventures$/);
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('capabilities API describes demo sections honestly', async ({ page }) => {
    const res = await page.request.get('/api/capabilities');
    const body = await res.json();
    expect(body).toMatchObject({ mode: 'demo', realMoney: false });
    expect(body.priceSource).toMatch(/^simulator(\+[a-z]+)*$/);
    expect(body.sections.find((s: { id: string }) => s.id === 'activity').status).toBe('in_development');
  });
});
