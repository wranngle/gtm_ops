/**
 * Dark-theme color-contrast — WCAG 2.1 AA. Symmetric to
 * light-theme-contrast.spec.ts. Re-enables axe color-contrast (which
 * the default route a11y suite disables for noise) on every route in
 * dark theme and asserts zero AA failures.
 */
import { test, expect } from './_helpers.js';
 
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
  test(`dark theme color-contrast · ${id}`, async ({ openConsole }) => {
    const page = await openConsole();
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.locator(`.sb__item:has-text("${label}")`).first().click();
    await page.waitForTimeout(150);
    const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    if (r.violations.length > 0) {
      const summary = r.violations.flatMap((v: any) =>
        v.nodes.map((n: any) => `${v.id} :: ${n.target.join(' ')} (${(n.failureSummary || '').slice(0, 80)})`),
      );
      console.log(`dark contrast fails on ${id}:`, summary);
    }
    expect(r.violations).toEqual([]);
  });
}
