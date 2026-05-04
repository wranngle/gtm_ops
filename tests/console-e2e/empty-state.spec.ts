/**
 * Empty-state behavior — when the live /api/history endpoint returns
 * an empty array (fresh deploy, no historic runs), the console must
 * NOT wipe the demo fallback data; otherwise a brand-new visitor sees
 * empty kanbans, blank proposals, no hot leads, and concludes the app
 * is broken. A "demo data" pill in the topbar tells them why.
 */
import { test, expect } from './_helpers.js';

test('empty /api/history preserves demo fallback companies + proposals', async ({ page }) => {
  await page.route('**/api/history', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/console/');
  await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 15_000 });
  await page.waitForTimeout(500);

  // window.GTM.companies should still hold the synthetic fixture rows.
  const counts = await page.evaluate(() => ({
    companies: (globalThis as any).GTM?.companies?.length ?? 0,
    proposals: (globalThis as any).GTM?.proposals?.length ?? 0,
    isFallback: Boolean((globalThis as any).GTM?._isDemoFallback),
  }));
  expect(counts.companies, 'companies wiped to empty').toBeGreaterThan(0);
  expect(counts.proposals, 'proposals wiped to empty').toBeGreaterThan(0);
  expect(counts.isFallback, '_isDemoFallback flag not set').toBe(true);
});

test('demo-data pill is visible in the topbar when fallback is active', async ({ page }) => {
  await page.route('**/api/history', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/console/');
  await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 15_000 });
  await page.waitForTimeout(500);
  // Force a small re-render so React picks up the flag if needed.
  await page.locator('.sb__item:has-text("Pipeline")').first().click();
  await expect(page.locator('.tb__demo-pill')).toBeVisible();
  await expect(page.locator('.tb__demo-pill')).toContainText(/demo data/i);
});

test('Pipeline route shows real cards (not "— empty —") with empty history', async ({ page }) => {
  await page.route('**/api/history', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/console/');
  await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 15_000 });
  await page.waitForTimeout(500);
  await page.locator('.sb__item:has-text("Pipeline")').first().click();
  // At least one kanban card visible — proves fallback survived.
  const cards = await page.locator('.pipe__card').count();
  expect(cards, 'pipeline kanban has zero cards on empty /api/history').toBeGreaterThan(0);
});
