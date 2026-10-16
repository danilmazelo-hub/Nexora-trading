import { defineConfig, devices } from '@playwright/test';

// E2E against the local dev servers. Reuses running `pnpm dev` servers; otherwise starts them.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Europe/Kyiv',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    { command: 'pnpm --filter @nexora/contracts build && pnpm dev:api', url: 'http://localhost:3001/health/live', reuseExistingServer: true, timeout: 120_000 },
    { command: 'pnpm dev:web', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 120_000 },
  ],
});
