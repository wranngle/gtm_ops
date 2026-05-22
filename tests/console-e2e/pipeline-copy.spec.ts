import {test, expect} from './helpers.js';

test('Pipeline velocity card reads like an operator record, not fixture plumbing', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Pipeline")').first().click();

	const card = page.getByTestId('pipeline-velocity-card');
	await expect(card).toBeVisible();
	await expect(card).toContainText(/sourced from console proposal records/i);
	await expect(card).not.toContainText(/fixture-driven|demo_mode|canned|no-op/i);
});

test('Pipeline history records humanize client slugs when metadata lacks client names', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Pipeline")').first().click();

	await page.waitForFunction(() => {
		const companies = (globalThis as any).GTM?.companies || [];
		return companies.some((company: any) => company.id === 'harbor-r1')
			&& companies.some((company: any) => company.id === 'summit-r1');
	});

	const normalizedNames = await page.evaluate(() => {
		const companies = (globalThis as any).GTM?.companies || [];
		return Object.fromEntries(companies
			.filter((company: any) => ['harbor-r1', 'summit-r1'].includes(company.id))
			.map((company: any) => [company.id, company.name]));
	});

	expect(normalizedNames).toEqual({
		'harbor-r1': 'Harbor Property Management',
		'summit-r1': 'Summit Dental Group',
	});

	const harborCard = page.getByTestId('pipe-card').filter({hasText: 'Harbor Property Management'});
	const summitCard = page.getByTestId('pipe-card').filter({hasText: 'Summit Dental Group'});
	await expect(harborCard).toBeVisible();
	await expect(summitCard).toBeVisible();
	await expect(page.getByTestId('pipe-card').filter({hasText: /harbor-property-mgmt|summit-dental-group/i})).toHaveCount(0);
});

test('Funnel stage rows open a computed review panel and route to evidence', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Funnel")').first().click();

	const panel = page.getByTestId('funnel-stage-review');
	await expect(panel).toBeVisible();
	await expect(panel).toHaveAttribute('data-stage-id', 'contract');
	await expect(panel).toContainText(/contract signed/i);
	await expect(panel.getByTestId('funnel-stage-loss')).toContainText(/53 proposal sent did not reach contract signed/i);

	const proposalRow = page.getByTestId('funnel-row-proposal');
	await expect(proposalRow).toHaveAttribute('aria-controls', 'funnel-stage-review');
	await proposalRow.click();

	await expect(panel).toHaveAttribute('data-stage-id', 'proposal');
	await expect(proposalRow).toHaveAttribute('aria-pressed', 'true');
	await expect(panel).toContainText(/proposal sent/i);
	await expect(panel.getByTestId('funnel-stage-loss')).toContainText(/84 booked did not reach proposal sent/i);

	await panel.getByTestId('funnel-stage-action').click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
	await expect(page.getByRole('heading', {level: 1})).toContainText(/proposals/i);
	const ctx = await page.evaluate(() => (globalThis as any).AppContext.get());
	expect(ctx.selection).toEqual({type: 'proposal', id: 'PR-2041'});
	expect(ctx.extra.triggered_from).toBe('funnel-stage-review');
	expect(ctx.extra.funnel_stage_id).toBe('proposal');
	await expect(page.locator('.split--2 > .vstack > .card').first()).toContainText(/PR-2041/);
});

test('Funnel header action follows the active stage review target', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Funnel")').first().click();

	const headerAction = page.getByTestId('funnel-header-review-action');
	await expect(headerAction).toHaveAttribute('data-stage-id', 'contract');
	await expect(headerAction).toContainText(/review signed proposals/i);

	await headerAction.click();

	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
	const ctx = await page.evaluate<{
		extra: Record<string, unknown>;
		selection: unknown;
	}>(`(() => {
		const context = globalThis.AppContext.get();
		return {
			extra: context.extra,
			selection: context.selection,
		};
	})()`);
	expect(ctx.selection).toEqual({type: 'proposal', id: 'PR-2038'});
	expect(ctx.extra.triggered_from).toBe('funnel-stage-review');
	expect(ctx.extra.funnel_stage_id).toBe('contract');
	expect(ctx.extra.proposal_filter).toBe('signed');
});
