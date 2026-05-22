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
import { test, expect } from './helpers.js';

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

test('console display typography uses the canonical Wranngle face without cramped tracking', async ({ openConsole }) => {
  const page = await openConsole();
  const typography = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const read = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement | null;
      const style = element ? getComputedStyle(element) : null;
      return {
        fontFamily: style?.fontFamily || '',
        letterSpacing: style?.letterSpacing || '',
      };
    };

    return {
      displayToken: root.getPropertyValue('--font-display').trim(),
      pageTitle: read('.ph__title'),
      statValue: read('.stat__value'),
      shellBrand: read('.sb__logo'),
    };
  });

  expect(typography.displayToken).toMatch(/^'Bricolage Grotesque',\s*'Outfit',\s*system-ui,\s*sans-serif$/);
  for (const [name, sample] of Object.entries({
    pageTitle: typography.pageTitle,
    statValue: typography.statValue,
    shellBrand: typography.shellBrand,
  })) {
    expect(sample.fontFamily, `${name} should inherit the console display face`).toMatch(/Bricolage Grotesque/i);
    expect(sample.letterSpacing, `${name} should not use negative tracking`).toMatch(/^(normal|0px)$/);
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
