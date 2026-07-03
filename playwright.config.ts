import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Unified Presales Report
 *
 * E2E tests for validating:
 * - HTML report rendering
 * - PDF generation
 * - Visual regression of generated documents
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // The e2e suite is split: most specs load pre-generated reports via
  // file:// URLs (and skip via test.skip(!reportPath) when output/ is
  // empty). The webServer is only useful when an operator wants to test
  // the live HTTP pipeline locally. Skip it under CI / PDF_E2E_NO_SERVER.
  ...(process.env.CI || process.env.PDF_E2E_NO_SERVER ? {} : {
    webServer: {
      command: 'bun run start',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  }),
  // Output directories
  outputDir: 'test-results/',
  snapshotDir: 'tests/e2e/__snapshots__',
  // Timeouts
  timeout: 30_000,
  expect: {
    timeout: 5000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05,
    },
  },
});
