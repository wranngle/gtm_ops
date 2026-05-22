/**
 * Settings tab a11y — every form field inside every tab panel must
 * have an accessible name. Tabs themselves were fixed in tick 16; this
 * spec covers the form fields inside the panels (selects, inputs,
 * switches, etc.) which are the next layer down.
 */
import {test, expect, seriousAxeViolations} from './helpers.js';

const tabs = ['Integrations', 'Eval policy', 'Team', 'Billing', 'Account', 'Security'] as const;

for (const tab of tabs) {
	test(`settings · ${tab} tab has zero blocking a11y violations`, async ({openConsole}) => {
		const page = await openConsole();
		await page.locator('.sb__item:has-text("Settings")').first().click();
		await page.locator(`.settings-nav__item:has-text("${tab}")`).click();
		await page.waitForTimeout(150);

		await expect(seriousAxeViolations(page)).resolves.toEqual([]);
	});
}

test('Eval policy form inputs are all labelled (aria-labelledby points at field__label)', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Settings")').first().click();
	await page.locator('.settings-nav__item:has-text("Eval policy")').click();
	// Every input.input under the panel should have a non-empty accessible name.
	const inputs = page.locator('[role="tabpanel"] input.input');
	const count = await inputs.count();
	expect(count).toBeGreaterThan(0);
	const accessibleNames = await inputs.evaluateAll(elements =>
		elements.map(element => {
			const ariaLabel = element.getAttribute('aria-label');
			if (ariaLabel) {
				return ariaLabel;
			}

			const labelledby = element.getAttribute('aria-labelledby');
			if (labelledby) {
				const ids = labelledby.split(/\s+/);
				return ids.map(id => document.querySelector(`#${CSS.escape(id)}`)?.textContent ?? '').join(' ').trim();
			}

			const id = element.getAttribute('id');
			if (id) {
				const lbl = document.querySelector(`label[for="${id}"]`);
				if (lbl) {
					return lbl.textContent ?? '';
				}
			}

			return '';
		}));
	for (const [index, accessibleName] of accessibleNames.entries()) {
		expect(accessibleName.trim().length, `input #${index + 1} has no accessible name`).toBeGreaterThan(0);
	}
});

test('Settings security admin controls are not covered by the global coach launcher', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1366, height: 768});
	await openConsole();
	await page.locator('.sb__item:has-text("Settings")').first().click();
	await page.locator('.settings-nav__item:has-text("Security")').click();

	await expect(page.locator('.coach-launcher')).toBeVisible();
	await expect(page.locator('[data-testid="sec-session-timeout"]')).toBeVisible();
	await expect(page.locator('[data-testid="sec-recovery-codes"]')).toBeVisible();

	const layout = await page.evaluate(() => {
		const rect = (selector: string) => {
			const element = document.querySelector(selector);
			if (!element) {
				return null;
			}

			const box = element.getBoundingClientRect();
			return {
				bottom: box.bottom,
				height: box.height,
				left: box.left,
				right: box.right,
				top: box.top,
				width: box.width,
			};
		};

		const overlaps = (
			a: ReturnType<typeof rect>,
			b: ReturnType<typeof rect>,
		) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
		const launcher = rect('.coach-launcher');
		const label = document.querySelector('.coach-launcher__label');
		return {
			labelDisplay: label ? getComputedStyle(label).display : null,
			launcher,
			overlapsRecoveryCodes: overlaps(launcher, rect('[data-testid="sec-recovery-codes"]')),
			overlapsSessionTimeout: overlaps(launcher, rect('[data-testid="sec-session-timeout"]')),
			overlapsSavePolicy: overlaps(launcher, rect('[data-testid="sec-save"]')),
		};
	});

	expect(layout.launcher, `coach launcher should remain mounted: ${JSON.stringify(layout)}`).not.toBeNull();
	expect(layout.labelDisplay, `Settings has dense admin forms, so the full Coach pill should be compact: ${JSON.stringify(layout)}`).toBe('none');
	expect(layout.launcher!.width, `Settings coach affordance should be compact: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(52);
	expect(layout.launcher!.height, `Settings coach affordance should be compact: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(52);
	expect(layout.overlapsSessionTimeout, `global coach must not cover session timeout: ${JSON.stringify(layout)}`).toBe(false);
	expect(layout.overlapsRecoveryCodes, `global coach must not cover recovery code control: ${JSON.stringify(layout)}`).toBe(false);
	expect(layout.overlapsSavePolicy, `global coach must not cover security save action: ${JSON.stringify(layout)}`).toBe(false);
});

test('Settings account panel stays readable on mobile instead of becoming a horizontal scroll trap', async ({openConsole, page}) => {
	await page.setViewportSize({width: 390, height: 844});
	await openConsole();
	await page.locator('.sb__item:has-text("Settings")').first().click();

	await expect(page.locator('.settings-nav__item[aria-selected="true"]')).toContainText('My Account');
	await expect(page.locator('.card__title:has-text("account · alert consent")')).toBeVisible();

	const layout = await page.evaluate(() => {
		const rect = (selector: string) => {
			const element = document.querySelector<HTMLElement>(selector);
			if (!element) {
				return null;
			}

			const box = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				bottom: box.bottom,
				clientWidth: element.clientWidth,
				display: style.display,
				gridTemplateColumns: style.gridTemplateColumns,
				left: box.left,
				right: box.right,
				scrollWidth: element.scrollWidth,
				top: box.top,
				width: box.width,
			};
		};

		const viewportWidth = window.innerWidth;
		const nav = rect('.settings-nav');
		const panel = rect('[role="tabpanel"]');
		const accountGrid = rect('.account-settings-grid');
		const card = rect('.card--accent');
		const firstConsent = rect('.consent-row');
		const scroll = document.querySelector<HTMLElement>('main.scroll');
		return {
			accountGrid,
			card,
			firstConsent,
			nav,
			panel,
			scrollClientWidth: scroll?.clientWidth ?? 0,
			scrollWidth: scroll?.scrollWidth ?? 0,
			viewportWidth,
		};
	});

	expect(layout.nav?.display, `settings nav should become a compact tab grid: ${JSON.stringify(layout)}`).toBe('grid');
	expect(layout.panel?.left, `tabpanel should start inside the mobile viewport: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(64);
	expect(layout.panel?.right, `tabpanel should not extend past the mobile viewport: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.viewportWidth);
	expect(layout.card?.right, `account card should not force horizontal scrolling: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.viewportWidth);
	expect(layout.accountGrid?.gridTemplateColumns, `account consent should stack on phone widths: ${JSON.stringify(layout)}`).not.toContain(' ');
	expect(layout.firstConsent?.width, `consent rows need enough width for readable copy: ${JSON.stringify(layout)}`).toBeGreaterThan(250);
	expect(layout.scrollWidth, `settings page should not create horizontal overflow: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.scrollClientWidth + 1);
});
