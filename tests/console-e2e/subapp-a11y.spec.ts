/**
 * a11y regression for the static dashboards (/evaluation/ and
 * /eval-runs/). They live outside the React console but are linked
 * from the sitemap and from the Evals route header, so visitors will
 * land on them. Asserts axe finds zero violations (color-contrast
 * disabled — fonts.googleapis.com timing makes that probe noisy when
 * the dashboards are still loading their data).
 */
import { test, expect } from './_helpers.js';
 
import AxeBuilderImport from '@axe-core/playwright';

const AxeBuilder = (AxeBuilderImport as any).default ?? AxeBuilderImport;

const PATHS = ['/evaluation/', '/eval-runs/'];

for (const path of PATHS) {
  test(`subapp a11y · ${path} (no critical/serious violations)`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const r = await new AxeBuilder({ page }).analyze();
    const blocking = r.violations.filter((v: any) =>
      v.impact === 'critical' || v.impact === 'serious',
    );
    if (blocking.length > 0) {
      console.log(
        `${path} blocking violations:`,
        blocking.map((v: any) => `${v.id} (${v.impact}) — ${v.nodes.length}`),
      );
    }
    expect(blocking).toEqual([]);
  });

  test(`subapp a11y · ${path} has a single <main> landmark`, async ({ page }) => {
    await page.goto(path);
    const mainCount = await page.locator('main').count();
    expect(mainCount).toBe(1);
  });
}

test('/evaluation/ filter selects have accessible names', async ({ page }) => {
  await page.goto('/evaluation/');
  for (const id of ['filter-status', 'filter-version', 'filter-search']) {
    const el = page.locator(`#${id}`);
    const ariaLabel = await el.getAttribute('aria-label');
    const labelFor = await page.locator(`label[for="${id}"]`).count();
    expect(
      Boolean(ariaLabel) || labelFor > 0,
      `${id} has neither aria-label nor associated <label>`,
    ).toBe(true);
  }
});
