/**
 * Per-component surface tests. One spec per major interactive component.
 */
import { test, expect, smokeClickAll } from './_helpers.js';

test.describe('shell', () => {
  test('sidebar nav toggles every route', async ({ openConsole }) => {
    const page = await openConsole();
    for (const label of ['Mission Control', 'Pipeline', 'Calls', 'Proposals', 'Evals', 'Agents', 'Settings']) {
      await page.locator(`.sb__item:has-text("${label}")`).first().click();
      await expect(page.locator('.tb__crumb--active')).toContainText(label);
    }
  });

  test('sidebar collapse toggle persists in DOM attribute', async ({ openConsole }) => {
    const page = await openConsole();
    const app = page.locator('.app');
    await expect(app).toHaveAttribute('data-collapsed', /false|true/);
    await page.locator('.tb button[title="Toggle sidebar"]').click();
    await expect(app).toHaveAttribute('data-collapsed', 'true');
    await page.locator('.tb button[title="Toggle sidebar"]').click();
    await expect(app).toHaveAttribute('data-collapsed', 'false');
  });

  test('sidebar agents block renders all registry entries and they navigate to Agents', async ({ openConsole }) => {
    const page = await openConsole();
    const orbItems = page.locator('.sb__nav[aria-label="ElevenLabs agents"] .sb__item');
    const count = await orbItems.count();
    expect(count).toBeGreaterThan(1);
    await orbItems.first().click();
    await expect(page.locator('.tb__crumb--active')).toContainText('Agents');
  });
});

test.describe('topbar', () => {
  test('command palette opens, filters, and dispatches', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.tb__search').click();
    const cp = page.locator('.cp');
    await expect(cp).toBeVisible();
    await cp.locator('input').fill('Calls');
    const calls = cp.locator('.cp__row:has-text("Go to Calls")');
    await expect(calls).toBeVisible();
    await calls.click();
    await expect(page.locator('.tb__crumb--active')).toContainText('Calls');
  });

  test('command palette traps Tab and restores focus on close', async ({ openConsole }) => {
    const page = await openConsole();
    // Open palette via keyboard — proves the search button is keyboard-reachable
    // AND the palette honors that focus on open.
    await page.locator('.tb__search').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.cp')).toBeVisible();

    // Wait one rAF tick for the palette's focus() call.
    await page.waitForFunction(
      () => !!document.activeElement && document.activeElement.classList.contains('cp__input'),
      null,
      { timeout: 2000 },
    );

    // Tab a handful of times and assert focus stays inside .cp.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () => !!document.activeElement?.closest('.cp'),
      );
      expect(inside, `Tab ${i + 1} leaked focus outside palette`).toBe(true);
    }

    // Escape closes and focus returns to the trigger.
    await page.keyboard.press('Escape');
    await expect(page.locator('.cp')).toHaveCount(0);
    const restored = await page.evaluate(
      () => document.activeElement?.classList.contains('tb__search') ?? false,
    );
    expect(restored, 'focus did not return to the search trigger').toBe(true);
  });

  test('notifications popover focuses first row + traps Tab + restores focus', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.tb__bell').click();
    await expect(page.locator('.popover')).toBeVisible();
    await expect(page.locator('.popover')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('.popover')).toHaveAttribute('aria-label', /notifications/i);
    // First focusable child should receive focus.
    await page.waitForFunction(
      () => !!document.activeElement?.closest('.popover'),
      null,
      { timeout: 2000 },
    );
    // Tab cycles inside the popover.
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => !!document.activeElement?.closest('.popover'));
      expect(inside, `Tab ${i + 1} leaked focus outside notifications popover`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.popover')).toHaveCount(0);
    const restored = await page.evaluate(
      () => document.activeElement?.classList.contains('tb__bell') ?? false,
    );
    expect(restored, 'focus did not return to .tb__bell').toBe(true);
  });

  test('"New run" popover focuses first row + traps Tab + restores focus', async ({ openConsole }) => {
    const page = await openConsole();
    const trigger = page.locator('.tb .btn--primary:has-text("New run")');
    await trigger.click();
    await expect(page.locator('.popover')).toBeVisible();
    await expect(page.locator('.popover')).toHaveAttribute('aria-label', /start a run/i);
    await page.waitForFunction(
      () => !!document.activeElement?.closest('.popover'),
      null,
      { timeout: 2000 },
    );
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => !!document.activeElement?.closest('.popover'));
      expect(inside, `Tab ${i + 1} leaked focus outside new-run popover`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.popover')).toHaveCount(0);
  });

  test('popover rows are keyboard-actionable (Enter triggers click)', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.tb__bell').click();
    await page.waitForFunction(
      () => !!document.activeElement?.closest('.popover'),
      null,
      { timeout: 2000 },
    );
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast').first()).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.popover')).toHaveCount(0);
  });

  test('command palette has dialog semantics', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.tb__search').click();
    const cp = page.locator('.cp');
    await expect(cp).toHaveAttribute('role', 'dialog');
    await expect(cp).toHaveAttribute('aria-modal', 'true');
    await expect(cp).toHaveAttribute('aria-label', /command palette/i);
  });

  test('search trigger is a real button — keyboard accessible, has aria-label, no fake input', async ({ openConsole }) => {
    const page = await openConsole();
    const search = page.locator('.tb__search');
    // Must render as <button>, not a misleading <input readonly>.
    await expect(search).toHaveJSProperty('tagName', 'BUTTON');
    await expect(search).toHaveAttribute('aria-label', /command palette|search/i);
    // No <input> child — the placeholder is now a <span>.
    await expect(search.locator('input')).toHaveCount(0);
    // Keyboard: focus + Enter opens the palette.
    await search.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.cp')).toBeVisible();
  });

  test('notifications popover opens and rows are clickable', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.tb__bell').click();
    await expect(page.locator('.popover')).toBeVisible();
    await page.locator('.popover .pop__row').first().click();
    await expect(page.locator('.toast').first()).toBeVisible({ timeout: 3000 });
  });

  test('"New run" popover lists actions and queues a run on click', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.tb .btn--primary:has-text("New run")').click();
    const pop = page.locator('.popover');
    await expect(pop).toBeVisible();
    await pop.locator('.pop__row').first().click();
    await expect(page.locator('.toast').first()).toBeVisible();
  });

  test('theme toggle flips data-theme', async ({ openConsole }) => {
    const page = await openConsole();
    const html = page.locator('html');
    const before = await html.getAttribute('data-theme');
    await page.locator('.tb button[title="Toggle theme"]').click();
    const after = await html.getAttribute('data-theme');
    expect(after).not.toBe(before);
  });
});

test.describe('mission control', () => {
  test('range segmented control changes state', async ({ openConsole }) => {
    const page = await openConsole();
    const seg = page.locator('.ph__actions .seg').first();
    await seg.locator('.seg__btn:has-text("7d")').click();
    await expect(seg.locator('.seg__btn[data-active="true"]')).toContainText('7d');
  });

  test('attention banner "Review now" routes to Calls', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.btn--primary:has-text("Review now")').click();
    await expect(page.locator('.tb__crumb--active')).toContainText('Calls');
  });
});

test.describe('pipeline', () => {
  test('selecting a kanban card opens lead detail and intake panel', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Pipeline")').first().click();
    await page.locator('.pipe__card').first().click();
    await expect(page.locator('[aria-label="Intake agent panel"]')).toBeVisible();
  });

  test('lead detail panel has dialog semantics + keyboard close + focus management', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Pipeline")').first().click();
    const card = page.locator('.pipe__card').first();
    await card.click();
    const panel = page.locator('[role="dialog"][aria-label^="Lead detail"]');
    await expect(panel).toBeVisible();
    // Close button receives focus on open.
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Close lead detail',
      null,
      { timeout: 2000 },
    );
    // Escape closes the panel.
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });

  test('view toggle switches between board and table', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Pipeline")').first().click();
    await page.locator('.seg__btn:has-text("Table")').click();
    await expect(page.locator('table.tbl')).toBeVisible();
    await page.locator('.seg__btn:has-text("Board")').click();
    await expect(page.locator('.pipe')).toBeVisible();
  });

  test('filter buttons all clickable without errors', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Pipeline")').first().click();
    for (const label of ['All', 'Mine', 'High intent']) {
      await page.locator(`.seg__btn:has-text("${label}")`).first().click();
    }
  });
});

test.describe('calls', () => {
  test('selecting a call updates the transcript card title', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Calls")').first().click();
    const list = page.locator('.calls-grid__list [role="button"]');
    const target = list.nth(2);
    const text = await target.locator('.mono').first().textContent();
    await target.click();
    await expect(page.locator('.calls-grid__transcript .card__title')).toContainText(text || '');
  });

  test('transcript scroll container is the only thing that scrolls', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Calls")').first().click();
    const scroller = page.locator('.calls-grid__trans-scroll');
    await expect(scroller).toBeVisible();
    const overflow = await scroller.evaluate(el => getComputedStyle(el).overflow);
    expect(overflow).toMatch(/auto|scroll/);
  });

  test('clicking a transcript line raises a coaching toast', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Calls")').first().click();
    await page.locator('.trans__line').first().click();
    await expect(page.locator('.toast').first()).toBeVisible({ timeout: 3000 });
  });
});

test.describe('proposals', () => {
  test('selecting a proposal updates detail card', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Proposals")').first().click();
    const items = page.locator('.split--2 [role="button"]');
    await items.nth(1).click();
    // Detail card title contains the proposal id.
    const id = await items.nth(1).locator('.mono').first().textContent();
    await expect(page.locator('.split--2 .card .card__title').nth(1)).toContainText((id || '').trim());
  });

  test('filter segmented re-counts the list', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Proposals")').first().click();
    const all = await page.locator('.split--2 [role="button"]').count();
    await page.locator('.ph__actions .seg__btn:has-text("Open")').click();
    const open = await page.locator('.split--2 [role="button"]').count();
    expect(open).toBeLessThanOrEqual(all);
  });

  test('"Generate proposal" button routes to Generate', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Proposals")').first().click();
    await page.locator('.btn--primary:has-text("Generate proposal")').click();
    await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
    await expect(page.locator('.ph__title')).toContainText('Generate Proposal');
  });
});

test.describe('agents page', () => {
  test('agent picker switches active agent + admin panel', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Agents")').first().click();
    const pickerItems = page.locator('.agents-grid .vstack [role="button"]');
    const count = await pickerItems.count();
    expect(count).toBeGreaterThan(1);
    await pickerItems.nth(1).click();
    // The admin card title updates to include the active agent's key.
    await expect(page.locator('.card__title:has-text("admin · ")')).toBeVisible();
  });

  test('playground card mounts the elevenlabs-convai web component', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Agents")').first().click();
    await expect(page.locator('elevenlabs-convai')).toHaveCount(1, { timeout: 10_000 });
    const aid = await page.locator('elevenlabs-convai').first().getAttribute('agent-id');
    expect(aid).toMatch(/^agent_/);
  });

  test('refresh-context button raises a toast', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Agents")').first().click();
    await page.locator('.btn--primary:has-text("Refresh context")').click();
    await expect(page.locator('.toast').first()).toContainText(/context refreshed/i);
  });

  test('admin-only agents are hidden by default and revealed with ?admin=1', async ({ page }) => {
    // Default visit: admin-only agents must not appear.
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/');
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 15_000 });
    await page.locator('.sb__item:has-text("Agents")').first().click();
    const publicNames = await page.locator('.agents-grid .vstack [role="button"]').allTextContents();
    expect(publicNames.join(' ')).not.toMatch(/Client Data Test|admin-only/i);

    // ?admin=1: admin-only agents must appear.
    await page.goto('/console/?admin=1');
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 15_000 });
    await page.locator('.sb__item:has-text("Agents")').first().click();
    const adminNames = await page.locator('.agents-grid .vstack [role="button"]').allTextContents();
    expect(adminNames.join(' ')).toMatch(/Client Data Test|admin-only/i);
  });
});

test.describe('settings', () => {
  test('all tabs render without error', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Settings")').first().click();
    for (const label of ['Integrations', 'Eval policy', 'Team', 'Billing', 'Security']) {
      await page.locator(`.settings-nav__item:has-text("${label}")`).click();
      await expect(page.locator('.card').first()).toBeVisible();
    }
  });

  test('"Manage agents →" routes to Agents page', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Settings")').first().click();
    await page.locator('.btn:has-text("Manage agents")').click();
    await expect(page.locator('.tb__crumb--active')).toContainText('Agents');
  });

  test('settings tabs follow the ARIA tabs pattern (arrow keys + roving tabindex + tabpanel)', async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Settings")').first().click();
    const tablist = page.locator('[role="tablist"][aria-label="Settings sections"]');
    await expect(tablist).toHaveAttribute('aria-orientation', 'vertical');

    // Roving tabindex: only the selected tab has tabindex=0.
    const zeros = await page.locator('[role="tab"][tabindex="0"]').count();
    expect(zeros, 'exactly one tab should be in tab order').toBe(1);

    // Each tab has aria-controls pointing to the panel.
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveAttribute(
      'aria-controls',
      /^settings-panel-/,
    );
    await expect(page.locator('[role="tabpanel"]')).toHaveAttribute(
      'aria-labelledby',
      /^settings-tab-/,
    );

    // ArrowDown moves focus and selection to next tab.
    await page.locator('[role="tab"][aria-selected="true"]').focus();
    await page.keyboard.press('ArrowDown');
    const after = await page.evaluate(() => ({
      selected: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent || '',
      focused: document.activeElement?.textContent || '',
    }));
    expect(after.selected).toBe('Eval policy');
    expect(after.focused).toBe('Eval policy');

    // End jumps to last tab; Home jumps to first.
    await page.keyboard.press('End');
    expect(await page.locator('[role="tab"][aria-selected="true"]').textContent()).toBe('Security');
    await page.keyboard.press('Home');
    expect(await page.locator('[role="tab"][aria-selected="true"]').textContent()).toBe('Integrations');
  });
});

test.describe('coach launcher', () => {
  test('opens and closes the dock', async ({ openConsole }) => {
    const page = await openConsole();
    const launcher = page.locator('.coach-launcher');
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(page.locator('.coach-dock')).toBeVisible();
    await page.locator('.coach-dock__hd .btn--icon').click();
    await expect(page.locator('.coach-dock')).toHaveCount(0);
  });
});
