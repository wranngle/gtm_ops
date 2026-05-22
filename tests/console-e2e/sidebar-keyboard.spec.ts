/**
 * Sidebar keyboard accessibility regression test.
 *
 * Core sidebar affordances are native links. That keeps route semantics
 * inspectable while avoiding a dense pile of button-like controls.
 */
import { test, expect } from './helpers.js';

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

const DEFAULT_CONSOLE_NAV_ITEMS = [
  'Mission Control',
  'Generate',
  'Pipeline',
  'Calls',
  'Proposals',
  'Evals',
  'Agents',
  'Sales Coach',
  'Sarah · Intake',
  'Funnel',
  'Simulator',
  'Follow-up email',
  'Verticals',
  'Replay',
  'Settings',
];

test('workspace sidebar items are native links', async ({ openConsole }) => {
  const page = await openConsole();
  for (const label of WORKSPACE_ITEMS) {
    const item = page.locator('.sb__nav .sb__item', { hasText: label }).first();
    await expect(item, `${label} tag`).toHaveJSProperty('tagName', 'A');
    await expect(item, `${label} href`).toHaveAttribute('href', /\?route=/);
    await expect(item, `${label} explicit role`).not.toHaveAttribute('role');
    await expect(item, `${label} custom tabindex`).not.toHaveAttribute('tabindex');
  }
});

test('sidebar account footer is a native link', async ({ openConsole }) => {
  const page = await openConsole();
  const footer = page.locator('.sb__footer');
  await expect(footer).toHaveJSProperty('tagName', 'A');
  await expect(footer).toHaveAttribute('href', /\?route=settings/);
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
    await expect(page.getByRole('link', { name: new RegExp(`^${label}(?: \\d+)?$`) })).toBeVisible();
  }

  await expect(page.getByRole('link', { name: /^Sales Coach global$/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Sarah · Intake pipeline$/ })).toBeVisible();
});

test('sidebar keeps every default console route above the account footer on laptop height', async ({ openConsole, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openConsole();

  const layout = await page.evaluate((labels) => {
    const footer = document.querySelector('.sb__footer')?.getBoundingClientRect();
    const content = document.querySelector('.sb__content') as HTMLElement | null;
    const items = labels.map(label => {
      const button = [...document.querySelectorAll('.sb__content .sb__item')]
        .find(element => (element.textContent || '').replace(/\s+/g, ' ').trim().includes(label));
      const box = button?.getBoundingClientRect();
      return {
        bottom: box?.bottom ?? 0,
        label,
        top: box?.top ?? 0,
        visible: Boolean(box && footer && box.top >= 0 && box.bottom <= footer.top - 1),
      };
    });
    return {
      contentClientHeight: content?.clientHeight ?? 0,
      contentScrollHeight: content?.scrollHeight ?? 0,
      footerTop: footer?.top ?? 0,
      items,
    };
  }, DEFAULT_CONSOLE_NAV_ITEMS);

  expect(
    layout.contentScrollHeight,
    `default sidebar nav should not require chrome scrolling at 1280x720: ${JSON.stringify(layout)}`,
  ).toBeLessThanOrEqual(layout.contentClientHeight + 1);
  expect(
    layout.items.filter(item => !item.visible),
    `sidebar items clipped behind the account footer: ${JSON.stringify(layout)}`,
  ).toEqual([]);
});
