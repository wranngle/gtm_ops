/**
 * Command palette coverage for sidecar console tools.
 */
import {test, expect} from './helpers.js';

test('command palette routes to sidecar tools instead of hiding them behind the sidebar', async ({openConsole}) => {
	const page = await openConsole();
	const routes = [
		{
			query: 'funnel',
			row: 'Go to Funnel',
			crumb: 'Funnel',
			heading: 'Funnel',
			marker: '[data-testid="funnel-chart"]',
		},
		{
			query: 'simulator',
			row: 'Go to Simulator',
			crumb: 'Simulator',
			heading: 'Simulator',
			marker: '[data-testid="call-simulator"]',
		},
		{
			query: 'follow-up email',
			row: 'Go to Follow-up Email',
			crumb: 'Follow-up email',
			heading: 'Follow-up Email',
			marker: '[data-testid="email-composer"]',
		},
		{
			query: 'verticals',
			row: 'Go to Verticals',
			crumb: 'Verticals',
			heading: 'Verticals',
			marker: '[data-testid="vertical-switcher"]',
		},
		{
			query: 'replay',
			row: 'Go to Replay',
			crumb: 'Replay',
			heading: 'Failure-mode replay',
			marker: '[data-testid="replay-panel"]',
		},
	];

	for (const route of routes) {
		await page.locator('.tb__search').click();
		const palette = page.locator('.cp');
		await expect(palette).toBeVisible();
		await palette.locator('input').fill(route.query);
		await expect(palette.locator('.cp__row').filter({hasText: 'no matches'})).toHaveCount(0);
		await palette.locator('.cp__row').filter({hasText: route.row}).click();

		await expect(page.locator('.tb__crumb--active')).toContainText(route.crumb);
		await expect(page.getByRole('heading', {level: 1})).toContainText(route.heading);
		await expect(page.locator(route.marker)).toBeVisible();
	}
});

test('sidecar tools render as local review panels without fixture-demo copy', async ({openConsole}) => {
	const page = await openConsole();

	await page.locator('.sb__item:has-text("Funnel")').first().click();
	await expect(page.getByTestId('funnel-chart')).toBeVisible();
	await expect(page.getByTestId('funnel-chart')).toContainText(/sourced from current console data/i);
	await expect(page.getByTestId('funnel-page')).not.toContainText(/fixture|demo_mode|canned/i);

	await page.locator('.sb__item:has-text("Simulator")').first().click();
	await expect(page.getByTestId('call-simulator')).toBeVisible();
	await expect(page.getByTestId('call-simulator')).not.toContainText(/fixture|demo_mode|canned/i);
	await expect(page.getByRole('heading', {level: 1})).toHaveText('Simulator');
	await expect(page.locator('.page--simulator')).not.toContainText(/canned trace/i);

	const simulatorChrome = await page.locator('.sim__head').evaluate(node => {
		const style = getComputedStyle(node as HTMLElement);
		return {
			borderLeftWidth: style.borderLeftWidth,
			display: style.display,
		};
	});
	expect(simulatorChrome.display).toBe('flex');
	expect(Number.parseFloat(simulatorChrome.borderLeftWidth)).toBeGreaterThanOrEqual(3);

	await page.locator('.sb__item:has-text("Replay")').first().click();
	await expect(page.getByTestId('replay-panel')).toBeVisible();
	await expect(page.getByTestId('replay-panel')).not.toContainText(/fixture|demo_mode|canned/i);

	const replayChrome = await page.evaluate(() => {
		const columns = document.querySelector('.replay__columns');
		const head = document.querySelector('.replay__col-head');
		const columnCount = document.querySelectorAll('.replay__col').length;
		return {
			columnCount,
			columnsDisplay: columns ? getComputedStyle(columns).display : '',
			headDisplay: head ? getComputedStyle(head).display : '',
		};
	});
	expect(replayChrome).toEqual({
		columnCount: 2,
		columnsDisplay: 'grid',
		headDisplay: 'flex',
	});
});
