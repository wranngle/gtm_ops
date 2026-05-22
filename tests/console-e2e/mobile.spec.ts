/**
 * Mobile viewport regression — at 375×800 (iPhone SE class), no console
 * route is allowed to overflow the document horizontally on initial paint.
 * Catches the specific class of bug where a fixed-pixel sidebar + 5-up
 * stats grid + 2-col split push the page into a horizontal scrollbar
 * on phones.
 */
import {test, expect} from './helpers.js';

const routes = [
	{id: 'home', label: 'Mission Control'},
	{id: 'pipeline', label: 'Pipeline'},
	{id: 'calls', label: 'Calls'},
	{id: 'proposals', label: 'Proposals'},
	{id: 'evals', label: 'Evals'},
	{id: 'agents', label: 'Agents'},
	{id: 'settings', label: 'Settings'},
];

for (const route of routes) {
	test(`mobile · ${route.id} fits 375px viewport without horizontal scroll`, async ({openConsole}) => {
		const page = await openConsole();
		await page.setViewportSize({width: 375, height: 800});
		await page.locator(`.sb__item:has-text("${route.label}")`).first().click();
		await page.waitForTimeout(250);
		const overflow = await page.evaluate(() => ({
			docScrollW: document.documentElement.scrollWidth,
			clientW: document.documentElement.clientWidth,
			bodyHasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
		}));
		expect(
			overflow.bodyHasHorizontalScroll,
			`route ${route.id}: docScrollW=${overflow.docScrollW} clientW=${overflow.clientW}`,
		).toBe(false);
	});
}

test('mobile · Mission Control agent queue and hot-lead actions stay inside the console column', async ({openConsole, page}) => {
	await page.setViewportSize({width: 390, height: 844});
	await openConsole();
	await expect(page.locator('[data-testid="agent-flight-row"]').first()).toBeVisible();
	await expect(page.locator('.hot-lead-row').first()).toBeVisible();

	const geometry = await page.evaluate(() => {
		const pageElement = document.querySelector<HTMLElement>('.page');
		const pageBox = pageElement?.getBoundingClientRect();
		const pageLeft = pageBox?.left ?? 0;
		const pageRight = pageBox?.right ?? window.innerWidth;
		const read = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].map(element => {
			const box = element.getBoundingClientRect();
			return {
				selector,
				text: (element.textContent ?? element.getAttribute('aria-label') ?? '').replaceAll(/\s+/g, ' ').trim(),
				left: box.left,
				right: box.right,
				width: box.width,
				clientWidth: element.clientWidth,
				scrollWidth: element.scrollWidth,
			};
		});
		const boxes = [
			...read('.agent-queue-actions .btn'),
			...read('.hot-lead-row'),
			...read('.hot-lead-row > div:first-child'),
			...read('.hot-lead-row__score'),
			...read('.hot-lead-row > .btn--icon'),
		];
		return {
			pageLeft,
			pageRight,
			offenders: boxes.filter(box => box.left < pageLeft - 1 || box.right > pageRight + 1),
			clippedButtons: read('.agent-queue-actions .btn').filter(box => box.scrollWidth > box.clientWidth + 1),
			firstHotLeadCopyWidth: document.querySelector<HTMLElement>('.hot-lead-row > div:first-child')?.getBoundingClientRect().width ?? 0,
		};
	});

	expect(
		geometry.offenders,
		`Mission Control nested controls should stay inside page bounds: ${JSON.stringify(geometry)}`,
	).toEqual([]);
	expect(
		geometry.clippedButtons,
		`Agent queue buttons should wrap instead of clipping: ${JSON.stringify(geometry)}`,
	).toEqual([]);
	expect(
		geometry.firstHotLeadCopyWidth,
		`Hot lead copy should get a full readable row before badges/progress: ${JSON.stringify(geometry)}`,
	).toBeGreaterThan(180);
});

test('mobile · Proposals detail and amount rows stay inside the local console column', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Proposals")').first().click();
	await expect(page.locator('[data-testid="proposal-row"]').first()).toBeVisible();

	const geometry = await page.evaluate(() => {
		const pageElement = document.querySelector<HTMLElement>('.page');
		const pageBox = pageElement?.getBoundingClientRect();
		const read = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].map(element => {
			const box = element.getBoundingClientRect();
			return {
				className: String(element.className || element.tagName),
				left: box.left,
				right: box.right,
				text: (element.textContent ?? '').replaceAll(/\s+/g, ' ').trim(),
			};
		});
		const boxes = [
			...read('[data-testid="proposal-row"]'),
			...read('.proposal-row-card__amount'),
			...read('.proposal-detail-summary'),
			...read('.proposal-detail-actions .btn'),
		];
		return {
			pageClientWidth: pageElement?.clientWidth ?? 0,
			pageLeft: pageBox?.left ?? 0,
			pageRight: pageBox?.right ?? 0,
			pageScrollWidth: pageElement?.scrollWidth ?? 0,
			offenders: boxes.filter(box => box.left < (pageBox?.left ?? 0) - 1 || box.right > (pageBox?.right ?? 0) + 1),
		};
	});

	expect(
		geometry.pageScrollWidth,
		`Proposals should not create local sideways scroll: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(geometry.pageClientWidth + 1);
	expect(
		geometry.offenders,
		`Proposal rows and detail actions should stay inside page bounds: ${JSON.stringify(geometry)}`,
	).toEqual([]);
});

test('mobile · Proposals review controls come before the long proposal list', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Proposals")').first().click();
	await expect(page.locator('.page--proposals .proposal-detail-stack')).toBeVisible();
	await expect(page.locator('.page--proposals .proposals-list-card')).toBeVisible();

	const order = await page.evaluate(() => {
		const detail = document.querySelector<HTMLElement>('.page--proposals .proposal-detail-stack');
		const list = document.querySelector<HTMLElement>('.page--proposals .proposals-list-card');
		const main = document.querySelector<HTMLElement>('main.scroll');
		return {
			detailTop: detail?.getBoundingClientRect().top ?? 0,
			listTop: list?.getBoundingClientRect().top ?? 0,
			mainScrollTop: main?.scrollTop ?? 0,
		};
	});

	expect(order.detailTop, `selected proposal detail should not be buried under the full list: ${JSON.stringify(order)}`).toBeLessThan(order.listTop);
	expect(order.detailTop, `selected proposal detail should appear in the first mobile viewport: ${JSON.stringify(order)}`).toBeLessThan(420);
	expect(order.mainScrollTop, `landing on Proposals should not auto-scroll to recover buried controls: ${JSON.stringify(order)}`).toBeLessThanOrEqual(1);

	await page.getByRole('button', {name: /^review packet$/i}).click();
	const reviewPanel = page.getByTestId('proposal-review-panel');
	await expect(reviewPanel).toBeVisible();
	await expect(reviewPanel).toHaveAttribute('role', 'region');
	await expect(reviewPanel.locator('.workflow-popout__title')).toContainText(/pr-2041 · banyan health/i);
	await expect(page.getByTestId('proposal-review-packet')).toContainText(/pdf preview, source evidence, audit state, and buyer-send gate stay together/i);

	const reviewTop = await reviewPanel.evaluate(panel => panel.getBoundingClientRect().top);
	expect(reviewTop, 'review packet panel should open near the selected proposal controls, not after the proposal list').toBeLessThan(800);
});

test('mobile · Funnel stays inside the console scroller without a sideways trap', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Funnel")').first().click();
	await expect(page.getByRole('heading', {level: 1})).toHaveText('Funnel');
	await expect(page.getByTestId('funnel-chart')).toBeVisible();
	await expect(page.getByTestId('funnel-page')).not.toHaveAttribute('style', /padding/i);

	const geometry = await page.evaluate(() => {
		const main = document.querySelector<HTMLElement>('main.scroll');
		const chart = document.querySelector<HTMLElement>('[data-testid="funnel-chart"]');
		const rows = [...document.querySelectorAll<HTMLElement>('[data-testid^="funnel-row-"]')];
		const mainRect = main?.getBoundingClientRect();
		const rowBoxes = rows.map(row => {
			const rect = row.getBoundingClientRect();
			const bar = row.querySelector('.funnel-row__bar');
			const barRect = bar?.getBoundingClientRect();
			return {
				barRight: barRect?.right ?? 0,
				left: rect.left,
				right: rect.right,
			};
		});

		return {
			chartRight: chart?.getBoundingClientRect().right ?? 0,
			mainClientWidth: main?.clientWidth ?? 0,
			mainRight: mainRect?.right ?? 0,
			mainScrollWidth: main?.scrollWidth ?? 0,
			rowBoxes,
			rowCount: rows.length,
		};
	});

	expect(geometry.rowCount).toBe(5);
	expect(
		geometry.mainScrollWidth,
		`Funnel should not create local horizontal scroll: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(geometry.mainClientWidth + 1);
	expect(
		geometry.chartRight,
		`Funnel chart should stay within the main scroller: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(geometry.mainRight + 1);
	for (const box of geometry.rowBoxes) {
		expect(box.right, `Funnel row should not overflow: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.mainRight + 1);
		expect(box.barRight, `Funnel bar should not overflow: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.mainRight + 1);
	}
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

test('mobile · topbar keeps console branding and active route without bleeding offscreen', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await expect(page.locator('.tb__crumbs')).toBeVisible();

	const geometry = await page.evaluate(() => {
		const read = (selector: string) => {
			const element = document.querySelector(selector);
			if (!element) {
				return undefined;
			}

			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				clientWidth: element.clientWidth,
				display: style.display,
				text: (element.textContent ?? '').trim().split(' ').filter(Boolean).join(' '),
				right: rect.right,
				scrollWidth: element.scrollWidth,
				width: rect.width,
			};
		};

		return {
			actions: read('.tb__actions'),
			active: read('.tb__crumb--active'),
			brand: read('.tb__crumb--brand'),
			crumbs: read('.tb__crumbs'),
			search: read('.tb__search'),
			topbar: read('.tb'),
			viewportWidth: window.innerWidth,
			workspace: read('.tb__crumb--workspace'),
		};
	});

	expect(geometry.brand?.text).toBe('Wranngle');
	expect(geometry.workspace?.text).toBe('gtm_ops console');
	expect(geometry.active?.display).not.toBe('none');
	expect(geometry.active?.text).toBe('Generate Proposal');
	expect(geometry.workspace?.text).not.toMatch(/\bv\d/i);
	expect(
		geometry.workspace?.scrollWidth ?? 0,
		`workspace crumb should render the full "gtm_ops console" label: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual((geometry.workspace?.clientWidth ?? 0) + 1);
	expect(geometry.search?.display).toBe('none');
	expect(
		geometry.topbar?.scrollWidth ?? 0,
		`topbar should not create horizontal bleed: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual((geometry.topbar?.clientWidth ?? 0) + 1);
	expect(
		geometry.actions?.right ?? 0,
		`topbar actions should stay inside the viewport: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(geometry.viewportWidth + 1);
});

test('mobile · 320px topbar keeps the workspace brand on one line', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 320, height: 844});
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const geometry = await page.evaluate(() => {
		const read = (selector: string) => {
			const element = document.querySelector(selector);
			if (!element) {
				return undefined;
			}

			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			const lineHeight = Number.parseFloat(style.lineHeight);
			return {
				clientWidth: element.clientWidth,
				height: rect.height,
				lineHeight,
				scrollWidth: element.scrollWidth,
				text: (element.textContent ?? '').replaceAll(/\s+/g, ' ').trim(),
				whiteSpace: style.whiteSpace,
			};
		};

		return {
			active: read('.tb__crumb--active'),
			topbar: read('.tb'),
			viewportWidth: window.innerWidth,
			workspace: read('.tb__crumb--workspace'),
		};
	});

	expect(geometry.workspace?.text).toBe('gtm_ops console');
	expect(geometry.active?.text).toBe('Generate Proposal');
	expect(geometry.workspace?.whiteSpace).toBe('nowrap');
	expect(
		geometry.workspace?.height ?? 0,
		`workspace crumb should not wrap at 320px: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual((geometry.workspace?.lineHeight ?? 0) * 1.4);
	expect(
		geometry.workspace?.scrollWidth ?? 0,
		`workspace crumb should show the full "gtm_ops console" label at 320px: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual((geometry.workspace?.clientWidth ?? 0) + 1);
	expect(
		geometry.topbar?.scrollWidth ?? 0,
		`320px topbar should not create horizontal bleed: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(geometry.viewportWidth - 64 + 1);
});

test('mobile · Generate run facts stay readable instead of truncating the sequence state', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const facts = page.locator('.generate-run-fact');
	await expect(facts).toHaveCount(4);
	await expect(page.getByTestId('generate-run-fact-buyer')).toHaveAttribute(
		'aria-label',
		/active buyer: none loaded\. no sample or handoff selected/i,
	);
	await expect(page.getByTestId('generate-run-fact-send')).toHaveAttribute(
		'aria-label',
		/buyer send: blocked\. requires proposals approval/i,
	);

	const detailLayout = await facts.evaluateAll(nodes => nodes.map(node => {
		const small = node.querySelector('small');
		const style = small ? getComputedStyle(small) : null;
		return {
			label: (node.querySelector('span')?.textContent ?? '').trim(),
			smallOverflow: style?.overflow,
			smallScrollWidth: small?.scrollWidth ?? 0,
			smallClientWidth: small?.clientWidth ?? 0,
			textOverflow: style?.textOverflow,
			whiteSpace: style?.whiteSpace,
		};
	}));
	const valueLayout = await facts.evaluateAll(nodes => nodes.map(node => {
		const value = node.querySelector('strong');
		const valueStyle = value ? getComputedStyle(value) : null;
		return {
			label: (node.querySelector('span')?.textContent ?? '').trim(),
			value: (value?.textContent ?? '').trim(),
			valueScrollWidth: value?.scrollWidth ?? 0,
			valueClientWidth: value?.clientWidth ?? 0,
			valueTextOverflow: valueStyle?.textOverflow,
			valueWhiteSpace: valueStyle?.whiteSpace,
			wordSpacing: valueStyle?.wordSpacing,
		};
	}));
	const stripBox = await page.getByTestId('generate-run-strip').boundingBox();

	for (const fact of detailLayout) {
		expect(
			fact.whiteSpace,
			`${fact.label} detail should wrap on mobile: ${JSON.stringify(fact)}`,
		).not.toBe('nowrap');
		expect(
			fact.textOverflow,
			`${fact.label} detail should not depend on ellipsis: ${JSON.stringify(fact)}`,
		).not.toBe('ellipsis');
		expect(
			fact.smallScrollWidth,
			`${fact.label} detail should stay inside its fact card: ${JSON.stringify(fact)}`,
		).toBeLessThanOrEqual(fact.smallClientWidth + 1);
	}

	for (const fact of valueLayout) {
		expect(
			fact.valueWhiteSpace,
			`${fact.label} value should wrap instead of visually collapsing: ${JSON.stringify(fact)}`,
		).not.toBe('nowrap');
		expect(
			fact.valueTextOverflow,
			`${fact.label} value should not depend on ellipsis: ${JSON.stringify(fact)}`,
		).not.toBe('ellipsis');
		expect(
			fact.valueScrollWidth,
			`${fact.label} value should stay inside its fact card: ${JSON.stringify(fact)}`,
		).toBeLessThanOrEqual(fact.valueClientWidth + 1);
	}

	expect(valueLayout.find(fact => fact.label === 'review packet')?.wordSpacing).not.toBe('0px');
	expect(stripBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(150);
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

test('mobile · eval tool latency chips wrap inside the console column', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Evals")').first().click();
	await expect(page.locator('[data-testid="eval-tool-latency-rollup"]')).toBeVisible();

	const geometry = await page.locator('[data-testid="eval-tool-latency-rollup"]').evaluate(root => {
		const rootRect = root.getBoundingClientRect();
		const chips = [...root.querySelectorAll('[data-testid="eval-tool-latency-rollup-row"]')]
			.map(element => {
				const r = element.getBoundingClientRect();
				return {
					right: r.right,
					text: (element.textContent ?? '').replaceAll(/\s+/g, ' ').trim(),
					width: r.width,
				};
			});
		return {
			chips,
			clientWidth: root.clientWidth,
			rootRight: rootRect.right,
			scrollWidth: root.scrollWidth,
			widestChip: Math.max(...chips.map(chip => chip.width)),
		};
	});

	expect(
		geometry.scrollWidth,
		`eval latency rollup should not create an internal horizontal scroll: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(geometry.clientWidth + 1);
	expect(
		geometry.widestChip,
		`eval latency chips should wrap metadata instead of exceeding the card: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(geometry.clientWidth + 1);
	expect(
		geometry.chips.every(chip => chip.right <= geometry.rootRight + 1),
		`eval latency chips painted past the column edge: ${JSON.stringify(geometry)}`,
	).toBe(true);
});

test('mobile · eval harness run names stay readable inside result rows', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Evals")').first().click();
	await expect(page.locator('.eval-run-row')).toHaveCount(8);

	const layout = await page.locator('.eval-run-row').evaluateAll(rows => rows.map(row => {
		const title = row.querySelector<HTMLElement>('.eval-run-row__title');
		const rowBox = row.getBoundingClientRect();
		const titleBox = title?.getBoundingClientRect();
		const style = title ? getComputedStyle(title) : null;
		return {
			clientWidth: title?.clientWidth ?? 0,
			rowWidth: rowBox.width,
			scrollWidth: title?.scrollWidth ?? 0,
			text: title?.textContent?.trim() ?? '',
			textOverflow: style?.textOverflow ?? '',
			titleWidth: titleBox?.width ?? 0,
			whiteSpace: style?.whiteSpace ?? '',
		};
	}));
	const noisyRun = layout.find(row => row.text === 'Noisy Caller Transcription Stress');

	expect(noisyRun, `expected noisy-caller run row: ${JSON.stringify(layout)}`).toBeTruthy();
	expect(
		noisyRun?.whiteSpace,
		`eval run title should wrap on mobile: ${JSON.stringify(noisyRun)}`,
	).not.toBe('nowrap');
	expect(
		noisyRun?.textOverflow,
		`eval run title should not depend on ellipsis: ${JSON.stringify(noisyRun)}`,
	).not.toBe('ellipsis');
	expect(
		noisyRun?.scrollWidth ?? Number.POSITIVE_INFINITY,
		`eval run title should fit its readable title column: ${JSON.stringify(noisyRun)}`,
	).toBeLessThanOrEqual((noisyRun?.clientWidth ?? 0) + 1);
	expect(
		noisyRun?.titleWidth ?? 0,
		`eval run title should use the result row width instead of a cramped metric column: ${JSON.stringify(noisyRun)}`,
	).toBeGreaterThan((noisyRun?.rowWidth ?? 0) * 0.68);
});

test('mobile · Evals suite and harness panels do not create a local sideways scroll', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Evals")').first().click();
	await expect(page.locator('.eval-run-row')).toHaveCount(8);

	const geometry = await page.evaluate(() => {
		const main = document.querySelector<HTMLElement>('main.scroll');
		const pageElement = document.querySelector<HTMLElement>('.page--evals');
		const pageBox = pageElement?.getBoundingClientRect();
		const pageLeft = pageBox?.left ?? 0;
		const pageRight = pageBox?.right ?? window.innerWidth;
		const read = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].map(element => {
			const box = element.getBoundingClientRect();
			return {
				selector,
				text: (element.textContent ?? '').replaceAll(/\s+/g, ' ').trim(),
				left: box.left,
				right: box.right,
				width: box.width,
				clientWidth: element.clientWidth,
				scrollWidth: element.scrollWidth,
			};
		});
		const watched = [
			...read('.eval-suites-card .eval-suite-row__select'),
			...read('.eval-runs-card .card__hd'),
			...read('.eval-runs-card__actions'),
			...read('.eval-runs-card__actions .btn'),
		];
		return {
			mainClientWidth: main?.clientWidth ?? 0,
			mainScrollWidth: main?.scrollWidth ?? 0,
			pageLeft,
			pageRight,
			offenders: watched.filter(box => box.left < pageLeft - 1 || box.right > pageRight + 1),
			clipped: watched.filter(box => box.scrollWidth > box.clientWidth + 1),
		};
	});

	expect(
		geometry.mainScrollWidth,
		`Evals should not create a sideways scroll inside main.scroll: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(geometry.mainClientWidth + 1);
	expect(
		geometry.offenders,
		`Evals suite/harness controls should stay inside the local column: ${JSON.stringify(geometry)}`,
	).toEqual([]);
	expect(
		geometry.clipped,
		`Evals suite/harness controls should wrap instead of clipping: ${JSON.stringify(geometry)}`,
	).toEqual([]);
});

test('mobile · Evals command center keeps local actions in the first viewport', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Evals")').first().click();
	await expect(page.locator('[data-testid="eval-command-center"]')).toBeVisible();
	await expect(page.getByTestId('eval-command-open-artifact')).toBeVisible();
	await expect(page.getByTestId('eval-command-open-artifact')).toHaveText(/review artifact/i);
	await expect(page.getByTestId('eval-command-evidence-card')).toContainText(/review evidence packet/i);
	await expect(page.getByTestId('eval-command-evidence-card')).toContainText(/source evidence/i);
	await expect(page.getByTestId('eval-command-open-admin')).toBeVisible();
	await expect(page.getByTestId('eval-command-open-admin')).toHaveText(/open local admin/i);
	await expect(page.getByTestId('eval-local-agent-admin')).toHaveCount(0);
	await expect(page.getByTestId('eval-artifacts-open')).toHaveCount(0);
	await expect(page.getByTestId('eval-run-plan-summary')).toBeVisible();

	const geometry = await page.evaluate(() => {
		const command = document.querySelector<HTMLElement>('[data-testid="eval-command-center"]');
		const commandBox = command?.getBoundingClientRect();
		const buttons = [...document.querySelectorAll<HTMLElement>('.eval-command-center__actions .btn')]
			.filter(button => button.offsetParent !== null)
			.map(button => {
				const box = button.getBoundingClientRect();
				return {
					bottom: Math.round(box.bottom),
					left: Math.round(box.left),
					text: (button.textContent ?? '').replaceAll(/\s+/g, ' ').trim(),
					top: Math.round(box.top),
					width: Math.round(box.width),
				};
			});
		const rowTops = [...new Set(buttons.map(button => button.top))];
		return {
			buttons,
			commandHeight: Math.round(commandBox?.height ?? 0),
			maxButtonBottom: Math.max(...buttons.map(button => button.bottom)),
			rowTops,
			viewportHeight: window.innerHeight,
		};
	});

	expect(
		geometry.commandHeight,
		`Evals command center should not consume a whole mobile screen before the run plan: ${JSON.stringify(geometry)}`,
	).toBeLessThan(760);
	expect(
		geometry.rowTops.length,
		`Evals local actions should pack into two rows, not one full-width button per row: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(2);
	expect(
		geometry.maxButtonBottom,
		`Evals local actions should be visible before the first mobile fold: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(geometry.viewportHeight);
	expect(geometry.buttons.map(button => button.text)).toEqual(['Policy settings', 'New suite']);
});

test('mobile · Evals keeps the Coach launcher in the sidebar rail', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Evals")').first().click();
	await expect(page.locator('.coach-launcher')).toBeVisible();
	await expect(page.getByTestId('eval-command-center')).toBeVisible();

	const geometry = await page.evaluate(() => {
		const read = (selector: string): {bottom: number; left: number; right: number; top: number} | undefined => {
			const element = document.querySelector(selector);
			if (!element) {
				return;
			}

			const rect = element.getBoundingClientRect();
			return {
				bottom: rect.bottom,
				left: rect.left,
				right: rect.right,
				top: rect.top,
			};
		};

		const overlaps = (
			a: {bottom: number; left: number; right: number; top: number} | undefined,
			b: {bottom: number; left: number; right: number; top: number} | undefined,
		) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);

		const launcher = read('.coach-launcher');
		const sidebar = read('.sb');
		const commandCenter = read('[data-testid="eval-command-center"]');
		const evidenceCard = read('[data-testid="eval-command-evidence-card"]');
		const runPlan = read('[data-testid="eval-run-plan-summary"]');
		return {
			commandCenter,
			evidenceCard,
			launcher,
			runPlan,
			sidebar,
			launcherInsideRail: Boolean(launcher && sidebar && launcher.left >= sidebar.left - 1 && launcher.right <= sidebar.right + 1),
			overlapsCommandCenter: overlaps(launcher, commandCenter),
			overlapsEvidenceCard: overlaps(launcher, evidenceCard),
			overlapsRunPlan: overlaps(launcher, runPlan),
		};
	});

	expect(
		geometry.launcherInsideRail,
		`Coach launcher should live in the collapsed sidebar rail on Evals mobile: ${JSON.stringify(geometry)}`,
	).toBe(true);
	expect(
		geometry.overlapsCommandCenter,
		`Coach launcher must not float over the Evals command center: ${JSON.stringify(geometry)}`,
	).toBe(false);
	expect(
		geometry.overlapsEvidenceCard,
		`Coach launcher must not cover local ElevenLabs evidence actions: ${JSON.stringify(geometry)}`,
	).toBe(false);
	expect(
		geometry.overlapsRunPlan,
		`Coach launcher must not obscure the eval run plan: ${JSON.stringify(geometry)}`,
	).toBe(false);
});

test('mobile · Evals evidence actions stay distinct inside the local ElevenLabs wrapper', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Evals")').first().click();
	await expect(page.getByTestId('eval-command-evidence-card')).toBeVisible();

	const layout = await page.getByTestId('eval-command-evidence-card').evaluate(card => {
		const cardBox = card.getBoundingClientRect();
		const actionBox = card.querySelector<HTMLElement>('.eval-command-center__evidence-actions')?.getBoundingClientRect();
		const buttons = [...card.querySelectorAll<HTMLElement>('.eval-command-center__evidence-actions .btn')].map(button => {
			const box = button.getBoundingClientRect();
			const style = getComputedStyle(button);
			return {
				clientWidth: button.clientWidth,
				left: Math.round(box.left),
				right: Math.round(box.right),
				scrollWidth: button.scrollWidth,
				text: (button.textContent ?? '').replaceAll(/\s+/g, ' ').trim(),
				whiteSpace: style.whiteSpace,
				width: Math.round(box.width),
			};
		});

		return {
			actionWidth: Math.round(actionBox?.width ?? 0),
			buttons,
			cardRight: Math.round(cardBox.right),
			gap: buttons.length > 1 ? Math.round(buttons[1].left - buttons[0].right) : 0,
			scrollWidth: card.scrollWidth,
			clientWidth: card.clientWidth,
		};
	});

	expect(layout.buttons.map(button => button.text)).toEqual(['Review artifact', 'Open local admin']);
	expect(
		layout.scrollWidth,
		`evidence card should not create an internal sideways scroll: ${JSON.stringify(layout)}`,
	).toBeLessThanOrEqual(layout.clientWidth + 1);
	expect(
		layout.gap,
		`evidence actions should be visually distinct, not jammed into one text run: ${JSON.stringify(layout)}`,
	).toBeGreaterThanOrEqual(4);
	for (const button of layout.buttons) {
		expect(
			button.whiteSpace,
			`${button.text} should wrap if needed on mobile: ${JSON.stringify(layout)}`,
		).toBe('normal');
		expect(
			button.scrollWidth,
			`${button.text} should fit inside its button: ${JSON.stringify(layout)}`,
		).toBeLessThanOrEqual(button.clientWidth + 1);
		expect(
			button.right,
			`${button.text} should stay inside the evidence card: ${JSON.stringify(layout)}`,
		).toBeLessThanOrEqual(layout.cardRight + 1);
	}
});

test('mobile · Evals evidence packet title wraps inside the local ElevenLabs wrapper', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Evals")').first().click();
	await expect(page.getByTestId('eval-command-evidence-title')).toBeVisible();
	await expect(page.getByTestId('eval-command-evidence-kind')).toHaveText(/source evidence\s*·\s*json/i);

	const evidence = await page.getByTestId('eval-command-evidence-title').evaluate(element => {
		const box = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		return {
			height: Math.round(box.height),
			lineHeight: Number.parseFloat(style.lineHeight),
			overflow: style.overflow,
			scrollWidth: element.scrollWidth,
			clientWidth: element.clientWidth,
			text: element.textContent?.replaceAll(/\s+/g, ' ').trim(),
			whiteSpace: style.whiteSpace,
		};
	});

	expect(evidence.text).toMatch(/noisy caller transcription stress/i);
	expect(evidence.text).toMatch(/review evidence packet/i);
	expect(evidence.whiteSpace, `evidence title should wrap instead of ellipsizing: ${JSON.stringify(evidence)}`).toBe('normal');
	expect(evidence.overflow, `evidence title should not hide the review artifact name: ${JSON.stringify(evidence)}`).toBe('visible');
	expect(evidence.scrollWidth, `evidence title should fit its card: ${JSON.stringify(evidence)}`).toBeLessThanOrEqual(evidence.clientWidth + 1);
	expect(evidence.height, `evidence title should allow multiple readable lines: ${JSON.stringify(evidence)}`).toBeGreaterThan(evidence.lineHeight);
});

test('mobile · Evals run rows expand instead of overlapping wrapped scenario metadata', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Evals")').first().click();
	await expect(page.locator('.eval-run-row')).toHaveCount(8, {timeout: 10_000});

	const layout = await page.locator('.eval-run-row').evaluateAll(rows => rows.map((row, index) => {
		const box = row.getBoundingClientRect();
		const select = row.querySelector<HTMLElement>('.eval-run-row__select');
		const selectBox = select?.getBoundingClientRect();
		return {
			index,
			bottom: Math.round(box.bottom),
			height: Math.round(box.height),
			selectBottom: Math.round(selectBox?.bottom ?? 0),
			selectHeight: Math.round(selectBox?.height ?? 0),
			text: (row.textContent ?? '').replaceAll(/\s+/g, ' ').trim().slice(0, 96),
			top: Math.round(box.top),
		};
	}));

	expect(layout.length).toBe(8);
	for (const row of layout) {
		expect(
			row.height,
			`Evals run row should grow to contain wrapped metadata: ${JSON.stringify(layout)}`,
		).toBeGreaterThanOrEqual(row.selectHeight);
		expect(
			row.bottom,
			`Evals run row should contain its selectable content: ${JSON.stringify(layout)}`,
		).toBeGreaterThanOrEqual(row.selectBottom);
	}

	for (let index = 1; index < layout.length; index += 1) {
		expect(
			layout[index].top,
			`Evals run rows should not overlap each other on mobile: ${JSON.stringify(layout)}`,
		).toBeGreaterThanOrEqual(layout[index - 1].bottom + 7);
	}
});

test('mobile · Agents admin surfaces stay inside the console column', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Agents")').first().click();
	await expect(page.locator('.agent-admin-card')).toBeVisible();

	const geometry = await page.locator('.agent-admin-card').evaluate(card => {
		const cardRect = card.getBoundingClientRect();
		const checked = [
			'.agent-admin-hero',
			'.agent-admin-tabs',
			'.agent-admin-panel',
			'.agent-admin-grid',
			'.agent-admin-block',
			'.agent-admin-actions',
			'.agent-admin-actions .btn',
		].flatMap(selector => [...card.querySelectorAll(selector)].map(element => {
			const r = element.getBoundingClientRect();
			return {
				left: r.left,
				selector,
				right: r.right,
				text: (element.textContent ?? '').replaceAll(/\s+/g, ' ').trim().slice(0, 80),
				width: r.width,
			};
		}));
		return {
			cardClientWidth: card.clientWidth,
			cardLeft: cardRect.left,
			cardRight: cardRect.right,
			cardScrollWidth: card.scrollWidth,
			offenders: checked.filter(item => item.left < cardRect.left - 1 || item.right > cardRect.right + 1),
		};
	});

	expect(
		geometry.cardScrollWidth,
		`Agents admin card should not create an internal horizontal scroll: ${JSON.stringify(geometry)}`,
	).toBeLessThanOrEqual(geometry.cardClientWidth + 1);
	expect(
		geometry.offenders,
		`Agents admin children painted past the card edge: ${JSON.stringify(geometry)}`,
	).toEqual([]);
});

test('mobile · Generate keeps buyer proof before the locked artifact review', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await expect(page.locator('.generate-brief-card')).toBeVisible();
	await expect(page.locator('.generate-review-card')).toBeVisible();

	const order = await page.evaluate(() => {
		const brief = document.querySelector('.generate-brief-card');
		const trace = document.querySelector('.generate-trace-card');
		const review = document.querySelector('.generate-review-card');
		return {
			briefTop: brief?.getBoundingClientRect().top ?? 0,
			traceTop: trace?.getBoundingClientRect().top ?? 0,
			reviewTop: review?.getBoundingClientRect().top ?? 0,
			firstGridCardTitle: (document.querySelector('.generate-grid > .card .card__title')?.textContent ?? '').trim(),
		};
	});

	expect(order.firstGridCardTitle).toBe('[buyer proof]');
	expect(
		order.briefTop,
		`buyer proof must not be buried below review: ${JSON.stringify(order)}`,
	).toBeLessThan(order.reviewTop);
	expect(
		order.traceTop,
		`sequence trace should stay between input and review: ${JSON.stringify(order)}`,
	).toBeLessThan(order.reviewTop);
});

test('mobile · Generate keeps the Coach launcher in the sidebar rail', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 375, height: 800});
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await expect(page.locator('.coach-launcher')).toBeVisible();
	await expect(page.locator('.generate-brief-card')).toBeVisible();

	const geometry = await page.evaluate(() => {
		const read = (selector: string): {bottom: number; left: number; right: number; top: number} | undefined => {
			const element = document.querySelector(selector);
			if (!element) {
				return;
			}

			const rect = element.getBoundingClientRect();
			return {
				bottom: rect.bottom,
				left: rect.left,
				right: rect.right,
				top: rect.top,
			};
		};

		const overlaps = (
			a: {bottom: number; left: number; right: number; top: number} | undefined,
			b: {bottom: number; left: number; right: number; top: number} | undefined,
		) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);

		const launcher = read('.coach-launcher');
		const pageColumn = read('.page');
		const sidebar = read('.sb');
		const brief = read('.generate-brief-card');
		const buyerProofInput = read('.generate-brief-card textarea');
		return {
			brief,
			buyerProofInput,
			launcher,
			pageColumn,
			sidebar,
			launcherInsideRail: Boolean(launcher && sidebar && launcher.left >= sidebar.left - 1 && launcher.right <= sidebar.right + 1),
			overlapsBrief: overlaps(launcher, brief),
			overlapsBuyerProofInput: overlaps(launcher, buyerProofInput),
			overlapsPageColumn: overlaps(launcher, pageColumn),
		};
	});

	expect(
		geometry.launcherInsideRail,
		`Coach launcher should live in the collapsed sidebar rail on Generate mobile: ${JSON.stringify(geometry)}`,
	).toBe(true);
	expect(
		geometry.overlapsPageColumn,
		`Coach launcher must not float over Generate content: ${JSON.stringify(geometry)}`,
	).toBe(false);
	expect(
		geometry.overlapsBrief,
		`Coach launcher must not cover buyer proof card: ${JSON.stringify(geometry)}`,
	).toBe(false);
	expect(
		geometry.overlapsBuyerProofInput,
		`Coach launcher must not cover the buyer proof input: ${JSON.stringify(geometry)}`,
	).toBe(false);
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
			.map(element => {
				const r = element.getBoundingClientRect();
				return {
					text: (element.textContent ?? '').trim(),
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
