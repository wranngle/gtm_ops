/**
 * Google Fonts fallback hygiene — privacy users (uBlock, NextDNS, Pi-Hole)
 * routinely block fonts.googleapis.com. Asserts that:
 *   1. every HTML entrypoint requests Google Fonts with display=swap
 *      (so blocked / slow loads never produce a flash of invisible text)
 *   2. every --font-* token in tokens.css ends in a system / generic
 *      family fallback so the page degrades gracefully
 *   3. with fonts.googleapis.com blocked, the console still renders
 *      with a non-empty system-font chain on body / .ph__title / .mono
 */
import { test, expect } from './_helpers.js';

const HTML_ENTRYPOINTS = ['/', '/console/', '/evaluation/', '/eval-runs/', '/404.html'];

for (const path of HTML_ENTRYPOINTS) {
  test(`fonts · ${path} requests Google Fonts with display=swap`, async ({ page }) => {
    await page.goto(path);
    // Use the stylesheet specifically, not the preconnect (which is bare host).
    const link = await page
      .locator('link[rel="stylesheet"][href*="fonts.googleapis.com/css"]')
      .first()
      .getAttribute('href');
    expect(link, `${path} has no Google Fonts stylesheet <link>`).toBeTruthy();
    expect(link, `${path} stylesheet link must use display=swap`).toContain('display=swap');
  });
}

test('every --font-* token chains to a system family fallback', async ({ page }) => {
  await page.goto('/console/');
  const families = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      display: cs.getPropertyValue('--font-display').trim(),
      body: cs.getPropertyValue('--font-body').trim(),
      mono: cs.getPropertyValue('--font-mono').trim(),
    };
  });
  // Generic family at end of each chain — sans-serif, monospace, or a
  // system-ui family — guarantees the browser always has something to draw.
  for (const [name, chain] of Object.entries(families)) {
    expect(chain, `--font-${name} is empty`).toBeTruthy();
    expect(
      chain,
      `--font-${name} must end in a system fallback: ${chain}`,
    ).toMatch(/(system-ui|ui-sans-serif|ui-serif|ui-monospace|sans-serif|monospace|serif|Menlo)/);
  }
});

test('console renders with system-font fallback when Google Fonts is blocked', async ({ page }) => {
  await page.route('**/fonts.googleapis.com/**', async (route) => route.abort('blockedbyclient'));
  await page.route('**/fonts.gstatic.com/**', async (route) => route.abort('blockedbyclient'));
  await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
  await page.goto('/console/');
  await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
  await page.waitForTimeout(300);
  const families = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    title: getComputedStyle(document.querySelector('.ph__title') as HTMLElement).fontFamily,
    mono: getComputedStyle(document.querySelector('.mono') as HTMLElement).fontFamily,
  }));
  for (const [el, chain] of Object.entries(families)) {
    expect(chain, `${el} fontFamily empty under blocked Google Fonts`).toBeTruthy();
    expect(chain, `${el} fontFamily lacks a system fallback: ${chain}`).toMatch(
      /(system-ui|ui-sans-serif|ui-monospace|sans-serif|monospace|Menlo)/,
    );
  }
});
