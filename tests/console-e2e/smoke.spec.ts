/**
 * Console-wide smoke-click sweep. Visits every route, clicks every visible
 * button, and asserts no uncaught page errors fire.
 */
import { test, expect, smokeClickAll } from './helpers.js';

const ROUTES = ['home', 'pipeline', 'calls', 'proposals', 'evals', 'agents', 'settings'];
const LABELS: Record<string, string> = {
  home: 'Mission Control',
  pipeline: 'Pipeline',
  calls: 'Calls',
  proposals: 'Proposals',
  evals: 'Evals',
  agents: 'Agents',
  settings: 'Settings',
};

for (const route of ROUTES) {
  test(`smoke-click · ${route}`, async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator(`.sb__item:has-text("${LABELS[route]}")`).first().click();
    await page.waitForTimeout(200);

    const errors = await smokeClickAll(page);
    expect(errors, `errors on ${route}: ${errors.join(' | ')}`).toEqual([]);
  });
}

test('agent context rebuilds when selection changes', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Pipeline")').first().click();
  await page.locator('.pipe__card').first().click();
  const ctxAfter = await page.evaluate(() => (globalThis as any).buildAgentContext((globalThis as any).AppContext.get()));
  expect(ctxAfter).toMatch(/active_lead|selection\.type/);
});

test('AppContext route stays in sync with sidebar nav', async ({ openConsole }) => {
  const page = await openConsole();
  for (const r of ROUTES) {
    await page.locator(`.sb__item:has-text("${LABELS[r]}")`).first().click();
    const route = await page.evaluate(() => (globalThis as any).AppContext.get().route);
    expect(route).toBe(r);
  }
});
