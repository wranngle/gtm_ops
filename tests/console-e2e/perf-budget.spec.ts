/**
 * Perf budget — guards against accidentally re-introducing the React
 * dev-bundle (1 MB heavier than prod) or some other heavy script
 * landing in the static console asset list.
 *
 * Numbers are deliberately loose so transient unpkg / Google-Fonts
 * size variation doesn't flake. Tightening means picking new ceilings
 * and committing them with the win.
 */
import { test, expect } from './_helpers.js';

const BUDGETS = {
  // Total bytes pulled across all responses on a cold console load.
  // ~3.5 MB today (mostly babel-standalone + 130 KB react-dom). Anything
  // above 4.5 MB means a regression worth investigating.
  totalKbCeiling: 4500,
  // Single biggest non-babel transfer. babel-standalone is ~3 MB by
  // design (no build step); everything else should be under 200 KB.
  largestNonBabelKbCeiling: 250,
};

test('perf · /console/ stays under transfer budget', async ({ page }) => {
  const transfers: Array<{ url: string; size: number }> = [];
  page.on('response', async (resp) => {
    try {
      const body = await resp.body();
      transfers.push({ url: resp.url(), size: body.length });
    } catch (_) { /* opaque or aborted — ignore */ }
  });
  await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
  await page.goto('/console/', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 15_000 });

  const totalKb = Math.round(transfers.reduce((s, t) => s + t.size, 0) / 1024);
  expect(totalKb, `console total transfer ${totalKb} KB exceeds budget`).toBeLessThan(BUDGETS.totalKbCeiling);

  const nonBabel = transfers.filter((t) => !t.url.includes('babel'));
  const largestNonBabel = Math.max(...nonBabel.map((t) => t.size)) / 1024;
  expect(
    largestNonBabel,
    `largest non-babel transfer ${largestNonBabel.toFixed(0)} KB exceeds budget`,
  ).toBeLessThan(BUDGETS.largestNonBabelKbCeiling);
});

test('perf · React UMD is the production bundle, not the dev build', async ({ page }) => {
  const reactRequests: string[] = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('react@') || u.includes('react-dom@')) reactRequests.push(u);
  });
  await page.goto('/console/', { waitUntil: 'load' });
  // Should be the .production.min.js builds — never .development.js.
  for (const u of reactRequests) {
    expect(u, `dev React UMD slipped back in: ${u}`).not.toMatch(/\.development\.js$/);
    expect(u, `unexpected React URL ${u}`).toMatch(/\.production\.min\.js$/);
  }
});
