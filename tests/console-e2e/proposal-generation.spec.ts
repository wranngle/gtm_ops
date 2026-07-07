/**
 * Proposal generation flow — exercise the Generate page UI end-to-end:
 *   - Use sample buyer proof populates the textarea with the Acme HVAC fixture
 *   - Run sequence is gated on input
 *   - Submitting fires a POST /api/generate (caught by the demo fetch shim)
 */
import {test, expect} from './helpers.js';

test('Generate page · auto-sample populates input', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 390, height: 844});
	await page.locator('.sb__item:has-text("Generate")').first().click();
	const textarea = page.locator('.generate-brief').first();
	await expect(textarea).toBeVisible();
	await expect(textarea).toHaveValue('');
	const sampleButton = page.getByRole('button', {name: /use sample buyer proof/i}).first();
	await sampleButton.click();
	// Either the fixture loads, or the canned fallback sets the same Acme HVAC string.
	await expect(textarea).toHaveValue(/HVAC|Acme|CLIENT:/, {timeout: 5000});

	const geometry = await page.evaluate(() => {
		const scroll = document.querySelector('main.scroll');
		const topbar = document.querySelector('.tb')?.getBoundingClientRect();
		const header = document.querySelector('.page--generate .ph')?.getBoundingClientRect();
		const sequence = document.querySelector('[data-testid="generate-sequence"]')?.getBoundingClientRect();
		return {
			activeElementText: document.activeElement?.textContent?.replaceAll(/\s+/g, ' ').trim() ?? '',
			activeElementTag: document.activeElement?.tagName ?? '',
			headerTop: header?.top ?? -1,
			scrollTop: scroll?.scrollTop ?? -1,
			sequenceTop: sequence?.top ?? -1,
			topbarBottom: topbar?.bottom ?? 0,
		};
	});

	expect(geometry.activeElementTag, `sample loading should not steal focus into the editor: ${JSON.stringify(geometry)}`).not.toBe('TEXTAREA');
	expect(geometry.activeElementText, `sample button should keep keyboard context: ${JSON.stringify(geometry)}`).toMatch(/use sample buyer proof/i);
	expect(geometry.scrollTop, `manual sample loading should not hide the proposal sequence: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(1);
	expect(geometry.headerTop, `Generate header should remain below the topbar: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(geometry.topbarBottom - 1);
	expect(geometry.sequenceTop, `sequence should stay visible after sample load: ${JSON.stringify(geometry)}`).toBeLessThan(520);
});

test('Generate page · run status is a separate band so header actions stay in the header', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 1440, height: 900});
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await expect(page.locator('[data-testid="generate-run-strip"]')).toBeVisible();
	// The visual-restraint pass removed the Generate header's sub line (the
	// run strip below carries the pipeline framing now) — pin its absence so
	// a decorative subtitle doesn't quietly return.
	await expect(page.locator('.page--generate .ph__sub')).toHaveCount(0);

	const geometry = await page.evaluate(() => {
		const header = document.querySelector<HTMLElement>('.page--generate .ph');
		const title = document.querySelector<HTMLElement>('.page--generate .ph__title');
		const actions = document.querySelector<HTMLElement>('.page--generate .ph__actions');
		const status = document.querySelector<HTMLElement>('[data-testid="generate-run-strip"]');
		const sequence = document.querySelector<HTMLElement>('[data-testid="generate-sequence"]');
		const rect = (element: HTMLElement | null | undefined) => {
			const box = element?.getBoundingClientRect();
			return box
				? {
					bottom: Math.round(box.bottom),
					left: Math.round(box.left),
					right: Math.round(box.right),
					top: Math.round(box.top),
					width: Math.round(box.width),
				}
				: null;
		};

		return {
			actions: rect(actions),
			header: rect(header),
			sequence: rect(sequence),
			status: rect(status),
			title: rect(title),
		};
	});

	expect(geometry.header, `Generate header should render: ${JSON.stringify(geometry)}`).not.toBeNull();
	expect(geometry.actions, `Generate header actions should render: ${JSON.stringify(geometry)}`).not.toBeNull();
	expect(geometry.status, `Generate run status should render: ${JSON.stringify(geometry)}`).not.toBeNull();
	expect(geometry.sequence, `Generate sequence should render: ${JSON.stringify(geometry)}`).not.toBeNull();
	expect(geometry.actions!.top, `actions should align with the header, not wrap into the status band: ${JSON.stringify(geometry)}`).toBeLessThan(geometry.header!.bottom + 1);
	expect(geometry.status!.top, `run status should sit below the header actions: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(geometry.header!.bottom);
	expect(geometry.status!.bottom, `run status should introduce the sequence, not bury it: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.sequence!.top);
	expect(geometry.status!.width, `run status should use the console column instead of a cramped subtitle width: ${JSON.stringify(geometry)}`).toBeGreaterThan(geometry.header!.width * 0.75);
});

test('Generate page · review path names the artifact, operator approval, and buyer-send gate', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const path = page.getByTestId('generate-review-path');
	await expect(path.locator('.artifact-review__path-copy strong')).toHaveText([
		'Review artifact',
		'Operator approval',
		'Buyer send',
	]);
	await expect(path).toContainText(/Review artifact/i);
	await expect(path).toContainText(/Operator approval/i);
	await expect(path).toContainText(/Buyer send/i);
	await expect(path).toContainText(/Review the sample packet preview before loading buyer proof/i);
	await expect(path).toContainText(/Buyer send blocked until approved by a Proposals operator/i);

	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete/i, {timeout: 20_000});
	await expect(path).toContainText(/Open Proposals on this draft; buyer send remains gated there/i);
	await expect(page.getByTestId('generate-review-path-action-open-proposals-review')).toHaveText(/Open review/i);
});

test('Generate page · mobile sequence stays compact enough to expose the buyer proof editor', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 390, height: 844});
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await expect(page.getByTestId('generate-sequence')).toBeVisible();
	await expect(page.locator('.generate-brief').first()).toBeVisible();

	const geometry = await page.evaluate(() => {
		const sequence = document.querySelector<HTMLElement>('[data-testid="generate-sequence"]');
		const textarea = document.querySelector<HTMLElement>('.generate-brief');
		const scroll = document.querySelector<HTMLElement>('main.scroll');
		const steps = [...document.querySelectorAll<HTMLElement>('.generate-step')].map(step => {
			const box = step.getBoundingClientRect();
			const detail = step.querySelector<HTMLElement>('p');
			return {
				bottom: Math.round(box.bottom),
				clientWidth: step.clientWidth,
				detailDisplay: detail ? getComputedStyle(detail).display : '',
				scrollWidth: step.scrollWidth,
				text: (step.textContent || '').replaceAll(/\s+/g, ' ').trim(),
				top: Math.round(box.top),
			};
		});
		const sequenceBox = sequence?.getBoundingClientRect();
		const textareaBox = textarea?.getBoundingClientRect();
		return {
			bodyWidth: document.body.scrollWidth,
			innerWidth,
			scrollTop: scroll?.scrollTop ?? -1,
			sequenceBottom: Math.round(sequenceBox?.bottom ?? -1),
			sequenceTop: Math.round(sequenceBox?.top ?? -1),
			steps,
			textareaTop: Math.round(textareaBox?.top ?? -1),
			viewportHeight: innerHeight,
		};
	});

	expect(geometry.bodyWidth, `mobile Generate should not introduce horizontal page scroll: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.innerWidth);
	expect(geometry.scrollTop, `initial Generate load should stay at the top: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(1);
	expect(geometry.steps).toHaveLength(3);
	expect(geometry.steps.every(step => step.scrollWidth <= step.clientWidth + 1), `sequence steps should wrap inside their mobile cards: ${JSON.stringify(geometry)}`).toBe(true);
	expect(geometry.steps[1].top, `mobile sequence should use readable rows at 390px, not cramped micro-cards: ${JSON.stringify(geometry)}`).toBeGreaterThan(geometry.steps[0].bottom);
	expect(geometry.steps[2].top, `mobile sequence should keep the review gate as its own row: ${JSON.stringify(geometry)}`).toBeGreaterThan(geometry.steps[1].bottom);
	expect(geometry.steps.every(step => step.detailDisplay !== 'none'), `sequence detail copy should stay visible on phone width: ${JSON.stringify(geometry)}`).toBe(true);
	expect(geometry.textareaTop, `buyer proof editor should be visible in the first mobile viewport after the sequence: ${JSON.stringify(geometry)}`).toBeLessThan(geometry.viewportHeight - 96);
	expect(geometry.textareaTop, `buyer proof editor should follow the sequence, not overlap it: ${JSON.stringify(geometry)}`).toBeGreaterThan(geometry.sequenceBottom);
});

test('Generate page · 320px sequence uses readable rows instead of cramped micro-cards', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 320, height: 844});
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await expect(page.getByTestId('generate-sequence')).toBeVisible();

	const geometry = await page.evaluate(() => {
		const steps = [...document.querySelectorAll<HTMLElement>('.generate-step')].map(step => {
			const box = step.getBoundingClientRect();
			const title = step.querySelector<HTMLElement>('strong')?.getBoundingClientRect();
			const action = step.querySelector<HTMLElement>('.generate-step__action')?.getBoundingClientRect();
			const badge = step.querySelector<HTMLElement>('.badge')?.getBoundingClientRect();
			return {
				badgeLeft: badge ? Math.round(badge.left) : null,
				bottom: Math.round(box.bottom),
				clientWidth: step.clientWidth,
				left: Math.round(box.left),
				right: Math.round(box.right),
				scrollWidth: step.scrollWidth,
				titleRight: title ? Math.round(title.right) : null,
				top: Math.round(box.top),
				width: Math.round(box.width),
				actionLeft: action ? Math.round(action.left) : null,
			};
		});
		return {
			bodyWidth: document.body.scrollWidth,
			innerWidth,
			steps,
		};
	});

	expect(geometry.bodyWidth, `320px Generate should not introduce horizontal scroll: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.innerWidth);
	expect(geometry.steps).toHaveLength(3);
	expect(geometry.steps.every(step => step.scrollWidth <= step.clientWidth + 1), `sequence rows should not overflow: ${JSON.stringify(geometry)}`).toBe(true);
	expect(geometry.steps.every(step => step.width >= 180), `sequence steps should use the available console width instead of 67px micro-cards: ${JSON.stringify(geometry)}`).toBe(true);
	expect(geometry.steps[1].top, `second step should sit below the first row, not beside it: ${JSON.stringify(geometry)}`).toBeGreaterThan(geometry.steps[0].bottom);
	expect(geometry.steps[2].top, `third step should sit below the second row, not beside it: ${JSON.stringify(geometry)}`).toBeGreaterThan(geometry.steps[1].bottom);
	expect(geometry.steps[0].titleRight!, `first step title should not collide with the action control: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.steps[0].actionLeft! - 4);
	expect(geometry.steps[1].titleRight!, `second step title should not collide with the status chip: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.steps[1].badgeLeft! - 4);
});

test('Generate demo deep link keeps the sequence header in view while auto-running', async ({page}) => {
	await page.setViewportSize({width: 390, height: 844});
	await page.addInitScript(() => {
		// @ts-expect-error injected for tests
		globalThis.DEMO_MODE = true;
	});
	await page.goto('/console/?route=generate&demo=1', {waitUntil: 'domcontentloaded'});
	await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

	await expect(page.locator('.generate-brief').first()).toHaveValue(/HVAC|Acme|CLIENT:/, {timeout: 5000});
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.start/i, {timeout: 10_000});

	const geometry = await page.evaluate(() => {
		const scroll = document.querySelector('main.scroll');
		const topbar = document.querySelector('.tb')?.getBoundingClientRect();
		const header = document.querySelector('.page--generate .ph')?.getBoundingClientRect();
		const strip = document.querySelector('[data-testid="generate-run-strip"]')?.getBoundingClientRect();
		const sequence = document.querySelector('[data-testid="generate-sequence"]')?.getBoundingClientRect();
		return {
			activeElementTag: document.activeElement?.tagName ?? '',
			headerTop: header?.top ?? -1,
			scrollTop: scroll?.scrollTop ?? -1,
			sequenceTop: sequence?.top ?? -1,
			stripTop: strip?.top ?? -1,
			topbarBottom: topbar?.bottom ?? 0,
		};
	});

	expect(geometry.scrollTop, `autoplay should not jump to the textarea: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(1);
	expect(geometry.activeElementTag).not.toBe('TEXTAREA');
	expect(geometry.headerTop, `Generate header should remain below the topbar: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(geometry.topbarBottom - 1);
	expect(geometry.stripTop, `run strip should stay in the first mobile viewport: ${JSON.stringify(geometry)}`).toBeLessThan(360);
	expect(geometry.sequenceTop, `sequence cards should explain the run before the editor: ${JSON.stringify(geometry)}`).toBeLessThan(520);
});

test('Generate page · topbar proposal run pre-fills even when Generate is already mounted', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	const textarea = page.locator('.generate-brief').first();
	await expect(textarea).toHaveValue('');

	await page
		.locator('.tb__actions')
		.getByRole('button', {name: /new run/i})
		.click();
	await page
		.locator('.pop__row')
		.filter({hasText: /^Generate proposal/})
		.click();

	const banner = page.locator('[data-testid="generate-new-run-banner"]');
	await expect(banner).toBeVisible();
	await expect(banner).toContainText(/new proposal run seeded from call-2419/i);
	await expect(banner).toContainText(/banyan health/i);
	await expect(textarea).toHaveValue(/buyer proof carried from the call:/i);
	await expect(textarea).toHaveValue(/call-2419/i);
	await expect(textarea).toHaveValue(/meeting-booked/i);
	await expect(page.locator('[data-testid="generate-step-01"]')).toHaveAttribute('data-state', 'ready');
});

test('Generate page · handoff review packet follows the source buyer, not the Acme sample default', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page
		.locator('.tb__actions')
		.getByRole('button', {name: /new run/i})
		.click();
	await page
		.locator('.pop__row')
		.filter({hasText: /^Generate proposal/})
		.click();

	await expect(page.locator('[data-testid="generate-new-run-banner"]')).toContainText(/banyan health/i);
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete: artifact_id=run_banyan_health/i, {timeout: 20_000});
	await expect(page.locator('.toast').first()).toContainText(/banyan health/i);

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /review draft pdf artifact/i})
		.click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toBeVisible();
	await expect(drawer).toContainText(/banyan health proposal draft/i);
	await expect(drawer.locator('[data-testid="generate-artifact-id"]')).toContainText(/run_banyan_health/);
	await expect(drawer.locator('[data-testid="generate-artifact-path-label"]')).toContainText(/sample-backed pdf review artifact/i);
	await expect(drawer).toContainText(/sample-backed banyan health packet/i);
	await expect(drawer).not.toContainText(/sample-backed acme hvac packet/i);
	await expect(drawer).not.toContainText(/demo_mode|demo sequence|demo-generated/i);

	await page.getByRole('button', {name: /close proposal artifact review drawer/i}).click();
	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /^review in proposals$/i})
		.click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
	const detailCard = page.locator('.split--2 > .vstack > .card').first();
	await expect(detailCard.locator('.card__title')).toContainText('PR-2041');
	await expect(detailCard).toContainText(/banyan health/i);

	const ctx = await page.evaluate(() => (globalThis as any).AppContext.get());
	expect(ctx.extra.generated_artifact_id).toBe('run_banyan_health');
});

test('Generate page · existing-proposal handoff opens the generated packet metadata, not the stale proposal packet', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page
		.locator('.tb__actions')
		.getByRole('button', {name: /new run/i})
		.click();
	await page
		.locator('.pop__row')
		.filter({hasText: /^Generate proposal/})
		.click();
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete: artifact_id=run_banyan_health/i, {timeout: 20_000});

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /^review in proposals$/i})
		.click();

	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
	const detailCard = page.locator('.split--2 > .vstack > .card').first();
	await expect(detailCard.locator('.card__title')).toContainText('PR-2041');
	await expect(detailCard).toContainText(/banyan health/i);

	const reviewPanel = page.getByTestId('proposal-review-panel');
	await expect(reviewPanel).toBeVisible();
	await expect(reviewPanel.locator('.workflow-popout__title')).toContainText(/pr-2041 · banyan health/i);
	await expect(page.getByTestId('proposal-review-packet-id')).toContainText('run_banyan_health');
	await expect(reviewPanel).not.toContainText(/review packet id\s+pr-2041/i);
	await expect(reviewPanel.locator('[data-testid="proposal-review-artifact"]').first()).toContainText(/review\/run_banyan_health\/proposal\.pdf/i);
	await expect(reviewPanel.locator('[data-testid="proposal-review-artifact"]').filter({hasText: /source evidence/i})).toContainText(/review\/run_banyan_health\/source-evidence\.json/i);
});

test('Generate page · empty draft actions focus buyer proof instead of acting inert', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	const textarea = page.locator('.generate-brief').first();

	const topDraft = page.locator('.ph__actions').getByRole('button', {name: /^add buyer proof first$/i});
	const lowerDraft = page.locator('.generate-actions').getByRole('button', {name: /^add buyer proof first$/i});
	await expect(topDraft).toBeEnabled();
	await expect(lowerDraft).toBeEnabled();
	await expect(page.getByRole('button', {name: /^generate review draft$/i})).toHaveCount(0);
	await expect(topDraft).toHaveAttribute('aria-controls', 'generate-buyer-brief');
	await expect(lowerDraft).toHaveAttribute('aria-controls', 'generate-buyer-brief');
	await expect(topDraft).toHaveAttribute('aria-describedby', 'generate-brief-required-note');
	await expect(page.locator('#generate-brief-required-note')).toContainText(/buyer proof is required/i);

	await topDraft.click();
	await expect(textarea).toBeFocused();
	await expect(textarea).toHaveAttribute('aria-invalid', 'true');
	await expect(page.locator('#generate-brief-error')).toContainText(/paste buyer context/i);
	await expect(page.locator('.toast', {hasText: /input required/i})).toHaveCount(0);

	await textarea.evaluate(node => {
		(node as HTMLTextAreaElement).blur();
	});
	await lowerDraft.click();
	await expect(textarea).toBeFocused();

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /add buyer proof/i})
		.click();
	await expect(textarea).toBeFocused();

	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await expect(page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i})).toBeEnabled();
	await expect(page.locator('.generate-actions').getByRole('button', {name: /^generate review draft$/i})).toBeEnabled();
	await expect(page.getByRole('button', {name: /^add buyer proof first$/i})).toHaveCount(0);
	await expect(page.locator('#generate-brief-required-note')).toHaveCount(0);
});

test('Generate proposal flow explains the review gate and destination before execution', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await expect(page.getByRole('button', {name: /^use sample brief$/i})).toHaveCount(0);
	await expect(page.getByRole('button', {name: /^use sample buyer proof$/i})).toHaveCount(2);
	await expect(page.getByRole('button', {name: /load hvac sample/i})).toHaveCount(0);
	await expect(page.locator('[data-testid="generate-step-03"]')).toContainText(/Review packet locally/);
	await expect(page.locator('[data-testid="generate-step-03"]')).toContainText(/open Proposals/);
	await expect(page.locator('.generate-review-card .artifact-review__packet')).toContainText(/review packet preview/i);
	await expect(page.locator('.generate-review-card .artifact-review__packet')).not.toContainText(/local artifact previews/i);
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /review packet preview/i})).toBeVisible();
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /review packet preview/i})).toHaveCount(1);
	await expect(page.getByTestId('generate-review-path-action-review-artifact-preview')).toHaveAttribute('aria-label', /path shortcut/i);
	await expect(page.getByTestId('generate-review-path-action-review-artifact-preview')).toHaveAttribute('aria-label', /review sample packet/i);
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /inspect source evidence/i})).toBeVisible();

	await page.locator('.generate-review-card').getByRole('button', {name: /review packet preview/i}).click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toBeVisible();
	await expect(drawer).toBeFocused();
	await expect(drawer).toContainText(/sample hvac review packet preview/i);
	await expect(drawer.locator('[data-testid="generate-artifact-id"]')).toContainText(/sample_acme_hvac/i);
	await expect(drawer.locator('[data-testid="generate-artifact-path-label"]')).toHaveText(/sample pdf review preview/i);
	await expect(drawer.locator('[data-testid="generate-artifact-path"]')).toContainText(/assets\/sample-proposal\.pdf/i);
	await expect(drawer).toContainText(/synthetic sample for checking the review path/i);
	await expect(drawer).not.toContainText(/review artifact path/i);
	await expect(drawer.getByTestId('generate-open-artifact-preview')).toHaveCount(0);
	await expect(drawer.getByRole('link', {name: /open pdf preview|open source preview/i})).toHaveCount(0);
	const artifactPreview = drawer.getByTestId('generate-focus-artifact-preview');
	await expect(artifactPreview).toHaveText(/focus pdf preview/i);
	await expect(drawer.getByTestId('generate-artifact-local-note')).toContainText(/preview stays inside the console drawer/i);
	await artifactPreview.click();
	await expect(drawer.getByTestId('generate-artifact-review-preview')).toBeFocused();
	await expect.poll(
		async () => (await drawer.boundingBox())?.y ?? 9999,
		{timeout: 5000},
	).toBeLessThan(240);
	await drawer.getByRole('button', {name: /close proposal artifact review drawer/i}).click();

	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/artifact/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/packet preview before loading buyer proof/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/review/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/draft gate locked/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/send/i);
	await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/buyer send blocked until approved/i);
	const reviewPathLayout = await page.locator('[data-testid="generate-review-path"]').evaluate(element => {
		const pathBox = element.getBoundingClientRect();
		const stepBoxes = [...element.children].map(child => child.getBoundingClientRect());
		return {
			stepCount: stepBoxes.length,
			fullWidthRows: stepBoxes.every(box => box.width >= pathBox.width * 0.9),
			stackedInSequence: stepBoxes.every((box, index) => index === 0 || box.top > stepBoxes[index - 1].top),
			actionsStayInsideRows: [...element.querySelectorAll('.artifact-review__path-action')].every(button => {
				const buttonBox = button.getBoundingClientRect();
				const rowBox = button.parentElement?.getBoundingClientRect();
				return Boolean(rowBox && buttonBox.left >= rowBox.left && buttonBox.right <= rowBox.right + 1);
			}),
		};
	});
	expect(reviewPathLayout).toEqual({
		stepCount: 3,
		fullWidthRows: true,
		stackedInSequence: true,
		actionsStayInsideRows: true,
	});
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /^review in proposals$/i})).toBeDisabled();
});

test('Generate artifact drawer keeps the review preview visible beside metadata on desktop', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 1440, height: 900});
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /review packet preview/i})
		.click();

	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toBeVisible();
	await expect.poll(
		async () => (await drawer.boundingBox())?.y ?? 9999,
		{timeout: 5000},
	).toBeLessThan(240);
	const layout = await drawer.evaluate(element => {
		const read = (selector: string) => {
			const node = element.querySelector<HTMLElement>(selector);
			if (!node) {
				return null;
			}

			const rect = node.getBoundingClientRect();
			return {
				bottom: rect.bottom,
				height: rect.height,
				left: rect.left,
				right: rect.right,
				top: rect.top,
				width: rect.width,
			};
		};

		return {
			drawer: read('.workflow-popout__pane'),
			meta: read('.artifact-drawer__meta'),
			preview: read('.artifact-drawer__review'),
			iframe: read('.artifact-drawer__review iframe'),
			viewportHeight: window.innerHeight,
		};
	});

	expect(layout.meta, `metadata column should render: ${JSON.stringify(layout)}`).not.toBeNull();
	expect(layout.preview, `preview column should render: ${JSON.stringify(layout)}`).not.toBeNull();
	expect(layout.iframe, `PDF iframe should render inside the review drawer: ${JSON.stringify(layout)}`).not.toBeNull();
	expect(layout.preview!.left, `preview should sit beside metadata, not below it: ${JSON.stringify(layout)}`).toBeGreaterThan(layout.meta!.right);
	expect(layout.preview!.top, `preview should align with the review facts: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.meta!.top + 24);
	expect(layout.iframe!.top, `PDF should be visible in the first viewport: ${JSON.stringify(layout)}`).toBeLessThan(layout.viewportHeight - 220);
	expect(layout.iframe!.height, `PDF review area should be large enough to inspect the artifact: ${JSON.stringify(layout)}`).toBeGreaterThan(420);
});

test('Generate page · sequence trace exposes and advances the full proposal pipeline', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const stageMap = page.getByTestId('generate-runtime-map');
	const stages = page.getByTestId('generate-runtime-stage');
	await expect(stageMap).toBeVisible();
	await expect(stages).toHaveCount(11);
	expect(await stages.evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.stageKey))).toEqual([
		'intake',
		'extract-client',
		'extract-signals',
		'enrichment-context',
		'enrichment-icp',
		'pricing',
		'compliance',
		'scope',
		'pdf',
		'audit',
		'ready',
	]);
	await expect(stages.first()).toHaveAttribute('data-state', 'locked');
	await expect(stageMap).toContainText(/Pricing modeled/);
	await expect(stageMap).toContainText(/Compliance scanned/);
	await expect(stageMap).toContainText(/Audit signed/);

	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await expect(page.locator('.generate-brief').first()).toHaveValue(/HVAC|Acme|CLIENT:/, {timeout: 5000});
	await expect(stages.first()).toHaveAttribute('data-state', 'ready');
	expect(await stages.evaluateAll(nodes => nodes.map(node => node.dataset.state))).toEqual([
		'ready',
		...Array.from({length: 10}, () => 'queued'),
	]);

	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('.console-panel')).toContainText(/audit\.signed/i, {timeout: 20_000});
	await expect(stages.nth(10)).toHaveAttribute('data-state', 'complete', {timeout: 20_000});
	expect(await stages.evaluateAll(nodes => nodes.map(node => node.dataset.state))).toEqual(Array.from({length: 11}, () => 'complete'));
});

test('Generate page · run strip does not claim a buyer until proof is loaded', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const strip = page.getByTestId('generate-run-strip');
	await expect(strip).toBeVisible();
	await expect(page.getByTestId('generate-run-fact-proof')).toContainText(/buyer proof/i);
	await expect(page.getByTestId('generate-run-fact-proof')).toContainText(/missing/i);
	await expect(page.getByTestId('generate-run-fact-buyer')).toContainText(/none loaded/i);
	await expect(page.getByTestId('generate-run-fact-buyer')).not.toContainText(/acme hvac/i);
	await expect(page.getByTestId('generate-run-fact-packet')).toContainText(/sample packet/i);
	await expect(page.getByTestId('generate-run-fact-send')).toContainText(/blocked/i);

	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await expect(page.getByTestId('generate-run-fact-proof')).toContainText(/loaded/i);
	const readyBorder = await page.getByTestId('generate-run-fact-proof').evaluate(node => {
		const probe = document.createElement('span');
		probe.style.borderLeft = '1px solid var(--healthy-fg)';
		document.body.append(probe);
		const expected = getComputedStyle(probe).borderLeftColor;
		probe.remove();
		return {
			actual: getComputedStyle(node as HTMLElement).borderLeftColor,
			expected,
		};
	});
	expect(readyBorder.actual, 'loaded buyer proof should use the real healthy token, not an undefined CSS fallback').toBe(readyBorder.expected);
	await expect(page.getByTestId('generate-run-fact-buyer')).toContainText(/acme hvac/i);
	await expect(page.getByTestId('generate-run-fact-packet')).toContainText(/run_acme_hvac/i);
	await expect(page.getByTestId('generate-run-fact-send')).toContainText(/requires proposals approval/i);
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /review pdf preview/i})).toBeVisible();
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /inspect source evidence preview/i})).toBeVisible();
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /review packet preview/i})).toHaveCount(0);
});

test('Generate page · pre-run previews are review packets, not generated drafts or shape fixtures', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();

	const reviewCard = page.locator('.generate-review-card');
	const artifactStep = page.getByTestId('generate-review-path-step-artifact');
	await expect(artifactStep).toContainText(/review packet preview only/i);
	await expect(page.getByTestId('generate-review-path-action-review-artifact-preview')).toHaveText(/inspect packet preview/i);
	await expect(reviewCard.locator('.artifact-review__packet')).toContainText(/review the packet preview only/i);
	await expect(reviewCard.locator('.artifact-review__packet')).toContainText(/bind buyer proof, audit trace, and source evidence/i);
	await expect(reviewCard.locator('.artifact-review__packet')).not.toContainText(/routing the draft into proposals/i);
	await expect(reviewCard.getByRole('button', {name: /review pdf preview/i})).toBeVisible();
	await expect(reviewCard.getByRole('button', {name: /inspect source evidence preview/i})).toBeVisible();
	await expect(reviewCard).not.toContainText(/artifact shape|packet-shape|shape preview/i);

	await reviewCard.getByRole('button', {name: /inspect source evidence preview/i}).click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toContainText(/source evidence review preview/i);
	await expect(drawer).toContainText(/review preview only/i);
	await expect(drawer).not.toContainText(/artifact shape|packet-shape|shape preview/i);
	await reviewCard.getByRole('button', {name: /inspect source evidence preview/i}).click();

	await page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i}).click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete: artifact_id=run_acme_hvac/i, {timeout: 20_000});
	await expect(artifactStep).toContainText(/run_acme_hvac review artifact available locally/i);
	await expect(page.getByTestId('generate-review-path-action-review-artifact-draft')).toHaveText(/review draft pdf/i);
	await expect(reviewCard.locator('.artifact-review__packet')).toContainText(/generated pdf and source evidence/i);
	await expect(reviewCard.locator('.artifact-review__packet')).toContainText(/routing the draft into proposals/i);
});

test('Generate artifact drawer primary action advances the review sequence', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /review packet preview/i})
		.click();
	let drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toBeVisible();
	await expect(drawer.getByTestId('generate-artifact-primary-action')).toHaveText(/use sample buyer proof/i);
	await drawer.getByTestId('generate-artifact-primary-action').click();

	await expect(page.locator('#generate-buyer-brief')).toHaveValue(/HVAC|Acme|CLIENT:/, {timeout: 5000});
	await expect(drawer).toHaveCount(0);
	await expect(page.getByTestId('generate-run-fact-buyer')).toContainText(/acme hvac/i);
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /review pdf preview/i})).toBeVisible();

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /review pdf preview/i})
		.click();
	drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer.getByTestId('generate-artifact-primary-action')).toHaveText(/generate review draft/i);
	await drawer.getByTestId('generate-artifact-primary-action').click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete: artifact_id=run_acme_hvac/i, {timeout: 20_000});

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /review draft pdf artifact/i})
		.click();
	drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer.getByTestId('generate-artifact-primary-action')).toHaveText(/^continue review$/i);
	await expect(drawer.getByTestId('generate-artifact-local-note')).toContainText(/proposals review is now unlocked/i);
	await drawer.getByTestId('generate-artifact-primary-action').click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
	await expect(page.locator('.proposal-detail-stack')).toContainText(/acme hvac/i);
});

test('Generate page · demo trace names the active buyer handoff instead of the canned sample', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page
		.locator('.tb__actions')
		.getByRole('button', {name: /new run/i})
		.click();
	await page
		.locator('.pop__row')
		.filter({hasText: /^Generate proposal/})
		.click();
	await expect(page.locator('[data-testid="generate-new-run-banner"]')).toContainText(/banyan health/i);

	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	const panel = page.locator('.console-panel');
	await expect(panel).toContainText(/extract\.client: banyan health/i, {timeout: 20_000});
	await expect(panel).toContainText(/call-2419/i);
	await expect(panel).not.toContainText(/extract\.client: acme hvac services/i);

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /inspect draft source evidence/i})
		.click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toContainText(/banyan health source evidence bundle/i);
	await expect(drawer).toContainText(/banyan health review metadata/i);
	await expect(drawer).not.toContainText(/bundled acme fixture/i);
	const sourceJson = drawer.locator('[data-testid="generate-artifact-source-json"]');
	await expect(sourceJson).toContainText(/"buyer": "banyan health"/i);
	await expect(sourceJson).toContainText(/call-2419/i);
	await expect(sourceJson).toContainText(/handoff_review_source/i);
	await expect(sourceJson).not.toContainText(/acme hvac/i);
});

test('Generate page · explicit CLIENT line overrides a stale proposal handoff', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page
		.locator('.tb__actions')
		.getByRole('button', {name: /new run/i})
		.click();
	await page
		.locator('.pop__row')
		.filter({hasText: /^Generate proposal/})
		.click();
	await expect(page.locator('[data-testid="generate-new-run-banner"]')).toContainText(/banyan health/i);

	await page.locator('.generate-brief').first().fill([
		'CLIENT: Harbor Property Services',
		'',
		'CONTEXT: Property-services operator replacing a missed-call intake workflow.',
		'BUDGET SIGNAL: COO approved a 90-day pilot if the review packet shows payback.',
		'COMPLIANCE: Standard call-recording disclosure required.',
	].join('\n'));

	await expect(page.locator('[data-testid="generate-new-run-banner"]')).toHaveCount(0);
	await expect(page.getByTestId('generate-run-fact-buyer')).toContainText(/harbor property services/i);
	await expect(page.getByTestId('generate-run-fact-buyer')).not.toContainText(/banyan health/i);
	await expect(page.getByTestId('generate-run-fact-packet')).toContainText(/run_harbor_property_services/i);

	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	const panel = page.locator('.console-panel');
	await expect(panel).toContainText(/extract\.client: harbor property services/i, {timeout: 20_000});
	await expect(panel).toContainText(/pipeline\.complete: artifact_id=run_harbor_property_services/i, {timeout: 20_000});
	await expect(panel).not.toContainText(/extract\.client: banyan health/i);

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /inspect draft source evidence/i})
		.click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toContainText(/harbor property services source evidence bundle/i);
	await expect(drawer.locator('[data-testid="generate-artifact-id"]')).toContainText(/run_harbor_property_services/i);
	const sourceJson = drawer.locator('[data-testid="generate-artifact-source-json"]');
	await expect(sourceJson).toContainText(/"review_subject": "harbor property services"/i);
	await expect(sourceJson).not.toContainText(/handoff_review_source/i);
	await expect(sourceJson).not.toContainText(/call-2419/i);
	await expect(sourceJson).not.toContainText(/banyan health/i);
});

test('Generate page · clearing a handoff brief clears stale buyer-specific artifacts', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page
		.locator('.tb__actions')
		.getByRole('button', {name: /new run/i})
		.click();
	await page
		.locator('.pop__row')
		.filter({hasText: /^Generate proposal/})
		.click();
	await expect(page.locator('[data-testid="generate-new-run-banner"]')).toContainText(/banyan health/i);

	await page.locator('.generate-brief').first().fill('');

	await expect(page.locator('[data-testid="generate-new-run-banner"]')).toHaveCount(0);
	await expect(page.getByTestId('generate-run-fact-buyer')).toContainText(/none loaded/i);
	await expect(page.getByTestId('generate-run-fact-packet')).toContainText(/sample packet/i);
	const reviewCard = page.locator('.generate-review-card');
	await expect(reviewCard.locator('.artifact-review__packet')).toContainText(/review packet preview/i);
	await expect(reviewCard.locator('.artifact-review__packet')).not.toContainText(/banyan health/i);

	await reviewCard.getByRole('button', {name: /review packet preview/i}).click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer.locator('[data-testid="generate-artifact-id"]')).toContainText(/sample_acme_hvac/i);
	await expect(drawer).not.toContainText(/run_banyan_health/i);
});

test('Generate page · sequence rail reflects the real review gate state', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const sequence = page.locator('[data-testid="generate-sequence"]');
	await expect(sequence).toBeVisible();
	await expect(page.locator('[data-testid="generate-step-01"]')).toHaveAttribute('data-state', 'missing');
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'waiting');
	await expect(page.locator('[data-testid="generate-step-03"]')).toHaveAttribute('data-state', 'locked');

	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await expect(page.locator('[data-testid="generate-step-01"]')).toHaveAttribute('data-state', 'ready');
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'ready');
	await expect(page.locator('[data-testid="generate-step-02"]')).toContainText(/ready to extract/i);

	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'running');
	await expect(page.locator('[data-testid="generate-step-03"]')).toHaveAttribute('data-state', 'locked');
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete/i, {timeout: 20_000});
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'complete');
	await expect(page.locator('[data-testid="generate-step-03"]')).toHaveAttribute('data-state', 'ready');
});

test('Generate page · buyer-proof sequence step focuses the real editor', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const firstStep = page.getByTestId('generate-step-01');
	const textarea = page.locator('#generate-buyer-brief');
	const addProof = firstStep.getByRole('button', {name: /^add proof$/i});
	await expect(addProof).toBeVisible();
	await expect(addProof).toHaveAttribute('aria-controls', 'generate-buyer-brief');
	await expect(addProof).toHaveAttribute('aria-describedby', 'generate-brief-required-note');

	await addProof.click();
	await expect(textarea).toBeFocused();
	await expect(textarea).toHaveAttribute('aria-invalid', 'true');
	await expect(page.locator('#generate-brief-error')).toContainText(/paste buyer context or load the hvac sample/i);
	await expect(page.locator('.toast', {hasText: /input required/i})).toHaveCount(0);

	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await expect(firstStep).toHaveAttribute('data-state', 'ready');
	const editProof = firstStep.getByRole('button', {name: /^edit proof$/i});
	await expect(editProof).toBeVisible();
	await expect(editProof).not.toHaveAttribute('aria-describedby', 'generate-brief-required-note');

	await editProof.click();
	await expect(textarea).toBeFocused();
	await expect(textarea).toHaveAttribute('aria-invalid', 'false');
});

test('Generate page · DEMO_MODE replay unlocks review even if POST never resolves', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();

	await page.evaluate(() => {
		const orig = globalThis.fetch.bind(globalThis);
		globalThis.fetch = async function (input: any, init: any) {
			const url = typeof input === 'string' ? input : input?.url || '';
			const method = (init?.method || input?.method || 'GET').toUpperCase();
			if (url.includes('/api/generate') && method === 'POST') {
				return new Promise(() => {});
			}

			return orig(input, init);
		} as any;
	});

	await page
		.locator('.generate-actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'running');
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete/i, {timeout: 20_000});
	await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'complete');
	await expect(page.locator('[data-testid="generate-step-03"]')).toHaveAttribute('data-state', 'ready');
	await expect(page.getByRole('button', {name: /^review in proposals$/i})).toBeEnabled();
});

test('Generate page · sequence init dispatches the pipeline', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await page.waitForTimeout(200);
	// The demo-mode fetch shim short-circuits /api POSTs, so we patch fetch
	// AFTER the page loads (re-wrapping the shim itself) to capture the call.
	await page.evaluate(() => {
		// @ts-expect-error window-injected
		globalThis.__seenApiGenerate = [];
		const orig = globalThis.fetch.bind(globalThis);
		globalThis.fetch = async function (input: any, init: any) {
			const url = typeof input === 'string' ? input : input?.url || '';
			const method = (init?.method || input?.method || 'GET').toUpperCase();
			if (url.includes('/api/generate') && method === 'POST') {
				// @ts-expect-error window-injected
				globalThis.__seenApiGenerate.push(url);
			}

			return orig(input, init);
		} as any;
	});
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.toast').first()).toContainText(/sequence initializing/i);
	const seen = await page.evaluate(() => (globalThis as any).__seenApiGenerate || []);
	expect(seen.length, 'POST /api/generate should fire from handleGenerate').toBeGreaterThan(0);
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.start/i);
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
		return headerBox.left >= panelBox.left - slack && headerBox.right <= panelBox.right + slack && controlsBox.left >= panelBox.left - slack && controlsBox.right <= panelBox.right + slack;
	});
	expect(headerFits, 'trace header controls should wrap instead of clipping at the card edge').toBe(true);
});

test('Generate page · lower draft controls stay reachable on a laptop viewport', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const editor = page.locator('.generate-brief').first();
	const actions = page.locator('.generate-actions').first();
	const lowerGenerate = actions.getByRole('button', {name: /^add buyer proof first$/i});

	await expect(editor).toBeVisible();
	await expect(lowerGenerate).toBeVisible();
	await expect(lowerGenerate).toBeEnabled();

	const [editorBox, actionsBox] = await Promise.all([editor.boundingBox(), actions.boundingBox()]);
	expect(editorBox, 'buyer brief editor should render').not.toBeNull();
	expect(actionsBox, 'lower generate action row should render').not.toBeNull();

	expect(editorBox!.height, 'brief editor should not consume the whole first viewport').toBeLessThanOrEqual(270);
	expect(actionsBox!.y + actionsBox!.height, 'lower draft controls should be reachable without scrolling at 1280x720').toBeLessThan(720);
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

test('Generate page · review packet is visible and opens sample artifact drawers', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCard = page.locator('.generate-review-card');
	await expect(reviewCard).toBeVisible();
	await expect(reviewCard).toContainText(/review packet/i);
	await expect(reviewCard).toContainText(/review packet preview is available for path inspection/i);
	await expect(reviewCard).toContainText(/load buyer proof to unlock a buyer-specific draft/i);
	await expect(reviewCard).not.toContainText(/run the sequence to unlock the proposal review gate/i);

	const reviewBox = await reviewCard.boundingBox();
	expect(reviewBox, 'artifact review card should have a rendered box').not.toBeNull();
	expect(reviewBox!.y, 'artifact review should not be buried below the first viewport').toBeLessThan(620);

	await reviewCard.getByRole('button', {name: /review packet preview/i}).click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toBeVisible();
	await expect.poll(async () => (await drawer.boundingBox())?.y ?? 9999, {timeout: 5000}).toBeLessThan(160);
	await expect(drawer).toContainText(/sample hvac review packet preview/i);
	await expect(drawer.locator('.workflow-popout__title')).not.toContainText(/proposal draft/i);
	await expect(drawer.locator('iframe[title="Sample proposal PDF review preview"]')).toBeVisible();
	await expect(drawer).toContainText(/review packet id/i);
	await expect(drawer.locator('[data-testid="generate-artifact-id"]')).toContainText(/sample_acme_hvac/);
	await expect(drawer.locator('[data-testid="generate-artifact-mode"]')).toContainText(/local sample replay/i);
	await expect(drawer).not.toContainText(/demo_mode|demo sequence|demo-generated/i);
	await expect(drawer.locator('[data-testid="generate-artifact-review-path"]')).toContainText(/artifact/i);
	await expect(drawer.getByTestId('generate-artifact-drawer-step-artifact')).toContainText(/packet preview before loading buyer proof/i);
	await expect(drawer.locator('[data-testid="generate-artifact-review-path"]')).toContainText(/review/i);
	await expect(drawer.getByTestId('generate-artifact-drawer-step-review')).toContainText(/draft gate locked/i);
	await expect(drawer.locator('[data-testid="generate-artifact-review-path"]')).toContainText(/send/i);
	await expect(drawer.getByTestId('generate-artifact-drawer-step-send')).toContainText(/buyer send blocked until approved/i);
	await expect(drawer).toContainText(/sample review packet for inspecting the approval path/i);
	await expect(drawer).not.toContainText(/fixture-backed/i);
	await expect(drawer).toContainText(/sequence_required/i);
	await expect(drawer).toContainText(/review source/i);
	await expect(drawer).not.toContainText(/local source path/i);
	await expect(drawer.locator('.artifact-drawer__path')).toContainText(/sample-proposal\.pdf/);
	expect((await drawer.locator('.artifact-drawer__path').innerText()).trim()).toBe('assets/sample-proposal.pdf');
	await expect(drawer.getByRole('link', {name: /open raw artifact/i})).toHaveCount(0);
	await expect(drawer.getByRole('button', {name: /copy review packet id/i})).toBeVisible();
	await expect(reviewCard.getByRole('button', {name: /review packet preview/i})).toHaveAttribute('aria-controls', 'generate-artifact-drawer');
	await expect(reviewCard.getByRole('button', {name: /review packet preview/i})).toHaveAttribute('aria-expanded', 'true');
	await expect(reviewCard.getByRole('button', {name: /inspect source evidence/i})).toHaveAttribute('aria-expanded', 'false');

	await reviewCard.getByRole('button', {name: /source/i}).click();
	await expect(drawer).toContainText(/sample hvac source packet preview/i);
	await expect(drawer).toContainText(/sample source packet for inspecting the review evidence path/i);
	await expect(drawer).toHaveAttribute('id', 'generate-artifact-drawer');
	await expect(reviewCard.getByRole('button', {name: /review packet preview/i})).toHaveAttribute('aria-expanded', 'false');
	await expect(reviewCard.getByRole('button', {name: /inspect source evidence/i})).toHaveAttribute('aria-expanded', 'true');
	const sourceJson = drawer.locator('[data-testid="generate-artifact-source-json"]');
	await expect(sourceJson).toContainText(/blocked_until_operator_review/i);
	await expect(sourceJson).toContainText(/quality_gate/i);
	await expect(sourceJson).toContainText(/pricing_math/i);
	await expect(sourceJson).toContainText(/risk_report/i);
	await expect(sourceJson).toContainText(/pdf_polish/i);
	await expect(sourceJson).toContainText(/needs_review/i);
	await expect(sourceJson).toContainText(/sample_review_source/i);
	await expect(sourceJson).toContainText(/prop_demo_001/i);
	await expect(sourceJson).toContainText(/acme hvac — voice agent pilot proposal/i);
	await expect(sourceJson).not.toContainText(/"_demo_note"/i);
	await expect(sourceJson).not.toContainText(/"client": "acme hvac services"/i);

	await reviewCard.getByRole('button', {name: /inspect source evidence/i}).click();
	await expect(drawer).toHaveCount(0);
	await expect(reviewCard.getByRole('button', {name: /review packet preview/i})).toHaveAttribute('aria-expanded', 'false');
	await expect(reviewCard.getByRole('button', {name: /inspect source evidence/i})).toHaveAttribute('aria-expanded', 'false');
});

test('Generate page · artifact metadata keeps review gate token intact at tablet width', async ({page, openConsole}) => {
	await page.setViewportSize({width: 900, height: 768});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /review packet preview/i})
		.click();

	const drawer = page.getByRole('region', {name: 'Proposal artifact review drawer'});
	const gate = drawer.getByTestId('generate-artifact-gate');
	await expect(gate).toHaveText('sequence_required');

	const gateLayout = await gate.evaluate(node => {
		const range = document.createRange();
		range.selectNodeContents(node);
		const lineRects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
		range.detach();
		return {
			lineCount: lineRects.length,
			factWidth: node.parentElement?.getBoundingClientRect().width ?? 0,
		};
	});
	expect(gateLayout.lineCount).toBe(1);
	expect(gateLayout.factWidth).toBeGreaterThanOrEqual(168);
});

test('Generate page · artifact query opens the local artifact inside the console', async ({page}) => {
	await page.addInitScript(() => {
		(globalThis as any).DEMO_MODE = true;
	});
	await page.goto('/console/?route=generate&artifact=pdf', {waitUntil: 'domcontentloaded'});
	await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

	await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
	await expect(page).toHaveURL(/\/console\/\?route=generate$/);

	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toBeVisible();
	await expect(drawer).toContainText(/sample hvac review packet preview/i);
	await expect(drawer.locator('.workflow-popout__title')).not.toContainText(/proposal draft/i);
	await expect(drawer).toContainText(/sample review artifact/i);
	await expect(drawer).toContainText(/sequence_required/i);
	await expect(drawer.locator('iframe[title="Sample proposal PDF review preview"]')).toBeVisible();
	await expect(drawer.getByRole('link', {name: /open raw artifact/i})).toHaveCount(0);
});

test('Generate page · artifact drawer suppresses the floating coach escape hatch while review is active', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const coach = page.locator('.coach-launcher');
	await expect(coach).toBeVisible();

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /review packet preview/i})
		.click();

	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toBeVisible();
	await expect(coach, 'artifact review should own the workbench while the drawer is open').toBeHidden();

	await drawer.getByRole('button', {name: /close proposal artifact review drawer/i}).click();
	await expect(drawer).toHaveCount(0);
	await expect(coach, 'global coach escape hatch returns after artifact review closes').toBeVisible();
});

test('Generate page · pasted proof without a CLIENT line gets its own review packet id', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page
		.locator('.generate-brief')
		.first()
		.fill('GOAL: Generate a review packet from pasted buyer proof.\n\nBUDGET SIGNAL: Owner approved a one-quarter pilot.\n\nCOMPLIANCE: Standard call recording disclosure required.');

	await expect(page.getByTestId('generate-run-fact-buyer')).toContainText(/pasted buyer proof/i);
	await expect(page.getByTestId('generate-run-fact-packet')).toContainText(/run_pasted_buyer_proof/i);
	await expect(page.getByTestId('generate-run-fact-packet')).not.toContainText(/run_acme_hvac/i);

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /inspect source evidence preview/i})
		.click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer).toContainText(/pasted buyer proof source artifact preview/i);
	await expect(drawer.locator('[data-testid="generate-artifact-id"]')).toContainText(/run_pasted_buyer_proof/i);
	await expect(drawer).not.toContainText(/sample_acme_hvac/i);
});

test('Generate page · Review in Proposals creates a local draft for unmatched pasted proof', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page
		.locator('.generate-brief')
		.first()
		.fill('GOAL: Generate a review packet from pasted buyer proof.\n\nBUDGET SIGNAL: Owner approved a one-quarter pilot.\n\nCOMPLIANCE: Standard call recording disclosure required.');

	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});

	await page
		.locator('.generate-review-card .card__hd')
		.getByRole('button', {name: /^review in proposals$/i})
		.click();

	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
	const detail = page.locator('.card:has(.card__title:has-text("detail · GEN-pasted-buyer-proof"))').first();
	await expect(detail).toBeVisible();
	await expect(detail).toContainText('Pasted buyer proof');
	await expect(detail).not.toContainText(/banyan health|acme hvac/i);
	await expect(detail.locator('.proposal-detail-summary__value')).toHaveText(/pricing pending/i);
	await expect(detail).not.toContainText(/\btbd\b/i);

	await detail.getByRole('button', {name: /review packet/i}).click();
	const workflow = page.getByRole('region', {name: /proposal workflow panel/i});
	await expect(workflow).toContainText(/pasted buyer proof proposal packet/i);
	await expect(page.getByTestId('proposal-review-packet-id')).toContainText('run_pasted_buyer_proof');
	await expect(page.getByTestId('proposal-review-gate')).toContainText('operator_review');
});

test('Generate page · sample draft review lands on the generated packet, not an existing proposal row', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete: artifact_id=run_acme_hvac/i, {timeout: 20_000});

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /^review in proposals$/i})
		.click();

	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
	const detail = page.locator('.card:has(.card__title:has-text("detail · GEN-acme-hvac"))').first();
	await expect(detail).toBeVisible();
	await expect(detail).toContainText(/acme hvac/i);
	await expect(detail).toContainText(/local draft/i);
	await expect(detail.locator('.proposal-detail-summary__value')).toHaveText('$18.5K');
	await expect(detail).not.toContainText(/\btbd\b|pricing pending/i);
	await expect(detail).not.toContainText(/banyan health/i);
	await expect(detail.locator('[data-testid="proposal-resend-open"]')).toHaveAttribute('data-send-gate', 'operator-review');
	await expect(detail.locator('[data-testid="proposal-resend-open"]')).toHaveAttribute('data-pending-sections', '5');
	await expect(detail.locator('[data-testid="proposal-resend-open"]')).toContainText(/send held.*review/i);
	await expect(detail.locator('[data-testid="proposal-send-gate-note"]')).toContainText(/operator review accepts every proposal section/i);

	await detail.locator('[data-testid="proposal-resend-open"]').click();
	const sendHold = page.getByTestId('proposal-send-hold');
	await expect(sendHold).toBeVisible();
	await expect(sendHold).toContainText(/buyer send held/i);
	await expect(sendHold).toContainText(/not buyer-sendable yet/i);
	await expect(sendHold.getByTestId('proposal-send-hold-review')).toContainText(/5 sections awaiting operator acceptance/i);
	await expect(page.getByTestId('proposal-resend-form')).toHaveCount(0);
	await page.getByRole('button', {name: /close proposal workflow panel/i}).click();

	await detail.getByRole('button', {name: /review packet/i}).click();
	const workflow = page.getByRole('region', {name: /proposal workflow panel/i});
	await expect(workflow).toContainText(/acme hvac proposal packet/i);
	await expect(page.getByTestId('proposal-review-packet-id')).toContainText('run_acme_hvac');
	await expect(page.getByTestId('proposal-review-gate')).toContainText('operator_review');
});

test('Proposals page · review-held generated draft can accept sections and unlock the resend form', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete: artifact_id=run_acme_hvac/i, {timeout: 20_000});

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /^review in proposals$/i})
		.click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');

	const detail = page.locator('.card:has(.card__title:has-text("detail · GEN-acme-hvac"))').first();
	await expect(detail.locator('[data-testid="proposal-resend-open"]')).toHaveAttribute('data-send-gate', 'operator-review');
	await detail.locator('[data-testid="proposal-resend-open"]').click();

	const sendHold = page.getByTestId('proposal-send-hold');
	await expect(sendHold).toBeVisible();
	await expect(sendHold.getByTestId('proposal-send-hold-review')).toContainText(/sections awaiting operator acceptance/i);
	await sendHold.getByTestId('proposal-send-hold-accept-sections').click();

	const workflow = page.getByRole('region', {name: /proposal workflow panel/i});
	await expect(page.getByTestId('proposal-resend-form')).toBeVisible();
	await expect(workflow).toContainText(/re-send gen-acme-hvac/i);
	await expect(detail.locator('[data-testid="proposal-resend-open"]')).toHaveAttribute('data-send-gate', 'ready');
	await expect(detail.locator('[data-testid="proposal-resend-open"]')).toContainText(/^re-send$/i);
	await expect(detail.locator('[data-testid="proposal-send-gate-note"]')).toHaveCount(0);
	await expect(page.locator('.toast', {hasText: /sections accepted locally/i})).toBeVisible();
});

test('Generate page · Review in Proposals opens the generated packet as the primary handoff', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 1440, height: 900});
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete: artifact_id=run_acme_hvac/i, {timeout: 20_000});

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /^review in proposals$/i})
		.click();

	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
	await expect(page.locator('.page--proposals .split--2')).toHaveClass(/proposals-review-handoff/);
	const reviewPanel = page.getByTestId('proposal-review-panel');
	await expect(reviewPanel).toBeVisible();
	await expect(reviewPanel.locator('.workflow-popout__title')).toContainText(/gen-acme-hvac · acme hvac/i);
	await expect(page.getByTestId('proposal-review-packet-id')).toContainText('run_acme_hvac');
	await expect(reviewPanel.locator('iframe[title="Acme HVAC sample PDF review preview"]')).toHaveAttribute('src', '../assets/sample-proposal.pdf');
	await expect(reviewPanel.locator('[data-testid="proposal-review-artifact"]').filter({hasText: /source evidence/i})).toContainText(/review sample evidence/i);

	const geometry = await page.evaluate(() => {
		const detail = document.querySelector<HTMLElement>('.page--proposals .proposal-detail-stack');
		const list = document.querySelector<HTMLElement>('.page--proposals .proposals-list-card');
		const panel = document.querySelector<HTMLElement>('[data-testid="proposal-review-panel"]');
		const main = document.querySelector<HTMLElement>('main.scroll');
		const rect = (element: HTMLElement | null | undefined) => {
			const box = element?.getBoundingClientRect();
			return box
				? {
					left: Math.round(box.left),
					top: Math.round(box.top),
				}
				: null;
		};

		return {
			detail: rect(detail),
			list: rect(list),
			panel: rect(panel),
			scrollTop: main?.scrollTop ?? 0,
		};
	});

	expect(geometry.detail, `Generated review detail should render: ${JSON.stringify(geometry)}`).not.toBeNull();
	expect(geometry.list, `Generated review list should render: ${JSON.stringify(geometry)}`).not.toBeNull();
	expect(geometry.panel, `Generated review panel should render: ${JSON.stringify(geometry)}`).not.toBeNull();
	expect(geometry.detail!.left, `Generated review handoff should put detail before the proposal list: ${JSON.stringify(geometry)}`).toBeLessThan(geometry.list!.left);
	expect(geometry.detail!.top, `Generated review handoff should preserve proposal context above the viewer: ${JSON.stringify(geometry)}`).toBeGreaterThan(0);
	expect(geometry.list!.top, `Generated review handoff should not scroll the proposal list out of context: ${JSON.stringify(geometry)}`).toBeGreaterThan(0);
	expect(geometry.panel!.top, `Generated review panel should be in the first viewport without hunting below the list: ${JSON.stringify(geometry)}`).toBeLessThan(620);
	expect(geometry.scrollTop, `Opening the generated handoff should not dump the operator into the middle of the list: ${JSON.stringify(geometry)}`).toBeLessThan(360);
});

test('Generate page · generated artifact drawer separates run artifact identity from demo preview backing files', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete: artifact_id=run_acme_hvac/i, {timeout: 20_000});

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /review draft pdf artifact/i})
		.click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer.locator('[data-testid="generate-artifact-path-label"]')).toHaveText(/demo pdf review artifact/i);
	await expect(drawer.locator('[data-testid="generate-artifact-path"]')).toHaveText('review/run_acme_hvac/proposal.pdf');
	await expect(drawer.getByTestId('generate-open-artifact-preview')).toHaveCount(0);
	await expect(drawer.getByTestId('generate-focus-artifact-preview')).toHaveText(/focus pdf preview/i);
	await expect(drawer.locator('iframe[title="Generated proposal PDF review preview"]')).toHaveAttribute('src', '../assets/sample-proposal.pdf');
	await expect(drawer).toContainText(/run-specific artifact identity is bound here/i);
	await expect(drawer).not.toContainText(/assets\/sample-proposal\.pdf.*review source/i);

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /inspect draft source evidence/i})
		.click();
	await expect(drawer.locator('[data-testid="generate-artifact-path-label"]')).toHaveText(/demo source evidence artifact/i);
	await expect(drawer.locator('[data-testid="generate-artifact-path"]')).toHaveText('review/run_acme_hvac/source-evidence.json');
	await expect(drawer.getByTestId('generate-focus-artifact-preview')).toHaveText(/focus source evidence preview/i);
	await expect(drawer.getByRole('link', {name: /open pdf preview|open source preview/i})).toHaveCount(0);
	const sourceJson = drawer.locator('[data-testid="generate-artifact-source-json"]');
	await expect(sourceJson).toContainText(/"source_path": "review\/run_acme_hvac\/source-evidence\.json"/i);
	await expect(sourceJson).toContainText(/"preview_path": "\.\.\/fixtures\/transcripts\/sample-proposal\.json"/i);
});

test('Generate page · review path is visible but muted until the draft is ready', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1440, height: 900});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCard = page.locator('.generate-review-card');
	const reviewHeader = reviewCard.locator('.card__hd');
	const previewButton = reviewCard.getByRole('button', {name: /review packet preview/i});
	const sourceButton = reviewCard.getByRole('button', {name: /source/i});
	const reviewButton = reviewHeader.getByRole('button', {name: /^review in proposals$/i});
	await expect(reviewButton).toBeDisabled();

	const [previewBox, sourceBox, reviewBox] = await Promise.all([previewButton.boundingBox(), sourceButton.boundingBox(), reviewButton.boundingBox()]);
	expect(previewBox, 'PDF preview button should render').not.toBeNull();
	expect(sourceBox, 'source inspection button should render').not.toBeNull();
	expect(reviewBox, 'proposal review button should render').not.toBeNull();
	expect(Math.abs(previewBox!.y - sourceBox!.y), 'artifact inspection buttons should share a compact desktop row').toBeLessThan(2);
	expect(reviewBox!.y + reviewBox!.height, 'proposal review path should sit in the card header above artifact inspection actions').toBeLessThan(previewBox!.y);
	expect(reviewBox!.y + reviewBox!.height, 'disabled review CTA should not be clipped at the viewport edge').toBeLessThan(900);

	const coachBox = await page.locator('.coach-launcher').boundingBox();
	expect(coachBox, 'global coach launcher should render').not.toBeNull();
	const overlapsCoach
		= reviewBox!.x < coachBox!.x + coachBox!.width && reviewBox!.x + reviewBox!.width > coachBox!.x && reviewBox!.y < coachBox!.y + coachBox!.height && reviewBox!.y + reviewBox!.height > coachBox!.y;
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
	const title = reviewCard.locator('.card__title');
	const reviewButton = reviewCard.getByRole('button', {name: /^review in proposals$/i});
	const packet = reviewCard.locator('.artifact-review__packet');
	const coach = page.locator('.coach-launcher');

	const [titleBox, reviewBox, cardBox, packetBox, coachBox] = await Promise.all([title.boundingBox(), reviewButton.boundingBox(), reviewCard.boundingBox(), packet.boundingBox(), coach.boundingBox()]);
	expect(titleBox, 'artifact review title should render').not.toBeNull();
	expect(reviewBox, 'proposal review CTA should render').not.toBeNull();
	expect(cardBox, 'artifact review card should render').not.toBeNull();
	expect(packetBox, 'review packet should render').not.toBeNull();
	expect(coachBox, 'global coach launcher should render').not.toBeNull();

	expect(cardBox!.width, 'artifact review card should not be the leftover narrow column').toBeGreaterThanOrEqual(320);
	expect(titleBox!.height, 'artifact review title should stay on one line at desktop width').toBeLessThan(24);
	expect(reviewBox!.x + reviewBox!.width, 'review CTA should stay inside the card header').toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);

	const actionBoxes = await reviewCard.evaluate(card =>
		[...card.querySelectorAll('.artifact-review__links .btn, .artifact-review__path-action')].map(button => {
			const buttonElement = button as HTMLElement;
			const rect = buttonElement.getBoundingClientRect();
			return {
				text: buttonElement.innerText,
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
			};
		}));
	for (const box of actionBoxes) {
		const overlapsCoach = box.left < coachBox!.x + coachBox!.width && box.right > coachBox!.x && box.top < coachBox!.y + coachBox!.height && box.bottom > coachBox!.y;
		expect(overlapsCoach, `global coach launcher must not cover "${box.text}"`).toBe(false);
	}

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
	await expect(reviewCard.getByRole('button', {name: /review packet preview/i})).toBeVisible();
	await expect(reviewCard.getByRole('button', {name: /inspect source evidence/i})).toBeVisible();
	await expect(reviewPath).toContainText(/packet preview before loading buyer proof/i);

	const [reviewPathBox, linksBox, qualityBox] = await Promise.all([reviewPath.boundingBox(), links.boundingBox(), quality.boundingBox()]);
	const pathRows = await reviewPath.evaluate(path => {
		const pathBox = path.getBoundingClientRect();
		return ([...path.querySelectorAll('[data-testid^="generate-review-path-step-"]')] as HTMLElement[]).map(row => {
			const rowBox = row.getBoundingClientRect();
			const action = row.querySelector('.artifact-review__path-action');
			const actionBox = action?.getBoundingClientRect();
			return {
				width: rowBox.width,
				pathWidth: pathBox.width,
				left: rowBox.left,
				pathLeft: pathBox.left,
				actionLeft: actionBox?.left ?? null,
				actionRight: actionBox?.right ?? null,
				textRight: row.querySelector('div')?.getBoundingClientRect().right ?? rowBox.right,
			};
		});
	});
	expect(reviewPathBox, 'proposal review path should render').not.toBeNull();
	expect(linksBox, 'artifact inspection row should render').not.toBeNull();
	expect(qualityBox, 'artifact quality checklist should render').not.toBeNull();
	expect(pathRows).toHaveLength(3);
	for (const row of pathRows) {
		expect(row.width, 'review path steps should read as full-width rows, not cramped tiles').toBeGreaterThan(reviewPathBox!.width * 0.9);
		expect(Math.abs(row.left - row.pathLeft), 'review path rows should align to the rail edge').toBeLessThanOrEqual(1);
		if (row.actionLeft != null && row.actionRight != null) {
			expect(row.actionLeft, 'review path action should sit after the explanatory copy').toBeGreaterThanOrEqual(row.textRight - 1);
			expect(row.actionRight, 'review path action should stay inside its row').toBeLessThanOrEqual(row.pathLeft + row.pathWidth + 1);
		}
	}

	expect(reviewPathBox!.y, 'proposal review path should be visible before artifact inspection').toBeLessThan(linksBox!.y);
	expect(reviewPathBox!.y + reviewPathBox!.height, 'proposal review path should stay above the first laptop fold').toBeLessThan(720);
	expect(linksBox!.y, 'PDF/source inspection should appear before the checklist').toBeLessThan(qualityBox!.y);
	expect(linksBox!.y + linksBox!.height, 'artifact inspection row should fit in the first laptop viewport').toBeLessThan(720);

	const qualityLayout = await quality.evaluate(node => {
		const rows = [...node.children].map(child => child.getBoundingClientRect());
		return {
			count: rows.length,
			sameRow: rows.every(row => Math.abs(row.top - rows[0].top) < 2),
			labelsFit: [...node.querySelectorAll('span')].every(span => span.scrollWidth <= span.clientWidth + 1),
		};
	});
	const pathCopyLayout = await reviewPath.evaluate(path => [...path.querySelectorAll('.artifact-review__path-copy p')].map(paragraph => {
		const style = getComputedStyle(paragraph);
		return {
			text: paragraph.textContent,
			scrollWidth: paragraph.scrollWidth,
			clientWidth: paragraph.clientWidth,
			whiteSpace: style.whiteSpace,
			textOverflow: style.textOverflow,
		};
	}));
	for (const copy of pathCopyLayout) {
		expect(copy.scrollWidth, `${copy.text} should wrap instead of clipping in the review path`).toBeLessThanOrEqual(copy.clientWidth + 1);
		expect(copy.whiteSpace, `${copy.text} should not be forced onto one line`).not.toBe('nowrap');
		expect(copy.textOverflow, `${copy.text} should not hide the review path behind ellipsis`).toBe('clip');
	}

	expect(qualityLayout).toEqual({
		count: 3,
		sameRow: true,
		labelsFit: true,
	});
	expect(qualityBox!.y + qualityBox!.height, 'secondary checklist should not push the review rail below the laptop fold').toBeLessThan(720);
});

test('Generate page · review gate buyer-proof action focuses the missing input', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCard = page.locator('.generate-review-card');
	const textarea = page.locator('#generate-buyer-brief');
	await expect(page.locator('#generate-brief-error')).toHaveCount(0);

	await reviewCard
		.locator('.artifact-review__state')
		.getByRole('button', {name: /^add buyer proof$/i})
		.click();

	await expect(textarea).toBeFocused();
	await expect(textarea).toHaveAttribute('aria-invalid', 'true');
	await expect(page.locator('#generate-brief-error')).toContainText(/paste buyer context or load the hvac sample/i);
});

test('Generate page · draft artifact actions do not collide in the review rail', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});

	const reviewCard = page.locator('.generate-review-card');
	const pdfButton = reviewCard.getByRole('button', {name: /review draft pdf artifact/i});
	const sourceButton = reviewCard.getByRole('button', {name: /inspect draft source evidence/i});
	await expect(pdfButton).toBeVisible();
	await expect(sourceButton).toBeVisible();

	const layout = await reviewCard.evaluate(card => {
		const buttons = [...card.querySelectorAll('.artifact-review__links .btn')] as HTMLElement[];
		const pathButtons = [...card.querySelectorAll('.artifact-review__path-action')] as HTMLElement[];
		const cardBox = card.getBoundingClientRect();
		const boxes = buttons.map(button => {
			const rect = button.getBoundingClientRect();
			return {
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
				width: rect.width,
				height: rect.height,
				text: button.innerText,
				scrollWidth: button.scrollWidth,
				clientWidth: button.clientWidth,
			};
		});
		const pathBoxes = pathButtons.map(button => {
			const rect = button.getBoundingClientRect();
			const parentRect = button.parentElement?.getBoundingClientRect();
			return {
				left: rect.left,
				right: rect.right,
				text: button.innerText,
				scrollWidth: button.scrollWidth,
				clientWidth: button.clientWidth,
				parentLeft: parentRect?.left ?? 0,
				parentRight: parentRect?.right ?? 0,
			};
		});
		const overlaps = boxes.length === 2 && boxes[0].left < boxes[1].right && boxes[0].right > boxes[1].left && boxes[0].top < boxes[1].bottom && boxes[0].bottom > boxes[1].top;
		return {
			cardBox: {left: cardBox.left, right: cardBox.right},
			boxes,
			pathBoxes,
			overlaps,
		};
	});

	expect(layout.boxes).toHaveLength(2);
	expect(layout.pathBoxes).toHaveLength(2);
	expect(layout.overlaps, 'PDF/source artifact buttons should not overlap each other').toBe(false);
	for (const box of layout.boxes) {
		expect(box.left, `${box.text} should stay inside the review card`).toBeGreaterThanOrEqual(layout.cardBox.left);
		expect(box.right, `${box.text} should stay inside the review card`).toBeLessThanOrEqual(layout.cardBox.right);
		expect(box.scrollWidth, `${box.text} label should wrap instead of clipping`).toBeLessThanOrEqual(box.clientWidth + 1);
		expect(box.height, `${box.text} should have a stable touch target`).toBeGreaterThanOrEqual(40);
	}

	for (const box of layout.pathBoxes) {
		expect(box.left, `${box.text} path action should stay inside its review step`).toBeGreaterThanOrEqual(box.parentLeft);
		expect(box.right, `${box.text} path action should stay inside its review step`).toBeLessThanOrEqual(box.parentRight + 1);
		expect(box.scrollWidth, `${box.text} path action should wrap instead of clipping`).toBeLessThanOrEqual(box.clientWidth + 1);
	}
});

test('Generate page · artifact inspection is not buried on short desktop viewports', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 640});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCard = page.locator('.generate-review-card');
	const links = reviewCard.locator('.artifact-review__links');
	const packet = reviewCard.locator('.artifact-review__packet');
	await expect(reviewCard.getByRole('button', {name: /review packet preview/i})).toBeVisible();
	await expect(reviewCard.getByRole('button', {name: /inspect source evidence/i})).toBeVisible();

	const [linksBox, packetBox] = await Promise.all([links.boundingBox(), packet.boundingBox()]);
	expect(linksBox, 'artifact inspection row should render').not.toBeNull();
	expect(packetBox, 'review packet copy should render').not.toBeNull();
	expect(linksBox!.y, 'PDF/source inspection should come before explanatory packet copy').toBeLessThan(packetBox!.y);
	expect(linksBox!.height, 'artifact inspection row should preserve a usable action target').toBeGreaterThanOrEqual(40);
	expect(linksBox!.y + linksBox!.height, 'artifact inspection row should have real breathing room above the 1280x640 fold').toBeLessThan(624);
});

test('Generate page · mobile keeps the buyer proof composer ahead of trace and locked review', async ({openConsole, page}) => {
	await page.setViewportSize({width: 390, height: 844});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCard = page.locator('.generate-review-card');
	const briefCard = page.locator('.generate-brief-card');
	const traceCard = page.locator('.generate-trace-card');
	const runStrip = page.locator('[data-testid="generate-run-strip"]');
	const briefTextarea = page.locator('.generate-brief').first();
	const coach = page.locator('.coach-launcher');

	const [reviewBox, briefBox, traceBox, textareaBox, coachBox, runStripBox] = await Promise.all([
		reviewCard.boundingBox(),
		briefCard.boundingBox(),
		traceCard.boundingBox(),
		briefTextarea.boundingBox(),
		coach.boundingBox(),
		runStrip.boundingBox(),
	]);
	expect(reviewBox, 'mobile review gate should render').not.toBeNull();
	expect(briefBox, 'mobile buyer brief should render').not.toBeNull();
	expect(traceBox, 'mobile trace card should render').not.toBeNull();
	expect(textareaBox, 'mobile buyer proof textarea should render').not.toBeNull();
	expect(coachBox, 'mobile coach launcher should render').not.toBeNull();
	expect(runStripBox, 'mobile run status strip should render').not.toBeNull();

	expect(runStripBox!.height, 'mobile run status facts should use a compact two-row strip before the sequence').toBeLessThan(150);
	expect(briefBox!.y, 'buyer proof should be the first card after the sequence explanation on mobile').toBeLessThan(traceBox!.y);
	expect(traceBox!.y, 'sequence trace should stay before the locked review gate on mobile').toBeLessThan(reviewBox!.y);
	expect(textareaBox!.y, 'the actual buyer proof field should be reachable in the first mobile viewport').toBeLessThan(844);

	const coachOverlapsReview
		= reviewBox!.x < coachBox!.x + coachBox!.width && reviewBox!.x + reviewBox!.width > coachBox!.x && reviewBox!.y < coachBox!.y + coachBox!.height && reviewBox!.y + reviewBox!.height > coachBox!.y;
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
	await expect.poll(async () => page.evaluate(() => document.querySelector('main.scroll')?.scrollTop || 0), {timeout: 5000}).toBeGreaterThan(startingScroll + 100);

	await expect
		.poll(
			async () =>
				textarea.evaluate(node => {
					const box = node.getBoundingClientRect();
					return Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0));
				}),
			{timeout: 5000},
		)
		.toBeGreaterThan(120);
});

test('Generate page · coach launcher stays out of the sequence and artifact review rails on short desktop viewports', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 640});
	await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();

	await expect(page.locator('html')).toHaveAttribute('data-console-route', 'generate');
	const packet = page.locator('.artifact-review__packet');
	const runStrip = page.locator('[data-testid="generate-run-strip"]');
	const sidebar = page.locator('.sb');
	const headerActions = page.locator('.page--generate .ph__actions');
	const coach = page.locator('.coach-launcher');
	await expect(packet).toBeVisible();
	await expect(runStrip).toBeVisible();
	await expect(headerActions).toBeVisible();
	await expect(coach).toBeVisible();

	const [coachBox, runStripBox, sidebarBox, headerActionsBox] = await Promise.all([coach.boundingBox(), runStrip.boundingBox(), sidebar.boundingBox(), headerActions.boundingBox()]);
	expect(coachBox, 'coach launcher should render').not.toBeNull();
	expect(runStripBox, 'generate run status strip should render').not.toBeNull();
	expect(sidebarBox, 'sidebar should render').not.toBeNull();
	expect(headerActionsBox, 'generate header actions should render').not.toBeNull();
	expect(coachBox!.y, 'launcher should sit below the topbar on dense Generate workbench').toBeGreaterThanOrEqual(56);
	expect(coachBox!.y + coachBox!.height, 'launcher should stay above artifact review actions on short Generate workbench').toBeLessThan(150);
	expect(coachBox!.x, 'desktop Generate launcher should not overlap the sidebar tools').toBeGreaterThan(sidebarBox!.x + sidebarBox!.width);
	expect(coachBox!.x + coachBox!.width, 'launcher right edge near viewport right').toBeGreaterThan(1280 - 60);
	expect(coachBox!.width, 'Generate uses a compact coach escape hatch to protect the run strip').toBeLessThanOrEqual(48);
	const overlapsHeaderActions = coachBox!.x < headerActionsBox!.x + headerActionsBox!.width
		&& coachBox!.x + coachBox!.width > headerActionsBox!.x
		&& coachBox!.y < headerActionsBox!.y + headerActionsBox!.height
		&& coachBox!.y + coachBox!.height > headerActionsBox!.y;
	expect(overlapsHeaderActions, 'global coach launcher must not clip the Generate header actions').toBe(false);
	const overlapsRunStrip = coachBox!.x < runStripBox!.x + runStripBox!.width
		&& coachBox!.x + coachBox!.width > runStripBox!.x
		&& coachBox!.y < runStripBox!.y + runStripBox!.height
		&& coachBox!.y + coachBox!.height > runStripBox!.y;
	expect(overlapsRunStrip, 'global coach launcher must not cover the Generate run status strip').toBe(false);

	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await page.waitForTimeout(250);

	const sequenceOverlaps = await page.evaluate(() => {
		const launcher = document.querySelector('.coach-launcher')?.getBoundingClientRect();
		if (!launcher) {
			return ['missing launcher'];
		}

		return [...document.querySelectorAll('.generate-step')]
			.map(step => {
				const box = step.getBoundingClientRect();
				const overlaps = launcher.left < box.right
					&& launcher.right > box.left
					&& launcher.top < box.bottom
					&& launcher.bottom > box.top;
				return overlaps ? (step.textContent || '').trim() : null;
			})
			.filter(Boolean);
	});
	expect(sequenceOverlaps, 'sample-brief focus must not park the coach launcher on top of a sequence step').toEqual([]);
});

test('Generate page · DEMO_MODE streams a canned pipeline trace and resets the button', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await page.waitForTimeout(150);
	const initBtn = page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i});
	await initBtn.click();
	// Button switches while the canned trace replays.
	await expect(page.locator('.ph__actions').getByRole('button', {name: /generating draft/i})).toBeVisible({timeout: 1000});
	// The canned trace should produce visible OK lines in the console panel —
	// at least the three from the demo stream (enrichment.icp, audit.signed,
	// pipeline.done). New events (request.response 200, pipeline.complete)
	// may add more; assert a lower bound, not equality.
	await expect.poll(async () => page.locator('.console-panel .cl-ok').count(), {timeout: 10_000}).toBeGreaterThanOrEqual(3);
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i);
	await expect(page.locator('.console-panel')).toContainText(/request\.response: http 200/i);
	await expect(page.locator('.console-panel')).toContainText(/request\.posting: post \/api\/generate/i);
	await expect(page.locator('.console-panel__status')).toContainText(/complete/i, {timeout: 20_000});
	// Button resets with honest copy: the next click replaces the ready draft.
	await expect(page.locator('.ph__actions').getByRole('button', {name: /^regenerate review draft$/i})).toBeVisible({timeout: 5000});
	// Final confirmation toast.
	await expect(page.locator('.toast').first()).toContainText(/proposal generated/i);
});

test('Generate page · regenerating closes stale artifact drawers while the new sequence runs', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();

	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});
	await expect(page.locator('.ph__actions').getByRole('button', {name: /^regenerate review draft$/i})).toBeVisible();

	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /inspect draft source evidence/i})
		.click();
	await expect(page.getByRole('region', {name: /proposal artifact review drawer/i})).toBeVisible();

	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^regenerate review draft$/i})
		.click();

	await expect(page.getByRole('region', {name: /proposal artifact review drawer/i})).toHaveCount(0);
	await expect(page.locator('.generate-review-card')).toContainText(/sequence is running/i);
	await expect(page.locator('.generate-review-card')).toContainText(/draft gate completes/i);
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /^review in proposals$/i})).toBeDisabled();
	await expect(page.locator('.ph__actions').getByRole('button', {name: /^generating draft$/i})).toBeVisible();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.start/i);
});

test('Generate page · editing buyer proof after draft ready locks stale review artifacts', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();

	const reviewCard = page.locator('.generate-review-card');
	const reviewButton = reviewCard.getByRole('button', {name: /^review in proposals$/i});
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});
	await expect(reviewButton).toBeEnabled({timeout: 5000});

	await reviewCard.getByRole('button', {name: /inspect draft source evidence/i}).click();
	await expect(page.getByRole('region', {name: /proposal artifact review drawer/i})).toBeVisible();

	const textarea = page.locator('.generate-brief').first();
	const existingBrief = await textarea.inputValue();
	await textarea.fill(`${existingBrief}\n\nNEW BUYER PROOF: CFO requested a revised security appendix before approval.`);

	await expect(page.getByRole('region', {name: /proposal artifact review drawer/i})).toHaveCount(0);
	await expect(reviewButton).toBeDisabled();
	await expect(reviewCard).toContainText(/review packet preview is local only/i);
	await expect(reviewCard).toContainText(/run the sequence to bind buyer proof before proposals/i);
	await expect(reviewCard.getByRole('button', {name: /review pdf preview/i})).toBeVisible();
	await expect(page.locator('.ph__actions').getByRole('button', {name: /^generate review draft$/i})).toBeVisible();
	await expect(page.locator('.toast').first()).toContainText(/draft review reset/i);
});

test('Generate page · completed draft routes to proposal review', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();

	const reviewButton = page.locator('.generate-review-card').getByRole('button', {name: /^review in proposals$/i});
	await expect(reviewButton).toBeDisabled();

	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});
	await expect(reviewButton).toBeEnabled({timeout: 5000});
	await expect(page.locator('.generate-review-card').getByRole('button', {name: /review draft pdf artifact/i})).toBeVisible();
	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /review draft pdf artifact/i})
		.click();
	const drawer = page.getByRole('region', {name: /proposal artifact review drawer/i});
	await expect(drawer.locator('iframe[title="Generated proposal PDF review preview"]')).toBeVisible();
	await expect(drawer.locator('[data-testid="generate-artifact-mode"]')).toContainText(/local sample replay/i);
	await expect(drawer.locator('[data-testid="generate-artifact-path-label"]')).toContainText(/sample-backed pdf review artifact/i);
	await expect(drawer).toContainText(/sample-backed acme hvac packet/i);
	await expect(drawer).not.toContainText(/demo_mode|demo sequence|demo-generated/i);
	await page.getByRole('button', {name: /close proposal artifact review drawer/i}).click();
	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /inspect draft source evidence/i})
		.click();
	await expect(drawer).toContainText(/operator_review/i);
	await expect(drawer).toContainText(/sample-backed evidence bundle/i);
	const sourceJson = drawer.locator('[data-testid="generate-artifact-source-json"]');
	await expect(sourceJson).toContainText(/prop_demo_001/i);
	await expect(sourceJson).toContainText(/review_preview_source/i);
	await expect(sourceJson).toContainText(/quality_gate/i);
	await expect(sourceJson).toContainText(/pricing_math": "checked/i);
	await expect(sourceJson).toContainText(/risk_report": "checked/i);
	await expect(sourceJson).toContainText(/pdf_polish": "needs_review/i);
	await expect(sourceJson).not.toContainText(/"_demo_note"/i);
	await reviewButton.click();

	await expect(page.locator('.tb__crumb--active')).toContainText(/proposals/i);
	await expect(page.locator('.ph__title').first()).toContainText(/proposals/i);
	await expect(page
		.locator('.card__title')
		.filter({hasText: /detail/i})
		.first()).toContainText(/acme|pr-2041/i);
});

test('Proposals page · normal nav keeps the detail pane aligned with the visible list', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Proposals")').first().click();

	const firstProposal = await page.evaluate(() => {
		const first = (globalThis as any).GTM.proposals[0];
		return {id: first.id, co: first.co};
	});
	const firstRow = page.locator('[data-testid="proposal-row"]').first();
	const detailCard = page.locator('.split--2 > .vstack > .card').first();

	await expect(firstRow).toHaveAttribute('data-active', 'true');
	await expect(firstRow).toContainText(firstProposal.id);
	await expect(detailCard.locator('.card__title')).toContainText(firstProposal.id);
	await expect(detailCard).toContainText(firstProposal.co);

	await page
		.locator('[data-testid="proposal-row"]')
		.filter({hasText: /acme-hvac-r3/i})
		.first()
		.click();
	await expect(detailCard).toContainText(/acme hvac services/i);
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^open$/i})
		.click();
	await expect(page.locator('[data-testid="proposal-row"][data-active="true"]')).not.toContainText(/acme-hvac-r3/i);
	await expect(detailCard).not.toContainText(/acme hvac services/i);
});

test('Proposals page · history PDF artifacts open as framed local review previews', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Proposals")').first().click();

	const acmeRow = page.locator('[data-testid="proposal-row"]').filter({hasText: /acme-hvac-r3/i}).first();
	await expect(acmeRow).toBeVisible({timeout: 10_000});
	await acmeRow.click();

	await page.locator('.card:has(.card__title:has-text("detail")) .btn:has-text("Review packet")').click();
	const reviewPanel = page.locator('[data-testid="proposal-review-panel"]');
	await expect(reviewPanel).toBeVisible();

	const pdfArtifact = reviewPanel.locator('[data-testid="proposal-review-artifact"]').filter({hasText: /proposal pdf/i});
	await expect(pdfArtifact).toContainText(/review sample pdf/i);
	await expect(pdfArtifact).toContainText(/sample pdf preview attached for local review/i);
	await expect(pdfArtifact).not.toContainText(/manifest only/i);
	await expect(reviewPanel.locator('iframe[title="Acme HVAC Services sample PDF review preview"]')).toBeVisible();
	await expect(page.locator('[data-testid="proposal-review-gate"]')).toContainText(/sent_review/i);
	await expect(page.locator('[data-testid="proposal-review-mode"]')).toContainText(/demo review/i);
});

test('Generate revised proposal from Calls carries call metadata into Generate, pre-fills the brief, hides internal version copy', async ({openConsole}) => {
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

	await page.locator('[data-testid="call-generate-proposal-v3"]').click();

	// The control should do navigation and state handoff, not a toast-only signal.
	await expect(page.locator('.toast', {hasText: /generator opened/i})).toHaveCount(0);

	// Land on Generate; the handoff banner names the call.
	await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
	const banner = page.locator('[data-testid="generate-proposal-v3-banner"]');
	await expect(banner).toBeVisible();
	await expect(banner).toContainText(new RegExp(`Generating revised proposal from ${activeCall.id}`));
	await expect(banner).not.toContainText(/proposal v\d+/i);
	await expect(banner).toContainText(new RegExp(activeCall.co));
	const summary = page.locator('[data-testid="generate-proposal-v3-summary"]');
	await expect(summary).toContainText(new RegExp(activeCall.outcome));

	// Brief textarea pre-filled with the call context.
	const brief = page.locator('.generate-brief');
	const briefValue = (await brief.inputValue()).trim();
	expect(briefValue).toContain(activeCall.id);
	expect(briefValue).toContain(activeCall.co);
	expect(briefValue).toContain(activeCall.outcome);
	expect(briefValue).toMatch(/call signal/i);
	expect(briefValue).not.toMatch(/proposal v\d+/i);

	// Dismiss banner removes it without clearing the textarea.
	await page.locator('[data-testid="generate-proposal-v3-dismiss"]').click();
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

	await page.locator('.inspectable[role="button"]').filter({hasText: target.id}).first().click();

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
	await page.locator('.inspectable[role="button"]').filter({hasText: 'PR-2041'}).first().click();
	await expect(page.locator('.ph__sub')).toContainText(/revised review packet/i);
	await expect(page.locator('.ph__sub')).not.toContainText(/v-next|next version/i);
	const addressButton = page.locator('[data-testid="proposal-address-blockers"]');
	await expect(addressButton).toContainText(/address blockers/i);
	await expect(addressButton).not.toContainText(/v-next|version/i);
	await expect(page.locator('[data-testid="proposal-send-gate-note"]')).toContainText(/revised review packet/i);
	await expect(page.locator('[data-testid="proposal-send-gate-note"]')).not.toContainText(/v-next|version/i);
	await page.locator('[data-testid="proposal-resend-open"]').click();
	const sendHold = page.locator('[data-testid="proposal-send-hold"]');
	await expect(sendHold).toBeVisible();
	await expect(sendHold).toContainText(/revised review packet/i);
	await expect(sendHold).not.toContainText(/v-next|next version/i);
	await page.getByRole('button', {name: /close proposal workflow panel/i}).click();

	const liveBlockers = await page.evaluate(() => {
		const D = (globalThis as any).GTM;
		const p = (D.proposals || []).find((x: any) => x.id === 'PR-2041');
		return Array.isArray(p?.blockers) ? p.blockers : [];
	});
	expect(liveBlockers.length).toBeGreaterThan(0);

	await addressButton.click();

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
	expect(briefValue).toMatch(/revised review packet/i);
	expect(briefValue).not.toMatch(/v-next|next version/i);

	// Dismiss banner removes it without clearing the textarea.
	await page.locator('[data-testid="generate-address-blockers-dismiss"]').click();
	await expect(banner).toHaveCount(0);
	expect((await brief.inputValue()).length).toBeGreaterThan(0);
});

test('Address blockers handoff banner auto-clears once the review draft is ready — no stale handoff label after the work is done', async ({openConsole}) => {
	const page = await openConsole();
	// Trigger the handoff from Proposals → Generate.
	await page.locator('.sb__item:has-text("Proposals")').first().click();
	await page.locator('.inspectable[role="button"]').filter({hasText: 'PR-2041'}).first().click();
	await page.locator('[data-testid="proposal-address-blockers"]').click();

	// Land on Generate with the banner visible — handoff is fresh.
	await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
	const banner = page.locator('[data-testid="generate-address-blockers-banner"]');
	await expect(banner).toBeVisible();

	// Run the demo pipeline; once it completes, reviewReady becomes true
	// and the handoff banner should auto-clear (the operator's brief is no
	// longer just-a-handoff — they've produced a draft from it).
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
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
	await page.locator('.inspectable[role="button"]').filter({hasText: 'PR-2041'}).first().click();
	await page.locator('[data-testid="proposal-address-blockers"]').click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Generate');

	// Run the demo pipeline so reviewReady becomes true and the handoff
	// banner auto-clears (per the prior fix). The lastHandoffRef should
	// still hold the PR-2041/Banyan context.
	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, {timeout: 10_000});

	// Click Review in Proposals — should route to PR-2041 (the handoff
	// origin) because the lastHandoffRef survived the banner auto-clear.
	await page
		.locator('.generate-review-card')
		.getByRole('button', {name: /^review in proposals$/i})
		.click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
	const detailCard = page.locator('.split--2 > .vstack > .card').first();
	await expect(detailCard.locator('.card__title')).toContainText('PR-2041');
	await expect(detailCard).toContainText(/banyan/i);
});

test('Generate page · lower Generate review draft button streams immediately', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await page.waitForTimeout(150);
	await page
		.locator('.generate-actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();
	await expect(page.locator('.console-panel')).toContainText(/pipeline\.start/i);
	await expect(page.locator('.console-panel')).toContainText(/intake\.received/i, {timeout: 3000});
});

test('Generate page · ConsolePanel surfaces the full pipeline log with scrollable body, line count, copy + clear', async ({openConsole, context}) => {
	// Clipboard read needs a permission grant; copy still works without it
	// (it just falls through to the toast assertion).
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	const page = await openConsole();
	await page.locator('.sb__item:has-text("Generate")').first().click();
	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
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

	await page
		.locator('.ph__actions')
		.getByRole('button', {name: /^generate review draft$/i})
		.click();

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

test('Proposals page · fixture review packet opens a local sample PDF preview', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Proposals")').first().click();

	await page
		.locator('.proposal-detail-actions')
		.getByRole('button', {name: /review packet/i})
		.click();

	const panel = page.getByTestId('proposal-review-panel');
	await expect(panel).toBeVisible();
	await expect(panel.getByTestId('proposal-review-packet')).toContainText(/review packet/i);
	await expect(panel.locator('[data-testid="proposal-review-artifact"]').first()).toContainText(/review sample pdf/i);
	await expect(panel.getByTestId('proposal-review-artifact-preview')).toBeVisible();
	await expect(panel.getByTestId('proposal-review-artifact-preview').locator('iframe')).toHaveAttribute(
		'src',
		/\.\.\/assets\/sample-proposal\.pdf/,
	);
	await expect(panel.getByTestId('proposal-review-preview-unavailable')).toHaveCount(0);
	await expect(panel).toContainText(/sample pdf preview attached for local review/i);
});

test('Generate page · disabled Proposals review button names the unlock sequence', async ({openConsole}) => {
	const page = await openConsole();
	await page.setViewportSize({width: 1280, height: 900});
	await page.locator('.sb__item:has-text("Generate")').first().click();

	const reviewCta = page.locator('.generate-review-card').getByRole('button', {name: /^review in proposals$/i});
	await expect(reviewCta).toBeDisabled();
	await expect(reviewCta).toHaveAttribute('aria-describedby', 'generate-review-cta-help');
	await expect(reviewCta).toHaveAttribute(
		'title',
		/Add buyer proof, then generate the review draft to unlock Proposals review\./,
	);

	const help = page.locator('#generate-review-cta-help');
	await expect(help).toBeVisible();
	await expect(help).toContainText(/add buyer proof, then generate the review draft/i);

	const reviewPath = page.getByTestId('generate-review-path-step-review');
	await expect(reviewPath).toContainText(/draft gate locked/i);
	await expect(reviewPath).toContainText(/unlock proposals review/i);

	await page.getByRole('button', {name: /use sample buyer proof/i}).first().click();
	await expect(reviewCta).toHaveAttribute(
		'title',
		/Generate the review draft to unlock Proposals review\./,
	);
	await expect(help).toContainText(/generate the review draft to unlock proposals review/i);
	await expect(reviewPath).toContainText(/draft gate locked/i);
});
