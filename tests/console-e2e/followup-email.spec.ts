/**
 * Follow-up email composer — local draft review, not a fake send surface.
 */
import {test, expect} from './helpers.js';

test.describe('follow-up email composer', () => {
	test('console sidecar tools load bundled fixtures from the console route', async ({openConsole}) => {
		const page = await openConsole();

		await page.locator('.sb__item:has-text("Simulator")').first().click();
		await expect(page.getByTestId('call-simulator')).toBeVisible();
		await expect(page.locator('[role="alert"]')).toHaveCount(0);

		await page.locator('.sb__item:has-text("Replay")').first().click();
		await expect(page.getByTestId('replay-panel')).toBeVisible();
		await expect(page.locator('[role="alert"]')).toHaveCount(0);

		await page.locator('.sb__item:has-text("Follow-up email")').first().click();
		await expect(page.getByTestId('email-composer')).toBeVisible();
		await expect(page.locator('[role="alert"]')).toHaveCount(0);
	});

	test('follow-up route loads without a missing route script error', async ({openConsole, page}) => {
		const routeErrors: string[] = [];
		page.on('pageerror', error => {
			routeErrors.push(error.message);
		});
		page.on('console', message => {
			if (message.type() === 'error') {
				routeErrors.push(message.text());
			}
		});

		await openConsole();
		await page.locator('.sb__item:has-text("Follow-up email")').first().click();
		await expect(page.getByTestId('email-composer')).toBeVisible();

		expect(routeErrors.filter(error => /email-composer\.tsx|could not load|404/i.test(error))).toEqual([]);
	});

	test('sidecar load failures use operator-facing local source language', async ({openConsole, page}) => {
		await page.route('**/fixtures/canned-call.jsonl', async route => route.fulfill({status: 404, body: 'missing'}));
		await page.route('**/fixtures/failed-call.jsonl', async route => route.fulfill({status: 404, body: 'missing'}));
		await page.route('**/fixtures/call-trace-followup.json', async route => route.fulfill({status: 404, body: '{}'}));
		await openConsole();

		await page.locator('.sb__item:has-text("Simulator")').first().click();
		let alert = page.locator('[role="alert"]');
		await expect(alert).toContainText('Local trace failed to load');
		await expect(alert).toContainText('local call trace returned HTTP 404');
		await expect(alert).not.toContainText('fixture');
		await expect(alert).not.toContainText('DEMO_MODE');
		await expect(alert).not.toContainText('canned');

		await page.locator('.sb__item:has-text("Replay")').first().click();
		alert = page.locator('[role="alert"]');
		await expect(alert).toContainText('Local trace failed to load');
		await expect(alert).toContainText('failed trace source returned HTTP 404');
		await expect(alert).not.toContainText('fixture');
		await expect(alert).not.toContainText('DEMO_MODE');
		await expect(alert).not.toContainText('canned');

		await page.locator('.sb__item:has-text("Follow-up email")').first().click();
		alert = page.locator('[role="alert"]');
		await expect(alert).toContainText('Source call trace failed to load');
		await expect(alert).toContainText('source call trace returned HTTP 404');
		await expect(alert).not.toContainText('fixture');
		await expect(alert).not.toContainText('DEMO_MODE');
		await expect(alert).not.toContainText('canned');
	});

	test('local draft must be approved before queueing a send receipt', async ({openConsole}) => {
		const page = await openConsole();
		await page.locator('.sb__item:has-text("Follow-up email")').first().click();

		await expect(page.locator('.tb__crumb--active')).toContainText('Follow-up email');
		await expect(page.getByRole('heading', {level: 1})).toHaveText('Follow-up Email');

		const composer = page.getByTestId('email-composer');
		await expect(composer).toBeVisible();
		await expect(composer).not.toContainText('mock');

		const preview = page.getByTestId('emailc-preview');
		await expect(preview).toBeVisible({timeout: 10_000});
		await expect(preview).toContainText('local draft');
		await expect(preview).toContainText('source CALL-');

		const gate = page.getByTestId('emailc-review-gate');
		const queueSend = page.getByTestId('emailc-queue-send');
		await expect(gate).toHaveAttribute('data-state', 'draft');
		await expect(gate).toContainText('Draft requires review');
		await expect(queueSend).toBeDisabled();

		await page.getByTestId('emailc-approve').click();
		await expect(gate).toHaveAttribute('data-state', 'approved');
		await expect(gate).toContainText('Approved locally');
		await expect(queueSend).toBeEnabled();

		await queueSend.click();
		await expect(gate).toHaveAttribute('data-state', 'queued');
		await expect(page.getByTestId('emailc-send-receipt')).toContainText('Send queued');
		await expect(page.getByTestId('emailc-send-receipt')).toContainText('CALL-');
		await expect(page.locator('.toast', {hasText: 'Send queued'})).toHaveCount(0);

		await page.getByTestId('emailc-compose').click();
		await expect(gate).toHaveAttribute('data-state', 'draft');
		await expect(page.getByTestId('emailc-send-receipt')).toHaveCount(0);
	});

	test('review layout stops squeezing source facts and preview on tablet width', async ({openConsole, page}) => {
		await page.setViewportSize({width: 900, height: 768});
		await openConsole();
		await page.locator('.sb__item:has-text("Follow-up email")').first().click();
		await expect(page.getByTestId('emailc-preview')).toBeVisible({timeout: 10_000});

		const layout = await page.evaluate(() => {
			const box = (selector: string) => {
				const rect = document.querySelector(selector)?.getBoundingClientRect();
				return rect
					? {
						height: rect.height, left: rect.left, top: rect.top, width: rect.width,
					}
					: null;
			};

			const metaItems = [...document.querySelectorAll('.emailc__meta-item strong')].map(element => {
				const rect = element.getBoundingClientRect();
				const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight || '0') || rect.height;
				return {
					text: element.textContent?.trim() || '',
					lineCount: Math.round(rect.height / lineHeight),
					overflowing: element.scrollWidth > element.clientWidth + 1,
				};
			});
			return {
				source: box('.emailc__source'),
				preview: box('.emailc__preview'),
				metaItems,
			};
		});

		expect(layout.source, `source pane should render: ${JSON.stringify(layout)}`).not.toBeNull();
		expect(layout.preview, `preview pane should render: ${JSON.stringify(layout)}`).not.toBeNull();
		expect(
			layout.preview!.top,
			`preview should stack below source instead of forcing a cramped split: ${JSON.stringify(layout)}`,
		).toBeGreaterThan(layout.source!.top + layout.source!.height - 1);
		expect(layout.source!.width, `stacked source pane should have enough width for source facts: ${JSON.stringify(layout)}`).toBeGreaterThan(520);
		expect(layout.metaItems.length).toBe(3);
		expect(layout.metaItems.every(item => item.lineCount <= 1), `header metadata should stay as single-line chips: ${JSON.stringify(layout.metaItems)}`).toBe(true);
		expect(layout.metaItems.some(item => /call-2419/i.test(item.text))).toBe(true);
	});
});
