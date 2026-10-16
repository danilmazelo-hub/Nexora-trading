import { expect, type Page } from '@playwright/test';

/** Opens /demo in a fresh context and enters the demo; returns after the app navigated away from /demo. */
export async function enterDemo(page: Page, next = '/markets') {
  await page.goto('/demo?next=' + encodeURIComponent(next));
  await page.getByRole('button', { name: 'Войти в демо' }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[?]/g, '\\?') + '$'));
}

export async function sessionState(page: Page) {
  const res = await page.request.get('/api/demo/session');
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { session: { id: string }; accounts: { id: string }[] };
}
