/**
 * Shared helpers for console-e2e Playwright tests.
 */
import { test as base, type Page } from '@playwright/test';
 
import AxeBuilderImport from '@axe-core/playwright';
// The package ships dual ESM/CJS — runtime gets a callable, but tsc sees the
// namespace. Coerce to the constructor at use-site.
const AxeBuilder = (AxeBuilderImport as any).default ?? AxeBuilderImport;

type ConsoleFixtures = { openConsole: () => Promise<Page> };

/** Visit the console with DEMO_MODE forced ON, so it reads from /fixtures
 *  rather than hitting the live API server. */
export const test = base.extend<ConsoleFixtures>({
  openConsole: async ({ page }: { page: Page }, use: (v: () => Promise<Page>) => Promise<void>) => {
    await page.addInitScript(() => {
      // Force the in-page fetch shim to swap real API calls for fixtures.
      // (window.fetch is reassigned inside index.html when DEMO_MODE is true.)
      // This must run before app scripts execute.
      // @ts-expect-error injected for tests
      globalThis.DEMO_MODE = true;
    });
    await use(async () => {
      await page.goto('/console/', { waitUntil: 'domcontentloaded' });
      // Babel-standalone needs a beat to transpile + render the React tree.
      await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 15_000 });
      return page;
    });
  },
});



/** Run axe-core, return only "serious" or "critical" violations to keep
 *  the noise down. The console is dense; we do not chase every minor.
 *  Disabled rules: color-contrast (theme tokens render fine in browser
 *  but axe sometimes mis-reads CSS variables on the in-browser babel run). */
export async function seriousAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .disableRules(['color-contrast'])
    .analyze();
  return results.violations.filter((v: { impact?: string }) => v.impact === 'serious' || v.impact === 'critical');
}

/** Click every visible button on the page and assert no console errors fire.
 *  Skips the coach launcher (would open the network-bound widget) and tweaks
 *  panel buttons (drag UI). Filters out errors emitted by the third-party
 *  ConvAI widget script (we don't own its bundle). */
const WIDGET_NOISE = [
  'languageCode',         // widget guard against undefined navigator
  'getReader',            // widget audio worklet feature-detect
  'AbortError',           // widget media stream cancel
  'NotAllowedError',      // mic permission in headless
  'elevenlabs-convai',    // any direct widget tag log
  'ConversationalAI',     // widget runtime logger prefix
  'widget_config',        // remote config fetch failures from the widget
  'Cannot fetch config',  // same fetch path, different message format
];
export async function smokeClickAll(page: Page, opts: { exclude?: string[] } = {}) {
  const errors: string[] = [];
  const isWidgetNoise = (text: string) => WIDGET_NOISE.some(needle => text.includes(needle));
  page.on('pageerror', e => {
    if (!isWidgetNoise(e.message)) errors.push(`pageerror: ${e.message}`);
  });
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' && !text.includes('Failed to load resource') && !isWidgetNoise(text)) {
      errors.push(`console: ${text}`);
    }
  });

  const exclude = new Set([
    '.coach-launcher',
    '.twk-x',
    '.twk-toggle',
    '.twk-btn',
    'elevenlabs-convai',
    ...(opts.exclude || []),
  ]);

  // Snapshot button locators once so React re-renders don't make the iteration
  // unbounded (each click can mount new buttons, which would loop forever).
  const handles = await page.locator('button:visible, [role="button"]:visible').elementHandles();
  const MAX_CLICKS = 60;
  const PER_CLICK_TIMEOUT = 1000;
  let clicks = 0;
  for (const h of handles) {
    if (clicks >= MAX_CLICKS) break;
    let skip = false;
    for (const sel of exclude) {
      try {
        skip = await h.evaluate((el: Element, s: string) => el.matches(s) || Boolean(el.closest(s)), sel);
      } catch { skip = false; }
      if (skip) break;
    }
    if (skip) continue;
    try {
      await h.click({ timeout: PER_CLICK_TIMEOUT });
      clicks += 1;
      await page.waitForTimeout(30);
    } catch {
      /* element may have unmounted (popover closed) — skip */
    }
  }
  return errors;
}

export {expect} from '@playwright/test';
export { AxeBuilder };