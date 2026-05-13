/**
 * Proposal generation flow — exercise the Generate page UI end-to-end:
 *   - Load demo proof populates the textarea with the Acme HVAC fixture
 *   - Run sequence is gated on input
 *   - Submitting fires a POST /api/generate (caught by the demo fetch shim)
 */
import {test, expect} from './helpers.js';

test('Generate page · demo proof populates input', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	const textarea = page.locator('.generate-brief').first();
	await expect(textarea).toBeVisible();
	await expect(textarea).toHaveValue('');
	await page.getByRole('button', {name: /load demo proof/i}).click();
	// Either the fixture loads, or the canned fallback sets the same Acme HVAC string.
	await expect(textarea).toHaveValue(/HVAC|Acme|CLIENT:/, {timeout: 5000});
});

test('Generate page · demo proof controls frame packets as review artifacts', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await expect(page.getByRole('button', {name: /load demo proof/i})).toBeVisible();
	await expect(page.getByRole('button', {name: /use demo proof/i})).toBeVisible();
	await expect(page.getByRole('button', {name: /load acme proof/i})).toHaveCount(0);
	await expect(page.locator('.page--generate')).not.toContainText(/sample brief|hvac sample|sample proof|sample artifact|fixture-backed/i);

	await page.getByRole('button', {name: /load demo proof/i}).click();
	const proofState = page.locator('[data-testid="generate-command-strip"] .generate-command-strip__item').first();
	await expect(proofState).toContainText(/demo proof loaded/i);
	await expect(proofState).toContainText(/synthetic buyer proof/i);
	const activeBuyer = page.locator('[data-testid="generate-command-strip"] .generate-command-strip__item').nth(1);
	await expect(activeBuyer).toContainText(/acme hvac/i);
	await expect(activeBuyer).toContainText(/demo proof/i);
	await expect(activeBuyer).not.toContainText(/sample/i);
	const proofMeter = page.locator('[data-testid="generate-proof-meter"]');
	await expect(proofMeter).toContainText(/demo proof loaded/i);
	await expect(proofMeter).not.toContainText(/operator supplied|sample/i);
});

test('Generate page · loading demo proof keeps the sequence and review gate in view', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page.getByRole('button', {name: /load demo proof/i}).click();
	await expect(page.locator('[data-testid="generate-step-01"]')).toHaveAttribute('data-state', 'ready');

	const geometry = await page.evaluate(() => {
		const scroller = document.querySelector('main.scroll');
		const topbar = document.querySelector('.tb');
		const sequence = document.querySelector('[data-testid="generate-sequence"]');
		const review = document.querySelector('.generate-review-card');
		const sequenceBox = sequence?.getBoundingClientRect();
		const reviewBox = review?.getBoundingClientRect();
		return {
			activeId: (document.activeElement as HTMLElement | undefined)?.id || '',
			scrollTop: scroller?.scrollTop ?? -1,
			topbarBottom: topbar?.getBoundingClientRect().bottom ?? 0,
			sequenceTop: sequenceBox?.top ?? 0,
			reviewBottom: reviewBox ? reviewBox.top + Math.min(reviewBox.height, 220) : 0,
			viewportHeight: window.innerHeight,
		};
	});

	expect(geometry.activeId).not.toBe('generate-buyer-proof');
	expect(geometry.scrollTop, `demo proof should not jump the main scroller: ${JSON.stringify(geometry)}`).toBeLessThan(24);
	expect(geometry.sequenceTop, `sequence rail should remain below topbar: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(geometry.topbarBottom - 1);
	expect(geometry.reviewBottom, `review gate should remain inspectable after loading proof: ${JSON.stringify(geometry)}`).toBeLessThan(geometry.viewportHeight);
});

test('Generate page · artifact review gate leads the work area before the composer', async ({openConsole, page}) => {
	await page.setViewportSize({width: 390, height: 844});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const layout = await page.evaluate(() => {
		const cards = [...document.querySelectorAll('.generate-grid > .card')] as HTMLElement[];
		const review = document.querySelector('.generate-review-card');
		const brief = document.querySelector('.generate-brief-card');
		const firstEnabledButton = cards[0]?.querySelector('button:not([disabled])');
		return {
			order: cards.map(card => card.className),
			reviewTop: review?.getBoundingClientRect().top ?? 0,
			briefTop: brief?.getBoundingClientRect().top ?? 0,
			firstEnabledButtonText: firstEnabledButton?.innerText?.trim().replaceAll(/\s+/g, ' ') || '',
		};
	});

	expect(layout.order[0]).toContain('generate-review-card');
	expect(layout.order[1]).toContain('generate-brief-card');
	expect(layout.order[2]).toContain('generate-trace-card');
	expect(layout.reviewTop, `review should visually lead composer: ${JSON.stringify(layout)}`).toBeLessThan(layout.briefTop);
	expect(layout.firstEnabledButtonText).toMatch(/add buyer proof/i);
});

test('Generate page · topbar proposal run pre-fills even when Generate is already mounted', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	const textarea = page.locator('.generate-brief').first();
	await expect(textarea).toHaveValue('');

	await page.getByRole('button', {name: /proposal run plan/i}).click();
	await page.locator('.pop__row').filter({hasText: /^Generate proposal/}).click();

	const banner = page.locator('[data-testid="generate-new-run-banner"]');
	await expect(banner).toBeVisible();
	await expect(banner).toContainText(/new proposal run seeded from call-2419/i);
	await expect(banner).toContainText(/banyan health/i);
	await expect(textarea).toHaveValue(/buyer proof carried from the call:/i);
	await expect(textarea).toHaveValue(/call-2419/i);
	await expect(textarea).toHaveValue(/meeting-booked/i);
	await expect(page.locator('[data-testid="generate-step-01"]')).toHaveAttribute('data-state', 'ready');
});

test('Generate page · topbar proposal run previews the local review sequence', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page.getByRole('button', {name: /proposal run plan/i}).click();
	const plan = page.getByTestId('proposal-run-plan');
	await expect(plan).toBeVisible();
	await expect(plan).toContainText(/proposal sequence/i);
	await expect(plan).toContainText(/banyan health/i);
	await expect(plan).toContainText(/buyer proof/i);
	await expect(plan).toContainText(/draft engine/i);
	await expect(plan).toContainText(/artifact review/i);
	await expect(plan).toContainText(/proposals approval/i);
	await expect(plan).toContainText(/buyer send stays blocked/i);

	await page.getByTestId('proposal-run-start').click();
	await expect(page.locator('[data-testid="generate-new-run-banner"]')).toContainText(/banyan health/i);
	await expect(page.locator('.generate-brief')).toHaveValue(/operator approval gate before buyer send/i);
});

test('Generate page · handoff review packet follows the source buyer, not the Acme demo default', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page.getByRole('button', {name: /proposal run plan/i}).click();
	await page.locator('.pop__row').filter({hasText: /^Generate proposal/}).click();

	await expect(page.locator('[data-testid="generate-new-run-banner"]')).toContainText(/banyan health/i);
	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete: artifact_id=run_banyan_health/i, {timeout: 20_000});
	const reviewState = page.getByTestId('generate-review-state');
	await expect(reviewState).toContainText(/banyan health draft is ready for operator review/i);
	await expect(reviewState).toContainText(/run_banyan_health/);

	await page.locator('.generate-review-card').getByRole('button', {name: /review pdf artifact/i}).click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toBeVisible();
	await expect(drawer).toContainText(/banyan health proposal draft/i);
	await expect(drawer.locator('[data-testid="generate-artifact-id"]')).toContainText(/run_banyan_health/);
	await expect(drawer).toContainText(/demo-generated banyan health packet/i);
	await expect(drawer).not.toContainText(/demo-generated acme hvac packet/i);

	await page.getByRole('button', {name: /close proposal artifact review drawer/i}).click();
	await page.locator('.generate-review-card').getByRole('button', {name: /^review in proposals$/i}).click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
	const detailCard = page.getByTestId('proposal-detail-card');
	await expect(detailCard.locator('.card__title')).toContainText('PR-2041');
	await expect(detailCard).toContainText(/banyan health/i);

	const ctx = await page.evaluate(() => (globalThis as any).AppContext.get());
	expect(ctx.extra.generated_artifact_id).toBe('run_banyan_health');
});

test('Generate page · empty input routes draft actions to buyer proof without an error toast', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	const textarea = page.locator('.generate-brief').first();

	const topDraft = page.locator('.ph__actions').getByRole('button', {name: /^add buyer proof$/i});
	const lowerDraft = page.locator('.generate-actions').getByRole('button', {name: /^add buyer proof$/i});
	await expect(topDraft).toBeEnabled();
	await expect(lowerDraft).toBeEnabled();
	await expect(topDraft).toHaveAttribute('aria-describedby', 'generate-brief-required-note');
	await expect(lowerDraft).toHaveAttribute('aria-describedby', 'generate-brief-required-note');
	await expect(page.locator('#generate-brief-required-note')).toContainText(/buyer proof is required/i);
	await expect(page.locator('.toast', {hasText: /input required/i})).toHaveCount(0);

	await topDraft.click();
	await expect(textarea).toBeFocused();
	await expect(textarea).toHaveAttribute('aria-invalid', 'false');
	await expect(page.locator('.toast', {hasText: /input required/i})).toHaveCount(0);

	await page.getByRole('button', {name: /load demo proof/i}).click();
	await expect(page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i})).toBeEnabled();
	await expect(page.locator('.generate-actions').getByRole('button', {name: /^generate review draft$/i})).toBeEnabled();
	await expect(page.locator('#generate-brief-required-note')).toHaveCount(0);
});

test('Generate page · attach file action exposes local picker state', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await expect(page.getByTestId('generate-attachment-status')).toHaveCount(0);
	await page.getByTestId('generate-file-attach').evaluate((button: HTMLButtonElement) => {
		button.click();
	});

	const status = page.getByTestId('generate-attachment-status');
	await expect(status).toBeVisible();
	await expect(status).toContainText(/file picker requested/i);
	await expect(status).toContainText(/buyer send stays gated/i);
	await expect(page.getByTestId('generate-file-attach')).toHaveAttribute('aria-describedby', 'generate-attachment-status');
});

test('Generate proposal flow explains the review gate and destination before execution', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await expect(page.locator('[data-testid="generate-step-03"]')).toContainText(/Review packet locally/);
	await expect(page.locator('[data-testid="generate-step-03"]')).toContainText(/open Proposals/);
	await expect(page.locator('.generate-review-card .artifact-review__packet')).toContainText(/requirements are visible/i);
	await expect(page.locator('.generate-review-card .artifact-review__packet')).toContainText(/proposals/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/artifact/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/inspect packet requirements/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/no pdf\/source preview exists/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).not.toContainText(/open local artifact previews/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/review/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/draft gate locked/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/send/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/buyer send blocked until approved/i);
	const reviewPathLayout = await page.locator('[data-testid="generate-review-path"]').evaluate(element => {
		const pathBox = element.getBoundingClientRect();
		const stepBoxes = [...element.children].map(child => child.getBoundingClientRect());
		return {
			stepCount: stepBoxes.length,
			allStepsStacked: stepBoxes.every((box, index) => index === 0 || box.top >= stepBoxes[index - 1].bottom - 1),
			allStepsReadable: stepBoxes.every(box => box.width >= pathBox.width * 0.9),
		};
	});
	expect(reviewPathLayout).toEqual({
		stepCount: 3,
		allStepsStacked: true,
		allStepsReadable: true,
	});
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /^review in proposals$/i})).toBeDisabled();

	await page.getByRole('button', {name: /load demo proof/i}).click();
	await expect(page.locator('.generate-review-card .artifact-review__packet')).toContainText(/run the sequence to create pdf\/source artifacts/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/run the sequence to render pdf\/source artifacts/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).not.toContainText(/open local artifact previews/i);
});

test('Generate page · artifact action copy matches packet readiness', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const pdfAction = page.getByTestId('generate-review-pdf-action');
	const sourceAction = page.getByTestId('generate-review-source-action');
	await expect(pdfAction).toHaveText(/inspect pdf requirements/i);
	await expect(sourceAction).toHaveText(/inspect source requirements/i);
	await expect(pdfAction).not.toHaveText(/review pdf artifact/i);

	await page.getByRole('button', {name: /load demo proof/i}).click();
	await expect(pdfAction).toHaveText(/inspect pdf requirements/i);
	await expect(sourceAction).toHaveText(/inspect source requirements/i);
	await expect(pdfAction).not.toHaveText(/review pdf artifact/i);

	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});
	await expect(pdfAction).toHaveText(/review pdf artifact/i);
	await expect(sourceAction).toHaveText(/inspect source evidence/i);
});

test('Generate page · demo trace names the active buyer handoff instead of the canned sample', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page.getByRole('button', {name: /proposal run plan/i}).click();
	await page.locator('.pop__row').filter({hasText: /^Generate proposal/}).click();
	await expect(page.locator('[data-testid="generate-new-run-banner"]')).toContainText(/banyan health/i);

	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	const panel = page.locator('.console-panel');
	await expect(panel).toContainText(/extract\.client: banyan health/i, {timeout: 20_000});
	await expect(panel).toContainText(/call-2419/i);
	await expect(panel).not.toContainText(/extract\.client: acme hvac services/i);

	await page.locator('.generate-review-card').getByRole('button', {name: /inspect source evidence/i}).click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toContainText(/banyan health source evidence bundle/i);
	await expect(drawer).toContainText(/banyan health review metadata/i);
	await expect(drawer).not.toContainText(/bundled acme fixture/i);
	const sourceJson = drawer.locator('[data-testid="generate-artifact-source-json"]');
	await expect(sourceJson).toContainText(/"buyer": "banyan health"/i);
	await expect(sourceJson).toContainText(/review_metadata/i);
	await expect(sourceJson).toContainText(/"review_packet_id": "run_banyan_health"/i);
	await expect(sourceJson).toContainText(/call-2419/i);
	await expect(sourceJson).toContainText(/handoff_review_source/i);
	await expect(sourceJson).not.toContainText(/acme hvac/i);
});

test('Generate page · sequence rail reflects the real review gate state', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const sequence = page.locator('[data-testid="generate-sequence"]');
	await expect(sequence).toBeVisible();
	await expect(page.locator('[data-testid="generate-step-01"]')).toHaveAttribute('data-state', 'missing');
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'waiting');
	await expect(page.locator('[data-testid="generate-step-03"]')).toHaveAttribute('data-state', 'locked');

	await page.getByRole('button', {name: /load demo proof/i}).click();
	await expect(page.locator('[data-testid="generate-step-01"]')).toHaveAttribute('data-state', 'ready');
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'ready');
	await expect(page.locator('[data-testid="generate-step-02"]')).toContainText(/ready to extract/i);

	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'running');
	await expect(page.locator('[data-testid="generate-step-03"]')).toHaveAttribute('data-state', 'locked');
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete/i, {timeout: 20_000});
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'complete');
	await expect(page.locator('[data-testid="generate-step-03"]')).toHaveAttribute('data-state', 'ready');
});

test('Generate page · buyer send stays gated after draft generation', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const sendTile = page.locator('[data-testid="generate-command-strip"] .generate-command-strip__item').filter({hasText: /^buyer send/i});
	await expect(sendTile).toHaveAttribute('data-state', 'locked');
	await expect(sendTile).toContainText(/blocked/i);

	await page.getByRole('button', {name: /load demo proof/i}).click();
	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete/i, {timeout: 20_000});

	await expect(sendTile).toHaveAttribute('data-state', 'gated');
	await expect(sendTile.locator('.badge')).toHaveText(/gated/i);
	await expect(sendTile).toContainText(/approval gate/i);
	await expect(sendTile).toContainText(/proposals approval required before buyer send/i);
	await expect(sendTile).not.toContainText(/operator review/i);
});

test('Generate page · DEMO_MODE replay unlocks review even if POST never resolves', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /load demo proof/i}).click();

	await page.evaluate(() => {
		const orig = globalThis.fetch.bind(globalThis);
		globalThis.fetch = async function (input: any, init: any) {
			const url = typeof input === 'string' ? input : (input?.url) || '';
			const method = ((init?.method) || (input?.method) || 'GET').toUpperCase();
			if (url.includes('/api/generate') && method === 'POST') {
				return new Promise(() => {
});
			}

			return orig(input, init);
		} as any;
	});

	await page.locator('.generate-actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'running');
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete/i, {timeout: 20_000});
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'complete');
	await expect(page.locator('[data-testid="generate-step-03"]')).toHaveAttribute('data-state', 'ready');
	await expect(page.getByRole('button', {name: /^review in proposals$/i})).toBeEnabled();
});

test('Generate page · sequence init dispatches the pipeline', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /load demo proof/i}).click();
	await page.waitForTimeout(200);
	// The demo-mode fetch shim short-circuits /api POSTs, so we patch fetch
	// AFTER the page loads (re-wrapping the shim itself) to capture the call.
	await page.evaluate(() => {
		// @ts-expect-error window-injected
		globalThis.__seenApiGenerate = [];
		const orig = globalThis.fetch.bind(globalThis);
		globalThis.fetch = async function (input: any, init: any) {
			const url = typeof input === 'string' ? input : (input?.url) || '';
			const method = ((init?.method) || (input?.method) || 'GET').toUpperCase();
			if (url.includes('/api/generate') && method === 'POST') {
				// @ts-expect-error window-injected
				globalThis.__seenApiGenerate.push(url);
			}

			return orig(input, init);
		} as any;
	});
	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('.toast', {hasText: /sequence initializing/i})).toHaveCount(0);
	const seen = await page.evaluate(() => (globalThis as any).__seenApiGenerate || []);
	expect(seen.length, 'POST /api/generate should fire from handleGenerate').toBeGreaterThan(0);
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.start/i);
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'running');
});

test('Generate page · live console panel mounts', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	const panel = page.locator('.console-panel');
	await expect(panel).toBeVisible();
	await expect(panel.locator('.console-panel__hd')).toContainText(/pipeline\.stream/);
	await expect(panel.locator('[data-testid="console-panel-count"]')).toContainText('0 lines');
	await expect(panel).toContainText(/ready/i);
	await expect(panel).not.toContainText(/stream\.error/i);
	await expect(panel.locator('[data-testid="console-panel-copy"]')).toBeDisabled();
	await expect(panel.locator('[data-testid="console-panel-clear"]')).toBeDisabled();
});

test('Generate page · sequence trace header keeps status controls inside the card', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	const panel = page.locator('.generate-grid .console-panel').first();
	await expect(panel).toBeVisible();

	const headerFits = await panel.evaluate(node => {
		const panelBox = node.getBoundingClientRect();
		const header = node.querySelector('.console-panel__hd');
		const controls = node.querySelector('.console-panel__hd-right');
		if (!header || !controls) {
			return false;
		}

		const headerBox = header.getBoundingClientRect();
		const controlsBox = controls.getBoundingClientRect();
		const slack = 1;
		return headerBox.left >= panelBox.left - slack
			&& headerBox.right <= panelBox.right + slack
			&& controlsBox.left >= panelBox.left - slack
			&& controlsBox.right <= panelBox.right + slack;
	});
	expect(headerFits, 'trace header controls should wrap instead of clipping at the card edge').toBe(true);
});

test('Generate page · laptop proof actions stay reachable without burying the review gate', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const editor = page.locator('.generate-brief').first();
	const reviewCard = page.locator('.generate-review-card');
	const reviewProofAction = reviewCard.getByRole('button', {name: /^add buyer proof$/i});
	const topProofAction = page.locator('.ph__actions').getByRole('button', {name: /^add buyer proof$/i});
	const actions = page.locator('.generate-actions').first();
	const lowerGenerate = actions.getByRole('button', {name: /^add buyer proof$/i});

	await expect(editor).toBeVisible();
	await expect(reviewProofAction).toBeVisible();
	await expect(reviewProofAction).toBeEnabled();
	await expect(topProofAction).toBeVisible();
	await expect(topProofAction).toBeEnabled();
	await expect(lowerGenerate).toBeVisible();
	await expect(lowerGenerate).toBeEnabled();

	const [editorBox, actionsBox, reviewBox, reviewProofActionBox, topProofActionBox] = await Promise.all([
		editor.boundingBox(),
		actions.boundingBox(),
		reviewCard.boundingBox(),
		reviewProofAction.boundingBox(),
		topProofAction.boundingBox(),
	]);
	expect(editorBox, 'buyer brief editor should render').not.toBeNull();
	expect(actionsBox, 'lower generate action row should render').not.toBeNull();
	expect(reviewBox, 'artifact review gate should render').not.toBeNull();
	expect(reviewProofActionBox, 'review-gate proof action should render').not.toBeNull();
	expect(topProofActionBox, 'top proof action should render').not.toBeNull();

	expect(editorBox!.height, 'brief editor should not consume the whole first viewport').toBeLessThanOrEqual(270);
	expect(reviewBox!.y + reviewBox!.height, 'review gate should stay comfortably inside a 1280x720 viewport').toBeLessThan(700);
	expect(reviewProofActionBox!.y + reviewProofActionBox!.height, 'review-gate proof action should stay reachable above the fold').toBeLessThan(640);
	expect(topProofActionBox!.y + topProofActionBox!.height, 'top proof action should stay reachable in the page header').toBeLessThan(140);
	expect(actionsBox!.y, 'lower composer controls can sit below the review-first fold').toBeGreaterThan(reviewBox!.y + reviewBox!.height);
});

test('Generate page · laptop single-column layout keeps artifact review before the proof composer', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1024, height: 640});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const geometry = await page.evaluate(() => {
		const box = (selector: string) => {
			const element = document.querySelector(selector);
			if (!(element instanceof HTMLElement)) {
				return null;
			}

			const rect = element.getBoundingClientRect();
			return {
				top: rect.top,
				bottom: rect.bottom,
				height: rect.height,
			};
		};

		const visibleBox = (selector: string) => {
			const element = document.querySelector(selector);
			if (!(element instanceof HTMLElement)) {
				return null;
			}

			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
				return null;
			}

			return {
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
			};
		};

		const overlaps = (
			a: ReturnType<typeof visibleBox>,
			b: ReturnType<typeof visibleBox>,
		) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
		const coach = visibleBox('.coach-launcher');
		const reviewJump = visibleBox('.generate-review-card .artifact-review__jump');

		return {
			sequence: box('[data-testid="generate-sequence"]'),
			review: box('.generate-review-card'),
			brief: box('.generate-brief-card'),
			trace: box('.generate-trace-card'),
			reviewState: box('.generate-review-card .artifact-review__state'),
			reviewJump: box('.generate-review-card .artifact-review__jump'),
			coachVisible: Boolean(coach),
			coachOverlapsReviewJump: overlaps(coach, reviewJump),
			viewportHeight: window.innerHeight,
		};
	});

	expect(geometry.sequence, 'sequence rail should render').not.toBeNull();
	expect(geometry.review, 'artifact review should render').not.toBeNull();
	expect(geometry.brief, 'proof composer should render').not.toBeNull();
	expect(geometry.trace, 'sequence trace should render').not.toBeNull();
	expect(geometry.reviewState, 'review state row should render').not.toBeNull();
	expect(geometry.reviewJump, 'artifact review proof action should render').not.toBeNull();

	expect(
		geometry.review!.top,
		`artifact review should sit after the sequence rail: ${JSON.stringify(geometry)}`,
	).toBeGreaterThan(geometry.sequence!.top);
	expect(
		geometry.review!.top,
		`artifact review should not be buried below the proof composer at laptop width: ${JSON.stringify(geometry)}`,
	).toBeLessThan(geometry.brief!.top);
	expect(
		geometry.trace!.top,
		`terminal trace should come after the proof composer in the single-column review path: ${JSON.stringify(geometry)}`,
	).toBeGreaterThan(geometry.brief!.top);
	expect(
		geometry.reviewJump!.bottom,
		`artifact review action should be visible in the first 1024x640 viewport: ${JSON.stringify(geometry)}`,
	).toBeLessThan(geometry.viewportHeight);
	expect(
		geometry.coachOverlapsReviewJump,
		`global coach launcher must not cover the laptop artifact review action: ${JSON.stringify(geometry)}`,
	).toBe(false);
});

test('Generate page · local static console starts in DEMO_MODE without a transport error', async ({page}) => {
	await page.goto('/console/?route=generate', {waitUntil: 'domcontentloaded'});
	await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});
	await expect.poll(async () => page.evaluate(() => (globalThis as any).DEMO_MODE)).toBe(true);

	const panel = page.locator('.console-panel');
	await expect(panel.locator('[data-testid="console-panel-count"]')).toContainText('0 lines');
	await expect(panel).toContainText(/ready/i);
	await expect(panel).not.toContainText(/stream\.error/i);
});

test('Generate page · empty review packet opens an unbound local artifact drawer', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCard = page.locator('.generate-review-card');
	await expect(reviewCard).toBeVisible();
	await expect(reviewCard).toContainText(/review packet/i);
	await expect(reviewCard).toContainText(/add buyer proof before this packet can be reviewed/i);
	await expect(reviewCard.getByRole('button', {name: /inspect requirements/i})).toBeVisible();
	await expect(reviewCard).not.toContainText(/open local artifact previews before approval/i);

	const reviewBox = await reviewCard.boundingBox();
	expect(reviewBox, 'artifact review card should have a rendered box').not.toBeNull();
	expect(reviewBox!.y, 'artifact review should not be buried below the first viewport').toBeLessThan(620);

	await reviewCard.getByRole('button', {name: /pdf/i}).click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toBeVisible();
	await expect.poll(
		async () => (await drawer.boundingBox())?.y ?? 9999,
		{timeout: 5000},
	).toBeLessThan(160);
	await expect(drawer).toContainText(/unbound proposal packet requirements/i);
	await expect(drawer.locator('.workflow-popout__title')).not.toContainText(/proposal draft/i);
	await expect(drawer).toContainText(/review packet id/i);
	await expect(drawer.locator('[data-testid="generate-artifact-id"]')).toContainText(/run_unbound_preview/);
	await expect(drawer.locator('[data-testid="generate-artifact-mode"]')).toContainText(/demo sequence/i);
	await expect(drawer.locator('[data-testid="generate-artifact-review-path"]')).toContainText(/artifact/i);
	await expect(drawer.locator('[data-testid="generate-artifact-review-path"]')).toContainText(/review/i);
	await expect(drawer.locator('[data-testid="generate-artifact-review-path"]')).toContainText(/send/i);
	await expect(drawer).toContainText(/unbound artifact requirements/i);
	await expect(drawer).toContainText(/sequence_required/i);
	await expect(drawer.locator('.artifact-drawer__path')).toContainText(/buyer proof required/i);
	await expect(drawer.locator('.artifact-drawer__path')).not.toContainText(/sample-proposal\.pdf/);
	await expect(drawer.locator('iframe[title="Local proposal PDF review preview"]')).toHaveCount(0);
	await expect(drawer.getByTestId('generate-pdf-review-placeholder')).toBeVisible();
	await expect(drawer.getByTestId('generate-pdf-review-placeholder')).toContainText(/buyer proof is required before this packet exists/i);
	await expect(drawer.getByRole('link', {name: /open raw artifact/i})).toHaveCount(0);
	await expect(drawer.getByRole('button', {name: /copy review packet id/i})).toBeVisible();

	await reviewCard.getByRole('button', {name: /source/i}).click();
	await expect(drawer).toContainText(/unbound source evidence requirements/i);
	const sourceJson = drawer.locator('[data-testid="generate-artifact-source-json"]');
	await expect(drawer.locator('.artifact-drawer__path')).toContainText(/buyer proof required/i);
	await expect(drawer.locator('.artifact-drawer__path')).not.toContainText(/sample-proposal\.json/i);
	await expect(sourceJson).toContainText(/blocked_until_operator_review/i);
	await expect(sourceJson).toContainText(/waiting_for_buyer_proof/i);
	await expect(sourceJson).not.toContainText(/prop_demo_001/i);
	await expect(sourceJson).not.toContainText(/acme hvac/i);
});

test('Generate page · artifact query opens the local review packet inside the console', async ({page}) => {
	await page.addInitScript(() => {
		(globalThis as any).DEMO_MODE = true;
	});
	await page.goto('/console/?route=generate&artifact=pdf', {waitUntil: 'domcontentloaded'});
	await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

	await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
	await expect(page).toHaveURL(/\/console\/\?route=generate$/);
	const activeBuyer = page.getByTestId('generate-command-item-active-buyer');
	await expect(activeBuyer).toContainText(/demo proof packet/i);
	await expect(activeBuyer).not.toContainText(/acme hvac demo proof/i);

	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toBeVisible();
	await expect(drawer).toContainText(/acme hvac proposal packet/i);
	await expect(drawer.locator('.workflow-popout__title')).not.toContainText(/proposal draft/i);
	await expect(drawer).toContainText(/demo-proof acme hvac review artifact preview/i);
	await expect(drawer).not.toContainText(/bundled fixture|local fixture/i);
	await expect(drawer).toContainText(/sequence_required/i);
	await expect(drawer.locator('iframe[title="Local proposal PDF review preview"]')).toBeVisible();
	await expect(drawer.getByRole('link', {name: /open raw artifact/i})).toHaveCount(0);
});

test('Generate page · loaded demo proof does not expose artifacts until the sequence runs', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /load demo proof/i}).click();

	await page.locator('.generate-review-card').getByRole('button', {name: /inspect pdf requirements/i}).click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toBeVisible();
	await expect(drawer.locator('.artifact-drawer__source')).toContainText(/review locator/i);
	await expect(drawer.locator('.artifact-drawer__path')).toContainText(/run sequence required before render/i);
	await expect(drawer.locator('.artifact-drawer__path')).not.toContainText(/sample-proposal\.pdf|fixtures\//i);
	await expect(drawer.locator('iframe[title="Local proposal PDF review preview"]')).toHaveCount(0);
	await expect(drawer.getByTestId('generate-pdf-review-placeholder')).toContainText(/run the sequence before this packet exists/i);
	await expect(drawer.getByTestId('generate-artifact-drawer-primary-action')).toContainText(/run sequence/i);

	await page.locator('.generate-review-card').getByRole('button', {name: /inspect source requirements/i}).click();
	await expect(drawer.locator('.artifact-drawer__path')).toContainText(/run sequence required before render/i);
	await expect(drawer.locator('.artifact-drawer__path')).not.toContainText(/sample-proposal\.json|fixtures\//i);
	await expect(drawer.locator('[data-testid="generate-artifact-source-json"]')).toContainText(/run_sequence_before_artifact_preview/i);

	await drawer.getByTestId('generate-artifact-drawer-primary-action').click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});

	await page.locator('.generate-review-card').getByRole('button', {name: /review pdf artifact/i}).click();
	await expect(drawer.locator('.artifact-drawer__path')).toContainText('local-review://run_acme_hvac/proposal.pdf');
	await expect(drawer.locator('.artifact-drawer__path')).not.toContainText(/sample-proposal\.pdf|fixtures\//i);
	await expect(drawer.locator('iframe[title="Generated proposal PDF review preview"]')).toBeVisible();

	await page.locator('.generate-review-card').getByRole('button', {name: /inspect source evidence/i}).click();
	await expect(drawer.locator('.artifact-drawer__path')).toContainText('local-review://run_acme_hvac/source-evidence.json');
	await expect(drawer.locator('.artifact-drawer__path')).not.toContainText(/sample-proposal\.json|fixtures\//i);
	await expect(drawer.locator('[data-testid="generate-artifact-source-json"]')).toContainText(/local-review:\/\/run_acme_hvac\/source-evidence\.json/i);
});

test('Generate page · review path is visible but muted until the draft is ready', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1440, height: 900});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCard = page.locator('.generate-review-card');
	const reviewHeader = reviewCard.locator('.card__hd');
	const previewButton = reviewCard.getByRole('button', {name: /pdf/i});
	const sourceButton = reviewCard.getByRole('button', {name: /source/i});
	const reviewButton = reviewHeader.getByRole('button', {name: /^review in proposals$/i});
	await expect(reviewButton).toBeDisabled();

	const [previewBox, sourceBox, reviewBox] = await Promise.all([
		previewButton.boundingBox(),
		sourceButton.boundingBox(),
		reviewButton.boundingBox(),
	]);
	expect(previewBox, 'PDF preview button should render').not.toBeNull();
	expect(sourceBox, 'source inspection button should render').not.toBeNull();
	expect(reviewBox, 'proposal review button should render').not.toBeNull();
	expect(Math.abs(previewBox!.y - sourceBox!.y), 'artifact inspection buttons should share a compact desktop row').toBeLessThan(2);
	expect(reviewBox!.y + reviewBox!.height, 'proposal review path should sit in the card header above artifact inspection actions').toBeLessThan(previewBox!.y);
	expect(reviewBox!.y + reviewBox!.height, 'disabled review CTA should not be clipped at the viewport edge').toBeLessThan(900);

	const coachBox = await page.locator('.coach-launcher').boundingBox();
	expect(coachBox, 'global coach launcher should render').not.toBeNull();
	const overlapsCoach = reviewBox!.x < coachBox!.x + coachBox!.width
		&& reviewBox!.x + reviewBox!.width > coachBox!.x
		&& reviewBox!.y < coachBox!.y + coachBox!.height
		&& reviewBox!.y + reviewBox!.height > coachBox!.y;
	expect(overlapsCoach, 'global coach launcher must not cover the proposal review CTA').toBe(false);

	const disabledStyle = await reviewButton.evaluate(node => {
		const style = getComputedStyle(node as HTMLElement);
		return {
			backgroundImage: style.backgroundImage,
			cursor: style.cursor,
			opacity: Number(style.opacity),
		};
	});
	expect(disabledStyle.cursor).toBe('not-allowed');
	expect(disabledStyle.backgroundImage).toBe('none');
	expect(disabledStyle.opacity, 'disabled primary CTA should not look like an active orange action').toBeLessThan(0.75);
});

test('Generate page · artifact review card is not cramped at 1280px desktop width', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCard = page.locator('.generate-review-card');
	const briefCard = page.locator('.generate-brief-card');
	const title = reviewCard.locator('.card__title');
	const reviewButton = reviewCard.getByRole('button', {name: /^review in proposals$/i});
	const packet = reviewCard.locator('.artifact-review__packet');
	const coach = page.locator('.coach-launcher');

	const [titleBox, reviewBox, cardBox, briefBox, packetBox, coachBox] = await Promise.all([
		title.boundingBox(),
		reviewButton.boundingBox(),
		reviewCard.boundingBox(),
		briefCard.boundingBox(),
		packet.boundingBox(),
		coach.boundingBox(),
	]);
	expect(titleBox, 'artifact review title should render').not.toBeNull();
	expect(reviewBox, 'proposal review CTA should render').not.toBeNull();
	expect(cardBox, 'artifact review card should render').not.toBeNull();
	expect(briefBox, 'buyer proof composer should render').not.toBeNull();
	expect(packetBox, 'review packet should render').not.toBeNull();
	expect(coachBox, 'global coach launcher should render').not.toBeNull();

	expect(cardBox!.width, 'artifact review card should use the main console width at 1280px').toBeGreaterThanOrEqual(briefBox!.width - 1);
	expect(cardBox!.y, 'artifact review should lead the work area before the long buyer-proof composer').toBeLessThan(briefBox!.y);
	expect(titleBox!.height, 'artifact review title should stay on one line at desktop width').toBeLessThan(24);
	expect(reviewBox!.x + reviewBox!.width, 'review CTA should stay inside the card header').toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);

	// Per May 5 punch list item #20 the launcher anchors bottom-right on
	// every route. A floating bottom-right widget can sit over scrolled
	// content; that's the accepted trade-off (Intercom-style). The layout
	// checks above (card width, title not wrapping, CTA inside card) are
	// what kept the page from feeling cramped — the launcher-overlap
	// assertion was a side-effect of the old top-right hop. Keep `coachBox`
	// resolved so we still flag a missing launcher.
	void coachBox;
	void packetBox;
});

test('Generate page · artifact inspection controls stay visible before the checklist', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCard = page.locator('.generate-review-card');
	const reviewPath = reviewCard.locator('[data-testid="generate-review-path"]');
	const links = reviewCard.locator('.artifact-review__links');
	const quality = reviewCard.locator('.artifact-review__quality');
	await expect(reviewCard.getByRole('button', {name: /inspect pdf requirements/i})).toBeVisible();
	await expect(reviewCard.getByRole('button', {name: /inspect source requirements/i})).toBeVisible();
	await expect(reviewPath).toContainText(/inspect packet requirements/i);
	await expect(reviewPath).toContainText(/no pdf\/source preview exists/i);

	const [reviewPathBox, linksBox, qualityBox] = await Promise.all([
		reviewPath.boundingBox(),
		links.boundingBox(),
		quality.boundingBox(),
	]);
	expect(reviewPathBox, 'proposal review path should render').not.toBeNull();
	expect(linksBox, 'artifact inspection row should render').not.toBeNull();
	expect(qualityBox, 'artifact quality checklist should render').not.toBeNull();
	expect(reviewPathBox!.y, 'proposal review path should be visible before artifact inspection').toBeLessThan(linksBox!.y);
	expect(reviewPathBox!.y + reviewPathBox!.height, 'proposal review path should stay above the first laptop fold').toBeLessThan(720);
	expect(linksBox!.y, 'PDF/source inspection should appear before the checklist').toBeLessThan(qualityBox!.y);
	expect(linksBox!.y + linksBox!.height, 'artifact inspection row should fit in the first laptop viewport').toBeLessThan(720);
});

test('Generate page · review path actions have real hit targets', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const actionMetrics = await page.locator('.generate-review-card .artifact-review__path-action').evaluateAll(actions => actions.map(action => {
		const box = action.getBoundingClientRect();
		const element = action as HTMLElement;
		return {
			text: element.textContent?.trim().replaceAll(/\s+/g, ' ') ?? '',
			height: box.height,
			width: box.width,
			clientWidth: element.clientWidth,
			scrollWidth: element.scrollWidth,
		};
	}));

	expect(actionMetrics.length, 'review path should expose at least one inline action').toBeGreaterThan(0);
	for (const action of actionMetrics) {
		expect(action.height, `review path action is too cramped: ${JSON.stringify(action)}`).toBeGreaterThanOrEqual(28);
		expect(action.width, `review path action should read as a control, not a text chip: ${JSON.stringify(action)}`).toBeGreaterThanOrEqual(104);
		expect(action.scrollWidth, `review path action label should fit: ${JSON.stringify(action)}`).toBeLessThanOrEqual(action.clientWidth + 1);
	}
});

test('Generate page · artifact inspection is not buried on short desktop viewports', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 640});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCard = page.locator('.generate-review-card');
	const links = reviewCard.locator('.artifact-review__links');
	const packet = reviewCard.locator('.artifact-review__packet');
	await expect(reviewCard.getByRole('button', {name: /inspect pdf requirements/i})).toBeVisible();
	await expect(reviewCard.getByRole('button', {name: /inspect source requirements/i})).toBeVisible();

	const [linksBox, packetBox] = await Promise.all([
		links.boundingBox(),
		packet.boundingBox(),
	]);
	expect(linksBox, 'artifact inspection row should render').not.toBeNull();
	expect(packetBox, 'review packet copy should render').not.toBeNull();
	expect(linksBox!.y, 'PDF/source inspection should come before explanatory packet copy').toBeLessThan(packetBox!.y);
	expect(linksBox!.y + linksBox!.height, 'artifact inspection row should fit above the fold at 1280x640').toBeLessThan(640);
});

test('Generate page · mobile keeps the review gate ahead of the long composer and trace', async ({openConsole, page}) => {
	await page.setViewportSize({width: 390, height: 844});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCard = page.locator('.generate-review-card');
	const briefCard = page.locator('.generate-brief-card');
	const traceCard = page.locator('.generate-trace-card');
	const reviewButton = reviewCard.getByRole('button', {name: /^review in proposals$/i});
	const coach = page.locator('.coach-launcher');

	const [reviewBox, briefBox, traceBox, reviewButtonBox, coachBox] = await Promise.all([
		reviewCard.boundingBox(),
		briefCard.boundingBox(),
		traceCard.boundingBox(),
		reviewButton.boundingBox(),
		coach.boundingBox(),
	]);
	expect(reviewBox, 'mobile review gate should render').not.toBeNull();
	expect(briefBox, 'mobile buyer brief should render').not.toBeNull();
	expect(traceBox, 'mobile trace card should render').not.toBeNull();
	expect(reviewButtonBox, 'mobile proposal review CTA should render').not.toBeNull();
	expect(coachBox, 'mobile coach launcher should render').not.toBeNull();

	expect(reviewBox!.y, 'review gate should be visible after the sequence explanation, not buried behind the composer').toBeLessThan(700);
	expect(reviewBox!.y, 'review gate should appear before the long buyer brief composer on mobile').toBeLessThan(briefBox!.y);
	expect(briefBox!.y, 'buyer brief should appear before the trace stream on mobile').toBeLessThan(traceBox!.y);
	expect(reviewButtonBox!.y + reviewButtonBox!.height, 'disabled review CTA should be visible in the first mobile viewport').toBeLessThan(844);

	const coachOverlapsReview = reviewBox!.x < coachBox!.x + coachBox!.width
		&& reviewBox!.x + reviewBox!.width > coachBox!.x
		&& reviewBox!.y < coachBox!.y + coachBox!.height
		&& reviewBox!.y + reviewBox!.height > coachBox!.y;
	expect(coachOverlapsReview, 'mobile coach launcher should stay in the rail instead of covering the review gate').toBe(false);
});

test('Generate page · locked mobile review gate jumps to buyer proof', async ({openConsole, page}) => {
	await page.setViewportSize({width: 390, height: 844});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCard = page.locator('.generate-review-card');
	const jumpButton = reviewCard.getByRole('button', {name: /add buyer proof/i});
	const textarea = page.locator('.generate-brief').first();
	await expect(jumpButton).toBeVisible();

	const startingScroll = await page.evaluate(() => document.querySelector('main.scroll')?.scrollTop || 0);
	await jumpButton.click();
	await expect(textarea).toBeFocused();
	await expect.poll(
		async () => page.evaluate(() => document.querySelector('main.scroll')?.scrollTop || 0),
		{timeout: 5000},
	).toBeGreaterThan(startingScroll + 100);

	await expect.poll(
		async () => textarea.evaluate(node => {
			const box = node.getBoundingClientRect();
			return Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0));
		}),
		{timeout: 5000},
	).toBeGreaterThan(120);
});

test('Generate page · coach launcher stays in shell chrome instead of covering artifact actions', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 640});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await expect(page.locator('html')).toHaveAttribute('data-console-route', 'generate');
	const links = page.locator('.artifact-review__links');
	const coach = page.locator('.coach-launcher');
	await expect(links).toBeVisible();
	await expect(coach).toBeVisible();

	const geometry = await page.evaluate(() => {
		const coachBox = document.querySelector('.coach-launcher')?.getBoundingClientRect();
		const topbarBox = document.querySelector('.tb')?.getBoundingClientRect();
		const linksBox = document.querySelector('.artifact-review__links')?.getBoundingClientRect();
		const sourceBox = document.querySelector('[data-testid="generate-review-source-action"]')?.getBoundingClientRect();
		const overlaps = (a: DOMRect | undefined, b: DOMRect | undefined) => {
			if (!a || !b) {
				return true;
			}

			return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
		};

		return {
			coachBottom: coachBox?.bottom ?? 0,
			coachTop: coachBox?.top ?? 0,
			overlapsLinks: overlaps(coachBox, linksBox),
			overlapsSource: overlaps(coachBox, sourceBox),
			topbarBottom: topbarBox?.bottom ?? 0,
			topbarTop: topbarBox?.top ?? 0,
		};
	});

	expect(geometry.coachTop, `coach should stay inside the shell chrome: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(geometry.topbarTop - 1);
	expect(geometry.coachBottom, `coach should stay inside the shell chrome: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.topbarBottom + 1);
	expect(geometry.overlapsLinks, `coach must not cover artifact actions: ${JSON.stringify(geometry)}`).toBe(false);
	expect(geometry.overlapsSource, `coach must not cover source evidence action: ${JSON.stringify(geometry)}`).toBe(false);
});

test('Generate page · DEMO_MODE streams a canned pipeline trace and resets the button', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /load demo proof/i}).click();
	await page.waitForTimeout(150);
	const initBtn = page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i});
	await initBtn.click();
	// Button switches while the canned trace replays.
	await expect(page.locator('.ph__actions').getByRole('button', {name: /generating draft/i})).toBeVisible({timeout: 1000});
	// The canned trace should produce visible OK lines in the console panel —
	// at least the three from the demo stream (enrichment.icp, audit.signed,
	// pipeline.done). New events (request.response 200, pipeline.complete)
	// may add more; assert a lower bound, not equality.
	await expect.poll(
		async () => page.locator('.console-panel .cl-ok').count(),
		{timeout: 10_000},
	).toBeGreaterThanOrEqual(3);
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i);
	await expect(page.locator('.console-panel')).toContainText(/request\.response: http 200/i);
	await expect(page.locator('.console-panel')).toContainText(/request\.posting: post \/api\/generate/i);
	await expect(page.locator('.console-panel__status')).toContainText(/complete/i, {timeout: 20_000});
	// Button resets with honest copy: the next click replaces the ready draft.
	await expect(page.locator('.ph__actions').getByRole('button', {name: /^regenerate review draft$/i})).toBeVisible({timeout: 5000});
	await expect(page.locator('.generate-review-card')).toContainText(/draft is ready for operator review/i);
	await expect(page.locator('.toast', {hasText: /proposal generated/i})).toHaveCount(0);
});

test('Generate page · completed sequence keeps local artifact review actions unobscured by toasts', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /load demo proof/i}).click();
	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();

	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete/i, {timeout: 20_000});
	await expect(page.locator('.generate-review-card')).toContainText(/draft is ready for operator review/i);
	await expect(page.locator('.toast', {hasText: /proposal generated/i})).toHaveCount(0);
	await expect(page.locator('.toast', {hasText: /sequence initializing/i})).toHaveCount(0);

	const geometry = await page.evaluate(() => {
		const rect = (element: Element | undefined) => {
			if (!element) {
				return null;
			}

			const box = element.getBoundingClientRect();
			return {
				left: box.left, right: box.right, top: box.top, bottom: box.bottom,
			};
		};

		const overlaps = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => {
			if (!a || !b) {
				return true;
			}

			return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
		};

		const toasts = [...document.querySelectorAll('.toast')].map(toast => rect(toast));
		const links = rect(document.querySelector('.artifact-review__links'));
		const source = rect(document.querySelector('[data-testid="generate-review-source-action"]'));
		const pdf = rect(document.querySelector('[data-testid="generate-review-pdf-action"]'));
		return {
			toastCount: toasts.length,
			overlapsLinks: toasts.some(toast => overlaps(toast, links)),
			overlapsSource: toasts.some(toast => overlaps(toast, source)),
			overlapsPdf: toasts.some(toast => overlaps(toast, pdf)),
		};
	});

	expect(geometry.toastCount, `completed Generate should not leave floating toast chrome over the review gate: ${JSON.stringify(geometry)}`).toBe(0);
	expect(geometry.overlapsLinks, `toast must not cover artifact inspection row: ${JSON.stringify(geometry)}`).toBe(false);
	expect(geometry.overlapsPdf, `toast must not cover PDF artifact action: ${JSON.stringify(geometry)}`).toBe(false);
	expect(geometry.overlapsSource, `toast must not cover source evidence action: ${JSON.stringify(geometry)}`).toBe(false);
});

test('Generate page · regenerating closes stale artifact drawers while the new sequence runs', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /load demo proof/i}).click();

	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});
	await expect(page.locator('.ph__actions').getByRole('button', {name: /^regenerate review draft$/i})).toBeVisible();

	await page.locator('.generate-review-card').getByRole('button', {name: /inspect source evidence/i}).click();
	await expect(page.getByRole('region', {name: /proposal artifact review drawer/i})).toBeVisible();

	await page.locator('.ph__actions').getByRole('button', {name: /^regenerate review draft$/i}).click();

	await expect(page.getByRole('region', {name: /proposal artifact review drawer/i})).toHaveCount(0);
	await expect(page.locator('.generate-review-card')).toContainText(/run the sequence to create the proposal review packet/i);
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /^review in proposals$/i})).toBeDisabled();
	await expect(page.locator('.ph__actions').getByRole('button', {name: /^generating draft$/i})).toBeVisible();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.start/i);
});

test('Generate page · editing buyer proof after draft ready locks stale review artifacts', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /load demo proof/i}).click();

	const reviewCard = page.locator('.generate-review-card');
	const reviewButton = reviewCard.getByRole('button', {name: /^review in proposals$/i});
	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});
	await expect(reviewButton).toBeEnabled({timeout: 5000});

	await reviewCard.getByRole('button', {name: /inspect source evidence/i}).click();
	await expect(page.getByRole('region', {name: /proposal artifact review drawer/i})).toBeVisible();

	const textarea = page.locator('.generate-brief').first();
	const existingBrief = await textarea.inputValue();
	await textarea.fill(`${existingBrief}\n\nNEW BUYER PROOF: CFO requested a revised security appendix before approval.`);

	await expect(page.getByRole('region', {name: /proposal artifact review drawer/i})).toHaveCount(0);
	await expect(reviewButton).toBeDisabled();
	await expect(reviewCard).toContainText(/run the sequence to create the proposal review packet/i);
	await expect(reviewCard.getByRole('button', {name: /inspect pdf requirements/i})).toBeVisible();
	await expect(page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i})).toBeVisible();
	await expect(page.locator('.toast').first()).toContainText(/draft review reset/i);
});

test('Generate page · completed draft routes to proposal review', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /load demo proof/i}).click();

	const reviewButton = page.locator('.generate-review-card').getByRole('button', {name: /^review in proposals$/i});
	await expect(reviewButton).toBeDisabled();

	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});
	await expect(reviewButton).toBeEnabled({timeout: 5000});
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /review pdf artifact/i})).toBeVisible();
	await page.locator('.generate-review-card').getByRole('button', {name: /review pdf artifact/i}).click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer.locator('iframe[title="Generated proposal PDF review preview"]')).toBeVisible();
	await expect(drawer.locator('[data-testid="generate-artifact-mode"]')).toContainText(/demo sequence/i);
	await expect(drawer).toContainText(/demo-generated acme hvac packet/i);
	await page.getByRole('button', {name: /close proposal artifact review drawer/i}).click();
	await page.locator('.generate-review-card').getByRole('button', {name: /inspect source evidence/i}).click();
	await expect(drawer).toContainText(/operator_review/i);
	await expect(drawer).toContainText(/demo evidence bundle/i);
	const sourceJson = drawer.locator('[data-testid="generate-artifact-source-json"]');
	await expect(sourceJson).toContainText(/prop_demo_001/i);
	await expect(sourceJson).toContainText(/"_demo_note"/i);
	await reviewButton.click();

	await expect(page.locator('.tb__crumb--active')).toContainText(/proposals/i);
	await expect(page.locator('.ph__title').first()).toContainText(/proposals/i);
	const activeRow = page.locator('[data-testid="proposal-row"][data-active="true"]');
	await expect(activeRow).toContainText(/draft-acme-hvac/i);
	await expect(activeRow).not.toContainText(/acme-hvac-r3/i);
	const detailCard = page.getByTestId('proposal-detail-card');
	await expect(detailCard.locator('.card__title')).toContainText(/draft-acme-hvac/i);
	await expect(detailCard).toContainText(/acme hvac/i);
	await expect(detailCard).toContainText(/run_acme_hvac/i);
	await expect(detailCard).not.toContainText(/banyan health/i);
});

test('Proposals page · normal nav keeps the detail pane aligned with the visible list', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Proposals")').first().click();

	const firstProposal = await page.evaluate(() => {
		const first = (globalThis as any).GTM.proposals[0];
		return {id: first.id, co: first.co};
	});
	const firstRow = page.locator('[data-testid="proposal-row"]').first();
	const detailCard = page.getByTestId('proposal-detail-card');

	await expect(firstRow).toHaveAttribute('data-active', 'true');
	await expect(firstRow).toContainText(firstProposal.id);
	await expect(detailCard.locator('.card__title')).toContainText(firstProposal.id);
	await expect(detailCard).toContainText(firstProposal.co);

	await page.locator('[data-testid="proposal-row"]').filter({hasText: /acme-hvac-r3/i}).first().click();
	await expect(detailCard).toContainText(/acme hvac services/i);
	await page.locator('.ph__actions').getByRole('button', {name: /^open$/i}).click();
	await expect(page.locator('[data-testid="proposal-row"][data-active="true"]')).not.toContainText(/acme-hvac-r3/i);
	await expect(detailCard).not.toContainText(/acme hvac services/i);
});

test('Draft next proposal from Calls carries call metadata into Generate, pre-fills the brief, shows the handoff banner', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Calls")').first().click();

	// Capture the active call from the GTM fixture so the assertions mirror real data.
	const activeCall = await page.evaluate(() => {
		const D = (globalThis as any).GTM;
		const ctx = (globalThis as any).AppContext.get();
		const id = ctx?.selection?.type === 'call' ? ctx.selection.id : 'CALL-2419';
		return (D.calls || []).find((c: any) => c.id === id) || (D.calls || [])[0];
	});
	expect(activeCall.id).toBeTruthy();
	expect(activeCall.co).toBeTruthy();

	await page.locator('[data-testid="call-draft-next-proposal"]').click();

	// The control should do navigation and state handoff, not a toast-only signal.
	await expect(page.locator('.toast', {hasText: new RegExp(`Proposal v3 generator opened · ${activeCall.id}`)})).toHaveCount(0);

	// Land on Generate; the handoff banner names the call.
	await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
	const banner = page.locator('[data-testid="generate-proposal-draft-banner"]');
	await expect(banner).toBeVisible();
	await expect(banner).toContainText(new RegExp(`Drafting next proposal from ${activeCall.id}`));
	await expect(banner).toContainText(new RegExp(activeCall.co));
	const summary = page.locator('[data-testid="generate-proposal-draft-summary"]');
	await expect(summary).toContainText(new RegExp(activeCall.outcome));

	// Brief textarea pre-filled with the call context.
	const brief = page.locator('.generate-brief');
	const briefValue = (await brief.inputValue()).trim();
	expect(briefValue).toContain(activeCall.id);
	expect(briefValue).toContain(activeCall.co);
	expect(briefValue).toContain(activeCall.outcome);
	expect(briefValue).toMatch(/call signal/i);

	// Dismiss banner removes it without clearing the textarea.
	await page.locator('[data-testid="generate-proposal-draft-dismiss"]').click();
	await expect(banner).toHaveCount(0);
	expect((await brief.inputValue()).length).toBeGreaterThan(0);
});

test('Address blockers is disabled on a zero-blocker proposal — no fake toast-only operation', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Proposals")').first().click();
	// Find a proposal that ships with NO blockers — PR-2040 (Verdant) and PR-2038 (Thornfield) qualify.
	const target = await page.evaluate(() => {
		const proposals = ((globalThis as any).GTM.proposals || []) as Array<{id: string; co: string; blockers?: string[]}>;
		return proposals.find(p => !Array.isArray(p.blockers) || p.blockers.length === 0);
	});
	if (!target) {
		return;
	} // Every proposal has blockers — nothing to test.

	await page.locator('[data-testid="proposal-row"]').filter({hasText: target.id}).first().click();

	// Button should be a real disabled control, not a clickable action that
	// only produces a toast.
	const btn = page.locator('[data-testid="proposal-address-blockers"]');
	await expect(btn).toHaveAttribute('data-blocker-count', '0');
	await expect(btn).toBeDisabled();
	await expect(btn).toContainText(/^No blockers to address$/);
	await expect(page.locator('.toast', {hasText: new RegExp(`${target.id} has no open blockers`)})).toHaveCount(0);

	await page.locator('.card:has(.card__title:has-text("detail")) .btn:has-text("Review packet")').click();
	const reviewPanel = page.locator('[data-testid="proposal-review-panel"]');
	await expect(reviewPanel).toBeVisible();
	const reviewHandoff = reviewPanel.locator('[data-testid="proposal-review-address-blockers"]');
	await expect(reviewHandoff).toHaveAttribute('data-blocker-count', '0');
	await expect(reviewHandoff).toBeDisabled();
	await expect(reviewHandoff).toContainText(/^No blockers to address$/);

	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
	await expect(page.locator('[data-testid="generate-address-blockers-banner"]')).toHaveCount(0);
});

test('Address blockers from Proposals carries the blocker list into Generate, pre-fills the brief, shows the handoff banner', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Proposals")').first().click();

	// Pick a proposal that has blockers — PR-2041 (Banyan) ships with ['Liability cap', 'Auto-renewal'].
	await page.locator('[data-testid="proposal-row"]').filter({hasText: 'PR-2041'}).first().click();

	const liveBlockers = await page.evaluate(() => {
		const D = (globalThis as any).GTM;
		const p = (D.proposals || []).find((x: any) => x.id === 'PR-2041');
		return Array.isArray(p?.blockers) ? p.blockers : [];
	});
	expect(liveBlockers.length).toBeGreaterThan(0);

	await page.locator('[data-testid="proposal-address-blockers"]').click();

	// The control should move directly into the Generate handoff banner.
	await expect(page.locator('.toast', {hasText: /drafting pr-2041 v-next/i})).toHaveCount(0);
	await expect(page.locator('.toast', {hasText: new RegExp(`${liveBlockers.length} blocker`)})).toHaveCount(0);

	// Land on Generate; the handoff banner names the proposal and lists each blocker.
	await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
	const banner = page.locator('[data-testid="generate-address-blockers-banner"]');
	await expect(banner).toBeVisible();
	await expect(banner).toContainText(/Addressing blockers from PR-2041/);
	for (const b of liveBlockers) {
		await expect(banner.locator('[data-testid="generate-address-blockers-list"]')).toContainText(b);
	}

	// Brief textarea is pre-filled with the blocker context — proves the click delivered, not just navigated.
	const brief = page.locator('.generate-brief');
	const briefValue = (await brief.inputValue()).trim();
	expect(briefValue).toContain('PR-2041');
	for (const b of liveBlockers) {
		expect(briefValue).toContain(b);
	}

	expect(briefValue).toMatch(/outstanding blockers/i);

	// Dismiss banner removes it without clearing the textarea.
	await page.locator('[data-testid="generate-address-blockers-dismiss"]').click();
	await expect(banner).toHaveCount(0);
	expect((await brief.inputValue()).length).toBeGreaterThan(0);
});

test('Address blockers handoff banner auto-clears once the review draft is ready — no stale handoff label after the work is done', async ({openConsole}) => {
	const page = await openConsole();
	// Trigger the handoff from Proposals → Generate.
	await page.locator('.sb__item:has-text("Proposals")').first().click();
	await page.locator('[data-testid="proposal-row"]').filter({hasText: 'PR-2041'}).first().click();
	await page.locator('[data-testid="proposal-address-blockers"]').click();

	// Land on Generate with the banner visible — handoff is fresh.
	await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
	const banner = page.locator('[data-testid="generate-address-blockers-banner"]');
	await expect(banner).toBeVisible();

	// Run the demo pipeline; once it completes, reviewReady becomes true
	// and the handoff banner should auto-clear (the operator's brief is no
	// longer just-a-handoff — they've produced a draft from it).
	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});
	await expect(banner).toHaveCount(0);
});

test('Review in Proposals routes to the proposal whose buyer matches the most recent handoff — not the hardcoded Acme/Banyan default', async ({openConsole}) => {
	const page = await openConsole();
	// Trigger the address-blockers handoff from PR-2041 (Banyan). The
	// hardcoded fallback in the previous version would also land on PR-2041
	// because Acme isn't in the seed proposals — making this test pass for
	// the wrong reason. So we explicitly pick a NON-Acme buyer (Banyan)
	// and verify the routing follows the handoff.
	await page.locator('.sb__item:has-text("Proposals")').first().click();
	await page.locator('[data-testid="proposal-row"]').filter({hasText: 'PR-2041'}).first().click();
	await page.locator('[data-testid="proposal-address-blockers"]').click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Generate');

	// Run the demo pipeline so reviewReady becomes true and the handoff
	// banner auto-clears (per the prior fix). The lastHandoffRef should
	// still hold the PR-2041/Banyan context.
	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});

	// Click Review in Proposals — should route to PR-2041 (the handoff
	// origin) because the lastHandoffRef survived the banner auto-clear.
	await page.locator('.generate-review-card').getByRole('button', {name: /^review in proposals$/i}).click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
	const detailCard = page.getByTestId('proposal-detail-card');
	await expect(detailCard.locator('.card__title')).toContainText('PR-2041');
	await expect(detailCard).toContainText(/banyan/i);
});

test('Generate page · lower Generate review draft button streams immediately', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /load demo proof/i}).click();
	await page.waitForTimeout(150);
	await page.locator('.generate-actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.start/i);
	await expect(page.locator('.console-panel')).toContainText(/intake\.received/i, {timeout: 3000});
});

test('Generate page · ConsolePanel surfaces the full pipeline log with scrollable body, line count, copy + clear', async ({openConsole, context}) => {
	// Clipboard read needs a permission grant; copy still works without it
	// (it just falls through to the toast assertion).
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /load demo proof/i}).click();
	await page.waitForTimeout(120);

	const panel = page.locator('.generate-grid .console-panel');
	const body = panel.locator('[data-testid="console-panel-body"]');

	// Body is a real scrollable region with role="log" so screen readers see it.
	await expect(body).toHaveAttribute('role', 'log');
	await expect(body).toHaveAttribute('aria-live', 'polite');
	const overflowY = await body.evaluate(element => getComputedStyle(element as HTMLElement).overflowY);
	expect(overflowY).toBe('auto');

	// Copy / Clear are disabled when the panel has no lines.
	const copyBtn = panel.locator('[data-testid="console-panel-copy"]');
	const clearBtn = panel.locator('[data-testid="console-panel-clear"]');
	await expect(copyBtn).toBeDisabled();
	await expect(clearBtn).toBeDisabled();

	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();

	// Expanded surface shows the new request envelope events the user
	// previously couldn't see at all.
	await expect(panel).toContainText(/pipeline\.start/i, {timeout: 5000});
	await expect(panel).toContainText(/request\.posting: post \/api\/generate/i, {timeout: 5000});
	await expect(panel).toContainText(/request\.response: http 200/i, {timeout: 5000});
	await expect(panel).toContainText(/pipeline\.done/i, {timeout: 20_000});
	await expect(panel).toContainText(/pipeline\.complete: artifact_id=run_acme_hvac/i, {timeout: 20_000});

	// Line count >= 14 (1 start + 1 posting + 1 response + 11 demo + 1 complete).
	const count = await panel.locator('[data-testid="console-panel-count"]').textContent();
	expect(Number.parseInt((count || '0').trim(), 10)).toBeGreaterThanOrEqual(14);

	// Copy is now enabled and toasts a confirmation including the line count.
	await expect(copyBtn).toBeEnabled();
	await copyBtn.click();
	await expect(page.locator('.toast', {hasText: /log copied to clipboard/i})).toBeVisible();

	// Clear empties the panel and disables the buttons again.
	await clearBtn.click();
	await expect(panel).not.toContainText(/pipeline\.start/i);
	await expect(copyBtn).toBeDisabled();
});
