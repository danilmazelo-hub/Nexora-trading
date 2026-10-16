import { expect, test } from '@playwright/test';
import { enterDemo } from './helpers';

test.describe('D08 base components and keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await enterDemo(page, '/dev/components');
  });

  test('dialog opens from the keyboard, traps focus, Escape closes and focus returns', async ({ page }) => {
    const opener = page.getByRole('button', { name: 'Открыть диалог' });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Пример диалога' });
    await expect(dialog).toBeVisible();
    // focus is inside
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
    // Tab cycles inside the dialog
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('disabled action explains why', async ({ page }) => {
    const buy = page.getByRole('button', { name: 'Купить' });
    await expect(buy).toBeDisabled();
    const describedBy = await buy.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toContainText('D15');
  });

  test('form field has a programmatic label and shows a linked error', async ({ page }) => {
    await page.getByRole('button', { name: 'Сохранить' }).click();
    const input = page.getByLabel('Имя профиля');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Введите не менее 2 символов')).toBeVisible();
    await input.fill('Тест');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText('Сохранено: Тест')).toBeVisible();
  });

  test('tabs: arrow keys move selection and skip disabled tabs', async ({ page }) => {
    const first = page.getByRole('tab', { name: 'Первая' });
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Вторая' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(first).toHaveAttribute('aria-selected', 'true');
  });

  test('long text wraps without horizontal page scroll; tiny negative money is not -0.00', async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('cell', { name: '−<$0,01' })).toBeVisible();
  });

  test('error state shows a readable message and request id', async ({ page }) => {
    const alert = page.getByRole('alert').filter({ hasText: 'База данных временно недоступна' });
    await expect(alert).toContainText('req_demo1234');
    await expect(alert.getByRole('button', { name: 'Повторить' })).toBeVisible();
  });
});

test('D06 reset from /demo returns $50 000 only for this session', async ({ browser }) => {
  const c1 = await browser.newContext();
  const c2 = await browser.newContext();
  const p1 = await c1.newPage();
  const p2 = await c2.newPage();
  await enterDemo(p1, '/markets');
  await enterDemo(p2, '/markets');
  await p1.goto('/demo');
  await p1.getByRole('button', { name: 'Тестовая операция +$100' }).click();
  await expect(p1.getByText('$50 100,00').first()).toBeVisible();
  await p2.goto('/demo');
  await p2.getByRole('button', { name: 'Тестовая операция +$100' }).click();
  await expect(p2.getByText('$50 100,00').first()).toBeVisible();

  await p1.getByRole('button', { name: 'Сбросить демосчёт' }).click();
  const dlg = p1.getByRole('dialog', { name: 'Сбросить демосчёт?' });
  await dlg.getByRole('button', { name: 'Сбросить' }).click();
  await expect(dlg).toBeHidden();
  await expect(p1.getByText('$50 000,00').first()).toBeVisible();

  await p2.reload();
  await expect(p2.getByText('$50 100,00').first()).toBeVisible();

  // failure scenario: the operation is refused and the balance does not change
  await p1.getByRole('button', { name: 'Включить сценарий «Сбой операции»' }).click();
  await p1.getByRole('button', { name: 'Тестовая операция +$100' }).click();
  await expect(p1.getByText('Демосценарий «сбой операции»').first()).toBeVisible();
  await expect(p1.getByText('$50 000,00').first()).toBeVisible();
  await c1.close();
  await c2.close();
});
