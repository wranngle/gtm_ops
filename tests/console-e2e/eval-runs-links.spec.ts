/**
 * /eval-runs/ result.json link integrity — every "result.json" link the
 * subapp renders for a run must resolve to a real fixture file. Catches
 * the bug-class where the rendering JS generates per-scenario URLs but
 * the fixture directory was never shipped.
 */
import { test, expect } from './helpers.js';

test('every result.json link in /eval-runs/ resolves with HTTP 200', async ({ page }) => {
  // The test static server doesn't honour Cloudflare _redirects rules, so the
  // /api/eval-runs alias 404s. Stand in for it the same way production does:
  // serve the bundled fixture.
  await page.route('**/api/eval-runs', async (route) => {
    const r = await route.fetch({ url: new URL('/fixtures/eval-runs.json', route.request().url()).toString() });
    await route.fulfill({ response: r });
  });
  await page.goto('/eval-runs/');
  await page.waitForLoadState('networkidle');
  // The renderer uses .link-btn for each run. Wait until at least one is mounted.
  await expect(page.locator('.link-btn')).not.toHaveCount(0);
  const links = await page.locator('.link-btn').all();
  expect(links.length).toBeGreaterThan(0);

  for (const link of links) {
    const href = await link.getAttribute('href');
    expect(href, 'link missing href').toBeTruthy();
    expect(href, 'link should target an in-tree fixture').toMatch(/^\.\.\/fixtures\/runs\//);
    // Resolve and HEAD it.
    const resolved = new URL(href!, await page.url()).pathname;
    const r = await page.request.get(resolved);
    expect(r.status(), `${resolved} returned ${r.status()} — link is dead`).toBe(200);
    const ct = r.headers()['content-type'] || '';
    expect(ct).toMatch(/json/);
    // The file should at minimum echo the scenario_id back (basic shape check).
    const body = await r.json();
    expect(body.scenario_id, `${resolved} missing scenario_id`).toBeTruthy();
  }
});
