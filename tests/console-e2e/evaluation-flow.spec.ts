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
		await expect(page.locator('#console-page-title')).toContainText('Evals');
		await expect(page.locator('.page--evals > .ph')).toHaveCount(0);
		await expect(page.locator('[data-testid="eval-control-rail"]')).toBeVisible();
		await expect(page.locator('[data-testid="eval-run-plan-summary"]')).toBeVisible();
		await expect(page.locator('.eval-convai-frame')).toBeVisible();
		await expect(page.locator('h1', {hasText: /^Evaluation Dashboard$/})).toHaveCount(0);
	});

	test('native Evals starts with dense controls instead of a visible page-title block', async ({page}) => {
		await page.setViewportSize({width: 1280, height: 720});
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const rail = page.locator('[data-testid="eval-control-rail"]');
		await expect(rail).toBeVisible();
		await expect(rail.getByRole('button', {name: /^fail$/i})).toBeVisible();
		await expect(rail.getByRole('button', {name: /run plan/i})).toBeVisible();
		await expect(page.locator('.page--evals > .ph')).toHaveCount(0);

		const geometry = await page.evaluate(() => {
			const pageRoot = document.querySelector('.page--evals');
			const railNode = document.querySelector('[data-testid="eval-control-rail"]');
			const center = document.querySelector('[data-testid="eval-command-center"]');
			const h1 = document.querySelector('#console-page-title');
			const pageChildren = [...(pageRoot?.children || [])].map(child => ({
				tag: child.tagName,
				testid: child.dataset.testid || '',
				id: child.id || '',
			}));
			const railBox = railNode?.getBoundingClientRect();
			const centerBox = center?.getBoundingClientRect();
			const h1Box = h1?.getBoundingClientRect();
			return {
				firstVisibleTestId: pageChildren.find(child => child.id !== 'console-page-title')?.testid,
				railBottom: railBox?.bottom ?? 0,
				centerTop: centerBox?.top ?? 0,
				h1Width: h1Box?.width ?? 0,
				h1Height: h1Box?.height ?? 0,
			};
		});

		expect(geometry.firstVisibleTestId).toBe('eval-control-rail');
		expect(geometry.railBottom, 'control rail should lead directly into the command center').toBeLessThanOrEqual(geometry.centerTop + 12);
		expect(geometry.h1Width, 'route h1 should exist for the landmark without becoming a visual page title').toBeLessThanOrEqual(1);
		expect(geometry.h1Height, 'route h1 should exist for the landmark without becoming a visual page title').toBeLessThanOrEqual(1);
	});

	test('native Evals evidence grid stays bounded at laptop width', async ({page}) => {
		await page.setViewportSize({width: 1366, height: 768});
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		await expect(page.locator('.evals-grid')).toBeVisible();

		const geometry = await page.evaluate(() => {
			const grid = document.querySelector('.evals-grid') as HTMLElement | null;
			const main = document.querySelector('main.scroll') as HTMLElement | null;
			const gridBox = grid?.getBoundingClientRect();
			const children = [...(grid?.children || [])]
				.filter((element): element is HTMLElement => element instanceof HTMLElement)
				.map(element => {
					const box = element.getBoundingClientRect();
					return {
						left: box.left,
						right: box.right,
						top: box.top,
						width: box.width,
						scrollWidth: element.scrollWidth,
						clientWidth: element.clientWidth,
					};
				});
			const firstRowTop = Math.min(...children.map(child => child.top));
			const firstRow = children.filter(child => Math.abs(child.top - firstRowTop) <= 2);

			return {
				gridClientWidth: grid?.clientWidth ?? 0,
				gridScrollWidth: grid?.scrollWidth ?? 0,
				gridWidth: gridBox?.width ?? 0,
				mainClientWidth: main?.clientWidth ?? 0,
				mainScrollWidth: main?.scrollWidth ?? 0,
				documentClientWidth: document.documentElement.clientWidth,
				documentScrollWidth: document.documentElement.scrollWidth,
				firstRow,
				firstRowColumnCount: firstRow.length,
			};
		});

		expect(geometry.gridScrollWidth, `Evals grid should not hide a horizontal scroll trap: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.gridClientWidth + 1);
		expect(geometry.mainScrollWidth, `Console scroller should stay bounded on Evals: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.mainClientWidth + 1);
		expect(geometry.documentScrollWidth, `Document should not overflow on Evals: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.documentClientWidth + 1);
		expect(geometry.firstRowColumnCount, `Evals evidence should remain a two-column workbench at laptop width: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(2);
		for (const column of geometry.firstRow) {
			expect(column.scrollWidth, `Evals column leaked internal horizontal scroll: ${JSON.stringify(column)}`).toBeLessThanOrEqual(column.clientWidth + 1);
			expect(column.width, `Evals column collapsed into cramped evidence: ${JSON.stringify(column)}`).toBeGreaterThanOrEqual(320);
		}
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

	test('global coach launcher does not cover the local eval run plan', async ({page}) => {
		await page.setViewportSize({width: 1280, height: 720});
		await page.route('**/unpkg.com/@elevenlabs/**', async route => route.abort('blockedbyclient'));
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const launcher = page.locator('.coach-launcher');
		const runPlan = page.locator('[data-testid="eval-run-plan-summary"]');
		await expect(launcher).toBeVisible();
		await expect(runPlan).toBeVisible();

		const overlaps = await page.evaluate(() => {
			const a = document.querySelector('.coach-launcher')?.getBoundingClientRect();
			const b = document.querySelector('[data-testid="eval-run-plan-summary"]')?.getBoundingClientRect();
			if (!a || !b) {
				return true;
			}

			return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
		});
		expect(overlaps, 'global coach launcher must not obscure the eval run-plan summary').toBe(false);
	});

	test('global coach launcher does not cover eval control rail actions', async ({page}) => {
		await page.setViewportSize({width: 1366, height: 768});
		await page.route('**/unpkg.com/@elevenlabs/**', async route => route.abort('blockedbyclient'));
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const launcher = page.locator('.coach-launcher');
		const controlRail = page.locator('[data-testid="eval-control-rail"]');
		const newSuite = page.locator('[data-testid="eval-new-suite-open"]');
		await expect(launcher).toBeVisible();
		await expect(controlRail).toBeVisible();
		await expect(newSuite).toBeVisible();

		const geometry = await page.evaluate(() => {
			const launcher = document.querySelector('.coach-launcher')?.getBoundingClientRect();
			const rail = document.querySelector('[data-testid="eval-control-rail"]')?.getBoundingClientRect();
			const button = document.querySelector('[data-testid="eval-new-suite-open"]')?.getBoundingClientRect();
			const overlaps = (a: DOMRect | undefined, b: DOMRect | undefined) => {
				if (!a || !b) {
					return true;
				}

				return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
			};

			return {
				launcherBottom: launcher?.bottom ?? 0,
				launcherTop: launcher?.top ?? 0,
				railTop: rail?.top ?? 0,
				railBottom: rail?.bottom ?? 0,
				overlapsRail: overlaps(launcher, rail),
				overlapsNewSuite: overlaps(launcher, button),
			};
		});

		expect(geometry.overlapsRail, 'global coach launcher must not cover the eval header controls').toBe(false);
		expect(geometry.overlapsNewSuite, 'global coach launcher must not cover New suite').toBe(false);
		expect(geometry.launcherBottom, 'eval coach launcher should stay in the shell, above the route control rail').toBeLessThanOrEqual(geometry.railTop);
	});

	test('native Evals control rail keeps suite creation compact at half width', async ({page}) => {
		await page.setViewportSize({width: 840, height: 720});
		await page.route('**/unpkg.com/@elevenlabs/**', async route => route.abort('blockedbyclient'));
		await page.addInitScript(() => {
			Object.assign(globalThis, {DEMO_MODE: true});
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const geometry = await page.evaluate(() => {
			const rail = document.querySelector('[data-testid="eval-control-rail"]');
			const railBox = rail?.getBoundingClientRect();
			const buttons = [...document.querySelectorAll('.eval-control-rail__actions .btn')]
				.filter((element): element is HTMLElement => element instanceof HTMLElement)
				.map(element => {
					const box = element.getBoundingClientRect();
					return {
						text: element.textContent?.trim().replaceAll(/\s+/gv, ' ') ?? '',
						top: Math.round(box.top),
						width: box.width,
						clientWidth: element.clientWidth,
						scrollWidth: element.scrollWidth,
					};
				});
			const suiteButton = buttons.find(button => /new suite/iv.test(button.text));
			return {
				railHeight: railBox?.height ?? 0,
				railWidth: railBox?.width ?? 1,
				actionRows: new Set(buttons.map(button => button.top)).size,
				buttons,
				suiteButtonShare: suiteButton == null ? 1 : suiteButton.width / (railBox?.width ?? suiteButton.width),
				textFits: buttons.every(button => button.scrollWidth <= button.clientWidth + 1),
			};
		});

		expect(geometry.buttons.map(button => button.text)).toEqual([
			'Artifacts',
			'Policy',
			'Run plan',
			'New suite',
		]);
		expect(geometry.actionRows, `Evals rail actions should stay in one compact row: ${JSON.stringify(geometry)}`).toBe(1);
		expect(geometry.suiteButtonShare, `New suite should not become a full-width hero CTA: ${JSON.stringify(geometry)}`).toBeLessThan(0.35);
		expect(geometry.railHeight, `Evals rail should stay compact at half width: ${JSON.stringify(geometry)}`).toBeLessThan(130);
		expect(geometry.textFits, `Evals rail button labels should fit: ${JSON.stringify(geometry)}`).toBe(true);
	});

	test('run-plan drawer suppresses the global coach launcher while local controls own the screen', async ({page}) => {
		await page.setViewportSize({width: 1280, height: 720});
		await page.route('**/unpkg.com/@elevenlabs/**', async route => route.abort('blockedbyclient'));
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const launcher = page.locator('.coach-launcher');
		await expect(launcher).toBeVisible();

		await page.locator('[data-testid="eval-header-run-plan-open"]').click();
		const drawer = page.locator('[data-testid="eval-harness-bridge"]');
		await expect(drawer).toBeVisible();
		await expect(launcher).toBeHidden();
		await expect(drawer.getByRole('button', {name: /copy command/i})).toBeVisible();
		await expect(drawer.getByRole('button', {name: /open local run artifact/i})).toBeVisible();
		await expect(drawer.getByRole('button', {name: /open local agent admin/i})).toBeVisible();

		await drawer.getByRole('button', {name: /close eval run plan/i}).click();
		await expect(drawer).toHaveCount(0);
		await expect(launcher).toBeVisible();
	});

	test('suite rows keep pass-rate and delta columns bounded inside the native Evals card', async ({page}) => {
		await page.setViewportSize({width: 1280, height: 720});
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const rows = await page.locator('.eval-suite-row__select').evaluateAll(nodes => nodes.map(node => {
			const row = node.getBoundingClientRect();
			const copy = node.querySelector('.eval-suite-row__copy')?.getBoundingClientRect();
			const metric = node.querySelector('.eval-suite-row__metric')?.getBoundingClientRect();
			const delta = node.querySelector('.eval-suite-row__delta')?.getBoundingClientRect();
			return {
				text: node.textContent?.trim().replaceAll(/\s+/g, ' ').slice(0, 90),
				scrollWidth: (node as HTMLElement).scrollWidth,
				clientWidth: (node as HTMLElement).clientWidth,
				rowLeft: row.left,
				rowRight: row.right,
				copyWidth: copy?.width ?? 0,
				copyRight: copy?.right ?? 0,
				metricLeft: metric?.left ?? 0,
				metricRight: metric?.right ?? 0,
				deltaLeft: delta?.left ?? 0,
				deltaRight: delta?.right ?? 0,
			};
		}));

		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(row.scrollWidth, `${row.text} leaked horizontal scroll`).toBeLessThanOrEqual(row.clientWidth + 1);
			expect(row.copyWidth, `${row.text} copy column collapsed`).toBeGreaterThanOrEqual(120);
			expect(row.copyRight, `${row.text} copy overlapped pass-rate column`).toBeLessThanOrEqual(row.metricLeft + 1);
			expect(row.metricRight, `${row.text} pass-rate column overlapped delta`).toBeLessThanOrEqual(row.deltaLeft + 1);
			expect(row.deltaRight, `${row.text} delta escaped row`).toBeLessThanOrEqual(row.rowRight + 1);
		}
	});

	test('run-detail transcript replay toolbar keeps the waveform readable and bounded', async ({page}) => {
		await page.setViewportSize({width: 1440, height: 900});
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const toolbar = page.locator('.eval-detail-grid .el-transcript__toolbar').first();
		await expect(toolbar).toBeVisible();

		const metrics = await toolbar.evaluate(node => {
			const rectFor = (element: Element | null) => {
				if (!element) {
					return null;
				}

				const rect = element.getBoundingClientRect();
				const html = element as HTMLElement;
				return {
					top: rect.top,
					bottom: rect.bottom,
					left: rect.left,
					right: rect.right,
					width: rect.width,
					scrollWidth: html.scrollWidth,
					clientWidth: html.clientWidth,
				};
			};

			const voice = rectFor(node.querySelector('.el-voice-btn'));
			const status = rectFor(node.querySelector('.el-transcript__replay-status'));
			const barsElement = node.querySelector('.el-bars');
			const bars = rectFor(barsElement);
			const spans = [...barsElement?.querySelectorAll('span') || []]
				.map(span => span.getBoundingClientRect());

			return {
				voice,
				status,
				bars,
				minSpanLeft: Math.min(...spans.map(rect => rect.left)),
				maxSpanRight: Math.max(...spans.map(rect => rect.right)),
			};
		});

		expect(metrics.voice).not.toBeNull();
		expect(metrics.status).not.toBeNull();
		expect(metrics.bars).not.toBeNull();
		expect(metrics.status!.top, 'status should sit below the replay button, not squeeze beside it').toBeGreaterThanOrEqual(metrics.voice!.bottom - 1);
		expect(metrics.bars!.top, 'waveform should sit below the status chip, not collapse into a side sliver').toBeGreaterThanOrEqual(metrics.status!.bottom - 1);
		expect(metrics.bars!.width, 'waveform should remain inspectable in the run-detail side column').toBeGreaterThanOrEqual(160);
		expect(metrics.bars!.scrollWidth, 'waveform children should not force hidden horizontal overflow').toBeLessThanOrEqual(metrics.bars!.clientWidth + 1);
		expect(metrics.minSpanLeft).toBeGreaterThanOrEqual(metrics.bars!.left - 1);
		expect(metrics.maxSpanRight).toBeLessThanOrEqual(metrics.bars!.right + 1);
	});

	test('command center does not present loading evidence as a ready regression', async ({page}) => {
		let releaseRuns!: () => void;
		const runsGate = new Promise<void>(resolve => {
			releaseRuns = resolve;
		});
		await page.route('**/api/eval-runs', async route => {
			await runsGate;
			await route.continue();
		});

		await page.goto('/console/?route=evals&live=1', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const center = page.locator('[data-testid="eval-command-center"]');
		await expect(center).toHaveAttribute('data-state', 'loading');
		await expect(center).toContainText(/loading run evidence/i);
		await expect(center.locator('[data-testid="eval-active-regression-review-copy"]')).toContainText(/loading harness run evidence/i);
		await expect(center).not.toContainText(/no failed axes selected/i);
		await expect(center.locator('.badge')).toContainText(/loading/i);

		releaseRuns();
		await expect(center).toHaveAttribute('data-state', 'fail', {timeout: 10_000});
		await expect(center.locator('[data-testid="eval-active-regression-review-copy"]')).toContainText(/failed judge axis/i);
	});

	test('command center actions open local evidence and local agent admin', async ({page}) => {
		await page.setViewportSize({width: 1280, height: 720});
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const center = page.locator('[data-testid="eval-command-center"]');
		await expect(center).toBeVisible();
		await expect(center.locator('[data-testid="eval-command-center-review-evidence"]')).toBeVisible();
		await expect(center.locator('[data-testid="eval-command-center-sync-context"]')).toBeVisible();
		await expect(center.locator('[data-testid="eval-command-center-open-agent-admin"]')).toBeVisible();
		await expect(center.locator('a[href*="elevenlabs.io"], a[href*="elevenlabs.com"]')).toHaveCount(0);

		await center.locator('[data-testid="eval-command-center-sync-context"]').click();
		let artifact = page.locator('[data-testid="eval-artifact-panel"]');
		await expect(artifact).toBeVisible();
		await expect(artifact).toContainText(/artifact review packet/i);
		const syncedContext = await page.evaluate(() => (globalThis as any).AppContext.get());
		expect(syncedContext.extra.triggered_from).toBe('evals-sync');
		expect(syncedContext.extra.selected_eval_run).toMatch(/\S/);
		expect(syncedContext.extra.selected_agent_key).toMatch(/\S/);
		expect(syncedContext.extra.eval_evidence_path).toMatch(/\.json$/);
		await expect(center.locator('a[href*="elevenlabs.io"], a[href*="elevenlabs.com"]')).toHaveCount(0);

		await center.locator('[data-testid="eval-command-center-review-evidence"]').click();
		artifact = page.locator('[data-testid="eval-artifact-panel"]');
		await expect(artifact).toBeVisible();
		await expect(artifact).toHaveAttribute('id', 'eval-artifact-panel');
		await expect(artifact).toContainText(/artifact review packet/i);
		await expect(artifact).toContainText(/review evidence/i);
		await expect(artifact.locator('[data-testid="eval-artifact-path"]')).toContainText(/^local-review:\/\/eval-runs\/.+\/result\.json$/);
		await expect(artifact.locator('[data-testid="eval-artifact-path"]')).not.toContainText(/fixtures/i);
		const locatorLayout = await artifact.locator('[data-testid="eval-artifact-path"]').evaluate(element => {
			const fact = element.parentElement as HTMLElement | null;
			const facts = fact?.parentElement as HTMLElement | null;
			const factBox = fact?.getBoundingClientRect();
			const factsBox = facts?.getBoundingClientRect();
			return {
				factWidth: factBox?.width ?? 0,
				factsWidth: factsBox?.width ?? 1,
			};
		});
		expect(locatorLayout.factWidth, `review locator should span the metadata row instead of wrapping in a cramped card: ${JSON.stringify(locatorLayout)}`).toBeGreaterThan(locatorLayout.factsWidth * 0.9);

		await page.locator('[data-testid="eval-command-center-open-agent-admin"]').click();
		await expect(page.locator('.tb__crumb--active')).toContainText('Agents');
		await expect(page.locator('[data-testid="agent-eval-handoff-banner"]')).toBeVisible();
		await expect(page.locator('[data-testid="agent-eval-handoff-banner"]')).toContainText(/run evidence/i);
		await expect(page.locator('[data-testid="agent-eval-handoff-banner"]')).toContainText(/local-review:\/\/eval-runs\/.+\/result\.json/i);
		await expect(page.locator('[data-testid="agent-eval-handoff-banner"]')).not.toContainText(/fixtures/i);
		await expect(page.locator('[data-testid="agent-eval-handoff-banner"] a[href*="elevenlabs.io"], [data-testid="agent-eval-handoff-banner"] a[href*="elevenlabs.com"]')).toHaveCount(0);
		await expect(page.locator('[data-testid="agents-elevenlabs-escape"]')).toHaveCount(0);
		await expect(page.locator('a[href*="elevenlabs.io"], a[href*="elevenlabs.com"]')).toHaveCount(0);
	});

	test('run plan makes the local artifact and agent-admin review path actionable', async ({page}) => {
		await page.setViewportSize({width: 1280, height: 720});
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		await expect(page.locator('[data-testid="eval-run-plan-summary-path"]')).toContainText(/command -> local artifact drawer -> local agent admin/i);

		await page.locator('[data-testid="eval-run-plan-open"]').click();
		const bridge = page.locator('[data-testid="eval-harness-bridge"]');
		await expect(bridge).toBeVisible();
		await page.waitForFunction(() => {
			const actions = document.querySelector('[data-testid="eval-harness-bridge"] .eval-run-plan__actions');
			if (!actions) {
				return false;
			}

			const rect = actions.getBoundingClientRect();
			return rect.top >= 0 && rect.bottom <= window.innerHeight;
		});
		const actionPlacement = await bridge.evaluate(node => {
			const actions = node.querySelector('.eval-run-plan__actions')?.getBoundingClientRect();
			const review = node.querySelector('[data-testid="eval-run-plan-review-path"]')?.getBoundingClientRect();
			const externalLinks = node.querySelectorAll('a[href*="elevenlabs.io"], a[href*="elevenlabs.com"]').length;
			return {
				actionsTop: actions?.top ?? 0,
				actionsBottom: actions?.bottom ?? 0,
				reviewTop: review?.top ?? 0,
				externalLinks,
				viewportHeight: window.innerHeight,
			};
		});
		expect(actionPlacement.actionsTop, 'run-plan actions should appear before the explanatory review path').toBeLessThan(actionPlacement.reviewTop);
		expect(actionPlacement.actionsBottom, 'run-plan actions should be usable in the first laptop viewport').toBeLessThanOrEqual(actionPlacement.viewportHeight);
		expect(actionPlacement.externalLinks, 'run-plan drawer should not add another ElevenLabs escape hatch').toBe(0);
		const reviewPath = bridge.locator('[data-testid="eval-run-plan-review-path"]');
		await expect(reviewPath).toContainText(/command/i);
		await expect(reviewPath).toContainText(/artifact review/i);
		await expect(reviewPath).toContainText(/agent admin/i);
		await expect(bridge.locator('[data-testid="eval-run-plan-open-agent-admin"]')).toBeEnabled();

		await bridge.locator('[data-testid="eval-run-plan-open-artifact"]').click();
		const artifact = page.locator('[data-testid="eval-artifact-panel"]');
		await expect(artifact).toBeVisible();
		await expect(artifact).toContainText(/artifact review packet/i);
		await expect(artifact).toContainText(/run evidence|review evidence/i);
		await expect(artifact.locator('[data-testid="eval-artifact-path"]')).toContainText(/^local-review:\/\/eval-runs\/.+\/result\.json$/);
		await expect(artifact.locator('[data-testid="eval-artifact-path"]')).not.toContainText(/fixtures/i);

		await page.locator('[data-testid="eval-header-run-plan-open"]').click();
		await expect(bridge).toBeVisible();
		await bridge.locator('[data-testid="eval-run-plan-open-agent-admin"]').click();
		await expect(page.locator('.tb__crumb--active')).toContainText('Agents');
		await expect(page.locator('[data-testid="agent-eval-handoff-banner"]')).toBeVisible();
		await expect(page.locator('[data-testid="agent-eval-handoff-banner"]')).toContainText(/run evidence/i);
		await expect(page.locator('[data-testid="agent-eval-handoff-banner"] a[href*="elevenlabs.io"]')).toHaveCount(0);
	});

	test('run detail labels prompt and harness metadata instead of exposing a bare version chip', async ({page}) => {
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});

		const meta = page.locator('.eval-meta-strip').first();
		await expect(meta).toBeVisible();
		await expect(meta).toContainText(/scenario\s*[a-z\d-]+/i);
		await expect(meta).toContainText(/prompt\s*prompt\/sewy\/v/i);
		await expect(meta).toContainText(/harness\s*0\.0\.1/i);

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

	test('run and suite selections stay aligned in the Evals command center', async ({page}) => {
		await page.addInitScript(() => {
			(globalThis as any).DEMO_MODE = true;
		});
		await page.goto('/console/?route=evals', {waitUntil: 'domcontentloaded'});
		await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, {timeout: 30_000});
		await expect(page.locator('.eval-run-row')).toHaveCount(8);

		await page.locator('.eval-run-row', {hasText: /Knowledge Base Pricing Question/}).click();
		await expect(page.locator('[data-testid="eval-active-scenario-id"]')).toContainText('knowledge-base-pricing-question');
		await expect(page.locator('[data-testid="eval-active-suite-context"]')).toContainText('Objection — Pricing Pushback');
		await expect(page.locator('.card__title:has-text("suite ·")').first()).toContainText('objection-pricing');
		await expect(page.locator('.eval-suite-detail')).toContainText('Objection — Pricing Pushback');
		await expect(page.locator('.eval-suite-row', {hasText: /Objection — Pricing Pushback/})).toHaveAttribute('data-active', 'true');

		await page.locator('.eval-suite-row', {hasText: /Multi-thread Stakeholder Map/}).getByRole('button').first().click();
		await expect(page.locator('[data-testid="eval-active-scenario-id"]')).toContainText('multi-turn-tool-loop');
		await expect(page.locator('[data-testid="eval-active-suite-context"]')).toContainText('Multi-thread Stakeholder Map');
		await expect(page.locator('.card__title:has-text("suite ·")').first()).toContainText('multithread');
		await expect(page.locator('.eval-run-row', {hasText: /Multi Turn Tool Loop/})).toHaveAttribute('data-active', 'true');
	});
});
