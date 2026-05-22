/**
 * Hover metadata must not render fake popouts over real console detail panes.
 */
import {test, expect} from './helpers.js';

test('inspectable rows do not render generated popout overlays on hover or focus', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Proposals")').first().click();

	const row = page.locator('.proposal-row-card[data-popout]').first();
	await expect(row).toBeVisible();
	await row.hover();
	await row.focus();

	const style = await row.evaluate(element => {
		const after = getComputedStyle(element, '::after');
		const cursor = getComputedStyle(element).cursor;
		return {
			afterContent: after.content,
			afterDisplay: after.display,
			cursor,
		};
	});

	expect(style.afterDisplay).toBe('none');
	expect(style.afterContent).toBe('none');
	expect(style.cursor).toBe('pointer');
});
