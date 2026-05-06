/**
 * /evaluation/ is now only a compatibility entrypoint. The actual Evals
 * dashboard lives inside /console so it inherits the shell, ElevenLabs lab,
 * command bridge, and operator context instead of acting like a bolted-on app.
 */
import { test, expect } from './_helpers.js';

test.describe('/evaluation/ console bridge', () => {
  test('redirects into the native console Evals route', async ({ page }) => {
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/evaluation/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });

    await expect(page).toHaveURL(/\/console\/\?route=evals$/);
    await expect(page.locator('.tb__crumb--active')).toContainText('Evals');
    await expect(page.locator('.ph__title')).toContainText('Evals');
    await expect(page.locator('[data-testid="eval-run-plan-summary"]')).toBeVisible();
    await expect(page.locator('.eval-convai-frame')).toBeVisible();
    await expect(page.locator('h1', { hasText: /^Evaluation Dashboard$/ })).toHaveCount(0);
  });

  test('public landing links point at console Evals, not the legacy dashboard', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('a[href="/evaluation/"]')).toHaveCount(0);
    for (const link of await page.locator('a', { hasText: /Evals|Evals dashboard/i }).all()) {
      await expect(link).toHaveAttribute('href', '/console/?route=evals');
    }
  });
});
