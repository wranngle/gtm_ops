import {test, expect} from './helpers.js';

test('Agents local preview status reads as a phrase inside the wrapper bar', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1440, height: 900});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	const contextBar = page.getByTestId('agent-context-bar');
	await expect(contextBar).toBeVisible();
	await expect(contextBar).toContainText('Preview the saved greeting before callers hear it.');

	const layout = await contextBar.evaluate(element => {
		const copy = element.querySelector(':scope > span');
		const badge = element.querySelector('.badge');
		const button = element.querySelector('button');
		const rect = (node: Element | undefined) => {
			if (!(node instanceof HTMLElement)) {
				return null;
			}

			const box = node.getBoundingClientRect();
			const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight) || 16;
			return {
				left: box.left,
				right: box.right,
				top: box.top,
				bottom: box.bottom,
				width: box.width,
				height: box.height,
				lines: box.height / lineHeight,
				scrollWidth: node.scrollWidth,
				clientWidth: node.clientWidth,
			};
		};

		return {
			bar: rect(element),
			copy: rect(copy ?? undefined),
			badge: rect(badge ?? undefined),
			button: rect(button ?? undefined),
			horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
		};
	});

	expect(layout.horizontalOverflow).toBe(false);
	expect(layout.copy?.width, `context copy collapsed: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(150);
	expect(layout.copy?.lines, `context copy wrapped one word per line: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(4.25);
	expect(layout.copy?.scrollWidth, `context copy overflowed: ${JSON.stringify(layout)}`).toBeLessThanOrEqual((layout.copy?.clientWidth ?? 0) + 1);
	expect(layout.bar?.height, `status bar grew into a cramped text column: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(125);
	expect(layout.button?.top, `preview action should move below readable status copy: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual((layout.copy?.bottom ?? 0) - 1);
	expect(layout.badge?.left, `ready badge should stay separated from status copy: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual((layout.copy?.right ?? 0) + 8);
});
