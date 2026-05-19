import {test, expect} from './helpers.js';

test('admin home hot lead rows drill into the selected Pipeline lead', async ({page}) => {
	await page.addInitScript(() => {
		Reflect.set(globalThis, 'DEMO_MODE', true);
	});
	await page.goto('/console/?admin=1', {waitUntil: 'domcontentloaded'});
	await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

	const firstRow = page.getByTestId('hot-lead-row').first();
	await expect(firstRow).toBeVisible();

	const lead = await firstRow.evaluate(row => ({
		id: row.dataset.companyId ?? '',
		name: row.querySelector<HTMLElement>('.home-lead-row__name')?.textContent?.trim() ?? '',
	}));
	expect(lead.id).toBeTruthy();
	expect(lead.name).toBeTruthy();

	await firstRow.click();

	await expect(page.locator('.tb__crumb--active')).toContainText('Pipeline');
	await expect.poll(async () => page.evaluate(() => {
		const appContext: unknown = Reflect.get(globalThis, 'AppContext');
		if (!appContext || typeof appContext !== 'object') return null;
		const getContext: unknown = Reflect.get(appContext, 'get');
		if (typeof getContext !== 'function') return null;
		const context: unknown = getContext();
		if (!context || typeof context !== 'object') return null;
		const selection: unknown = Reflect.get(context, 'selection');
		if (!selection || typeof selection !== 'object') return null;
		const type: unknown = Reflect.get(selection, 'type');
		const id: unknown = Reflect.get(selection, 'id');
		return {
			type: typeof type === 'string' ? type : '',
			id: typeof id === 'string' ? id : '',
		};
	})).toEqual({
		type: 'lead',
		id: lead.id,
	});
	await expect(page.locator('.pipeline-metric--selected')).toContainText(lead.name);
	await expect(page.locator(`.pipe__card[data-company-id="${lead.id}"]`)).toHaveAttribute('aria-pressed', 'true');
});
