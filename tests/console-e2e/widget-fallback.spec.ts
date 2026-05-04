/**
 * ElevenLabs widget unreachability fallback — when unpkg.com is blocked
 * (corporate network, strict CSP, etc.) the embed script never registers
 * the <elevenlabs-convai> custom element. Without a fallback the user
 * sees an empty 600×500 box with no explanation. This spec routes the
 * unpkg request to abort and asserts the fallback message + deep link
 * render with proper a11y semantics.
 */
import { test, expect } from './_helpers.js';

test.describe('widget unreachability fallback', () => {
  test('Agents page shows fallback when unpkg is blocked', async ({ page }) => {
    await page.route('**/unpkg.com/@elevenlabs/**', async (route) => route.abort('blockedbyclient'));
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/');
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 15_000 });
    await page.locator('.sb__item:has-text("Agents")').first().click();
    // The fallback fires after a 5s timeout; allow up to 8s with margin.
    await expect(page.locator('.convai-mount--unreachable')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.convai-mount--unreachable')).toHaveAttribute('role', 'alert');
    await expect(page.locator('.convai-fallback__title')).toContainText(/widget unreachable/i);
    // Deep link to the agent on elevenlabs.io with the right agent_id.
    const link = page.locator('.convai-mount--unreachable a[href*="elevenlabs.io"]');
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href, 'fallback link should target the active agent').toMatch(/agent_/);
  });

  test('coach dock shows fallback when unpkg is blocked', async ({ page }) => {
    await page.route('**/unpkg.com/@elevenlabs/**', async (route) => route.abort('blockedbyclient'));
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/');
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 15_000 });
    await page.locator('.coach-launcher').click();
    await expect(page.locator('.coach-dock .convai-mount--unreachable')).toBeVisible({ timeout: 8_000 });
  });

  test('loading state renders before either ready or fallback fires', async ({ page }) => {
    // Slow the unpkg script enough that the loading state shows briefly.
    await page.route('**/unpkg.com/@elevenlabs/**', async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    });
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/');
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 15_000 });
    await page.locator('.sb__item:has-text("Agents")').first().click();
    // Either we see the loading marker, or the widget already loaded; both are healthy.
    const loadingOrReady = await page.evaluate(() =>
      Boolean(
        document.querySelector('.convai-mount--loading') ||
          document.querySelector('elevenlabs-convai'),
      ),
    );
    expect(loadingOrReady).toBe(true);
  });
});
