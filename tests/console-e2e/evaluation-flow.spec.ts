/**
 * /evaluation/ subapp data flow — symmetric to eval-runs-links.spec.ts
 * but for the per-run detail click flow. Verifies the page loads stats,
 * runs table, flaw chart, and that clicking a row opens a detail panel
 * populated from the demo-mode-shimmed /api/eval/runs/{id} fixture.
 */
import { test, expect } from './_helpers.js';

test.describe('/evaluation/ data flow', () => {
  test('initial paint renders stats grid + runs table + flaw chart', async ({ page }) => {
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/evaluation/');
    await page.waitForLoadState('networkidle');
    // Stats: 5 cards each with a .label and .value.
    await expect(page.locator('#stats-grid .stat-card')).toHaveCount(5);
    const values = await page.locator('#stats-grid .value').allTextContents();
    expect(values.every((v) => v && v !== '--')).toBe(true);
    // Runs table: at least one row populated.
    await expect(page.locator('#runs-table tr')).not.toHaveCount(0);
    // Flaw chart: rendered with real items, not the empty placeholder.
    await expect(page.locator('#flaw-chart')).not.toContainText(/no evaluation data yet/i);
    expect(await page.locator('#flaw-chart > *').count()).toBeGreaterThan(0);
  });

  test('clicking a run row opens the detail panel with axis scores', async ({ page }) => {
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/evaluation/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    await page.locator('#runs-table tr').first().click();
    const panel = page.locator('#detail-panel');
    await expect(panel).toHaveClass(/open/, { timeout: 3000 });
    // Detail content should include real fields — the case id, status, scores object.
    const content = page.locator('#detail-content');
    await expect(content).toContainText(/case:/i);
    await expect(content).toContainText(/status:/i);
    await expect(content).toContainText(/score/i);
  });

  test('filter selects narrow the runs table without errors', async ({ page }) => {
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/evaluation/');
    await page.waitForLoadState('networkidle');
    const all = await page.locator('#runs-table tr').count();
    expect(all).toBeGreaterThan(0);
    // Status filter to "completed" / "failed" / back to all.
    await page.locator('#filter-status').selectOption('completed');
    await page.waitForTimeout(200);
    const afterCompleted = await page.locator('#runs-table tr').count();
    expect(afterCompleted).toBeLessThanOrEqual(all);
    await page.locator('#filter-status').selectOption('');
    await page.waitForTimeout(200);
    expect(await page.locator('#runs-table tr').count()).toBe(all);
  });
});
