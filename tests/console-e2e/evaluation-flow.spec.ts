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

  test('command center does not present loading evidence as a ready regression', async ({ page }) => {
    let releaseRuns!: () => void;
    const runsGate = new Promise<void>(resolve => { releaseRuns = resolve; });
    await page.route('**/api/eval-runs', async route => {
      await runsGate;
      await route.continue();
    });

    await page.goto('/console/?route=evals&live=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });

    const center = page.locator('[data-testid="eval-command-center"]');
    await expect(center).toHaveAttribute('data-state', 'loading');
    await expect(center).toContainText(/loading run evidence/i);
    await expect(center.locator('[data-testid="eval-active-regression-review-copy"]')).toContainText(/loading harness run evidence/i);
    await expect(center).not.toContainText(/No failed axes selected/i);
    await expect(center.locator('.badge')).toContainText(/loading/i);

    releaseRuns();
    await expect(center).toHaveAttribute('data-state', 'fail', { timeout: 10_000 });
    await expect(center.locator('[data-testid="eval-active-regression-review-copy"]')).toContainText(/failed judge axis/i);
  });

  test('run plan makes the local artifact and agent-admin review path actionable', async ({ page }) => {
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/?route=evals', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });

    await expect(page.locator('[data-testid="eval-run-plan-summary-path"]')).toContainText(
      /command -> local artifact drawer -> local agent admin/i,
    );

    await page.locator('[data-testid="eval-run-plan-open"]').click();
    const bridge = page.locator('[data-testid="eval-harness-bridge"]');
    await expect(bridge).toBeVisible();
    await page.waitForFunction(() => {
      const actions = document.querySelector('[data-testid="eval-harness-bridge"] .eval-run-plan__actions');
      if (!actions) return false;
      const rect = actions.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
    const reviewPath = bridge.locator('[data-testid="eval-run-plan-review-path"]');
    await expect(reviewPath).toContainText(/Command/i);
    await expect(reviewPath).toContainText(/Artifact review/i);
    await expect(reviewPath).toContainText(/Agent admin/i);
    await expect(bridge.locator('[data-testid="eval-run-plan-open-agent-admin"]')).toBeEnabled();

    await bridge.locator('[data-testid="eval-run-plan-open-artifact"]').click();
    const artifact = page.locator('[data-testid="eval-artifact-panel"]');
    await expect(artifact).toBeVisible();
    await expect(artifact).toContainText(/artifact review packet/i);
    await expect(artifact).toContainText(/run evidence|review evidence/i);
    await expect(artifact.locator('[data-testid="eval-artifact-path"]')).not.toHaveText('');

    await page.locator('[data-testid="eval-header-run-plan-open"]').click();
    await expect(bridge).toBeVisible();
    await bridge.locator('[data-testid="eval-run-plan-open-agent-admin"]').click();
    await expect(page.locator('.tb__crumb--active')).toContainText('Agents');
    await expect(page.locator('[data-testid="agent-eval-handoff-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-eval-handoff-banner"]')).toContainText(/run evidence/i);
    await expect(page.locator('[data-testid="agent-eval-handoff-banner"] a[href*="elevenlabs.io"]')).toHaveCount(0);
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
