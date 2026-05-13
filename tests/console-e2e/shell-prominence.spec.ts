import {test, expect} from './helpers.js';

const CORE_ROUTES = [
	{id: 'home', name: 'Callbacks', crumb: /callbacks/i},
	{id: 'generate', name: 'Generate', crumb: /generate/i},
	{id: 'pipeline', name: 'Pipeline', crumb: /pipeline/i},
	{id: 'calls', name: 'Calls', crumb: /calls/i},
	{id: 'proposals', name: 'Proposals', crumb: /proposals/i},
	{id: 'evals', name: 'Evals', crumb: /evals/i},
	{id: 'agents', name: 'Agents', crumb: /agents/i},
	{id: 'settings', name: 'Settings', crumb: /settings/i},
];

test('public shell exposes every core console route without admin mode', async ({openConsole}) => {
	const page = await openConsole();
	await expect(page).not.toHaveURL(/admin=1/);

	for (const route of CORE_ROUTES) {
		const routeButton = page.locator(`[data-testid="sidebar-route"][data-route-id="${route.id}"]`);
		await expect(routeButton, `${route.id} route button`).toBeVisible();
		await expect(
			page.getByRole('button', {name: new RegExp(String.raw`^${route.name}(?: \d+)?$`, 'i')}),
			`${route.name} accessible name`,
		).toBeVisible();

		if (route.id === 'generate' || route.id === 'evals') {
			await routeButton.click();
			await expect(page.locator('.tb__crumb--active')).toContainText(route.crumb);
		}
	}
});

test('public shell keeps ElevenLabs agents visible as local console targets', async ({openConsole}) => {
	const page = await openConsole();
	const agentRows = page.locator('.sb__nav[aria-label="ElevenLabs agents"] .sb__item');
	await expect(agentRows).toHaveCount(2);
	await expect(agentRows.first().locator('.el-orb')).toBeVisible();
	await expect(page.locator('[data-testid="sidebar-agent-route"][data-agent-key="sales_coach"] .sb__agent-name')).toHaveText('Sales Coach');
	await expect(page.locator('[data-testid="sidebar-agent-route"][data-agent-key="sales_coach"] .sb__agent-surface')).toHaveText('all pages');
	await expect(page.locator('[data-testid="sidebar-agent-route"][data-agent-key="intake"] .sb__agent-name')).toHaveText('Sarah Intake');
	await expect(page.locator('[data-testid="sidebar-agent-route"][data-agent-key="intake"] .sb__agent-surface')).toHaveText('pipeline lead');

	const labelMetrics = await agentRows.evaluateAll(rows => rows.map(row => {
		const name = row.querySelector('.sb__agent-name');
		const surface = row.querySelector('.sb__agent-surface');
		return {
			nameFits: Boolean(name && name.scrollWidth <= name.clientWidth + 1),
			rowHeight: row.getBoundingClientRect().height,
			surfaceFits: Boolean(surface && surface.scrollWidth <= surface.clientWidth + 1),
		};
	}));
	for (const metrics of labelMetrics) {
		expect(metrics.nameFits, 'agent name should not be clipped in the sidebar').toBe(true);
		expect(metrics.surfaceFits, 'agent scope should not be clipped in the sidebar').toBe(true);
		expect(metrics.rowHeight, 'agent row should have room for name and local scope').toBeGreaterThanOrEqual(38);
	}

	await page.locator('[data-testid="sidebar-agent-route"][data-agent-key="intake"]').click();
	await expect(page.locator('.tb__crumb--active')).toContainText(/agents/i);
	await expect(page.locator('[data-testid="sidebar-agent-route"][data-agent-key="intake"]')).toHaveAttribute('data-active', 'true');

	const ctx = await page.evaluate(() => (globalThis as any).AppContext.get().extra);
	expect(ctx.selected_agent_key).toBe('intake');
	expect(ctx.triggered_from).toBe('sidebar-agent-nav');
});

test('desktop shell brands the route as Wranngle / gtm_ops console without a version chip', async ({openConsole}) => {
	const page = await openConsole();
	const routeLabel = page.getByTestId('topbar-route-label');

	await expect(page.locator('.sb__wordmark-text')).toHaveText('Wranngle');
	await expect(page.locator('.sb__brand-sub')).toHaveText('gtm_ops console');
	await expect(routeLabel.locator('.tb__route-brand')).toHaveText('Wranngle');
	await expect(routeLabel.locator('.tb__route-product')).toHaveText('gtm_ops console');
	await expect(routeLabel).toContainText(/wranngle\s*\/\s*gtm_ops console\s*\/\s*callbacks/i);
	await expect(routeLabel.locator('.tb__route-page')).toHaveText('Callbacks');
	await expect(routeLabel.locator('.tb__route-page')).not.toContainText(/home/i);
	await expect(routeLabel).not.toContainText(/v\d/i);

	await page.locator('[data-testid="sidebar-route"][data-route-id="generate"]').click();
	await expect(routeLabel).toContainText(/wranngle\s*\/\s*gtm_ops console\s*\/\s*generate/i);
	await expect(routeLabel).not.toContainText(/v\d/i);
});

test('desktop shell separates breadcrumb, search, and run actions on the crowded Generate route', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1366, height: 768});
	await openConsole();
	await page.locator('[data-testid="sidebar-route"][data-route-id="generate"]').click();

	const layout = await page.evaluate(() => {
		const rectFor = (selector: string) => {
			const element = document.querySelector(selector);
			const rect = element?.getBoundingClientRect();
			return rect ? {left: rect.left, right: rect.right, width: rect.width} : null;
		};

		const topbar = rectFor('.tb');
		const route = document.querySelector('[data-testid="topbar-route-label"]');
		const routeBox = route?.getBoundingClientRect();
		const search = rectFor('.tb__search');
		const actions = rectFor('.tb__actions');
		const coach = rectFor('.coach-launcher');
		const overlaps = (a: {left: number; right: number} | undefined, b: {left: number; right: number} | undefined) =>
			Boolean(a && b && a.left < b.right && a.right > b.left);
		return {
			actionsInside: Boolean(topbar && actions && actions.right <= topbar.right + 1),
			bodyOverflow: document.body.scrollWidth > window.innerWidth + 1,
			coachClearOfActions: !overlaps(coach, actions),
			coachClearOfRoute: !overlaps(coach, routeBox ? {left: routeBox.left, right: routeBox.right, width: routeBox.width} : null),
			coachClearOfSearch: !overlaps(coach, search),
			routeToSearchGap: routeBox && search ? Math.round(search.left - routeBox.right) : -1,
			routeTextFits: Boolean(route && route.scrollWidth <= route.clientWidth + 1),
			searchBeforeActions: Boolean(search && actions && search.right <= actions.left - 1),
		};
	});

	expect(layout.bodyOverflow, `topbar leaked horizontal scroll: ${JSON.stringify(layout)}`).toBe(false);
	expect(layout.routeTextFits, `breadcrumb text should not be clipped: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.routeToSearchGap, `search should not crowd the route label: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(72);
	expect(layout.searchBeforeActions, `search and action cluster overlapped: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.actionsInside, `run actions escaped the topbar: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.coachClearOfRoute, `coach launcher covered the route label: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.coachClearOfSearch, `coach launcher covered command search: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.coachClearOfActions, `coach launcher covered topbar actions: ${JSON.stringify(layout)}`).toBe(true);
});

test('narrow desktop shell keeps Generate route identity readable', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1024, height: 720});
	await openConsole();
	await page.locator('[data-testid="sidebar-route"][data-route-id="generate"]').click();

	const layout = await page.evaluate(() => {
		const read = (selector: string) => {
			const element = document.querySelector<HTMLElement>(selector);
			const rect = element?.getBoundingClientRect();
			return rect
				? {
					clientWidth: element.clientWidth,
					left: rect.left,
					right: rect.right,
					scrollWidth: element.scrollWidth,
					width: rect.width,
				}
				: null;
		};

		const route = read('[data-testid="topbar-route-label"]');
		const product = read('.tb__route-product');
		const pageLabel = read('.tb__route-page');
		const search = read('.tb__search');
		const actions = read('.tb__actions');
		const proposalPlan = read('.tb__proposal-run-trigger');
		const callBack = read('.tb__run-trigger');

		return {
			actionsInsideViewport: Boolean(actions && actions.right <= window.innerWidth + 1),
			bodyOverflow: document.body.scrollWidth > window.innerWidth + 1,
			callBackIsCompact: Boolean(callBack && callBack.width <= 44),
			pageFits: Boolean(pageLabel && pageLabel.scrollWidth <= pageLabel.clientWidth + 1),
			productFits: Boolean(product && product.scrollWidth <= product.clientWidth + 1),
			proposalPlanIsCompact: Boolean(proposalPlan && proposalPlan.width <= 44),
			routeBeforeSearch: Boolean(route && search && route.right <= search.left - 1),
		};
	});

	expect(layout.bodyOverflow, `narrow desktop topbar leaked horizontal scroll: ${JSON.stringify(layout)}`).toBe(false);
	expect(layout.productFits, `gtm_ops console label should remain readable: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.pageFits, `Generate label should remain readable: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.routeBeforeSearch, `route label should not run under command search: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.proposalPlanIsCompact, `secondary proposal plan action should collapse before it crowds the route: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.callBackIsCompact, `primary callback action should collapse before it crowds the route: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.actionsInsideViewport, `topbar actions escaped the viewport: ${JSON.stringify(layout)}`).toBe(true);
});

test('desktop shell keeps the Coach launcher clear of Evals and Agents topbar controls', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1180, height: 720});
	await openConsole();

	for (const routeId of ['evals', 'agents']) {
		await page.locator(`[data-testid="sidebar-route"][data-route-id="${routeId}"]`).click();
		await expect(page.locator('html')).toHaveAttribute('data-console-route', routeId);

		const geometry = await page.evaluate(() => {
			const rectFor = (selector: string) => {
				const element = document.querySelector(selector);
				const rect = element?.getBoundingClientRect();
				return rect
					? {
						left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width,
					}
					: null;
			};

			const overlaps = (a: ReturnType<typeof rectFor>, b: ReturnType<typeof rectFor>) =>
				Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
			const coach = rectFor('.coach-launcher');
			const route = rectFor('[data-testid="topbar-route-label"]');
			const search = rectFor('.tb__search');
			const actions = rectFor('.tb__actions');
			const topbar = rectFor('.tb');
			return {
				coachBottom: coach?.bottom ?? 0,
				topbarBottom: topbar?.bottom ?? 0,
				topbarTop: topbar?.top ?? 0,
				overRoute: overlaps(coach, route),
				overSearch: overlaps(coach, search),
				overActions: overlaps(coach, actions),
			};
		});

		expect(geometry.coachBottom, `${routeId} coach should stay in shell chrome: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.topbarBottom + 1);
		expect(geometry.coachBottom, `${routeId} coach should render below topbar top: ${JSON.stringify(geometry)}`).toBeGreaterThan(geometry.topbarTop);
		expect(geometry.overRoute, `${routeId} coach covered route label: ${JSON.stringify(geometry)}`).toBe(false);
		expect(geometry.overSearch, `${routeId} coach covered command search: ${JSON.stringify(geometry)}`).toBe(false);
		expect(geometry.overActions, `${routeId} coach covered topbar actions: ${JSON.stringify(geometry)}`).toBe(false);
	}
});

test('narrow shell hides the global Coach launcher on local ElevenLabs routes', async ({openConsole, page}) => {
	await page.setViewportSize({width: 960, height: 720});
	await openConsole();

	for (const routeId of ['evals', 'agents']) {
		await page.locator(`[data-testid="sidebar-route"][data-route-id="${routeId}"]`).click();
		await expect(page.locator('html')).toHaveAttribute('data-console-route', routeId);
		await expect(page.locator('.coach-launcher')).toBeHidden();

		if (routeId === 'evals') {
			await expect(page.locator('[data-testid="eval-control-rail"]')).toBeVisible();
			await expect(page.locator('.eval-convai-frame')).toBeVisible();
		} else {
			await expect(page.locator('.agents-picker-card')).toBeVisible();
			await expect(page.locator('[data-testid="agent-local-admin-panel"]')).toBeVisible();
		}
	}
});

test('mobile shell keeps the current route visible without exposing a version chip', async ({openConsole, page}) => {
	await page.setViewportSize({width: 390, height: 844});
	await openConsole();

	const routeLabel = page.getByTestId('topbar-route-label');
	await expect(routeLabel).toBeVisible();
	await expect(routeLabel.locator('.tb__route-brand')).toHaveText('Wranngle');
	await expect(routeLabel.locator('.tb__route-product')).toHaveText('gtm_ops console');
	await expect(routeLabel.locator('.tb__route-page')).toHaveText('Callbacks');
	await expect(routeLabel.locator('.tb__route-page')).not.toContainText(/home/i);
	await expect(routeLabel).toContainText(/wranngle/i);
	await expect(routeLabel).toContainText(/gtm_ops console/i);
	await expect(routeLabel).not.toContainText(/v\d/i);

	await page.locator('[data-testid="sidebar-route"][data-route-id="evals"]').click();
	await expect(routeLabel.locator('.tb__route-page')).toHaveText('Evals');

	const layout = await page.evaluate(() => {
		const topbar = document.querySelector('.tb')?.getBoundingClientRect();
		const label = document.querySelector('[data-testid="topbar-route-label"]')?.getBoundingClientRect();
		const read = (selector: string) => {
			const element = document.querySelector<HTMLElement>(selector);
			return element
				? {
					clientWidth: element.clientWidth,
					display: getComputedStyle(element).display,
					scrollWidth: element.scrollWidth,
					text: element.textContent?.trim() ?? '',
				}
				: null;
		};
		return {
			brand: read('.tb__route-brand'),
			bodyOverflow: document.body.scrollWidth > window.innerWidth + 1,
			labelVisible: Boolean(label && label.width > 20 && label.left >= (topbar?.left ?? 0) && label.right <= (topbar?.right ?? window.innerWidth)),
			product: read('.tb__route-product'),
			topbarWidth: Math.round(topbar?.width ?? 0),
			viewport: window.innerWidth,
		};
	});

	expect(layout.bodyOverflow, `mobile topbar leaked horizontal scroll: ${JSON.stringify(layout)}`).toBe(false);
	expect(layout.labelVisible, `route label should remain inside topbar: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.brand?.display, `brand should remain visible on mobile: ${JSON.stringify(layout)}`).not.toBe('none');
	expect(layout.brand?.text).toBe('Wranngle');
	expect(layout.brand?.scrollWidth, `brand label clipped: ${JSON.stringify(layout)}`).toBeLessThanOrEqual((layout.brand?.clientWidth ?? 0) + 1);
	expect(layout.product?.display, `product should remain visible on mobile: ${JSON.stringify(layout)}`).not.toBe('none');
	expect(layout.product?.text).toBe('gtm_ops console');
	expect(layout.product?.scrollWidth, `product label clipped: ${JSON.stringify(layout)}`).toBeLessThanOrEqual((layout.product?.clientWidth ?? 0) + 1);
	expect(layout.topbarWidth).toBeLessThanOrEqual(layout.viewport);
});
