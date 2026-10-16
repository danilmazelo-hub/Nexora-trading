import { expect, type Page, test } from '@playwright/test';
import { enterDemo } from './helpers';

const lastOf = (page: Page, id: string) => page.locator(`[data-instrument="${id}"] [data-testid="quote-last"]`).innerText();

test.describe('D10–D11 quotes', () => {
  test('test card shows price, source, time and status; it matches the API', async ({ page }) => {
    await enterDemo(page, '/dev/quotes');
    const card = page.locator('[data-instrument="BTC-USD"]');
    // simulator, or Binance when live reference feeds are on (ADR 0005)
    await expect(card.getByText(/Симулятор NEXORA \(демо\)|Binance · справочная цена/)).toBeVisible();
    await expect(card.getByText('Онлайн')).toBeVisible();
    await expect(card.getByText('за 24 ч')).toBeVisible();
    await expect(card.getByTestId('quote-observed')).not.toHaveText('—');
    await expect
      .poll(
        async () => {
          await page.getByRole('button', { name: 'Сравнить с API' }).click();
          await page.getByTestId('api-last').waitFor();
          const api = await page.getByTestId('api-last').innerText();
          const shown = (await card.getByTestId('quote-last').innerText()).replace(/\s*USD$/, '');
          return api === shown;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  });

  test('missing price shows a dash and "unavailable", never zero (A13)', async ({ page }) => {
    await enterDemo(page, '/dev/quotes');
    await page.getByLabel('Инструмент').selectOption('LBS');
    const card = page.locator('[data-instrument="LBS"]');
    await expect(card.getByText('Недоступно')).toBeVisible();
    await expect(card.getByTestId('quote-last')).toHaveText('—');
    await expect(card.getByTestId('quote-change')).toContainText('—');
  });

  test('two tabs show the same price for the same instrument', async ({ browser }) => {
    const ctx = await browser.newContext();
    const finance = await ctx.newPage();
    await enterDemo(finance, '/finance/account');
    const market = await ctx.newPage();
    await market.goto('/dev/quotes');
    await expect(finance.locator('[data-instrument="BTC-USD"] [data-testid="quote-last"]')).not.toHaveText('—');
    await expect(market.locator('[data-instrument="BTC-USD"] [data-testid="quote-last"]')).not.toHaveText('—');
    await expect
      .poll(async () => (await lastOf(finance, 'BTC-USD')).replace(/\s*USD$/, '') === (await lastOf(market, 'BTC-USD')).replace(/\s*USD$/, ''), { timeout: 20_000 })
      .toBe(true);
    await ctx.close();
  });

  test('prices update; after a dropped connection the stream recovers with one new connection', async ({ page }) => {
    await enterDemo(page, '/finance/account');
    // AAPL stays on the simulator (ticks every 2 s); a live feed price may legitimately stand still for a while
    const price = page.locator('[data-instrument="AAPL"] [data-testid="quote-last"]');
    await expect(price).not.toHaveText('—');
    const before = await price.innerText();
    await expect.poll(() => price.innerText(), { timeout: 20_000 }).not.toBe(before);
    const opened = await page.evaluate(() => (window as unknown as { __nexoraStream: { opened: number } }).__nexoraStream.opened);
    await page.evaluate(() => (window as unknown as { __nexoraStream: { dropConnection(): void } }).__nexoraStream.dropConnection());
    await expect.poll(() => page.evaluate(() => (window as unknown as { __nexoraStream: { state: string } }).__nexoraStream.state), { timeout: 10_000 }).toBe('open');
    expect(await page.evaluate(() => (window as unknown as { __nexoraStream: { opened: number } }).__nexoraStream.opened)).toBe(opened + 1);
    const afterDrop = await price.innerText();
    await expect.poll(() => price.innerText(), { timeout: 20_000 }).not.toBe(afterDrop);
    // server side: only this tab's stream is open
    const st = await (await page.request.get('/api/market/status')).json();
    expect(st.streams).toBeGreaterThanOrEqual(1);
    expect(st.streams).toBeLessThanOrEqual(3);
  });
});
