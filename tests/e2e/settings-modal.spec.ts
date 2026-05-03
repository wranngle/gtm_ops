/**
 * E2E Tests: Settings Modal (Enterprise Dashboard)
 * Validates the Settings modal and all its tabs
 *
 * Test Count: 25 tests
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

// Helper to open settings modal
async function openSettings(page: Page) {
  await page.click('button:has-text("Settings")');
  await expect(page.locator('#settings-modal')).toBeVisible();
}

// Helper to select a settings tab
async function selectTab(page: Page, tabName: string) {
  await page.click(`.settings-tab[data-settings-tab="${tabName}"]`);
}

test.describe('Settings Modal - Opening/Closing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('[P0][SM-001] should open Settings modal when clicking gear icon', async ({ page }) => {
    await page.click('button:has-text("Settings")');
    await expect(page.locator('#settings-modal')).toBeVisible();
  });

  test('[P0][SM-002] should close Settings modal when clicking X button', async ({ page }) => {
    await openSettings(page);
    await page.click('#settings-modal .btn-close-modal');
    await expect(page.locator('#settings-modal')).not.toBeVisible();
  });

  test('[P1][SM-003] should close Settings modal when clicking outside', async ({ page }) => {
    await openSettings(page);
    // Click on the modal backdrop (the overlay itself)
    await page.click('#settings-modal', { position: { x: 10, y: 10 } });
    await expect(page.locator('#settings-modal')).not.toBeVisible();
  });

  test('[P1][SM-004] should have all tabs visible', async ({ page }) => {
    await openSettings(page);
    const tabs = ['webhooks', 'versions', 'audit', 'usage', 'branding', 'admin', 'gdpr', 'users'];
    for (const tab of tabs) {
      await expect(page.locator(`.settings-tab[data-settings-tab="${tab}"]`)).toBeVisible();
    }
  });
});

test.describe('Settings Modal - Webhooks Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await openSettings(page);
    await selectTab(page, 'webhooks');
  });

  test('[P0][SM-005] should display webhook section', async ({ page }) => {
    await expect(page.locator('#settings-webhooks')).toBeVisible();
  });

  test('[P1][SM-006] should have create webhook form', async ({ page }) => {
    await expect(page.locator('#webhook-name')).toBeVisible();
    await expect(page.locator('#webhook-url')).toBeVisible();
    await expect(page.locator('button:has-text("Create Webhook")')).toBeVisible();
  });

  test('[P1][SM-007] should have webhook list area', async ({ page }) => {
    await expect(page.locator('#webhooks-list')).toBeVisible();
  });
});

test.describe('Settings Modal - Versions Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await openSettings(page);
    await selectTab(page, 'versions');
  });

  test('[P0][SM-008] should display version history section', async ({ page }) => {
    await expect(page.locator('#settings-versions')).toBeVisible();
  });

  test('[P1][SM-009] should have execution selector dropdown', async ({ page }) => {
    await expect(page.locator('#version-execution-select')).toBeVisible();
  });

  test('[P1][SM-010] should have versions list area', async ({ page }) => {
    await expect(page.locator('#versions-list')).toBeVisible();
  });
});

test.describe('Settings Modal - Audit Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await openSettings(page);
    await selectTab(page, 'audit');
  });

  test('[P0][SM-011] should display audit logs section', async ({ page }) => {
    await expect(page.locator('#settings-audit')).toBeVisible();
  });

  test('[P1][SM-012] should have date filter inputs', async ({ page }) => {
    await expect(page.locator('#audit-start-date')).toBeVisible();
    await expect(page.locator('#audit-end-date')).toBeVisible();
  });

  test('[P1][SM-013] should have action filter dropdown', async ({ page }) => {
    await expect(page.locator('#audit-action-filter')).toBeVisible();
  });

  test('[P1][SM-014] should have export CSV button', async ({ page }) => {
    await expect(page.locator('button:has-text("Export CSV")')).toBeVisible();
  });

  test('[P1][SM-015] should have audit logs list area', async ({ page }) => {
    await expect(page.locator('#audit-logs-list')).toBeVisible();
  });
});

test.describe('Settings Modal - Usage Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await openSettings(page);
    await selectTab(page, 'usage');
  });

  test('[P0][SM-016] should display usage stats section', async ({ page }) => {
    await expect(page.locator('#settings-usage')).toBeVisible();
  });

  test('[P1][SM-017] should have usage stats cards', async ({ page }) => {
    await expect(page.locator('#usage-stats')).toBeVisible();
    await expect(page.locator('#usage-documents')).toBeVisible();
    await expect(page.locator('#usage-api-calls')).toBeVisible();
    await expect(page.locator('#usage-tokens')).toBeVisible();
    await expect(page.locator('#usage-cost')).toBeVisible();
  });
});

test.describe('Settings Modal - GDPR Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await openSettings(page);
    await selectTab(page, 'gdpr');
  });

  test('[P0][SM-018] should display GDPR section', async ({ page }) => {
    await expect(page.locator('#settings-gdpr')).toBeVisible();
  });

  test('[P1][SM-019] should have request export button', async ({ page }) => {
    await expect(page.locator('button:has-text("Request Data Export")')).toBeVisible();
  });

  test('[P1][SM-020] should have consent toggles', async ({ page }) => {
    await expect(page.locator('#consent-marketing')).toBeVisible();
    await expect(page.locator('#consent-analytics')).toBeVisible();
  });

  test('[P1][SM-021] should have export status area', async ({ page }) => {
    // Export status div is present but empty until an export is requested
    await expect(page.locator('#gdpr-export-status')).toBeAttached();
  });
});

test.describe('Settings Modal - Branding Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await openSettings(page);
    await selectTab(page, 'branding');
  });

  test('[P0][SM-022] should display branding section', async ({ page }) => {
    await expect(page.locator('#settings-branding')).toBeVisible();
  });

  test('[P1][SM-023] should have color pickers', async ({ page }) => {
    await expect(page.locator('#branding-primary')).toBeVisible();
    await expect(page.locator('#branding-secondary')).toBeVisible();
  });

  test('[P1][SM-024] should have logo upload button', async ({ page }) => {
    await expect(page.locator('#branding-logo-file')).toBeAttached();
    await expect(page.locator('button:has-text("Choose File")')).toBeVisible();
  });

  test('[P1][SM-025] should have hex color inputs', async ({ page }) => {
    await expect(page.locator('#branding-primary-hex')).toBeVisible();
    await expect(page.locator('#branding-secondary-hex')).toBeVisible();
  });
});

test.describe('Settings Modal - Users Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await openSettings(page);
    await selectTab(page, 'users');
  });

  test('[P0][SM-026] should display users section', async ({ page }) => {
    await expect(page.locator('#settings-users')).toBeVisible();
  });

  test('[P1][SM-027] should have invite user form', async ({ page }) => {
    await expect(page.locator('#invite-email')).toBeVisible();
    await expect(page.locator('#invite-role')).toBeVisible();
    await expect(page.locator('button:has-text("Send Invitation")')).toBeVisible();
  });
});
