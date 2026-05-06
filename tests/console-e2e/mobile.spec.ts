/**
 * Mobile viewport regression — at 375×800 (iPhone SE class), no console
 * route is allowed to overflow the document horizontally on initial paint.
 * Catches the specific class of bug where a fixed-pixel sidebar + 5-up
 * stats grid + 2-col split push the page into a horizontal scrollbar
 * on phones.
 */
import { test, expect } from './_helpers.js';

const ROUTES = [
  { id: 'home', label: 'Mission Control' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'calls', label: 'Calls' },
  { id: 'proposals', label: 'Proposals' },
  { id: 'evals', label: 'Evals' },
  { id: 'agents', label: 'Agents' },
  { id: 'settings', label: 'Settings' },
];

for (const route of ROUTES) {
  test(`mobile · ${route.id} fits 375px viewport without horizontal scroll`, async ({ openConsole }) => {
    const page = await openConsole();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.locator(`.sb__item:has-text("${route.label}")`).first().click();
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => ({
      docScrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      bodyHasHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    expect(
      overflow.bodyHasHScroll,
      `route ${route.id}: docScrollW=${overflow.docScrollW} clientW=${overflow.clientW}`,
    ).toBe(false);
  });
}

test('mobile · sidebar auto-collapses at narrow viewports', async ({ openConsole }) => {
  const page = await openConsole();
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(200);
  const sidebarW = await page.evaluate(
    () => document.querySelector('.sb')?.getBoundingClientRect().width ?? 0,
  );
  // Compact rail width is --sidebar-collapsed-w: 64px. Must not be the full 232px.
  expect(sidebarW).toBeLessThan(100);
  expect(sidebarW).toBeGreaterThan(0);
});

test('mobile · stats grid does not overflow its container at 375px', async ({ openConsole }) => {
  const page = await openConsole();
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(200);
  const stats = await page.evaluate(() => {
    const s = document.querySelector('.stats') as HTMLElement | null;
    if (!s) return { ok: true };
    const r = s.getBoundingClientRect();
    return { ok: s.scrollWidth <= r.width + 1, scrollW: s.scrollWidth, rectW: r.width };
  });
  expect(stats.ok, `stats overflow: ${JSON.stringify(stats)}`).toBe(true);
});

test('mobile · attention banner actions stay inside the viewport', async ({ openConsole }) => {
  const page = await openConsole();
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(200);

  const banner = page.locator('[data-testid="attention-banner"]');
  await expect(banner).toBeVisible();
  await expect(page.locator('[data-testid="attention-review-now"]')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const viewportW = document.documentElement.clientWidth;
    const bannerEl = document.querySelector('[data-testid="attention-banner"]') as HTMLElement | null;
    const buttons = [...document.querySelectorAll('[data-testid="attention-snooze-1h"], [data-testid="attention-review-now"]')]
      .map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return {
          text: (el.textContent || '').trim(),
          left: r.left,
          right: r.right,
          width: r.width,
        };
      });
    const bannerRect = bannerEl?.getBoundingClientRect();
    return {
      viewportW,
      bannerRight: bannerRect?.right ?? 0,
      buttons,
      contained: buttons.every((r) => r.left >= 0 && r.right <= viewportW + 1 && r.width > 0),
    };
  });

  expect(
    geometry.contained,
    `attention actions clipped: ${JSON.stringify(geometry)}`,
  ).toBe(true);
});
