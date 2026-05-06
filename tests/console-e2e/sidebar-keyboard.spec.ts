/**
 * Sidebar keyboard accessibility regression test.
 *
 * Core sidebar affordances should be native buttons. That gives keyboard
 * activation, focus semantics, and accessible role mapping without custom
 * div-button plumbing drifting out of sync.
 */
import { test, expect } from './_helpers.js';

const WORKSPACE_ITEMS = [
  'Mission Control',
  'Generate',
  'Pipeline',
  'Calls',
  'Proposals',
  'Evals',
  'Agents',
  'Settings',
];

test('workspace sidebar items are native buttons', async ({ openConsole }) => {
  const page = await openConsole();
  for (const label of WORKSPACE_ITEMS) {
    const item = page.locator('.sb__nav .sb__item', { hasText: label }).first();
    await expect(item, `${label} tag`).toHaveJSProperty('tagName', 'BUTTON');
    await expect(item, `${label} explicit role`).not.toHaveAttribute('role');
    await expect(item, `${label} custom tabindex`).not.toHaveAttribute('tabindex');
  }
});

test('sidebar account footer is a native button', async ({ openConsole }) => {
  const page = await openConsole();
  const footer = page.locator('.sb__footer');
  await expect(footer).toHaveJSProperty('tagName', 'BUTTON');
  await expect(footer).toHaveAttribute('type', 'button');
  await footer.click();
  await expect(page.locator('.tb__crumb--active')).toContainText('Settings');
});

test('Enter activates a sidebar item via keyboard', async ({ openConsole }) => {
  const page = await openConsole();
  const target = page.locator('.sb__nav .sb__item', { hasText: 'Pipeline' }).first();
  await target.focus();
  await page.keyboard.press('Enter');
  await expect(target, 'aria-current after Enter').toHaveAttribute('aria-current', 'page');
});

test('Space activates a sidebar item via keyboard', async ({ openConsole }) => {
  const page = await openConsole();
  const target = page.locator('.sb__nav .sb__item', { hasText: 'Calls' }).first();
  await target.focus();
  await page.keyboard.press(' ');
  await expect(target, 'aria-current after Space').toHaveAttribute('aria-current', 'page');
});

test('collapsed sidebar keeps workspace and agent controls named', async ({ openConsole }) => {
  const page = await openConsole();
  await page.getByRole('button', { name: /Toggle sidebar/i }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-collapsed', 'true');

  for (const label of WORKSPACE_ITEMS) {
    await expect(page.getByRole('button', { name: new RegExp(`^${label}(?: \\d+)?$`) })).toBeVisible();
  }

  await expect(page.getByRole('button', { name: /^Sales Coach global$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sarah · Intake pipeline$/ })).toBeVisible();
});
