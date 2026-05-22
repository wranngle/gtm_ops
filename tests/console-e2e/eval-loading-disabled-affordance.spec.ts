import {test, expect} from './helpers.js';

test('Evals loading-state artifact actions are visibly unavailable', async ({page}) => {
	let releaseRuns!: () => void;
	const runsGate = new Promise<void>(resolve => {
		releaseRuns = resolve;
	});

	await page.addInitScript(() => {
		// @ts-expect-error injected for tests
		globalThis.DEMO_MODE = true;
	});
	await page.route('**/fixtures/eval-runs.json', async route => {
		await runsGate;
		await route.continue();
	});

	await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
	await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

	const artifact = page.getByTestId('eval-command-open-artifact');
	const localAdmin = page.getByTestId('eval-command-open-admin');
	await expect(artifact).toBeDisabled();
	await expect(localAdmin).toBeDisabled();

	const styles = await artifact.evaluate(button => {
		const probe = document.createElement('span');
		probe.style.color = 'var(--text-3)';
		document.body.append(probe);
		const expectedMuted = getComputedStyle(probe).color;
		probe.remove();

		const before = getComputedStyle(button as HTMLElement);
		return {
			background: before.backgroundColor,
			border: before.borderColor,
			color: before.color,
			cursor: before.cursor,
			expectedMuted,
			opacity: Number.parseFloat(before.opacity),
		};
	});

	expect(styles.cursor).toBe('not-allowed');
	expect(styles.color, `disabled ghost actions should use muted text: ${JSON.stringify(styles)}`).toBe(styles.expectedMuted);
	expect(styles.opacity, `disabled actions should be visibly de-emphasized: ${JSON.stringify(styles)}`).toBeLessThan(0.8);
	expect(styles.background).toBe('rgba(0, 0, 0, 0)');
	expect(styles.border).toBe('rgba(0, 0, 0, 0)');

	releaseRuns();
	await expect(page.locator('.eval-run-row')).not.toHaveCount(0, {timeout: 5000});
	await expect(artifact).toBeEnabled();
	await expect(localAdmin).toBeEnabled();
});
