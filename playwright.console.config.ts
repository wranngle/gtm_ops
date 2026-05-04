/**
 * Playwright config — ops-console UI surface tests.
 * Serves apps/ops-console as static and points tests at the rendered console.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.CONSOLE_TEST_PORT || 4173);

export default defineConfig({
  testDir: './tests/console-e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-console-report' }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `bun tests/console-e2e/static-server.ts ${PORT}`,
    url: `http://localhost:${PORT}/console/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  outputDir: 'test-results-console/',
  timeout: 30_000,
  expect: { timeout: 5_000 },
});
