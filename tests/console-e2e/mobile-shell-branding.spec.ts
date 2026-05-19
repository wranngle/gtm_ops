import {test, expect} from './helpers.js';

test('mobile shell keeps compact gtm_ops product identity in the topbar', async ({openConsole, page}) => {
	await page.setViewportSize({width: 390, height: 844});
	await openConsole();

	const routeLabel = page.getByTestId('topbar-route-label');
	const brandLabel = routeLabel.locator('.tb__route-brand');
	const productLabel = routeLabel.locator('.tb__route-product');
	const pageLabel = routeLabel.locator('.tb__route-page');

	await expect(routeLabel).toBeVisible();
	await expect(brandLabel).toBeVisible();
	await expect(brandLabel).toHaveText('Wranngle');
	await expect(productLabel).toBeVisible();
	await expect(productLabel).toHaveText('gtm_ops console');
	await expect(pageLabel).toHaveText('Callbacks');
	await expect(routeLabel).not.toContainText(/v\d/u);

	await page.locator('[data-testid="sidebar-route"][data-route-id="generate"]').click();
	await expect(pageLabel).toHaveText('Generate');

	const metrics = await page.evaluate(() => {
		const readLabel = (selector: string) => {
			const element = document.querySelector<HTMLElement>(selector);
			if (!element) {
				return null;
			}

			return {
				clientWidth: element.clientWidth,
				display: getComputedStyle(element).display,
				scrollWidth: element.scrollWidth,
				text: element.textContent?.trim() ?? '',
			};
		};

		const topbar = document.querySelector('.tb')?.getBoundingClientRect();
		const route = document.querySelector('[data-testid="topbar-route-label"]')?.getBoundingClientRect();
		const proposalPlan = document.querySelector('.tb__proposal-run-trigger')?.getBoundingClientRect();
		const runTrigger = document.querySelector('.tb__run-trigger')?.getBoundingClientRect();

		return {
			brand: readLabel('.tb__route-brand'),
			bodyOverflow: document.body.scrollWidth > window.innerWidth + 1,
			product: readLabel('.tb__route-product'),
			proposalPlanWidth: Math.round(proposalPlan?.width ?? 0),
			routeInsideTopbar: Boolean(route && topbar && route.left >= topbar.left && route.right <= topbar.right + 1),
			routePage: readLabel('.tb__route-page'),
			runTriggerWidth: Math.round(runTrigger?.width ?? 0),
			searchDisplay: readLabel('.tb__search')?.display ?? null,
		};
	});

	if (!metrics.brand || !metrics.product || !metrics.routePage) {
		throw new Error(`mobile route labels did not render: ${JSON.stringify(metrics)}`);
	}

	expect(metrics.bodyOverflow, `mobile shell leaked horizontal scroll: ${JSON.stringify(metrics)}`).toBe(false);
	expect(metrics.routeInsideTopbar, `mobile route label escaped topbar: ${JSON.stringify(metrics)}`).toBe(true);
	expect(metrics.brand.display, `brand label should stay visible: ${JSON.stringify(metrics)}`).not.toBe('none');
	expect(metrics.brand.text).toBe('Wranngle');
	expect(metrics.brand.scrollWidth, `brand label clipped: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.brand.clientWidth + 1);
	expect(metrics.product.display, `product label should stay visible: ${JSON.stringify(metrics)}`).not.toBe('none');
	expect(metrics.product.text).toBe('gtm_ops console');
	expect(metrics.product.scrollWidth, `product label clipped: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.product.clientWidth + 1);
	expect(metrics.routePage.text).toBe('Generate');
	expect(metrics.routePage.scrollWidth, `route label clipped: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.routePage.clientWidth + 1);
	expect(metrics.searchDisplay, `mobile search should yield space to route branding: ${JSON.stringify(metrics)}`).toBe('none');
	expect(metrics.proposalPlanWidth, `run-plan button should collapse to an icon on mobile: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(44);
	expect(metrics.runTriggerWidth, `primary run button should collapse to an icon on mobile: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(44);
});
