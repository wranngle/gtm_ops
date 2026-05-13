/**
 * Empty-state behavior — when the live /api/history endpoint returns
 * an empty array (fresh deploy, no historic runs), the console must
 * NOT wipe the demo fallback data; otherwise a brand-new visitor sees
 * empty kanbans, blank proposals, no hot leads, and concludes the app
 * is broken. A demo banner at the top of the shell tells them why.
 */
import { test, expect } from './helpers.js';

test('empty /api/history preserves demo fallback companies + proposals', async ({ page }) => {
  // The console runs in DEMO_MODE on the static test server (port !== 3000),
  // so /api/history is rewritten to ../fixtures/history.json before the network.
  // Mock both: the fixture path catches DEMO_MODE; the /api path catches live mode.
  await page.route('**/fixtures/history.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/history', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/console/');
  await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
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

test('demo banner is visible at the very top when fallback is active', async ({ page }) => {
  // The console runs in DEMO_MODE on the static test server (port !== 3000),
  // so /api/history is rewritten to ../fixtures/history.json before the network.
  // Mock both: the fixture path catches DEMO_MODE; the /api path catches live mode.
  await page.route('**/fixtures/history.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/history', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/console/');
  await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
  await page.waitForTimeout(500);
  // Force a small re-render so React picks up the flag if needed.
  await page.locator('.sb__item:has-text("Pipeline")').first().click();
  const banner = page.getByTestId('demo-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/demo mode/i);
  await expect(banner).toContainText(/synthetic demo data/i);
  const geometry = await page.evaluate(() => {
    const bannerBox = document.querySelector('[data-testid="demo-banner"]')?.getBoundingClientRect();
    const appBox = document.querySelector('.app')?.getBoundingClientRect();
    return {
      bannerTop: bannerBox?.top ?? -1,
      bannerBottom: bannerBox?.bottom ?? -1,
      appTop: appBox?.top ?? -1,
    };
  });
  expect(Math.round(geometry.bannerTop)).toBe(0);
  expect(geometry.appTop).toBeGreaterThanOrEqual(geometry.bannerBottom - 1);
  await expect(page.locator('.tb__demo-pill')).toHaveCount(0);
});

test('Pipeline route shows real cards (not "— empty —") with empty history', async ({ page }) => {
  // The console runs in DEMO_MODE on the static test server (port !== 3000),
  // so /api/history is rewritten to ../fixtures/history.json before the network.
  // Mock both: the fixture path catches DEMO_MODE; the /api path catches live mode.
  await page.route('**/fixtures/history.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/history', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/console/');
  await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
  await page.waitForTimeout(500);
  await page.locator('.sb__item:has-text("Pipeline")').first().click();
  // At least one kanban card visible — proves fallback survived.
  const cards = await page.locator('.pipe__card').count();
  expect(cards, 'pipeline kanban has zero cards on empty /api/history').toBeGreaterThan(0);
});
