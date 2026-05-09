/**
 * /evaluation/ is now only a compatibility entrypoint. The actual Evals
 * dashboard lives inside /console so it inherits the shell, ElevenLabs lab,
 * command bridge, and operator context instead of acting like a bolted-on app.
 */
import { test, expect } from './helpers.js';

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

  test('compatibility document is only a redirect bridge, not a second dashboard', async ({ request }) => {
    const response = await request.get('/evaluation/');
    expect(response.ok()).toBe(true);

    const html = await response.text();
    expect(html).toContain('/console/?route=evals');
    expect(html).not.toContain('Evaluation Dashboard');
    expect(html).not.toContain('filter-version');
    expect(html).not.toContain('runs-table');
  });

  test('global coach launcher does not cover the local eval run plan', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.route('**/unpkg.com/@elevenlabs/**', async (route) => route.abort('blockedbyclient'));
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/?route=evals', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });

    const launcher = page.locator('.coach-launcher');
    const runPlan = page.locator('[data-testid="eval-run-plan-summary"]');
    await expect(launcher).toBeVisible();
    await expect(runPlan).toBeVisible();

    const overlaps = await page.evaluate(() => {
      const a = document.querySelector('.coach-launcher')?.getBoundingClientRect();
      const b = document.querySelector('[data-testid="eval-run-plan-summary"]')?.getBoundingClientRect();
      if (!a || !b) return true;
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    });
    expect(overlaps, 'global coach launcher must not obscure the eval run-plan summary').toBe(false);
  });

  test('run detail labels prompt and harness metadata instead of exposing a bare version chip', async ({ page }) => {
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/?route=evals', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });

    const meta = page.locator('.eval-meta-strip').first();
    await expect(meta).toBeVisible();
    await expect(meta).toContainText(/scenario\s*[a-z0-9-]+/i);
    await expect(meta).toContainText(/prompt\s*prompt\/sewy\/v/i);
    await expect(meta).toContainText(/harness\s*0\.0\.1/i);

    const chips = (await meta.locator('> .mono').allTextContents()).map(text => text.trim());
    expect(chips).not.toContain('0.0.1');
  });

  test('run rows use readable scenario titles while preserving raw scenario ids', async ({ page }) => {
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/?route=evals', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });

    const firstRun = page.locator('.eval-run-row').first();
    await expect(firstRun.locator('.eval-run-row__title')).toHaveText('Multi Turn Tool Loop');
    await expect(firstRun.locator('[data-testid="eval-run-row-scenario-id"]')).toContainText('scenario multi-turn-tool-loop');
    await expect(firstRun.locator('.eval-run-row__title')).not.toContainText('multi-turn-tool-loop');

    await firstRun.click();
    await expect(page.locator('.card__title:has-text("run detail")').first()).toContainText('Multi Turn Tool Loop');
    await expect(page.locator('.eval-meta-strip').first()).toContainText(/scenario\s*multi-turn-tool-loop/i);
  });
});
