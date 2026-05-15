/**
 * Light-theme color-contrast — WCAG 2.1 AA. The default route a11y
 * suite (routes.spec.ts) disables this rule because it is noisy under
 * babel-standalone. Here we re-enable it explicitly for the light theme
 * and assert zero AA failures on the routes a brand-new visitor can hit.
 */
import { test, expect } from './helpers.js';
 
import AxeBuilderImport from '@axe-core/playwright';

const AxeBuilder = (AxeBuilderImport as any).default ?? AxeBuilderImport;

const ROUTES = [
  ['home', 'Mission Control'],
  ['pipeline', 'Pipeline'],
  ['calls', 'Calls'],
  ['proposals', 'Proposals'],
  ['evals', 'Evals'],
  ['agents', 'Agents'],
  ['settings', 'Settings'],
] as const;

for (const [id, label] of ROUTES) {
  test(`light theme color-contrast · ${id}`, async ({ openConsole }) => {
    const page = await openConsole();
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.locator(`.sb__item:has-text("${label}")`).first().click();
    await page.waitForTimeout(150);
    const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    if (r.violations.length > 0) {
      const summary = r.violations.flatMap((v: any) =>
        v.nodes.map((n: any) => `${v.id} :: ${n.target.join(' ')} (${(n.failureSummary || '').slice(0, 80)})`),
      );
      console.log(`light contrast fails on ${id}:`, summary);
    }
    expect(r.violations).toEqual([]);
  });
}
