import { expect, type Page, test } from '@playwright/test';
import { enterDemo } from './helpers';

const range = async (page: Page) => {
  const el = page.getByTestId('chart-range');
  await expect(el).not.toHaveAttribute('data-count', '0');
  return { first: Date.parse((await el.getAttribute('data-first'))!), last: Date.parse((await el.getAttribute('data-last'))!), count: Number(await el.getAttribute('data-count')), instrument: await el.getAttribute('data-instrument') };
};

test.describe('D13 chart and periods', () => {
  test.beforeEach(async ({ page }) => {
    await enterDemo(page, '/markets/crypto?symbol=BTC-USD');
  });

  test('chart renders candles (canvas) with loading finished', async ({ page }) => {
    await expect(page.locator('.chart-canvas canvas').first()).toBeVisible();
    const r = await range(page);
    expect(r.count).toBeGreaterThan(200); // 24h of 5-minute candles
    await expect(page.getByText('TradingView Lightweight Charts™')).toBeVisible();
  });

  test('24h and 1Y show different ranges; period is kept in the URL', async ({ page }) => {
    const day = await range(page);
    expect(day.last - day.first).toBeLessThanOrEqual(24 * 3600_000);
    await page.getByRole('tab', { name: '1 год' }).click();
    await expect(page).toHaveURL(/period=1Y/);
    await expect(page.getByTestId('chart-range')).toContainText('свечи 1 день');
    const year = await range(page);
    expect(year.last - year.first).toBeGreaterThan(300 * 86_400_000);
    expect(year.first).toBeLessThan(day.first);
    await page.reload();
    await expect(page.getByRole('tab', { name: '1 год' })).toHaveAttribute('aria-selected', 'true');
    for (const [tab, unit] of [['1 нед', 'свечи 1 час'], ['1 мес', 'свечи 4 часа'], ['Всё', 'свечи 1 неделя']] as const) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByTestId('chart-range')).toContainText(unit);
    }
  });

  test('no candles from the future and no repeated timestamps (API used by the chart)', async ({ page }) => {
    for (const interval of ['5m', '1h', '1d', '1w']) {
      const res = await page.request.get(`/api/market/instruments/BTC-USD/candles?interval=${interval}&limit=500`);
      const body = await res.json();
      const opens = body.candles.map((c: { openTime: string }) => Date.parse(c.openTime));
      expect(new Set(opens).size).toBe(opens.length);
      expect(Math.max(...opens)).toBeLessThanOrEqual(Date.now() + 2000);
    }
  });

  test('changing the asset replaces the chart (no previous instrument left)', async ({ page }) => {
    await range(page);
    await page.getByLabel('Поиск инструмента').fill('SOL');
    await page.getByRole('option', { name: /SOL\/USD/ }).click();
    await expect(page.getByRole('heading', { name: 'График SOL/USD' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'График BTC/USD' })).toHaveCount(0);
    const r = await range(page);
    expect(r.instrument).toBe('SOL-USD');
    await expect(page.locator('.chart-canvas')).toHaveCount(1);
  });

  test('instrument without history shows the empty state', async ({ page }) => {
    await page.goto('/markets/commodities?symbol=LBS');
    await expect(page.getByText('Нет данных за период')).toBeVisible();
    await expect(page.locator('[data-instrument="LBS"] [data-testid="quote-last"]')).toHaveText('—');
  });

  test('price format follows the instrument tick size', async ({ page }) => {
    // a live feed may have no value at all (provider day limit before anything was saved): nothing to format then
    const q = await (await page.request.get('/api/market/quotes/EUR-USD')).json();
    test.skip(q.last == null, `no EUR/USD price from ${q.source} right now (${q.status})`);
    await page.goto('/markets/forex?symbol=EUR-USD');
    await expect(page.locator('[data-instrument="EUR-USD"] [data-testid="quote-last"]')).toHaveText(/^\d,\d{5}/);
  });
});
