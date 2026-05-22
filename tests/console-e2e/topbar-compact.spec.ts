import {test, expect} from './helpers.js';

test('compact desktop topbar keeps primary shell actions legible', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 1024, height: 768});
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const layout = await page.evaluate(() => {
		const read = (selector: string) => {
			const element = document.querySelector(selector) as HTMLElement | null;
			if (!element) return null;
			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			const after = getComputedStyle(element, '::after');
			return {
				afterContent: after.content,
				clientWidth: element.clientWidth,
				display: style.display,
				right: rect.right,
				text: (element.textContent ?? '').replaceAll(/\s+/g, ' ').trim(),
				width: rect.width,
			};
		};

		return {
			actions: read('.tb__actions'),
			newRun: read('.tb__run'),
			runLabel: read('.tb__run-label'),
			search: read('.tb__search'),
			topbar: read('.tb'),
			viewportWidth: window.innerWidth,
		};
	});

	expect(layout.search?.display).not.toBe('none');
	expect(layout.search?.afterContent).toBe('"Search"');
	expect(layout.search?.width ?? 0).toBeGreaterThanOrEqual(88);
	expect(layout.newRun?.text).toMatch(/new run/i);
	expect(layout.runLabel?.width ?? 0).toBeGreaterThan(40);
	expect(
		layout.topbar?.right ?? 0,
		`topbar should stay inside viewport: ${JSON.stringify(layout)}`,
	).toBeLessThanOrEqual(layout.viewportWidth + 1);
	expect(
		layout.actions?.right ?? 0,
		`topbar actions should stay inside viewport: ${JSON.stringify(layout)}`,
	).toBeLessThanOrEqual(layout.viewportWidth + 1);
});

test('tablet topbar keeps New run named instead of collapsing to a bare plus', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 820, height: 768});
	await page.locator('.sb__item:has-text("Evals")').first().click();

	const layout = await page.evaluate(() => {
		const read = (selector: string) => {
			const element = document.querySelector(selector) as HTMLElement | null;
			if (!element) return null;
			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				clientWidth: element.clientWidth,
				display: style.display,
				left: rect.left,
				right: rect.right,
				text: (element.textContent ?? '').replaceAll(/\s+/g, ' ').trim(),
				width: rect.width,
			};
		};

		const overlaps = (a: ReturnType<typeof read>, b: ReturnType<typeof read>) =>
			Boolean(a && b && a.left < b.right && a.right > b.left);

		return {
			actions: read('.tb__actions'),
			crumbs: read('.tb__crumbs'),
			newRun: read('.tb__run'),
			runLabel: read('.tb__run-label'),
			search: read('.tb__search'),
			viewportWidth: window.innerWidth,
			runOverlapsSearch: overlaps(read('.tb__run'), read('.tb__search')),
			runOverflowing: (() => {
				const element = document.querySelector('.tb__run') as HTMLElement | null;
				return element ? element.scrollWidth > element.clientWidth + 1 : true;
			})(),
		};
	});

	expect(layout.newRun?.text).toMatch(/new run/i);
	expect(layout.runLabel?.width ?? 0).toBeGreaterThan(40);
	expect(layout.runLabel?.display).not.toBe('none');
	expect(layout.search?.width ?? 0).toBeLessThanOrEqual(44);
	expect(layout.runOverlapsSearch, `New run should not collide with search: ${JSON.stringify(layout)}`).toBe(false);
	expect(layout.runOverflowing, `New run label should fit inside the button: ${JSON.stringify(layout)}`).toBe(false);
	expect(
		layout.actions?.right ?? 0,
		`topbar actions should stay inside viewport: ${JSON.stringify(layout)}`,
	).toBeLessThanOrEqual(layout.viewportWidth + 1);
	expect(layout.crumbs?.width ?? 0).toBeGreaterThan(160);
});

test('mobile New run menu opens as a bounded console sheet beside the rail', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 390, height: 844});

	await page.locator('.tb__run').click();
	await expect(page.locator('#new-run-popover')).toBeVisible();

	const layout = await page.evaluate(() => {
		const popover = document.querySelector('#new-run-popover') as HTMLElement | null;
		const rail = document.querySelector('.sb') as HTMLElement | null;
		const rows = [...document.querySelectorAll('#new-run-popover .pop__row')] as HTMLElement[];
		const rect = (element: HTMLElement | null) => {
			if (!element) return null;
			const box = element.getBoundingClientRect();
			return {
				bottom: Math.round(box.bottom),
				height: Math.round(box.height),
				left: Math.round(box.left),
				right: Math.round(box.right),
				top: Math.round(box.top),
				width: Math.round(box.width),
			};
		};
		const style = popover ? getComputedStyle(popover) : null;
		const rowMetrics = rows.map(row => ({
			clientWidth: row.clientWidth,
			height: Math.round(row.getBoundingClientRect().height),
			scrollWidth: row.scrollWidth,
			text: (row.textContent ?? '').replaceAll(/\s+/g, ' ').trim(),
		}));

		return {
			backgroundColor: style?.backgroundColor ?? '',
			maxHeight: style?.maxHeight ?? '',
			popover: rect(popover),
			rail: rect(rail),
			rows: rowMetrics,
			viewportHeight: window.innerHeight,
			viewportWidth: window.innerWidth,
		};
	});

	expect(layout.popover, `New run popover should render: ${JSON.stringify(layout)}`).not.toBeNull();
	expect(layout.rail, `collapsed rail should render: ${JSON.stringify(layout)}`).not.toBeNull();
	expect(layout.popover!.left, `popover should start in the content column, not over the icon rail: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(layout.rail!.right + 10);
	expect(layout.popover!.right, `popover should stay inside the mobile viewport: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.viewportWidth - 10);
	expect(layout.popover!.bottom, `popover should stay within the viewport: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.viewportHeight - 10);
	expect(layout.popover!.width, `popover should use the available content column instead of a cramped anchor width: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(290);
	expect(layout.backgroundColor, `popover needs an opaque panel so page copy does not compete underneath: ${JSON.stringify(layout)}`).toMatch(/rgb\(21,\s*20,\s*29\)|rgb\(255,\s*255,\s*255\)/);
	expect(layout.rows).toHaveLength(5);
	for (const row of layout.rows) {
		expect(row.height, `run menu rows need touch-sized targets: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(54);
		expect(row.scrollWidth, `run menu row text should not clip: ${JSON.stringify(row)}`).toBeLessThanOrEqual(row.clientWidth + 1);
	}
});
