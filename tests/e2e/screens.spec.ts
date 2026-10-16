import { expect, test } from '@playwright/test';
import { enterDemo } from './helpers';

// D09: entry, shell and every route at 390 and 1440 px — no horizontal scroll, navigation visible, no JS errors.
const PATHS = ['/markets', '/markets/crypto', '/markets/stocks', '/markets/indices', '/markets/forex', '/markets/commodities', '/finance/account', '/finance/pnl', '/finance/verification', '/subscription', '/activity', '/ai', '/ai/demo-chat', '/ventures', '/settings/profile', '/settings/security', '/settings/notifications', '/settings/language', '/dev/components', '/dev/quotes', '/does-not-exist'];

for (const width of [390, 1440]) {
  test(`all screens render at ${width}px`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/demo');
    await page.screenshot({ path: info.outputPath(`w${width}-demo.png`), fullPage: true });
    await enterDemo(page);
    for (const p of PATHS) {
      await page.goto(p);
      await expect(page.locator('h1').first(), p).toBeVisible();
      if (width === 390) await expect(page.getByRole('navigation', { name: 'Нижняя навигация' })).toBeVisible();
      else await expect(page.locator('#sidebar')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${p} horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: info.outputPath(`w${width}${p.replace(/\//g, '_')}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}
