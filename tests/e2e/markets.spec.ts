import { expect, test } from '@playwright/test';
import { enterDemo } from './helpers';

test.describe('D12 markets and instrument selection', () => {
  test.beforeEach(async ({ page }) => {
    await enterDemo(page);
  });

  test('hub lists five markets with counts and coming-soon categories', async ({ page }) => {
    await page.goto('/markets');
    await expect(page.getByRole('link', { name: /Криптовалюты: 50 инструментов/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Forex: 63 инструментов/ })).toBeVisible();
    await expect(page.locator('.soon').filter({ hasText: 'Облигации' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('search BTC finds Bitcoin; choosing it changes the URL and every block', async ({ page }) => {
    await page.goto('/markets');
    await page.getByLabel('Поиск инструмента').fill('BTC');
    await page.getByRole('option', { name: /BTC\/USD\s*Bitcoin/ }).click();
    await expect(page).toHaveURL(/\/markets\/crypto\?symbol=BTC-USD$/);
    await expect(page.getByTestId('instrument-title')).toContainText('Bitcoin');
    await expect(page.locator('[data-instrument="BTC-USD"]').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'График BTC/USD' })).toBeVisible();

    // switch to another crypto asset inside the market
    await page.getByLabel('Поиск инструмента').fill('ethereum');
    await page.getByRole('option', { name: /ETH\/USD/ }).click();
    await expect(page).toHaveURL(/symbol=ETH-USD/);
    await expect(page.getByTestId('instrument-title')).toContainText('Ethereum');
    await expect(page.getByRole('heading', { name: 'График ETH/USD' })).toBeVisible();
    await expect(page.locator('[data-instrument="BTC-USD"]')).toHaveCount(0);
    await expect(page.getByTestId('chart-range')).toHaveAttribute('data-instrument', 'ETH-USD');
    // Back returns to the previous selection
    await page.goBack();
    await expect(page.getByTestId('instrument-title')).toContainText('Bitcoin');
  });

  test('different markets list different instruments', async ({ page }) => {
    await page.goto('/markets/stocks');
    await expect(page).toHaveURL(/symbol=AAPL/);
    const stocks = await page.locator('.picker-item .picker-sym').allInnerTexts();
    await page.goto('/markets/forex');
    await expect(page).toHaveURL(/symbol=EUR-USD/);
    const forex = await page.locator('.picker-item .picker-sym').allInnerTexts();
    expect(stocks.length).toBeGreaterThan(10);
    expect(forex.length).toBeGreaterThan(10);
    expect(stocks.filter((s) => forex.includes(s))).toEqual([]);
    expect(forex.every((s) => s.includes('/'))).toBe(true);
  });

  test('unknown symbol is reported and does not silently select the first asset', async ({ page }) => {
    await page.goto('/markets/crypto?symbol=NOPE-USD');
    await expect(page.getByText('Инструмент «NOPE-USD» не найден')).toBeVisible();
    await expect(page).toHaveURL(/symbol=NOPE-USD/);
    await expect(page.getByTestId('instrument-title')).toHaveCount(0);
    await expect(page.locator('.picker-item.selected')).toHaveCount(0);
  });

  test('a symbol of another market points to the right market', async ({ page }) => {
    await page.goto('/markets/crypto?symbol=AAPL');
    await page.getByRole('link', { name: 'Открыть на нужном рынке' }).click();
    await expect(page).toHaveURL(/\/markets\/stocks\?symbol=AAPL/);
    await expect(page.getByTestId('instrument-title')).toContainText('Apple');
  });

  test('empty search result shows an empty state', async ({ page }) => {
    await page.goto('/markets/indices');
    await page.getByLabel('Поиск инструмента').fill('zzzz-nothing');
    await expect(page.getByText('Ничего не найдено')).toBeVisible();
  });

  test('topbar search opens the instrument', async ({ page }) => {
    await page.goto('/finance/account');
    await page.getByRole('button', { name: 'Поиск инструмента' }).click();
    const dlg = page.getByRole('dialog', { name: 'Поиск инструмента' });
    await dlg.getByLabel('Поиск инструмента').fill('gold');
    await dlg.getByRole('option', { name: /XAU\/USD/ }).click();
    await expect(page).toHaveURL(/\/markets\/commodities\?symbol=XAU-USD/);
  });

  test('crypto shows an order book: live levels with a live feed, otherwise an honest "unavailable"', async ({ page }) => {
    await page.goto('/markets/crypto?symbol=BTC-USD');
    const book = page.getByTestId('order-book');
    await expect(book).toBeVisible();
    const api = await (await page.request.get('/api/market/instruments/BTC-USD/orderbook?depth=10')).json();
    if (api.status === 'live') {
      await expect(book.getByRole('table')).toHaveCount(2);
      await expect(book.getByText(/Binance/)).toBeVisible();
    } else {
      await expect(book.getByText('Стакан недоступен')).toBeVisible();
    }
    // other markets have no order book panel
    await page.goto('/markets/stocks?symbol=AAPL');
    await expect(page.getByRole('heading', { name: 'График AAPL' })).toBeVisible();
    await expect(page.getByTestId('order-book')).toHaveCount(0);
  });
});
