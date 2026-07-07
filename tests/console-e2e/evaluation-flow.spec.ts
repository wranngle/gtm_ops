/**
 * /evaluation/ is now only a compatibility entrypoint. The actual Evals
 * dashboard lives inside /console so it inherits the shell, ElevenLabs lab,
 * command bridge, and operator context instead of acting like a bolted-on app.
 */
import {test, expect} from './helpers.js';

test.describe('/evaluation/ console bridge', () => {
	test('redirects into the native console Evals route', async ({page}) => {
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/evaluation/', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		await expect(page).toHaveURL(/\/console\/\?route=evals$/);
		await expect(page.locator('.tb__crumb--active')).toContainText('Evals');
		await expect(page.getByRole('heading', {level: 1})).toHaveText('Evals');
		await expect(page.getByTestId('eval-command-center')).toBeVisible();
		await expect(page.locator('.page--evals > .ph')).toHaveCount(0);
		await expect(page.locator('[data-testid="eval-run-plan-summary"]')).toBeVisible();
		await expect(page.locator('.eval-convai-frame')).toBeVisible();
		await expect(page.locator('h1', {hasText: /^Evaluation Dashboard$/})).toHaveCount(0);
	});

	test('keeps one explicit local run-plan opener instead of duplicate hero controls', async ({page}) => {
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		await expect(page.getByTestId('eval-command-center')).toBeVisible();
		await expect(page.getByTestId('eval-run-plan-summary')).toBeVisible();
		await expect(page.getByTestId('eval-run-plan-summary')).toContainText(/quick gtm eval batch ready/i);
		await expect(page.getByTestId('eval-harness-manifest-status')).toContainText(/console eval manifest\s*·\s*8 commands/i);
		await expect(page.getByTestId('eval-run-plan-summary')).not.toContainText(/voice_ai_agent_evals|eval-harness\.manifest\.json/i);
		await expect(page.getByTestId('eval-run-plan-summary')).not.toContainText(/no harness command queued/i);
		await expect(page.getByTestId('eval-command-center').getByRole('button', {name: /^run plan$/i})).toHaveCount(0);
		await expect(page.getByTestId('eval-run-plan-open')).toHaveText(/open run plan/i);
		await expect(page.getByTestId('eval-run-plan-open')).toHaveAttribute('aria-controls', 'eval-run-plan-details');
		await expect(page.getByRole('button', {name: /^open run plan$/i})).toHaveCount(1);

		await page.getByTestId('eval-run-plan-open').click();
		const runPlan = page.getByRole('region', {name: /local eval run plan details/i});
		await expect(runPlan).toBeVisible();
		await expect(runPlan).toContainText(/manifest command handoff/i);
		await expect(runPlan).toContainText(/open review evidence/i);
		await expect(runPlan).not.toContainText(/\.\.\/voice_ai_agent_evals|harness repo/i);
		await expect(page.getByTestId('eval-run-plan-open')).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByTestId('eval-run-plan-summary')).toContainText(/quick gtm eval batch selected/i);
	});

	test('Mission Control run-plan handoff opens Evals at the native masthead, not mid-panel', async ({openConsole}) => {
		const page = await openConsole();
		await page.setViewportSize({width: 1366, height: 768});

		await page.getByRole('button', {name: 'OPEN EVAL RUN PLAN'}).click();

		await expect(page).toHaveURL(/\/console\/\?route=evals$/);
		await expect(page.locator('.tb__crumb--active')).toContainText('Evals');
		await expect(page.getByTestId('eval-console-masthead')).toBeInViewport();
		const scrollTop = await page.locator('main.scroll').evaluate(element => element.scrollTop);
		expect(scrollTop, 'external run-plan handoff should not auto-scroll past the Evals masthead').toBeLessThan(40);

		await expect(page.getByTestId('eval-run-plan-open')).toHaveAttribute('aria-expanded', 'true');
		await expect(page.locator('#eval-run-plan-details')).toHaveCount(1);
		await expect(page.getByTestId('eval-run-plan-summary')).toContainText('Quick GTM eval batch selected');
	});

	test('command center voice block names the local ElevenLabs wrapper and selected evidence', async ({page}) => {
		await page.addInitScript(() => {
			Reflect.set(globalThis, 'DEMO_MODE', true);
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const commandCenter = page.getByTestId('eval-command-center');
		const voiceMeta = page.getByTestId('eval-command-voice-meta');
		await expect(commandCenter).toBeVisible();
		await expect(voiceMeta).toBeVisible();
		await expect(voiceMeta).toContainText(/agent/i);
		await expect(voiceMeta).toContainText(/local wrapper/i);
		await expect(voiceMeta).toContainText(/agents\s*\/\s*(sales_coach|intake)/i);
		await expect(voiceMeta).toContainText(/evidence/i);
		await expect(voiceMeta).toContainText(/review evidence packet/i);
		await expect(voiceMeta).toContainText(/source evidence/i);
		await expect(voiceMeta).not.toContainText(/fixtures\/runs|eval-runs\.json/i);
		await expect(page.getByTestId('eval-command-latency')).toContainText(/latency/i);
		await expect(page.getByTestId('eval-command-latency')).toContainText(/total turn|pending/i);
		await expect(page.getByTestId('eval-command-open-admin')).toHaveText(/open local admin/i);
		await expect(commandCenter.getByTestId('eval-command-open-admin')).toHaveCount(1);
		await expect(commandCenter.getByTestId('eval-command-open-artifact')).toHaveCount(1);
		await expect(commandCenter.locator('[data-testid="eval-local-agent-admin"], [data-testid="eval-artifacts-open"]')).toHaveCount(0);
		await expect(commandCenter.getByRole('button', {name: 'Agent admin', exact: true})).toHaveCount(0);
		await expect(commandCenter.locator('a[href*="elevenlabs.io"]')).toHaveCount(0);
	});

	test('command center promotes judge-axis evidence into the selected run workbench', async ({page}) => {
		await page.setViewportSize({width: 1280, height: 720});
		await page.addInitScript(() => {
			Reflect.set(globalThis, 'DEMO_MODE', true);
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const commandCenter = page.getByTestId('eval-command-center');
		const axisBrief = page.getByTestId('eval-command-axis-brief');
		await expect(commandCenter).toBeVisible();
		await expect(axisBrief).toBeVisible();
		await expect(axisBrief).toContainText(/judge axes/i);
		await expect(axisBrief).toContainText(/1 failed/i);
		await expect(axisBrief.getByTestId('eval-command-axis-row')).toHaveCount(4);
		await expect(axisBrief).toContainText(/asr robustness/i);
		await expect(axisBrief).toContainText(/agent confidently filled-in for misheard tokens/i);
		await expect(axisBrief.locator('[data-status="fail"]')).toContainText(/fail/i);
		await expect(axisBrief).not.toContainText(/fixtures\/runs|eval-runs\.json/i);

		const layout = await axisBrief.evaluate(element => {
			const card = element.closest<HTMLElement>('[data-testid="eval-command-center"]');
			const cardBox = card?.getBoundingClientRect();
			const briefBox = element.getBoundingClientRect();
			const rows = [...element.querySelectorAll<HTMLElement>('[data-testid="eval-command-axis-row"]')].map(row => {
				const box = row.getBoundingClientRect();
				return {
					clientWidth: row.clientWidth,
					right: box.right,
					scrollWidth: row.scrollWidth,
					text: (row.textContent ?? '').replaceAll(/\s+/g, ' ').trim(),
				};
			});
			return {
				briefRight: briefBox.right,
				cardRight: cardBox?.right ?? 0,
				rows,
				scrollWidth: element.scrollWidth,
				clientWidth: element.clientWidth,
			};
		});

		expect(
			layout.briefRight,
			`axis brief should stay inside the Evals command card: ${JSON.stringify(layout)}`,
		).toBeLessThanOrEqual(layout.cardRight + 1);
		expect(
			layout.scrollWidth,
			`axis brief should not create hidden horizontal scroll: ${JSON.stringify(layout)}`,
		).toBeLessThanOrEqual(layout.clientWidth + 1);
		expect(
			layout.rows.every(row => row.scrollWidth <= row.clientWidth + 1),
			`axis rows should wrap details instead of clipping: ${JSON.stringify(layout)}`,
		).toBe(true);
	});

	test('Evals masthead uses a native console heading before the scenario workbench', async ({page}) => {
		await page.addInitScript(() => {
			Reflect.set(globalThis, 'DEMO_MODE', true);
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const masthead = page.getByTestId('eval-console-masthead');
		const heading = masthead.getByRole('heading', {level: 1});
		await expect(heading).toHaveText('Evals');
		await expect(masthead.getByTestId('eval-masthead-results')).toContainText(/loaded results/i);
		await expect(masthead.getByTestId('eval-masthead-suite-runs')).toContainText(/suite-library runs/i);
		await expect(page.getByTestId('eval-active-scenario-title')).toContainText(/noisy caller transcription stress/i);

		const headingStyle = await heading.evaluate(element => {
			const style = getComputedStyle(element as HTMLElement);
			const headingBox = element.getBoundingClientRect();
			const scopeBox = element
				.closest('[data-testid="eval-console-masthead"]')
				?.querySelector('[data-testid="eval-masthead-results"]')
				?.getBoundingClientRect();
			return {
				fontFamily: style.fontFamily,
				fontSize: Number.parseFloat(style.fontSize),
				letterSpacing: style.letterSpacing,
				scopeTop: scopeBox?.top ?? 0,
				titleBottom: headingBox.bottom,
				textTransform: style.textTransform,
			};
		});

		expect(headingStyle.fontFamily, `Evals h1 should use the console display face, not a mono eyebrow: ${JSON.stringify(headingStyle)}`).not.toMatch(/jetbrains mono|ui-monospace|monospace/i);
		expect(headingStyle.fontSize, `Evals h1 should read as a page title before the scenario title: ${JSON.stringify(headingStyle)}`).toBeGreaterThanOrEqual(20);
		expect(headingStyle.scopeTop, `Evals scope chips should sit below the page title, not crowd its line: ${JSON.stringify(headingStyle)}`).toBeGreaterThanOrEqual(headingStyle.titleBottom - 1);
		expect(['normal', '0px']).toContain(headingStyle.letterSpacing);
		expect(headingStyle.textTransform).not.toBe('uppercase');
	});

	test('command center latency value is readable inside the local wrapper', async ({page}) => {
		await page.setViewportSize({width: 1366, height: 768});
		await page.addInitScript(() => {
			Reflect.set(globalThis, 'DEMO_MODE', true);
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const latency = page.getByTestId('eval-command-latency');
		await expect(latency).toContainText(/total turn|pending/i);
		const geometry = await latency.evaluate(element => {
			const label = element.querySelector('span');
			const value = element.querySelector('strong');
			const style = value ? getComputedStyle(value) : null;
			return {
				clientWidth: value?.clientWidth ?? 0,
				labelText: label?.textContent?.trim() ?? '',
				scrollWidth: value?.scrollWidth ?? 0,
				text: value?.textContent?.trim() ?? '',
				textOverflow: style?.textOverflow ?? '',
				whiteSpace: style?.whiteSpace ?? '',
			};
		});

		expect(geometry.labelText, `latency label should name the measured metric: ${JSON.stringify(geometry)}`).toMatch(/total turn|latency/i);
		expect(geometry.text, `latency value should render: ${JSON.stringify(geometry)}`).toMatch(/\d+(?:\.\d+)?[a-z]+|pending/i);
		expect(geometry.scrollWidth, `latency value should not be visually clipped: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.clientWidth + 1);
		expect(geometry.textOverflow, `latency value should not be ellipsized: ${JSON.stringify(geometry)}`).not.toBe('ellipsis');
		expect(geometry.whiteSpace, `latency value should be allowed to wrap if needed: ${JSON.stringify(geometry)}`).not.toBe('nowrap');
	});

	test('command center evidence packet has a readable local source label and real review actions', async ({page}) => {
		await page.addInitScript(() => {
			Reflect.set(globalThis, 'DEMO_MODE', true);
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const evidence = page.getByTestId('eval-command-evidence-card');
		const title = page.getByTestId('eval-command-evidence-title');
		const kind = page.getByTestId('eval-command-evidence-kind');
		const source = page.getByTestId('eval-command-evidence-source');
		await expect(evidence).toBeVisible();
		await expect(evidence).toContainText(/evidence packet/i);
		await expect(title).toContainText(/noisy caller transcription stress/i);
		await expect(title).toContainText(/review evidence packet/i);
		await expect(kind).toHaveText(/source evidence\s*·\s*json/i);
		await expect(source).toContainText(/source evidence/i);
		await expect(source).toContainText(/[a-z\d-]+/i);
		await expect(source).not.toContainText(/fixtures\/runs/i);
		expect(await source.evaluate(node => {
			const style = getComputedStyle(node as HTMLElement);
			return {
				overflowWrap: style.overflowWrap,
				whiteSpace: style.whiteSpace,
			};
		})).toEqual({overflowWrap: 'anywhere', whiteSpace: 'normal'});
		const titleLayout = await title.evaluate(element => {
			const scope = element.querySelector<HTMLElement>('.eval-command-center__evidence-title-scope');
			const name = element.querySelector<HTMLElement>('strong');
			const read = (node: HTMLElement | null | undefined) => {
				if (!node) {
					return null;
				}

				const rect = node.getBoundingClientRect();
				return {
					bottom: rect.bottom,
					clientWidth: node.clientWidth,
					scrollWidth: node.scrollWidth,
					text: (node.textContent || '').trim(),
					top: rect.top,
				};
			};

			const style = getComputedStyle(element as HTMLElement);
			return {
				display: style.display,
				rowGap: Number.parseFloat(style.rowGap || '0'),
				scope: read(scope),
				name: read(name),
			};
		});
		expect(titleLayout.display, `evidence title should use stacked rows, not one fused label: ${JSON.stringify(titleLayout)}`).toBe('grid');
		expect(titleLayout.rowGap, `evidence title rows need visible separation: ${JSON.stringify(titleLayout)}`).toBeGreaterThanOrEqual(2);
		expect(titleLayout.scope?.text, `packet scope should be separate from scenario: ${JSON.stringify(titleLayout)}`).toMatch(/review evidence packet/i);
		expect(titleLayout.name?.text, `scenario title should stay readable: ${JSON.stringify(titleLayout)}`).toMatch(/noisy caller transcription stress/i);
		expect(titleLayout.scope!.bottom, `packet scope should sit above scenario title: ${JSON.stringify(titleLayout)}`).toBeLessThanOrEqual(titleLayout.name!.top);
		expect(titleLayout.name!.scrollWidth, `scenario title should not clip: ${JSON.stringify(titleLayout)}`).toBeLessThanOrEqual(titleLayout.name!.clientWidth + 1);
		const packetLayout = await evidence.evaluate(element => {
			const read = (selector: string) => {
				const node = element.querySelector<HTMLElement>(selector);
				if (!node) {
					return null;
				}

				const rect = node.getBoundingClientRect();
				return {
					bottom: rect.bottom,
					clientWidth: node.clientWidth,
					height: rect.height,
					left: rect.left,
					right: rect.right,
					scrollWidth: node.scrollWidth,
					top: rect.top,
					width: rect.width,
				};
			};

			const style = getComputedStyle(element as HTMLElement);
			return {
				card: read('[data-testid="eval-command-evidence-card"]') ?? {
					bottom: element.getBoundingClientRect().bottom,
					clientWidth: element.clientWidth,
					height: element.getBoundingClientRect().height,
					left: element.getBoundingClientRect().left,
					right: element.getBoundingClientRect().right,
					scrollWidth: element.scrollWidth,
					top: element.getBoundingClientRect().top,
					width: element.getBoundingClientRect().width,
				},
				title: read('[data-testid="eval-command-evidence-title"]'),
				kind: read('[data-testid="eval-command-evidence-kind"]'),
				source: read('[data-testid="eval-command-evidence-source"]'),
				actions: read('.eval-command-center__evidence-actions'),
				borderLeftWidth: Number.parseFloat(style.borderLeftWidth || '0'),
				rowGap: Number.parseFloat(style.rowGap || '0'),
			};
		});

		expect(packetLayout.borderLeftWidth, `evidence packet should read as an artifact card: ${JSON.stringify(packetLayout)}`).toBeGreaterThanOrEqual(2);
		expect(packetLayout.rowGap, `evidence packet rows need breathing room: ${JSON.stringify(packetLayout)}`).toBeGreaterThanOrEqual(6);
		expect(packetLayout.title, `evidence title should render: ${JSON.stringify(packetLayout)}`).not.toBeNull();
		expect(packetLayout.kind, `evidence kind should render: ${JSON.stringify(packetLayout)}`).not.toBeNull();
		expect(packetLayout.source, `evidence source should render: ${JSON.stringify(packetLayout)}`).not.toBeNull();
		expect(packetLayout.actions, `evidence actions should render: ${JSON.stringify(packetLayout)}`).not.toBeNull();
		expect(packetLayout.title!.bottom, `evidence title should not collide with the kind label: ${JSON.stringify(packetLayout)}`).toBeLessThanOrEqual(packetLayout.kind!.top);
		expect(packetLayout.kind!.bottom, `evidence kind should not collide with source label: ${JSON.stringify(packetLayout)}`).toBeLessThanOrEqual(packetLayout.source!.top);
		expect(packetLayout.source!.bottom, `source label should not collide with artifact/admin actions: ${JSON.stringify(packetLayout)}`).toBeLessThanOrEqual(packetLayout.actions!.top);
		expect(packetLayout.source!.scrollWidth, `source label should fit without hidden horizontal overflow: ${JSON.stringify(packetLayout)}`).toBeLessThanOrEqual(packetLayout.source!.clientWidth + 1);

		await page.getByTestId('eval-command-open-artifact').click();
		await expect(page.getByTestId('eval-artifact-panel')).toBeVisible();
		await expect(page.getByTestId('eval-artifact-path')).toContainText(/source evidence · noisy-caller-transcription-stress/i);
		await expect(page.getByTestId('eval-artifact-path')).not.toContainText(/fixtures\/runs|eval-runs\.json/i);

		await page.getByTestId('eval-command-open-admin').click();
		await expect(page.locator('.tb__crumb--active')).toContainText('Agents');
		await expect(page.getByTestId('agent-eval-handoff-banner')).toBeVisible();
		await expect(page.getByTestId('agent-context')).toContainText(/eval_evidence_path:/);
	});

	test('Evals local admin handoff keeps the global coach affordance compact', async ({page}) => {
		await page.setViewportSize({width: 1366, height: 768});
		await page.addInitScript(() => {
			Reflect.set(globalThis, 'DEMO_MODE', true);
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		await page.getByTestId('eval-command-open-admin').click();
		await expect(page.locator('.tb__crumb--active')).toContainText('Agents');
		await expect(page.getByTestId('agent-eval-handoff-banner')).toBeVisible();
		await expect(page.locator('.coach-launcher')).toBeVisible();

		const layout = await page.evaluate(() => {
			const rect = (selector: string) => {
				const element = document.querySelector(selector);
				if (!element) {
					return null;
				}

				const box = element.getBoundingClientRect();
				return {
					bottom: box.bottom,
					height: box.height,
					left: box.left,
					right: box.right,
					top: box.top,
					width: box.width,
				};
			};

			const overlaps = (
				a: ReturnType<typeof rect>,
				b: ReturnType<typeof rect>,
			) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
			const launcher = rect('.coach-launcher');
			const label = document.querySelector('.coach-launcher__label');
			return {
				labelDisplay: label ? getComputedStyle(label).display : null,
				launcher,
				overlapsContextMeta: overlaps(launcher, rect('.agent-eval-handoff__meta')),
				overlapsReturnAction: overlaps(launcher, rect('[data-testid="agent-return-to-eval-run-top"]')),
			};
		});

		expect(layout.launcher, `coach launcher should remain available: ${JSON.stringify(layout)}`).not.toBeNull();
		expect(layout.labelDisplay, `Agents has a native ElevenLabs wrapper, so the duplicate Coach label should be hidden: ${JSON.stringify(layout)}`).toBe('none');
		expect(layout.launcher!.width, `Agents coach affordance should be compact: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(52);
		expect(layout.launcher!.height, `Agents coach affordance should be compact: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(52);
		expect(layout.overlapsContextMeta, `compact launcher must not cover eval evidence copy: ${JSON.stringify(layout)}`).toBe(false);
		expect(layout.overlapsReturnAction, `compact launcher must not cover Back to Evals: ${JSON.stringify(layout)}`).toBe(false);
	});

	test('Evals keeps the global coach affordance off the local run-plan controls', async ({page}) => {
		await page.setViewportSize({width: 1366, height: 768});
		await page.addInitScript(() => {
			Reflect.set(globalThis, 'DEMO_MODE', true);
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		await expect(page.locator('.coach-launcher')).toBeVisible();
		await expect(page.getByTestId('eval-run-plan-summary')).toBeVisible();

		const layout = await page.evaluate(() => {
			const rect = (selector: string) => {
				const element = document.querySelector(selector);
				if (!element) {
					return null;
				}

				const box = element.getBoundingClientRect();
				return {
					bottom: box.bottom,
					height: box.height,
					left: box.left,
					right: box.right,
					top: box.top,
					width: box.width,
				};
			};

			const overlaps = (
				a: ReturnType<typeof rect>,
				b: ReturnType<typeof rect>,
			) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
			const launcher = rect('.coach-launcher');
			const commandCenter = rect('[data-testid="eval-command-center"]');
			const runPlan = rect('[data-testid="eval-run-plan-summary"]');
			const runPlanButton = rect('[data-testid="eval-run-plan-open"]');
			const label = document.querySelector('.coach-launcher__label');
			return {
				commandCenter,
				labelDisplay: label ? getComputedStyle(label).display : null,
				launcher,
				overlapsCommandCenter: overlaps(launcher, commandCenter),
				overlapsRunPlan: overlaps(launcher, runPlan),
				overlapsRunPlanButton: overlaps(launcher, runPlanButton),
				runPlan,
			};
		});

		expect(layout.launcher, `coach launcher should remain mounted: ${JSON.stringify(layout)}`).not.toBeNull();
		expect(layout.commandCenter, `command center should render: ${JSON.stringify(layout)}`).not.toBeNull();
		expect(layout.runPlan, `run-plan summary should render: ${JSON.stringify(layout)}`).not.toBeNull();
		expect(layout.labelDisplay, `Evals has a native ElevenLabs wrapper, so the duplicate Coach label should stay hidden: ${JSON.stringify(layout)}`).toBe('none');
		expect(layout.launcher!.width, `Evals coach affordance should stay compact: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(52);
		expect(layout.launcher!.height, `Evals coach affordance should stay compact: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(52);
		expect(layout.launcher!.bottom, `launcher should sit above the local run-plan card: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.runPlan!.top);
		expect(layout.overlapsCommandCenter, `global coach orb must not sit on top of the native Evals command center: ${JSON.stringify(layout)}`).toBe(false);
		expect(layout.overlapsRunPlan, `global coach orb must not cover the local run-plan summary: ${JSON.stringify(layout)}`).toBe(false);
		expect(layout.overlapsRunPlanButton, `global coach orb must not cover Open run plan: ${JSON.stringify(layout)}`).toBe(false);
	});

	test('Evals command center and run lists stay inside a mid-width console', async ({page}) => {
		await page.setViewportSize({width: 1000, height: 720});
		await page.route('**/unpkg.com/@elevenlabs/**', async route => route.abort('blockedbyclient'));
		await page.addInitScript(() => {
			Reflect.set(globalThis, 'DEMO_MODE', true);
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		await expect(page.getByTestId('eval-command-center')).toBeVisible();
		await expect(page.locator('.evals-grid')).toBeVisible();

		const layout = await page.evaluate(() => {
			const pageBox = document.querySelector('.page--evals')?.getBoundingClientRect();
			const commandBox = document.querySelector('[data-testid="eval-command-center"]')?.getBoundingClientRect();
			const grid = document.querySelector('.evals-grid');
			const commandOverflow = [...document.querySelectorAll('[data-testid="eval-command-center"], [data-testid="eval-command-center"] *')]
				.filter(element => {
					const box = element.getBoundingClientRect();
					return box.width > 0 && pageBox && (box.left < pageBox.left - 1 || box.right > pageBox.right + 1);
				})
				.map(element => ({
					className: String((element as HTMLElement).className || element.tagName),
					text: element.textContent?.trim().replaceAll(/\s+/g, ' ').slice(0, 80),
				}));
			const clippedRows = [...document.querySelectorAll('.eval-suite-row__select, .eval-run-row__select')]
				.filter(element => element.scrollWidth > element.clientWidth + 4 || element.scrollHeight > element.clientHeight + 4)
				.slice(0, 8)
				.map(element => ({
					className: String((element as HTMLElement).className || element.tagName),
					overflowX: element.scrollWidth - element.clientWidth,
					text: element.textContent?.trim().replaceAll(/\s+/g, ' ').slice(0, 80),
				}));

			return {
				commandRight: Math.round(commandBox?.right ?? 0),
				commandWidth: Math.round(commandBox?.width ?? 0),
				docScrollWidth: document.documentElement.scrollWidth,
				gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns : '',
				pageLeft: Math.round(pageBox?.left ?? 0),
				pageRight: Math.round(pageBox?.right ?? 0),
				viewportWidth: window.innerWidth,
				commandOverflow,
				clippedRows,
			};
		});

		expect(layout.docScrollWidth, `Evals should not create page-level horizontal scroll: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.viewportWidth);
		expect(layout.commandRight, `command center should stay inside the page column: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.pageRight);
		expect(layout.pageRight - layout.commandRight, `command center should reserve the coach gutter once, not waste a second column: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(96);
		expect(layout.commandWidth, `command center should stay usable at mid width instead of becoming a narrow bolted-on panel: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(620);
		expect(layout.commandOverflow, `command center children should not hang past the page edge: ${JSON.stringify(layout)}`).toEqual([]);
		expect(layout.gridColumns.trim().split(/\s+/), `Evals workbench should collapse before row controls clip: ${JSON.stringify(layout)}`).toHaveLength(1);
		expect(layout.clippedRows, `Evals row controls should not internally scroll at 1000px: ${JSON.stringify(layout)}`).toEqual([]);
	});

	test('eval artifact drawer frames the evidence reference as review metadata', async ({page}) => {
		await page.addInitScript(() => {
			Reflect.set(globalThis, 'DEMO_MODE', true);
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		await page.getByTestId('eval-run-plan-open').click();
		const detail = page.getByTestId('eval-harness-command-detail');
		await expect(detail).toContainText(/quick gtm eval batch/i, {timeout: 10_000});
		await detail.getByRole('button', {name: /open review evidence/i}).click();

		const artifactPanel = page.getByTestId('eval-artifact-panel');
		await expect(artifactPanel).toBeVisible();
		await expect(artifactPanel).toContainText(/evidence artifact/i);
		await expect(artifactPanel).toContainText(/local evidence reference/i);
		await expect(artifactPanel).not.toContainText(/local path/i);
		await expect(artifactPanel).not.toContainText(/evidence artifact path/i);
		await expect(page.getByTestId('eval-artifact-path')).toContainText(/source evidence · [a-z\d-]+/i);
		await expect(page.getByTestId('eval-artifact-path')).not.toContainText(/fixtures\/runs|eval-runs\.json/i);
		await expect(artifactPanel).toContainText(/normalized payload/i);
	});

	test('eval artifact drawer stays inside the console column at mid width', async ({page}) => {
		await page.setViewportSize({width: 1000, height: 720});
		await page.route('**/unpkg.com/@elevenlabs/**', async route => route.abort('blockedbyclient'));
		await page.addInitScript(() => {
			Reflect.set(globalThis, 'DEMO_MODE', true);
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		await page.getByTestId('eval-command-open-artifact').click();
		const artifactPanel = page.getByTestId('eval-artifact-panel');
		await expect(artifactPanel).toBeVisible();
		await expect(page.getByTestId('eval-artifact-path')).toContainText(/source evidence · [a-z\d-]+/i);
		await expect(page.getByTestId('eval-artifact-path')).not.toContainText(/fixtures\/runs|eval-runs\.json/i);

		const layout = await page.evaluate(() => {
			const scroll = document.querySelector('main.scroll');
			const panel = document.querySelector('[data-testid="eval-artifact-panel"]');
			const pane = document.querySelector('[data-testid="eval-artifact-panel"] .workflow-popout__pane');
			const facts = document.querySelector('[data-testid="eval-artifact-panel"] .artifact-drawer__facts');
			const panelBox = panel?.getBoundingClientRect();
			const paneBox = pane?.getBoundingClientRect();
			const factBoxes = facts
				? [...facts.children].map(child => (child as HTMLElement).getBoundingClientRect())
				: [];

			return {
				mainClientWidth: scroll?.clientWidth ?? 0,
				mainScrollWidth: scroll?.scrollWidth ?? 0,
				panelRight: panelBox?.right ?? 0,
				paneRight: paneBox?.right ?? 0,
				factsClientWidth: facts?.clientWidth ?? 0,
				factsScrollWidth: facts?.scrollWidth ?? 0,
				pathFactWidth: facts?.querySelector('.artifact-drawer__fact--path')?.getBoundingClientRect().width ?? 0,
				factsInsidePane: factBoxes.every(box => !paneBox || box.left >= paneBox.left - 1 && box.right <= paneBox.right + 1),
			};
		});

		expect(
			layout.mainScrollWidth,
			`artifact drawer should not create horizontal scroll in main: ${JSON.stringify(layout)}`,
		).toBeLessThanOrEqual(layout.mainClientWidth + 1);
		expect(
			layout.factsScrollWidth,
			`artifact metadata grid should shrink inside the drawer: ${JSON.stringify(layout)}`,
		).toBeLessThanOrEqual(layout.factsClientWidth + 1);
		expect(
			layout.pathFactWidth,
			`evidence reference should be a reviewable metadata row, not a cramped KPI tile: ${JSON.stringify(layout)}`,
		).toBeGreaterThanOrEqual(layout.factsClientWidth * 0.9);
		expect(layout.factsInsidePane, `artifact metadata cells should stay inside the pane: ${JSON.stringify(layout)}`).toBe(true);
		expect(layout.panelRight, `artifact drawer should stay inside the content gutter: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.paneRight + 1);
	});

	test('public landing links point at console Evals, not the legacy dashboard', async ({page}) => {
		await page.goto('/');

		await expect(page.locator('a[href="/evaluation/"]')).toHaveCount(0);
		for (const link of await page.locator('a', {hasText: /evals|evals dashboard/i}).all()) {
			await expect(link).toHaveAttribute('href', '/console/?route=evals');
		}
	});

	test('compatibility document is only a redirect bridge, not a second dashboard', async ({request}) => {
		const response = await request.get('/evaluation/');
		expect(response.ok()).toBe(true);

		const html = await response.text();
		expect(html).toContain('/console/?route=evals');
		expect(html).not.toContain('Evaluation Dashboard');
		expect(html).not.toContain('filter-version');
		expect(html).not.toContain('runs-table');
	});

	test('global coach launcher stays in the viewport corner without covering eval controls', async ({page}) => {
		await page.setViewportSize({width: 1280, height: 720});
		await page.route('**/unpkg.com/@elevenlabs/**', async route => route.abort('blockedbyclient'));
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const launcher = page.locator('.coach-launcher');
		const runPlan = page.locator('[data-testid="eval-run-plan-summary"]');
		const commandCenter = page.locator('[data-testid="eval-command-center"]');
		await expect(launcher).toBeVisible();
		await expect(runPlan).toBeVisible();
		await expect(commandCenter).toBeVisible();

		const layout = await page.evaluate(() => {
			const rect = (selector: string) => {
				const box = document.querySelector(selector)?.getBoundingClientRect();
				return box
					? {
						left: box.left, right: box.right, top: box.top, bottom: box.bottom,
					}
					: null;
			};

			const overlaps = (
				a: {left: number; right: number; top: number; bottom: number} | null | undefined,
				b: {left: number; right: number; top: number; bottom: number} | null | undefined,
			) => {
				if (!a || !b) {
					return true;
				}

				return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
			};

			const launcherBox = rect('.coach-launcher');
			const launcherLabel = document.querySelector('.coach-launcher__label');
			const launcherLabelStyle = launcherLabel ? getComputedStyle(launcherLabel) : null;
			return {
				bottomOffset: launcherBox ? window.innerHeight - launcherBox.bottom : Number.POSITIVE_INFINITY,
				height: launcherBox?.bottom && launcherBox?.top ? launcherBox.bottom - launcherBox.top : 0,
				labelDisplay: launcherLabelStyle?.display || '',
				rightOffset: launcherBox ? window.innerWidth - launcherBox.right : Number.POSITIVE_INFINITY,
				topOffset: launcherBox ? launcherBox.top : Number.POSITIVE_INFINITY,
				overlapsCommandCenter: overlaps(launcherBox, rect('[data-testid="eval-command-center"]')),
				overlapsRunPlan: overlaps(launcherBox, rect('[data-testid="eval-run-plan-summary"]')),
				width: launcherBox?.right && launcherBox?.left ? launcherBox.right - launcherBox.left : 0,
			};
		});

		expect(layout.topOffset, `coach launcher should stay in the compact top workbench corner on Evals: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(72);
		expect(layout.rightOffset, `coach launcher should stay near the viewport right edge: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(40);
		expect(layout.width, `Evals already has native ElevenLabs controls, so the global launcher should stay compact: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(48);
		expect(layout.height, `compact Evals launcher should remain a touchable square: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(44);
		expect(layout.labelDisplay, `Evals should not render a duplicate Coach pill label: ${JSON.stringify(layout)}`).toBe('none');
		expect(layout.overlapsCommandCenter, 'global coach launcher must not sit on the Evals command center').toBe(false);
		expect(layout.overlapsRunPlan, 'global coach launcher must not obscure the eval run-plan summary').toBe(false);
	});

	for (const width of [1280, 1800]) {
		test(`Evals top cards reserve a gutter for the compact Coach escape hatch at ${width}px`, async ({page}) => {
			await page.setViewportSize({width, height: 720});
			await page.route('**/unpkg.com/@elevenlabs/**', async route => route.abort('blockedbyclient'));
			await page.addInitScript(() => {
				Reflect.set(globalThis, 'DEMO_MODE', true);
			});
			await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
			await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

			const layout = await page.evaluate(() => {
				const read = (selector: string) => {
					const box = document.querySelector(selector)?.getBoundingClientRect();
					return box
						? {
							left: box.left, right: box.right,
						}
						: null;
				};

				return {
					commandCenter: read('[data-testid="eval-command-center"]'),
					launcher: read('.coach-launcher'),
					runPlan: read('[data-testid="eval-run-plan-summary"]'),
				};
			});

			expect(layout.launcher, 'compact Coach launcher should be visible').not.toBeNull();
			for (const {name, box} of [
				{name: 'commandCenter', box: layout.commandCenter},
				{name: 'runPlan', box: layout.runPlan},
			]) {
				expect(box, `${name} should render`).not.toBeNull();
				if (!box || !layout.launcher) {
					continue;
				}

				expect(
					box.right,
					`${name} should stop before the Coach escape hatch gutter: ${JSON.stringify(layout)}`,
				).toBeLessThanOrEqual(layout.launcher.left - 8);
			}
		});
	}

	for (const width of [1000, 1280]) {
		test(`global coach launcher does not sit on the Evals KPI row at ${width}px`, async ({page}) => {
			await page.setViewportSize({width, height: 720});
			await page.route('**/unpkg.com/@elevenlabs/**', async route => route.abort('blockedbyclient'));
			await page.addInitScript(() => {
				(globalThis as any).DEMO_MODE = true;
			});
			await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
			await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

			await expect(page.locator('.coach-launcher')).toBeVisible();
			await expect(page.locator('.eval-stats')).toBeVisible();

			const layout = await page.evaluate(() => {
				const launcher = document.querySelector('.coach-launcher')?.getBoundingClientRect();
				const statBoxes = [...document.querySelectorAll('.eval-stats .stat')].map((element, index) => {
					const box = element.getBoundingClientRect();
					return {
						bottom: box.bottom,
						index,
						left: box.left,
						right: box.right,
						top: box.top,
					};
				});
				const overlaps = launcher
					? statBoxes.filter(box => launcher.left < box.right && launcher.right > box.left && launcher.top < box.bottom && launcher.bottom > box.top)
					: statBoxes;
				return {
					launcher: launcher
						? {
							bottom: launcher.bottom, left: launcher.left, right: launcher.right, top: launcher.top,
						}
						: null,
					overlaps,
					statBoxes,
				};
			});

			expect(layout.overlaps, `coach launcher should have its own Evals KPI gutter: ${JSON.stringify(layout)}`).toEqual([]);
		});
	}

	test('local run plan stays attached to the Evals command center', async ({page}) => {
		await page.setViewportSize({width: 1280, height: 720});
		await page.addInitScript(() => {
			Object.assign(globalThis, {DEMO_MODE: true});
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		await expect(page.getByTestId('eval-command-center')).toBeVisible();
		await expect(page.getByTestId('eval-run-plan-summary')).toBeVisible();
		const defaultOrder = await page.evaluate(() => {
			const read = (selector: string) => {
				const box = document.querySelector(selector)?.getBoundingClientRect();
				return box ? {bottom: box.bottom, top: box.top} : null;
			};

			return {
				command: read('[data-testid="eval-command-center"]'),
				grid: read('.evals-grid'),
				stats: read('.eval-stats'),
				summary: read('[data-testid="eval-run-plan-summary"]'),
			};
		});

		const commandBottom = defaultOrder.command?.bottom ?? 0;
		const statsTop = defaultOrder.stats?.top ?? 0;
		const gridTop = defaultOrder.grid?.top ?? 0;
		expect(
			defaultOrder.summary?.top,
			'run plan should sit immediately after the command center, not below the entire eval workspace',
		).toBeGreaterThanOrEqual(commandBottom - 1);
		expect(
			defaultOrder.summary?.bottom,
			'run plan should appear before metrics and suites',
		).toBeLessThanOrEqual(statsTop);
		expect(
			defaultOrder.summary?.top,
			'run plan summary must not render after the suites grid',
		).toBeLessThan(gridTop);

		await page.getByTestId('eval-run-plan-open').click();
		await expect(page.locator('.eval-bridge-popout')).toBeVisible();
		const expandedOrder = await page.evaluate(() => {
			const read = (selector: string) => {
				const box = document.querySelector(selector)?.getBoundingClientRect();
				return box ? {bottom: box.bottom, top: box.top} : null;
			};

			return {
				detail: read('.eval-bridge-popout'),
				stats: read('.eval-stats'),
				summary: read('[data-testid="eval-run-plan-summary"]'),
			};
		});

		const summaryBottom = expandedOrder.summary?.bottom ?? 0;
		const expandedStatsTop = expandedOrder.stats?.top ?? 0;
		expect(
			expandedOrder.detail?.top,
			'run plan details should open directly under the summary',
		).toBeGreaterThanOrEqual(summaryBottom - 1);
		expect(
			expandedOrder.detail?.bottom,
			'run plan details should remain before the KPI grid',
		).toBeLessThanOrEqual(expandedStatsTop);
	});

	test('run detail labels prompt and review evidence metadata without exposing fixture plumbing', async ({page}) => {
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const meta = page.locator('.eval-meta-strip').first();
		await expect(meta).toBeVisible();
		await expect(meta).toContainText(/scenario\s*[a-z\d-]+/i);
		await expect(meta).toContainText(/prompt\s*active prompt profile/i);
		await expect(meta).toContainText(/evidence\s*source evidence · [a-z\d-]+/i);
		await expect(meta).not.toContainText(/fixtures\/runs|eval-runs\.json/i);
		await expect(meta).not.toContainText(/0\.0\.1/i);

		const chips = (await meta.locator('> .mono').allTextContents()).map(text => text.trim());
		expect(chips).not.toContain('0.0.1');
	});

	test('run rows use readable scenario titles while preserving raw scenario ids', async ({page}) => {
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const firstRun = page.locator('.eval-run-row').first();
		await expect(firstRun.locator('.eval-run-row__title')).toHaveText('Multi Turn Tool Loop');
		await expect(firstRun.locator('[data-testid="eval-run-row-scenario-id"]')).toContainText('scenario multi-turn-tool-loop');
		await expect(firstRun.locator('.eval-run-row__title')).not.toContainText('multi-turn-tool-loop');

		await firstRun.click();
		await expect(page.locator('.card__title:has-text("run detail")').first()).toContainText('Multi Turn Tool Loop');
		await expect(page.locator('.eval-meta-strip').first()).toContainText(/scenario\s*multi-turn-tool-loop/i);
	});

	test('run-detail transcript controls stay inside the desktop console column', async ({page}) => {
		await page.setViewportSize({width: 1440, height: 900});
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const toolbar = page.locator('.el-transcript__toolbar').first();
		await expect(toolbar).toBeVisible();

		const geometry = await toolbar.evaluate(node => {
			const root = node as HTMLElement;
			const rootRect = root.getBoundingClientRect();
			const viewportRight = document.documentElement.clientWidth;
			const children = [...root.children].map(child => {
				const rect = (child as HTMLElement).getBoundingClientRect();
				return {
					className: String((child as HTMLElement).className || child.tagName),
					right: rect.right,
					width: rect.width,
				};
			});

			return {
				children,
				clientWidth: root.clientWidth,
				rootRight: rootRect.right,
				scrollWidth: root.scrollWidth,
				viewportRight,
			};
		});

		expect(
			geometry.scrollWidth,
			`transcript toolbar should not create internal horizontal scroll: ${JSON.stringify(geometry)}`,
		).toBeLessThanOrEqual(geometry.clientWidth + 1);
		expect(
			geometry.children.every(child => child.right <= Math.min(geometry.rootRight, geometry.viewportRight) + 1),
			`transcript toolbar children should stay inside the console column: ${JSON.stringify(geometry)}`,
		).toBe(true);
	});
});
