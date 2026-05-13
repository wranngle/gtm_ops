/**
 * Per-route surface tests: every nav target renders, has a unique title,
 * and reports zero serious/critical axe-core violations.
 */
import { test, expect, seriousAxeViolations } from './helpers.js';

const ROUTES = [
  { id: 'home',      label: 'Callbacks',       titleHint: /Callbacks/i },
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
      const main = page.locator('main[aria-labelledby="console-page-title"]');
      await expect(main, `${route.id} should expose the route content as the main landmark`).toHaveCount(1);

      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1, `${route.id} should expose its visual page title as the single h1`).toHaveCount(1);
      await expect(h1).toHaveAttribute('id', 'console-page-title');
      await expect(h1).toContainText(route.titleHint, { timeout: 5000 });
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

test('route · Callbacks stat render does not leave navigation on a stale page body', async ({ openConsole }) => {
  const page = await openConsole();
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Callbacks/i);

  await page.evaluate(() => {
    (window as any).proposalAmountToThousands = undefined;
    (window as any).formatProposalTotal = undefined;
  });
  await page.getByRole('button', { name: /^7D$/i }).click();
  await expect(page.locator('[data-testid="mission-stats"]')).toHaveAttribute('data-range', 'week');

  await page.locator('.sb__item:has-text("Calls")').first().click();
  await expect(page.locator('.tb__crumb--active')).toContainText('Calls');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Calls/i);
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText(/Callbacks/i);
  expect(pageErrors).toEqual([]);
});

test('route · navigation resets the main scroller instead of landing mid-page', async ({ openConsole }) => {
  const page = await openConsole();
  const main = page.locator('main.scroll');

  await page.locator('.sb__item:has-text("Evals")').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Evals/i);
  await main.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect.poll(async () => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);

  await page.locator('.sb__item:has-text("Agents")').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Agents/i);
  await expect.poll(async () => main.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.locator('.page').first()).toBeInViewport();
});

/* Page wrapper margin/padding consistency.
 *
 * Every route's `.page` wrapper must use the canonical token-driven padding
 * — no inline `style="padding: ..."` overrides — so the left edge of content
 * lines up identically across the whole console regardless of which page
 * the operator lands on. `.page--evals` and `.page--generate` are wide-canvas
 * variants that intentionally bump padding, so we accept either canonical
 * value but reject anything in between (which is always drift).
 */
const CANONICAL_LEFT_PADS = new Set(['28px', '34px']);
for (const route of ROUTES) {
  test(`route · ${route.id} uses the canonical .page padding (no inline overrides)`, async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator(`.sb__item:has-text("${route.label}")`).first().click();
    const wrapper = page.locator('.page').first();
    await expect(wrapper).toBeVisible({ timeout: 5000 });

    const inlinePad = await wrapper.evaluate((el) => (el as HTMLElement).style.padding);
    expect(inlinePad, `${route.id} has an inline padding override on .page`).toBe('');

    const inlineMaxWidth = await wrapper.evaluate((el) => (el as HTMLElement).style.maxWidth);
    expect(inlineMaxWidth, `${route.id} has an inline max-width override on .page`).toBe('');

    const leftPad = await wrapper.evaluate((el) => getComputedStyle(el).paddingLeft);
    expect(CANONICAL_LEFT_PADS.has(leftPad), `${route.id} computed paddingLeft=${leftPad}; expected one of ${[...CANONICAL_LEFT_PADS].join(', ')}`).toBe(true);
  });
}

for (const route of ROUTES) {
  test(`route · ${route.id} keeps horizontal scroll inside local widgets`, async ({ page, openConsole }) => {
    await page.setViewportSize({ width: 1366, height: 850 });
    const consolePage = await openConsole();
    await consolePage.locator(`.sb__item:has-text("${route.label}")`).first().click();
    await expect(consolePage.locator('.page').first()).toBeVisible({ timeout: 5000 });

    const overflow = await consolePage.locator('.scroll').first().evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
    }));
    expect(
      overflow.scrollWidth,
      `${route.id} leaked horizontal scroll to the page scroller`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
}
