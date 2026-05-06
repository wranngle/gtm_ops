/**
 * Settings tab a11y — every form field inside every tab panel must
 * have an accessible name. Tabs themselves were fixed in tick 16; this
 * spec covers the form fields inside the panels (selects, inputs,
 * switches, etc.) which are the next layer down.
 */
import { test, expect } from './_helpers.js';
 
import AxeBuilderImport from '@axe-core/playwright';

const AxeBuilder = (AxeBuilderImport as any).default ?? AxeBuilderImport;

const TABS = ['Integrations', 'Eval policy', 'Team', 'Billing', 'Account', 'Security'] as const;

for (const tab of TABS) {
  test(`settings · ${tab} tab has zero blocking a11y violations`, async ({ openConsole }) => {
    const page = await openConsole();
    await page.locator('.sb__item:has-text("Settings")').first().click();
    await page.locator(`.settings-nav__item:has-text("${tab}")`).click();
    await page.waitForTimeout(150);
    const r = await new AxeBuilder({ page }).analyze();
    const blocking = r.violations.filter(
      (v: any) => v.impact === 'critical' || v.impact === 'serious',
    );
    if (blocking.length > 0) {
      const summary = blocking.flatMap((v: any) =>
        v.nodes.map((n: any) => `${v.id} :: ${n.target.join(' ')}`),
      );
       
      console.log(`${tab} blocking:`, summary);
    }
    expect(blocking).toEqual([]);
  });
}

test('Eval policy form inputs are all labelled (aria-labelledby points at field__label)', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Settings")').first().click();
  await page.locator('.settings-nav__item:has-text("Eval policy")').click();
  // Every input.input under the panel should have a non-empty accessible name.
  const inputs = page.locator('[role="tabpanel"] input.input');
  const count = await inputs.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const accessibleName = await inputs.nth(i).evaluate((el) => {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;
      const labelledby = el.getAttribute('aria-labelledby');
      if (labelledby) {
        const ids = labelledby.split(/\s+/);
        return ids.map((id) => document.querySelector(`#${CSS.escape(id)}`)?.textContent || '').join(' ').trim();
      }
      const id = el.getAttribute('id');
      if (id) {
        const lbl = document.querySelector(`label[for="${id}"]`);
        if (lbl) return lbl.textContent || '';
      }
      return '';
    });
    expect(accessibleName.trim().length, `input #${i + 1} has no accessible name`).toBeGreaterThan(0);
  }
});
