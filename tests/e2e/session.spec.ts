import { expect, test } from '@playwright/test';
import { enterDemo, sessionState } from './helpers';

test.describe('D03/D05 demo session', () => {
  test('entering the demo creates a personal account with $50 000', async ({ page }) => {
    await enterDemo(page);
    await page.goto('/demo');
    await expect(page.getByText('Найдена ваша демосессия')).toBeVisible();
    await expect(page.getByText('$50 000,00')).toBeVisible();
  });

  test('two independent browser contexts get different accounts', async ({ browser }) => {
    const c1 = await browser.newContext();
    const c2 = await browser.newContext();
    const p1 = await c1.newPage();
    const p2 = await c2.newPage();
    await enterDemo(p1);
    await enterDemo(p2);
    const s1 = await sessionState(p1);
    const s2 = await sessionState(p2);
    expect(s1.session.id).not.toBe(s2.session.id);
    expect(s1.accounts[0]!.id).not.toBe(s2.accounts[0]!.id);
    // someone else's accountId does not open their data
    const foreign = await p1.request.get(`/api/me/accounts/${s2.accounts[0]!.id}/balances`);
    expect(foreign.status()).toBe(404);
    await c1.close();
    await c2.close();
  });

  test('a protected page without a session redirects to /demo and returns after entering', async ({ page }) => {
    await page.goto('/finance/account');
    await expect(page).toHaveURL(/\/demo\?next=%2Ffinance%2Faccount/);
    await page.getByRole('button', { name: 'Войти в демо' }).click();
    await expect(page).toHaveURL(/\/finance\/account$/);
  });

  test('reload keeps the session (resume)', async ({ page }) => {
    await enterDemo(page);
    const before = await sessionState(page);
    await page.reload();
    const after = await sessionState(page);
    expect(after.session.id).toBe(before.session.id);
  });

  test('an expired/removed session sends the user back to /demo', async ({ page, context }) => {
    await enterDemo(page);
    await context.clearCookies();
    await page.goto('/markets');
    await expect(page).toHaveURL(/\/demo/);
    await expect(page.getByRole('button', { name: 'Войти в демо' })).toBeVisible();
  });
});
