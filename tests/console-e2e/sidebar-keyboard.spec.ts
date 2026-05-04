/**
 * Sidebar keyboard accessibility regression test.
 *
 * The workspace sidebar uses <div onClick> for navigation items. Without
 * role/tabIndex/keyboard handler these items are inert for keyboard-only
 * users — a WCAG 2.1.1 (Keyboard) violation. This test asserts each item
 * is reachable via Tab, declares button semantics, and routes on
 * Enter / Space.
 */
import { test, expect } from './_helpers';

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

test('workspace sidebar items expose button semantics', async ({ openConsole }) => {
  const page = await openConsole();
  for (const label of WORKSPACE_ITEMS) {
    const item = page.locator('.sb__nav .sb__item', { hasText: label }).first();
    await expect(item, `${label} role`).toHaveAttribute('role', 'button');
    await expect(item, `${label} tabindex`).toHaveAttribute('tabindex', '0');
  }
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
