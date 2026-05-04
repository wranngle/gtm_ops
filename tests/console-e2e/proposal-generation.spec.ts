/**
 * Proposal generation flow — exercise the Generate page UI end-to-end:
 *   - Auto-Sample populates the textarea with the Acme HVAC fixture
 *   - Initialize Sequence is gated on input
 *   - Submitting fires a POST /api/generate (caught by the demo fetch shim)
 */
import { test, expect } from './_helpers.js';

test('Generate page · auto-sample populates input', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  const textarea = page.locator('.split--2 textarea').first();
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveValue('');
  await page.locator('.btn:has-text("Auto-Sample")').click();
  // Either the fixture loads, or the canned fallback sets the same Acme HVAC string.
  await expect(textarea).toHaveValue(/HVAC|Acme|CLIENT:/, { timeout: 5_000 });
});

test('Generate page · empty input shows critical toast', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  await page.locator('.btn--primary:has-text("Initialize Sequence")').click();
  await expect(page.locator('.toast').first()).toContainText(/Input required/i);
});

test('Generate page · sequence init dispatches the pipeline', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  await page.locator('.btn:has-text("Auto-Sample")').click();
  await page.waitForTimeout(200);
  // The demo-mode fetch shim short-circuits /api POSTs, so we patch fetch
  // AFTER the page loads (re-wrapping the shim itself) to capture the call.
  await page.evaluate(() => {
    // @ts-expect-error window-injected
    globalThis.__seenApiGenerate = [];
    const orig = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async function (input: any, init: any) {
      const url = typeof input === 'string' ? input : (input?.url) || '';
      const method = ((init?.method) || (input?.method) || 'GET').toUpperCase();
      if (url.includes('/api/generate') && method === 'POST') {
        // @ts-expect-error window-injected
        globalThis.__seenApiGenerate.push(url);
      }
      return orig(input, init);
    } as any;
  });
  await page.locator('.btn--primary:has-text("Initialize Sequence")').click();
  await expect(page.locator('.toast').first()).toContainText(/Sequence Initializing/i);
  const seen = await page.evaluate(() => (globalThis as any).__seenApiGenerate || []);
  expect(seen.length, 'POST /api/generate should fire from handleGenerate').toBeGreaterThan(0);
});

test('Generate page · live console panel mounts', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  await expect(page.locator('.console-panel')).toBeVisible();
  await expect(page.locator('.console-panel__hd')).toContainText(/pipeline\.stream/);
});
