/**
 * a11y regression for the remaining static dashboard (/eval-runs/).
 * /evaluation/ is only a compatibility redirect into /console/?route=evals,
 * so its behavior is covered in evaluation-flow.spec.ts.
 */
import { test, expect } from './_helpers.js';
 
import AxeBuilderImport from '@axe-core/playwright';

const AxeBuilder = (AxeBuilderImport as any).default ?? AxeBuilderImport;

const PATHS = ['/eval-runs/'];

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
