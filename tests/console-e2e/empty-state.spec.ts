/**
 * Empty-state behavior — when the live /api/history endpoint returns
 * an empty array (fresh deploy, no historic runs), the console must
 * NOT wipe the demo fallback data; otherwise a brand-new visitor sees
 * empty kanbans, blank proposals, no hot leads, and concludes the app
 * is broken. The fallback flag is observable via `window.GTM._isDemoFallback`;
 * we no longer paint a topbar pill — the URL/route carries the signal.
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
