import {test, expect} from './helpers.js';

test('public callback menu exposes real dialog state and native row buttons', async ({openConsole}) => {
	const page = await openConsole();
	const trigger = page.getByRole('button', {name: 'Call back'});

	await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
	await expect(trigger).toHaveAttribute('aria-controls', 'topbar-run-popover');
	await expect(trigger).toHaveAttribute('aria-expanded', 'false');

	await trigger.click();
	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	const popover = page.locator('#topbar-run-popover');
	await expect(popover).toBeVisible();
	await expect(popover).toHaveAttribute('role', 'dialog');
	await expect(popover).toHaveAttribute('aria-label', 'Call back');

	const firstRow = popover.locator('.pop__row').first();
	await expect(firstRow).toHaveJSProperty('tagName', 'BUTTON');
	await expect(firstRow).toContainText('Call a missed number');

	await firstRow.focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('.tb__crumb--active')).toContainText('Calls');
	const ctx = await page.evaluate(() => {
		const holder = globalThis as typeof globalThis & {
			AppContext?: {get: () => {extra?: Record<string, unknown>}};
		};
		return holder.AppContext?.get() || {};
	});
	expect(ctx.extra?.run_intent).toBe('missed_callback');
	expect(ctx.extra?.triggered_from).toBe('topbar-new-run');
});

test('Generate route primary topbar action starts the proposal draft path', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('[data-testid="sidebar-route"][data-route-id="generate"]').click();

	const trigger = page.getByRole('button', {name: 'Generate draft'});
	await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
	await expect(trigger).toHaveAttribute('aria-controls', 'topbar-run-popover');
	await expect(trigger).toHaveAttribute('aria-expanded', 'false');

	await trigger.click();
	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	const popover = page.locator('#topbar-run-popover');
	await expect(popover).toHaveAttribute('aria-label', 'Generate draft');
	await expect(popover).toContainText('Generate proposal');
	await expect(popover).not.toContainText('Call a missed number');

	await popover.getByRole('button', {name: 'Generate proposal'}).click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
	await expect(page.getByTestId('generate-new-run-banner')).toContainText('New proposal run seeded');
	await expect(page.locator('[data-testid="generate-step-01"]')).toHaveAttribute('data-state', 'ready');
});

test('public callback menu sends each workflow to the matching call, not the first missed callback', async ({openConsole}) => {
	const page = await openConsole();
	const expected = await page.evaluate(() => {
		const calls = ((globalThis as any).GTM.calls || []) as any[];
		const isMissed = (call: any) => call?.missed === true || ['voicemail', 'no-answer', 'dropped', 'missed'].includes(String(call?.outcome || '').toLowerCase());
		const risk = (call: any) => (Number(call?.flags) || 0) + (Number(call?.deflections) || 0);
		const missed = calls.find(call => isMissed(call) && call.returned !== true) || calls.find(isMissed) || null;
		const quote = calls.find(call => !isMissed(call) && /pricing|quote|follow-up|objection/.test(String(call.outcome || '').toLowerCase()))
			|| calls.find(call => !isMissed(call) && risk(call) > 0)
			|| missed;
		const schedule = calls.find(call => !isMissed(call) && /meeting-booked|qualified|discovery|technical-deep-dive/.test(String(call.outcome || '').toLowerCase()))
			|| quote
			|| missed;
		const human = calls
			.filter(call => !isMissed(call) && !/no-fit|lost|closed|signed/.test(String(call.outcome || '').toLowerCase()))
			.sort((a, b) => risk(b) - risk(a))[0]
			|| quote
			|| missed;
		return {
			quote, schedule, human, missed,
		};
	});
	expect(expected.missed?.id).not.toBe(expected.quote?.id);
	expect(expected.missed?.id).not.toBe(expected.schedule?.id);
	expect(expected.missed?.id).not.toBe(expected.human?.id);

	const triggerAction = async (name: RegExp) => {
		const trigger = page.getByRole('button', {name: 'Call back'});
		await trigger.click();
		const popover = page.locator('#topbar-run-popover');
		await expect(popover).toBeVisible();
		await popover.getByRole('button', {name}).click();
		await expect(page.locator('.tb__crumb--active')).toContainText('Calls');
		return page.evaluate(() => (globalThis as any).AppContext.get());
	};

	let ctx = await triggerAction(/send a quote follow-up/i);
	await expect(page.locator('.workflow-popout')).toContainText(`Quote follow-up · ${expected.quote.co}`);
	expect(ctx.selection).toEqual({type: 'call', id: expected.quote.id});
	expect(ctx.extra.run_intent).toBe('quote_follow_up');
	await expect(page.locator('.toast', {hasText: /quote follow-up opened/i})).toHaveCount(0);

	ctx = await triggerAction(/schedule a job/i);
	const bookingForm = page.getByTestId('call-booking-form');
	await expect(bookingForm).toBeVisible();
	await expect(bookingForm).toContainText(`Schedule job · ${expected.schedule.co}`);
	expect(ctx.selection).toEqual({type: 'call', id: expected.schedule.id});
	expect(ctx.extra.run_intent).toBe('schedule_job');

	ctx = await triggerAction(/escalate to a human/i);
	const humanPanel = page.getByTestId('call-human-review-panel');
	await expect(humanPanel).toBeVisible();
	await expect(humanPanel).toContainText(`Human review · ${expected.human.id}`);
	expect(ctx.selection).toEqual({type: 'call', id: expected.human.id});
	expect(ctx.extra.run_intent).toBe('human_handoff');
});

test('settings handoffs survive route changes instead of losing their target tab', async ({openConsole}) => {
	const page = await openConsole();

	await page.getByRole('button', {name: 'Notifications'}).click();
	const notifications = page.locator('#topbar-notifications-popover');
	await expect(notifications).toBeVisible();
	await notifications.locator('.pop__ft').getByRole('button', {name: 'Settings'}).click();

	await expect(page.locator('.tb__crumb--active')).toContainText('Settings');
	await expect(page.getByRole('tab', {name: /^Integrations$/})).toHaveAttribute('aria-selected', 'true');

	await page.locator('[data-testid="sidebar-route"][data-route-id="generate"]').click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
	await page.locator('.sb__footer').click();

	await expect(page.locator('.tb__crumb--active')).toContainText('Settings');
	await expect(page.getByRole('tab', {name: /^My Account$/})).toHaveAttribute('aria-selected', 'true');
	const ctx = await page.evaluate(() => (globalThis as any).AppContext.get());
	expect(ctx.extra.settings_tab).toBe('account');
	expect(ctx.extra.triggered_from).toBe('sidebar-account-footer');
});

test('admin run menu is labeled as New run and keeps advanced actions in-console', async ({page}) => {
	await page.addInitScript(() => {
		Object.assign(globalThis, {DEMO_MODE: true});
	});
	await page.goto('/console/?admin=1', {waitUntil: 'domcontentloaded'});
	await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

	const trigger = page.locator('.tb__run-trigger');
	await expect(trigger).toHaveAccessibleName('New run');
	await expect(trigger).toHaveAttribute('aria-controls', 'topbar-run-popover');
	await expect(trigger).toHaveAttribute('aria-expanded', 'false');

	await trigger.click();
	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	const popover = page.locator('#topbar-run-popover');
	await expect(popover).toHaveAttribute('aria-label', 'New run');
	await expect(popover).toContainText('Outbound discovery');
	await expect(popover).toContainText('Generate proposal');
	await expect(popover).toContainText('Trigger eval suite');
	await expect(popover.locator('.pop__row').first()).toHaveJSProperty('tagName', 'BUTTON');

	await popover.locator('.pop__row', {hasText: 'Trigger eval suite'}).click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Evals');
	await expect(page.locator('.eval-bridge-popout')).toBeVisible();
	await expect(page.locator('.toast', {hasText: 'queued'})).toHaveCount(0);
});

test('Generate route proposal run popover declares its local review path target', async ({page}) => {
	await page.addInitScript(() => {
		Object.assign(globalThis, {DEMO_MODE: true});
	});
	await page.goto('/console/?admin=1&route=generate', {waitUntil: 'domcontentloaded'});
	await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

	const trigger = page.locator('.tb__proposal-run-trigger');

	await expect(page.locator('.tb__actions').getByRole('button', {name: 'Generate draft'})).toHaveCount(1);
	await expect(trigger).toHaveAccessibleName('Proposal run plan');
	await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
	await expect(trigger).toHaveAttribute('aria-controls', 'topbar-proposal-run-popover');
	await expect(trigger).toHaveAttribute('aria-expanded', 'false');

	await trigger.click();
	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	const popover = page.locator('#topbar-proposal-run-popover');
	await expect(popover).toBeVisible();
	await expect(popover).toHaveAttribute('aria-label', 'Proposal run plan');
	await expect(popover.getByTestId('proposal-run-plan')).toContainText('Buyer proof');
	await expect(popover.getByTestId('proposal-run-plan')).toContainText('Artifact review');
	await expect(popover.getByTestId('proposal-run-start')).toHaveJSProperty('tagName', 'BUTTON');
});
