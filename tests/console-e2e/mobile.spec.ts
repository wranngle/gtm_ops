/**
 * Mobile viewport regression — at 375×800 (iPhone SE class), no console
 * route is allowed to overflow the document horizontally on initial paint.
 * Catches the specific class of bug where a fixed-pixel sidebar + 5-up
 * stats grid + 2-col split push the page into a horizontal scrollbar
 * on phones.
 */
import {test, expect} from './helpers.js';

const routes = [
	{id: 'home', label: 'Callbacks'},
	{id: 'pipeline', label: 'Pipeline'},
	{id: 'calls', label: 'Calls'},
	{id: 'proposals', label: 'Proposals'},
	{id: 'evals', label: 'Evals'},
	{id: 'agents', label: 'Agents'},
	{id: 'generate', label: 'Generate'},
	{id: 'settings', label: 'Settings'},
];

for (const route of routes) {
	test(`mobile · ${route.id} fits 375px viewport without horizontal scroll`, async ({openConsole}) => {
		const page = await openConsole();
		await page.setViewportSize({width: 375, height: 800});
		await page.locator(`[data-testid="sidebar-route"][data-route-id="${route.id}"]`).click();
		await page.waitForTimeout(250);
		const overflow = await page.evaluate(() => ({
			docScrollW: document.documentElement.scrollWidth,
			clientW: document.documentElement.clientWidth,
			hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
		}));
		expect(
			overflow.hasHorizontalScroll,
			`route ${route.id}: docScrollW=${overflow.docScrollW} clientW=${overflow.clientW}`,
		).toBe(false);
	});
}

for (const route of routes) {
	test(`mobile · direct ${route.id} URL mounts the shell and active page`, async ({page}) => {
		await page.addInitScript(() => {
			// @ts-expect-error injected for tests
			globalThis.DEMO_MODE = true;
		});
		await page.setViewportSize({width: 375, height: 800});
		await page.goto(route.id === 'home' ? '/console/' : `/console/?route=${route.id}`, {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 20_000});
		await expect(page.locator('.tb__crumb--active')).toContainText(route.label);
		await expect(page.locator(`[data-testid="sidebar-route"][data-route-id="${route.id}"]`)).toHaveAttribute('data-active', 'true');
		await expect(page.locator('#root')).not.toBeEmpty();
	});
}

test('mobile · topbar actions fit inside the visible shell at 390px', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 390, height: 844});
	await page.locator('[data-testid="sidebar-route"][data-route-id="agents"]').click();
	await expect(page.locator('.tb__run-trigger')).toBeVisible();
	await expect(page.locator('.tb__run-trigger')).toHaveAccessibleName('Call back');

	const geometry = await page.evaluate(() => {
		const viewportW = document.documentElement.clientWidth;
		const topbar = document.querySelector('.tb')?.getBoundingClientRect();
		const controls = [...document.querySelectorAll('.tb button')]
			.filter(element => {
				const box = element.getBoundingClientRect();
				return box.width > 0 && box.height > 0;
			})
			.map(element => {
				const box = element.getBoundingClientRect();
				return {
					label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '',
					left: box.left,
					right: box.right,
					width: box.width,
				};
			});
		return {
			viewportW,
			topbarLeft: topbar?.left ?? 0,
			topbarRight: topbar?.right ?? viewportW,
			controls,
		};
	});

	for (const control of geometry.controls) {
		expect(control.left, `${control.label} clipped left`).toBeGreaterThanOrEqual(geometry.topbarLeft - 1);
		expect(control.right, `${control.label} clipped right`).toBeLessThanOrEqual(Math.min(geometry.topbarRight, geometry.viewportW) + 1);
		expect(control.width, `${control.label} collapsed`).toBeGreaterThanOrEqual(30);
	}

	await page.locator('.tb__run-trigger').click();
	await expect(page.getByRole('dialog', {name: 'Call back'})).toBeVisible();
});

test('mobile · Evals command rail wraps run metadata instead of clipping it', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('[data-testid="sidebar-route"][data-route-id="evals"]').click();

	const evidenceChip = page.locator('.eval-control-rail__chip', {hasText: 'suite-library runs'}).first();
	await expect(evidenceChip).toBeVisible();
	await expect(evidenceChip).toContainText('loaded results · 7,690 suite-library runs');

	const geometry = await evidenceChip.evaluate(element => {
		const style = getComputedStyle(element);
		return {
			clientWidth: element.clientWidth,
			scrollWidth: element.scrollWidth,
			whiteSpace: style.whiteSpace,
			overflow: style.overflow,
		};
	});

	expect(geometry.whiteSpace, `chip should wrap metadata: ${JSON.stringify(geometry)}`).not.toBe('nowrap');
	expect(
		geometry.scrollWidth,
		`eval metadata chip clipped its evidence text: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(geometry.clientWidth + 1);
});

test('mobile · Evals command rail keeps primary actions compact', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('[data-testid="sidebar-route"][data-route-id="evals"]').click();
	await page.waitForTimeout(250);

	const geometry = await page.evaluate(() => {
		const rail = document.querySelector('[data-testid="eval-control-rail"]');
		const commandCenter = document.querySelector('[data-testid="eval-command-center"]');
		const buttons = [...document.querySelectorAll('.eval-control-rail__actions .btn')]
			.filter(element => element instanceof HTMLElement)
			.map(element => {
				const box = element.getBoundingClientRect();
				return {
					text: (element.textContent || '').trim(),
					top: Math.round(box.top),
					left: box.left,
					right: box.right,
					width: box.width,
				};
			});
		const railBox = rail?.getBoundingClientRect();
		const commandBox = commandCenter?.getBoundingClientRect();
		const distinctRows = new Set(buttons.map(button => button.top)).size;
		return {
			railHeight: railBox?.height ?? 0,
			railBottom: railBox?.bottom ?? 0,
			commandTop: commandBox?.top ?? 9999,
			distinctRows,
			buttons,
			contained: buttons.every(button => button.left >= (railBox?.left ?? 0) - 1
				&& button.right <= (railBox?.right ?? document.documentElement.clientWidth) + 1
				&& button.width > 0),
		};
	});

	expect(geometry.buttons.map(button => button.text)).toEqual([
		'Artifacts',
		'Policy',
		'Run plan',
		'New suite',
	]);
	expect(geometry.distinctRows, `Evals actions should fit into a two-row grid: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(2);
	expect(geometry.contained, `Evals action buttons clipped inside the rail: ${JSON.stringify(geometry)}`).toBe(true);
	expect(geometry.railHeight, `Evals command rail is too tall on mobile: ${JSON.stringify(geometry)}`).toBeLessThan(220);
	expect(geometry.commandTop, `Active regression card starts too far below the command rail: ${JSON.stringify(geometry)}`).toBeLessThan(360);
});

test('mobile · Evals evidence surfaces stay inside the console scroller', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 390, height: 844});
	await page.locator('[data-testid="sidebar-route"][data-route-id="evals"]').click();
	await expect(page.locator('.eval-stats')).toBeVisible();
	await expect(page.locator('.eval-run-row')).not.toHaveCount(0, {timeout: 5000});

	const geometry = await page.evaluate(() => {
		const measure = (selector: string) => {
			const element = document.querySelector(selector) as HTMLElement | null;
			return {
				selector,
				clientWidth: element?.clientWidth ?? 0,
				scrollWidth: element?.scrollWidth ?? 0,
				ok: element ? element.scrollWidth <= element.clientWidth + 1 : false,
			};
		};
		const titleFits = [...document.querySelectorAll('.eval-run-row__title')]
			.every(element => (element as HTMLElement).scrollWidth <= (element as HTMLElement).clientWidth + 1);
		return {
			surfaces: [
				measure('main.scroll'),
				measure('.page--evals'),
				measure('.eval-stats'),
				measure('.evals-grid'),
				measure('.eval-run-list'),
			],
			titleFits,
		};
	});

	for (const surface of geometry.surfaces) {
		expect(
			surface.ok,
			`${surface.selector} overflowed: ${JSON.stringify(surface)}`,
		).toBe(true);
	}
	expect(geometry.titleFits, `eval run titles should wrap instead of forcing clipped columns: ${JSON.stringify(geometry)}`).toBe(true);
});

test('mobile · Agents local admin stays inside the console scroller', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Agents")').first().click();
	await expect(page.locator('[data-testid="agent-local-admin-panel"]')).toBeVisible();

	const geometry = await page.evaluate(() => {
		const scroller = document.querySelector('.scroll');
		const adminPanel = document.querySelector('[data-testid="agent-local-admin-panel"]');
		const phonePanel = document.querySelector('[data-testid="phone-setup-panel"]');
		const greeting = document.querySelector('[data-testid="phone-setup-greeting-input"]');
		const preview = document.querySelector('[data-testid="phone-setup-preview"]');
		const scrollerBox = scroller?.getBoundingClientRect();
		const insideScroller = [adminPanel, phonePanel, greeting, preview].every(element => {
			if (!element || !scrollerBox) {
				return false;
			}

			const box = element.getBoundingClientRect();
			return box.left >= scrollerBox.left - 1 && box.right <= scrollerBox.right + 1;
		});

		return {
			scrollerClientW: scroller?.clientWidth ?? 0,
			scrollerScrollW: scroller?.scrollWidth ?? 0,
			insideScroller,
		};
	});

	expect(
		geometry.scrollerScrollW,
		`Agents route overflowed the console scroller: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(geometry.scrollerClientW + 1);
	expect(geometry.insideScroller, `admin panel geometry escaped scroller: ${JSON.stringify(geometry)}`).toBe(true);
});

test('mobile · sidebar auto-collapses at narrow viewports', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.waitForTimeout(200);
	const sidebarW = await page.evaluate(() => document.querySelector('.sb')?.getBoundingClientRect().width ?? 0);
	// Compact rail width is --sidebar-collapsed-w: 64px. Must not be the full 232px.
	expect(sidebarW).toBeLessThan(100);
	expect(sidebarW).toBeGreaterThan(0);
});

test('mobile · Pipeline lead detail is not covered by the collapsed Sarah handoff', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Pipeline")').first().click();
	await page.locator('[data-testid="pipe-card"]').first().click();

	const intake = page.locator('[aria-label="Intake agent panel"]');
	const detail = page.locator('.lead-detail-panel');
	await expect(intake).toBeVisible();
	await expect(detail).toBeVisible();
	await expect(intake).toHaveAttribute('data-state', 'collapsed');

	const geometry = await page.evaluate(() => {
		const intakeBox = document.querySelector('[aria-label="Intake agent panel"]')?.getBoundingClientRect();
		const detailBox = document.querySelector('.lead-detail-panel')?.getBoundingClientRect();
		return {
			intakeHeight: intakeBox?.height ?? 0,
			intakeBottom: intakeBox?.bottom ?? 0,
			detailTop: detailBox?.top ?? 0,
			overlap: Boolean(intakeBox
				&& detailBox
				&& !(intakeBox.right <= detailBox.left
					|| detailBox.right <= intakeBox.left
					|| intakeBox.bottom <= detailBox.top
					|| detailBox.bottom <= intakeBox.top)),
		};
	});

	expect(geometry.intakeHeight, `collapsed Sarah handoff is too tall: ${JSON.stringify(geometry)}`).toBeLessThan(150);
	expect(geometry.overlap, `collapsed Sarah handoff covers lead detail: ${JSON.stringify(geometry)}`).toBe(false);
});

test('mobile · stats grid does not overflow its container at 375px', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.waitForTimeout(200);
	const stats = await page.evaluate(() => {
		const s = document.querySelector('.stats');
		if (!s) {
			return {ok: true};
		}

		const r = s.getBoundingClientRect();
		return {ok: s.scrollWidth <= r.width + 1, scrollW: s.scrollWidth, rectW: r.width};
	});
	expect(stats.ok, `stats overflow: ${JSON.stringify(stats)}`).toBe(true);
});

test('mobile · attention banner actions stay inside the viewport', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.waitForTimeout(200);

	const banner = page.locator('[data-testid="attention-banner"]');
	await expect(banner).toBeVisible();
	await expect(page.locator('[data-testid="attention-review-now"]')).toBeVisible();

	const geometry = await page.evaluate(() => {
		const viewportW = document.documentElement.clientWidth;
		const bannerElement = document.querySelector('[data-testid="attention-banner"]');
		const buttons = [...document.querySelectorAll('[data-testid="attention-snooze-1h"], [data-testid="attention-review-now"]')]
			.filter(element => element instanceof HTMLElement)
			.map(element => {
				const r = element.getBoundingClientRect();
				return {
					text: (element.textContent || '').trim(),
					left: r.left,
					right: r.right,
					width: r.width,
				};
			});
		const bannerRect = bannerElement?.getBoundingClientRect();
		return {
			viewportW,
			bannerRight: bannerRect?.right ?? 0,
			buttons,
			contained: buttons.every(r => r.left >= 0 && r.right <= viewportW + 1 && r.width > 0),
		};
	});

	expect(
		geometry.contained,
		`attention actions clipped: ${JSON.stringify(geometry)}`,
	).toBe(true);
});

test('mobile · Generate keeps artifact review before the long buyer proof composer', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.waitForTimeout(250);

	const geometry = await page.evaluate(() => {
		const getBox = (selector: string) => {
			const element = document.querySelector(selector);
			if (!(element instanceof HTMLElement)) {
				return null;
			}

			return element.getBoundingClientRect();
		};

		const sequenceBox = getBox('[data-testid="generate-sequence"]');
		const briefBox = getBox('.generate-brief-card');
		const reviewBox = getBox('.generate-review-card');
		const traceBox = getBox('.generate-trace-card');
		const reviewPathRows = [...document.querySelectorAll('[data-testid="generate-review-path"] > div')]
			.filter((element): element is HTMLElement => element instanceof HTMLElement);
		const rowWidths = reviewPathRows.map(row => ({
			clientWidth: row.clientWidth,
			scrollWidth: row.scrollWidth,
			copyWidth: row.querySelector('.artifact-review__path-copy')?.getBoundingClientRect().width ?? 0,
		}));
		const firstCopy = reviewPathRows[0]?.querySelector('.artifact-review__path-copy')?.getBoundingClientRect();
		const firstAction = reviewPathRows[0]?.querySelector('.artifact-review__path-action')?.getBoundingClientRect();
		return {
			sequenceTop: sequenceBox?.top ?? 0,
			briefTop: briefBox?.top ?? 0,
			reviewTop: reviewBox?.top ?? 0,
			traceTop: traceBox?.top ?? 0,
			briefVisibleHeight: briefBox?.height ?? 0,
			reviewPathMinCopyWidth: Math.min(...rowWidths.map(row => row.copyWidth)),
			reviewPathRowsContained: rowWidths.every(row => row.scrollWidth <= row.clientWidth + 1),
			reviewPathActionStacked: Boolean(firstCopy
				&& firstAction
				&& firstAction.top >= firstCopy.bottom - 1
				&& firstAction.left >= firstCopy.left - 1
				&& firstAction.right <= firstCopy.right + 1),
		};
	});

	expect(
		geometry.reviewTop,
		`Generate mobile order should be sequence -> review -> buyer brief -> trace: ${JSON.stringify(geometry)}`,
	).toBeGreaterThan(geometry.sequenceTop);
	expect(
		geometry.briefTop,
		`Artifact review should stay ahead of the long buyer proof composer on mobile: ${JSON.stringify(geometry)}`,
	).toBeGreaterThan(geometry.reviewTop);
	expect(
		geometry.traceTop,
		`Sequence trace should stay after buyer proof on mobile: ${JSON.stringify(geometry)}`,
	).toBeGreaterThan(geometry.briefTop);
	expect(geometry.briefVisibleHeight).toBeGreaterThan(250);
	expect(
		geometry.reviewPathMinCopyWidth,
		`Generate review path copy should not collapse beside its action: ${JSON.stringify(geometry)}`,
	).toBeGreaterThanOrEqual(160);
	expect(geometry.reviewPathRowsContained, `Generate review path rows should not horizontally scroll: ${JSON.stringify(geometry)}`).toBe(true);
	expect(geometry.reviewPathActionStacked, `Generate review path action should stack under copy on mobile: ${JSON.stringify(geometry)}`).toBe(true);
});

test('mobile · Settings account controls stay inside the console scroller', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Settings")').first().click();
	await page.waitForTimeout(250);

	const geometry = await page.evaluate(() => {
		const main = document.querySelector('main.scroll');
		const viewportW = document.documentElement.clientWidth;
		const boxes = [...document.querySelectorAll('.account-consent-stack, .account-consent-status, .settings-card--account .hstack')]
			.filter(element => element instanceof HTMLElement)
			.map(element => {
				const rect = element.getBoundingClientRect();
				return {
					className: element.className,
					left: rect.left,
					right: rect.right,
					width: rect.width,
				};
			});
		return {
			bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			mainOverflow: main ? main.scrollWidth - main.clientWidth : 0,
			boxes,
			contained: boxes.every(box => box.left >= 0 && box.right <= viewportW + 1 && box.width > 0),
		};
	});

	expect(geometry.bodyOverflow, `document overflowed horizontally: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(1);
	expect(geometry.mainOverflow, `console scroller overflowed horizontally: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(1);
	expect(geometry.contained, `settings account controls clipped: ${JSON.stringify(geometry)}`).toBe(true);
});

test('mobile · Settings top tabs wrap instead of becoming a clipped scroll trap', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Settings")').first().click();
	await page.waitForTimeout(250);

	const geometry = await page.locator('[data-testid="settings-top-tabs"]').evaluate(tablist => {
		const listBox = tablist.getBoundingClientRect();
		const tabs = [...tablist.querySelectorAll('[role="tab"]')].map(tab => {
			const box = tab.getBoundingClientRect();
			return {
				label: tab.textContent?.trim() || '',
				left: box.left,
				right: box.right,
				top: Math.round(box.top),
				width: box.width,
			};
		});
		return {
			listClientWidth: (tablist as HTMLElement).clientWidth,
			listScrollWidth: (tablist as HTMLElement).scrollWidth,
			rows: new Set(tabs.map(tab => tab.top)).size,
			tabs,
			contained: tabs.every(tab => tab.left >= listBox.left - 1 && tab.right <= listBox.right + 1 && tab.width >= 84),
		};
	});

	expect(geometry.rows, `settings tabs should wrap into visible rows: ${JSON.stringify(geometry)}`).toBeGreaterThan(1);
	expect(geometry.rows, `settings tabs should not consume the whole first viewport: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(3);
	expect(geometry.listScrollWidth, `settings tablist should not require hidden horizontal scroll: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.listClientWidth + 1);
	expect(geometry.contained, `settings tabs clipped off the mobile viewport: ${JSON.stringify(geometry)}`).toBe(true);
	expect(geometry.tabs.map(tab => tab.label)).toEqual(['My Account', 'Integrations', 'Eval policy', 'Team', 'Billing', 'Security']);
});
