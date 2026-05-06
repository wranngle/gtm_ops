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
  // CI uses 1 worker per shard. Tested workers=2 on a 2-vCPU runner: zero
  // wall-clock improvement (chromium is itself multi-threaded; two browsers
  // contend for the 2 cores). Real parallelism comes from `--shard=N/M` in
  // the workflow matrix, not in-process workers. Local runs default half-CPU.
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
  // 60s per-test budget. Babel-standalone transpile + 4-worker parallel
  // load makes the prior 30s ceiling brittle for mount-heavy suites
  // (smoke-click sweeps 60 buttons; ui-action-coverage exercises every
  // route). Each test still asserts its own action timeouts inside.
  timeout: 60_000,
  expect: { timeout: 5_000 },
});
