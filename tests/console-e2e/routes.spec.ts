/**
 * Per-route surface tests: every nav target renders, has a unique title,
 * and reports zero serious/critical axe-core violations.
 */
import { test, expect, seriousAxeViolations } from './_helpers.js';

const ROUTES = [
  { id: 'home',      label: 'Mission Control', titleHint: /Mission Control/i },
  { id: 'pipeline',  label: 'Pipeline',        titleHint: /Pipeline/i },
  { id: 'calls',     label: 'Calls',           titleHint: /Calls/i },
  { id: 'proposals', label: 'Proposals',       titleHint: /Proposals/i },
  { id: 'evals',     label: 'Evals',           titleHint: /Evals/i },
  { id: 'agents',    label: 'Agents',          titleHint: /Agents/i },
  { id: 'settings',  label: 'Settings',        titleHint: /Settings/i },
  { id: 'generate',  label: 'Generate',        titleHint: /Generate Proposal/i },
];

for (const route of ROUTES) {
  test(`route · ${route.id} renders + a11y baseline`, async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator(`.sb__item:has-text("${route.label}")`).first().click();
    // The route content should mount.
    await expect(page.locator('.page').first()).toBeVisible({ timeout: 5000 });
    // Page header title is the strongest signal the route mounted.
    if (route.titleHint) {
      await expect(page.locator('.ph__title').first()).toContainText(route.titleHint, { timeout: 5000 });
    }
    // Topbar breadcrumb reflects the route.
    await expect(page.locator('.tb__crumb--active')).toContainText(route.label, { timeout: 5000 });

    const violations = await seriousAxeViolations(page);
    if (violations.length > 0) {
      console.log(`a11y violations on ${route.id}:`,
        violations.map((v: { id: string; impact?: string; nodes: unknown[] }) => `${v.id} (${v.impact}) — ${v.nodes.length} nodes`));
    }
    expect(violations).toEqual([]);
  });
}
