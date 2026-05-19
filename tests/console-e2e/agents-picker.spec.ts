import {test, expect} from './helpers.js';

test('Agents picker rows expose display names, roles, and surface labels from the public registry', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	const picker = page.locator('.agents-picker-card');
	await expect(picker).toBeVisible();

	const list = page.getByRole('list', {name: 'ElevenLabs agents wired into this console'});
	const rows = picker.locator('[data-testid="agents-picker-row"]');
	await expect(list.getByRole('listitem')).toHaveCount(2);
	await expect(rows).toHaveCount(2);

	await expect(rows.nth(0).locator('.agent-row__name')).toHaveText('Sales Coach');
	await expect(rows.nth(0).locator('.agent-row__role')).toHaveText('Deal coaching agent');
	await expect(rows.nth(0).locator('[data-testid="agent-surface-label"]')).toHaveText('all pages');
	await expect(rows.nth(0)).toHaveAccessibleName('Sales Coach Deal coaching agent all pages');
	await expect(rows.nth(0)).toHaveAttribute('aria-pressed', 'false');
	await expect(rows.nth(1).locator('.agent-row__name')).toHaveText('Sarah Intake');
	await expect(rows.nth(1).locator('.agent-row__role')).toHaveText('AI receptionist · answers callers and hands off jobs');
	await expect(rows.nth(1).locator('[data-testid="agent-surface-label"]')).toHaveText('pipeline lead');
	await expect(rows.nth(1)).toHaveAccessibleName('Sarah Intake AI receptionist · answers callers and hands off jobs pipeline lead');
	await expect(rows.nth(1)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('[data-testid="sidebar-agent-route"][data-agent-key="intake"]')).toHaveAttribute('data-active', 'true');

	const text = await picker.textContent();
	expect(text).not.toMatch(/\bglobal\b|\badmin-only\b/u);

	const layout = await rows.first().evaluate(row => {
		const role = row.querySelector('.agent-row__role')?.getBoundingClientRect();
		const surface = row.querySelector('[data-testid="agent-surface-label"]')?.getBoundingClientRect();
		const box = row.getBoundingClientRect();
		return role && surface
			? {
				rowWidth: box.width,
				surfaceSeparatedFromRole: surface.top >= role.bottom - 1 || surface.left >= role.right + 8,
				surfaceContained: surface.right <= box.right - 1,
			}
			: null;
	});

	expect(layout).toEqual({
		rowWidth: expect.any(Number),
		surfaceSeparatedFromRole: true,
		surfaceContained: true,
	});
	expect(layout?.rowWidth).toBeGreaterThanOrEqual(260);
});

test('Agents workspace route resets stale eval context to the receptionist setup', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('[data-testid="sidebar-route"][data-route-id="evals"]').click();
	await expect(page.getByTestId('eval-command-center')).toBeVisible();
	await expect.poll(async () => page.evaluate(() => (globalThis as any).AppContext.get().extra?.selected_agent_key)).toBe('sales_coach');

	await page.locator('[data-testid="sidebar-route"][data-route-id="agents"]').click();

	await expect(page.locator('[data-testid="sidebar-agent-route"][data-agent-key="intake"]')).toHaveAttribute('data-active', 'true');
	await expect(page.locator('[data-testid="agents-picker-row"][data-agent-key="intake"]')).toHaveAttribute('data-active', 'true');
	await expect(page.locator('.agent-route-strip__active')).toContainText('Your AI receptionist');
	await expect(page.locator('[data-testid="phone-setup-greeting-input"]')).toHaveValue(/Hi, this is Sarah with Wranngle/);
	await expect(page.locator('[data-testid="agent-eval-handoff-banner"]')).toHaveCount(0);
	const ctx = await page.evaluate(() => (globalThis as any).AppContext.get().extra);
	expect(ctx.selected_agent_key).toBe('intake');
	expect(ctx.triggered_from).toBe('sidebar-agents-route-nav');
});

test('Agents route starts with the selected local wrapper, not a detached page action header', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('[data-testid="sidebar-route"][data-route-id="agents"]').click();

	const strip = page.locator('.agent-route-strip');
	const settings = page.getByTestId('agents-workspace-settings');
	await expect(strip).toBeVisible();
	await expect(settings).toBeVisible();
	await expect(strip).toContainText('Your AI receptionist');
	await expect(strip).toContainText('Sarah Intake');
	await expect(page.locator('.page--agents > .ph')).toHaveCount(0);
	await expect(page.getByRole('heading', {name: 'Agents'})).toHaveClass('sr-only');

	const layout = await page.evaluate(() => {
		const strip = document.querySelector('.agent-route-strip');
		const settings = document.querySelector('[data-testid="agents-workspace-settings"]');
		const picker = document.querySelector('.agents-picker-card');
		const stripBox = strip?.getBoundingClientRect();
		const settingsBox = settings?.getBoundingClientRect();
		const pickerBox = picker?.getBoundingClientRect();
		return {
			settingsInsideStrip: Boolean(settings && strip?.contains(settings)),
			stripTop: stripBox?.top ?? 9999,
			pickerTop: pickerBox?.top ?? 9999,
			settingsContained: Boolean(stripBox && settingsBox && (
				settingsBox.left >= stripBox.left
				&& settingsBox.right <= stripBox.right
				&& settingsBox.top >= stripBox.top
				&& settingsBox.bottom <= stripBox.bottom
			)),
			horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
		};
	});

	expect(layout.settingsInsideStrip).toBe(true);
	expect(layout.settingsContained).toBe(true);
	expect(layout.stripTop, 'selected-agent strip should lead the page content').toBeLessThan(130);
	expect(layout.pickerTop, 'agent picker should follow the local wrapper strip immediately').toBeLessThan(230);
	expect(layout.horizontalOverflow).toBe(false);
});

test('Agents topbar primary action stays local to ElevenLabs instead of opening callbacks', async ({openConsole, page}) => {
	await page.addInitScript(() => {
		class TestUtterance {
			text: string;
			rate = 1;
			pitch = 1;
			onend: (() => void) | undefined;
			onerror: (() => void) | undefined;

			constructor(text: string) {
				this.text = text;
			}
		}

		Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
			value: TestUtterance,
			configurable: true,
		});
		Object.defineProperty(globalThis, 'speechSynthesis', {
			value: {
				cancel() {
					(globalThis as any).__topbarAgentPreviewCancelled = true;
				},
				speak(utterance: TestUtterance) {
					(globalThis as any).__topbarAgentPreviewText = utterance.text;
				},
			},
			configurable: true,
		});
	});
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('[data-testid="sidebar-route"][data-route-id="agents"]').click();

	const trigger = page.getByRole('button', {name: /^test agent$/i});
	await expect(trigger).toBeVisible();
	await expect(trigger).not.toHaveText(/call back/i);

	await trigger.click();
	const popover = page.locator('#topbar-run-popover');
	await expect(popover).toBeVisible();
	await expect(popover).toContainText('Preview greeting');
	await expect(popover).toContainText('Edit phone setup');
	await expect(popover).toContainText('ElevenLabs settings');
	await expect(popover).not.toContainText(/call a missed number|send a quote follow-up|schedule a job/i);

	await popover.getByRole('button', {name: /preview greeting/i}).click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Agents');
	await expect(page.getByTestId('agent-context-bar')).toContainText('Sarah Intake preview playing locally.');
	await expect(page.getByTestId('phone-setup-preview')).toHaveAttribute('data-active', 'true');
	await expect(page.locator('.toast', {hasText: /callback|opened/i})).toHaveCount(0);
	await expect.poll(async () => page.evaluate(() => (globalThis as any).__topbarAgentPreviewText)).toContain('Hi, this is Sarah with Wranngle');
	const ctx = await page.evaluate(() => (globalThis as any).AppContext.get());
	expect(ctx.extra.run_intent).toBe('agent_preview');
	expect(ctx.extra.selected_agent_key).toBe('intake');
});

test('Agents desktop layout keeps the ConvAI frame and phone setup visible without horizontal overflow', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1440, height: 900});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	const picker = page.locator('.agents-picker-card');
	const playground = page.locator('.agent-playground-card');
	const admin = page.locator('[data-testid="agent-local-admin-panel"]');
	await expect(picker).toBeVisible();
	await expect(playground).toBeVisible();
	await expect(admin).toBeVisible();

	await expect(page.locator('[data-testid="phone-setup-panel"]')).toBeVisible();
	await expect(page.locator('[data-testid="phone-setup-greeting-input"]')).toHaveValue(/Hi, this is Sarah with Wranngle/);
	await expect(page.locator('[data-testid="phone-setup-greeting-input"]')).not.toHaveValue(/Sales Coach/);
	await expect(page.locator('[data-testid="phone-setup-greeting-input"]')).toBeVisible();
	await expect(page.locator('[data-testid="phone-setup-hours-start"]')).toHaveValue('07:00');
	await expect(page.locator('[data-testid="phone-setup-hours-end"]')).toHaveValue('19:00');
	await expect(page.locator('[data-testid="agent-prompt-role-input"]')).toHaveCount(0);
	await expect(page.locator('[data-testid="agent-save-settings"]')).toHaveCount(0);
	await expect(page.locator('.agent-admin-tab')).toHaveCount(0);
	await expect(page.locator('.agent-admin-quick strong')).toHaveText('Sarah Intake');
	await expect(page.locator('[data-testid="agent-local-wrapper-id"]')).toHaveText('greeting · hours · handoff');
	await expect(page.locator('.card__title:has-text("Receptionist setup")')).toBeVisible();
	await expect(page.locator('.card__title:has-text("admin · sales_coach")')).toHaveCount(0);
	await expect(page.locator('[data-testid="agents-elevenlabs-escape"]')).toHaveCount(0);
	await expect(page.locator('a[href*="elevenlabs.io"], a[href*="elevenlabs.com"]')).toHaveCount(0);

	const layout = await page.evaluate(() => {
		const rect = (selector: string) => {
			const node = document.querySelector(selector);
			if (!node) {
				return null;
			}

			const box = node.getBoundingClientRect();
			return {
				left: box.left,
				right: box.right,
				top: box.top,
				bottom: box.bottom,
				width: box.width,
				height: box.height,
			};
		};

		const viewportBottom = window.innerHeight;
		return {
			picker: rect('.agents-picker-card'),
			playground: rect('.agent-playground-card'),
			admin: rect('[data-testid="agent-local-admin-panel"]'),
			phoneSetup: rect('[data-testid="phone-setup-panel"]'),
			convai: rect('[data-testid="agent-playground-convai"]'),
			convaiHost: rect('[data-testid="agent-playground-convai"] .convai-host'),
			viewportBottom,
			horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
		};
	});

	expect(layout.horizontalOverflow).toBe(false);
	expect(layout.picker?.top).toBeLessThan(layout.viewportBottom);
	expect(layout.playground?.top).toBeLessThan(layout.viewportBottom);
	expect(layout.admin?.top).toBeLessThan(layout.viewportBottom);
	expect(layout.convai?.width, 'ConvAI frame should keep a useful chat width beside local phone setup').toBeGreaterThanOrEqual(680);
	expect(layout.convai?.height, 'ConvAI frame should not reserve a giant blank well before phone setup').toBeLessThanOrEqual(330);
	const visibleConvaiHostHeight = Math.min(layout.convaiHost?.bottom ?? 0, layout.viewportBottom)
		- Math.max(layout.convaiHost?.top ?? 0, 0);
	expect(visibleConvaiHostHeight, 'ConvAI chat mount should be visible without an immediate scroll').toBeGreaterThanOrEqual(160);
	expect(layout.playground?.top).toBeGreaterThanOrEqual(layout.picker!.bottom - 1);
	expect(layout.admin?.left, 'phone setup should sit beside the test-call frame on desktop, not below a blank widget well').toBeGreaterThanOrEqual(layout.playground!.right - 1);
	expect(layout.phoneSetup?.top, 'phone setup controls should begin in the first viewport, not hide behind a tall empty widget frame').toBeLessThan(layout.viewportBottom);
});

test('Agents test-call preview exposes a real local play and stop control', async ({openConsole, page}) => {
	await page.addInitScript(() => {
		class TestUtterance {
			text: string;
			rate = 1;
			pitch = 1;
			onend: (() => void) | undefined;
			onerror: (() => void) | undefined;

			constructor(text: string) {
				this.text = text;
			}
		}

		Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
			value: TestUtterance,
			configurable: true,
		});
		Object.defineProperty(globalThis, 'speechSynthesis', {
			value: {
				cancel() {
					(globalThis as any).__greetingPreviewCancelled = true;
				},
				speak(utterance: TestUtterance) {
					(globalThis as any).__greetingPreviewText = utterance.text;
				},
			},
			configurable: true,
		});
	});
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	const contextBar = page.getByTestId('agent-context-bar');
	const inlinePlay = page.getByTestId('agent-playground-play-greeting');
	const phonePreview = page.getByTestId('phone-setup-preview');
	await expect(contextBar).toContainText('Preview the saved greeting before callers hear it.');
	await expect(contextBar).not.toContainText(/press play/i);
	await expect(inlinePlay).toHaveText(/play greeting/i);
	await expect(inlinePlay).toHaveAttribute('aria-pressed', 'false');
	await expect(phonePreview).toHaveAttribute('data-active', 'false');

	await inlinePlay.click();
	await expect(contextBar).toContainText('Sarah Intake preview playing locally.');
	await expect(inlinePlay).toHaveText(/stop preview/i);
	await expect(inlinePlay).toHaveAttribute('aria-pressed', 'true');
	await expect(phonePreview).toHaveAttribute('data-active', 'true');
	await expect(page.locator('.toast', {hasText: /sarah intake preview/i})).toHaveCount(0);
	await expect(page.locator('.agent-playground-frame .el-bars.is-active')).toHaveCount(1);
	await expect(page.locator('.agent-playground-frame .el-orb--talking')).toHaveCount(1);
	await expect.poll(async () => page.evaluate(() => (globalThis as any).__greetingPreviewText)).toContain('Hi, this is Sarah with Wranngle');

	await inlinePlay.click();
	await expect(inlinePlay).toHaveText(/play greeting/i);
	await expect(inlinePlay).toHaveAttribute('aria-pressed', 'false');
	await expect(phonePreview).toHaveAttribute('data-active', 'false');
});

test('Agents greeting preview falls back to a visible local rehearsal when browser audio fails', async ({openConsole, page}) => {
	await page.addInitScript(() => {
		class TestUtterance {
			text: string;
			rate = 1;
			pitch = 1;
			onend: (() => void) | undefined;
			onerror: (() => void) | undefined;

			constructor(text: string) {
				this.text = text;
			}
		}

		Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
			value: TestUtterance,
			configurable: true,
		});
		Object.defineProperty(globalThis, 'speechSynthesis', {
			value: {
				cancel() {},
				speak(utterance: TestUtterance) {
					setTimeout(() => utterance.onerror?.(), 0);
				},
			},
			configurable: true,
		});
	});
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	const contextBar = page.getByTestId('agent-context-bar');
	const inlinePlay = page.getByTestId('agent-playground-play-greeting');
	const phonePreview = page.getByTestId('phone-setup-preview');

	await inlinePlay.click();
	await expect(contextBar).toContainText('Sarah Intake visual preview running; browser audio unavailable.');
	await expect(inlinePlay).toHaveText(/stop preview/i);
	await expect(inlinePlay).toHaveAttribute('aria-pressed', 'true');
	await expect(phonePreview).toHaveAttribute('data-active', 'true');
	await expect(phonePreview).toHaveAttribute('data-preview-mode', 'visual');
	await expect(phonePreview).toContainText(/visual preview running/i);

	await expect(phonePreview).toHaveAttribute('data-active', 'false', {timeout: 4000});
	await expect(inlinePlay).toHaveText(/play greeting/i);
});

test('Agents phone setup hours use clean textbox semantics instead of native time subfield names', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	const opens = page.getByTestId('phone-setup-hours-start');
	const closes = page.getByTestId('phone-setup-hours-end');
	await expect(opens).toHaveAttribute('type', 'text');
	await expect(opens).toHaveAttribute('inputmode', 'numeric');
	await expect(opens).toHaveAccessibleName('Opens');
	await expect(closes).toHaveAccessibleName('Closes');
	await expect(page.getByRole('spinbutton', {name: 'Hours Hours'})).toHaveCount(0);
	await expect(page.getByRole('spinbutton', {name: 'Minutes Minutes'})).toHaveCount(0);
	await expect(page.getByRole('spinbutton', {name: 'AM/PM AM/PM'})).toHaveCount(0);

	await opens.fill('8:30');
	await opens.blur();
	await expect(opens).toHaveValue('08:30');
	await closes.fill('24:00');
	await closes.blur();
	await expect(closes).toHaveValue('19:00');
});

test('Agents laptop layout surfaces phone setup beside the test-call frame', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	await expect(page.locator('.agent-playground-card')).toBeVisible();
	await expect(page.locator('[data-testid="agent-local-admin-panel"]')).toBeVisible();
	await expect(page.locator('[data-testid="phone-setup-panel"]')).toBeVisible();

	const layout = await page.evaluate(() => {
		const rect = (selector: string) => {
			const node = document.querySelector(selector);
			if (!node) {
				return null;
			}

			const box = node.getBoundingClientRect();
			return {
				left: box.left,
				right: box.right,
				top: box.top,
				bottom: box.bottom,
				width: box.width,
				height: box.height,
			};
		};

		return {
			playground: rect('.agent-playground-card'),
			admin: rect('[data-testid="agent-local-admin-panel"]'),
			phoneSetup: rect('[data-testid="phone-setup-panel"]'),
			convai: rect('[data-testid="agent-playground-convai"]'),
			quickWrapper: rect('.agent-admin-quick'),
			viewportBottom: window.innerHeight,
			horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
		};
	});

	expect(layout.horizontalOverflow).toBe(false);
	expect(layout.admin?.top, `phone setup started below the laptop viewport: ${JSON.stringify(layout)}`).toBeLessThan(layout.viewportBottom);
	expect(layout.admin?.left, 'phone setup should sit beside the test-call frame at 1280px').toBeGreaterThanOrEqual(layout.playground!.right - 1);
	expect(layout.phoneSetup?.top, 'editable phone setup fields should start in the first viewport').toBeLessThan(layout.viewportBottom);
	expect(layout.convai?.height, 'test-call frame should not reserve a tall blank well before phone setup').toBeLessThanOrEqual(300);
	const visibleConvaiHeight = Math.min(layout.convai?.bottom ?? 0, layout.viewportBottom)
		- Math.max(layout.convai?.top ?? 0, 0);
	expect(visibleConvaiHeight, `embedded ConvAI frame should be visible above the fold before local wrapper shortcuts: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(120);
	expect(layout.quickWrapper?.top, 'local wrapper shortcut should not push the embedded ConvAI frame below the fold').toBeGreaterThanOrEqual(layout.convai!.bottom - 1);
});

test('Agents status strip uses operator-facing phone setup facts by default', async ({openConsole, page}) => {
	await page.setViewportSize({width: 390, height: 844});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	const facts = page.locator('.agent-route-strip__facts');
	await expect(facts).toBeVisible();
	await expect(facts.locator('[data-testid="agent-route-fact-status"]')).toContainText('Answering now');
	await expect(facts.locator('[data-testid="agent-route-fact-hours"]')).toContainText('M-F 7a-7p');
	await expect(facts.locator('[data-testid="agent-route-fact-handoff"]')).toContainText('Maria after 2 tries');
	await expect(facts).not.toContainText(/surface|chat-or-voice|voice-first|context/i);
	const layout = await facts.evaluate(element => {
		const chips = [...element.querySelectorAll(':scope > span')] as HTMLElement[];
		return chips.map(chip => {
			const label = chip.querySelector('.agent-route-strip__fact-label') as HTMLElement | null;
			const value = chip.querySelector('code') as HTMLElement | null;
			const chipBox = chip.getBoundingClientRect();
			const labelBox = label?.getBoundingClientRect();
			const valueBox = value?.getBoundingClientRect();
			return {
				labelText: label?.textContent?.trim() ?? '',
				text: chip.textContent?.trim().replace(/\s+/g, ' ') ?? '',
				valueText: value?.textContent?.trim() ?? '',
				labelFits: Boolean(labelBox && labelBox.width <= chipBox.width),
				valueFits: Boolean(value && value.scrollWidth <= value.clientWidth + 1),
				valueStartsAfterLabel: Boolean(labelBox && valueBox && valueBox.left > labelBox.left),
				singleLineValue: Boolean(valueBox && labelBox && Math.abs(valueBox.top - labelBox.top) < 3),
			};
		});
	});
	expect(layout).toHaveLength(3);
	expect(layout.every(item => item.labelFits), `agent fact labels should fit: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.every(item => item.valueFits), `agent fact values should fit: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.every(item => item.valueStartsAfterLabel), `agent facts should read as label/value chips: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.every(item => item.singleLineValue), `agent fact values should sit on the same row as their labels: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.some(item => item.labelText.toLowerCase() === 'handoff' && /Maria after 2 tries/i.test(item.valueText))).toBe(true);
	expect(layout.some(item => item.labelText.toLowerCase() === 'handoff' && /Hand off/i.test(item.valueText))).toBe(false);

	await page.locator('[data-testid="agents-picker-row"]').filter({hasText: /sarah intake/i}).click();
	await expect(page.locator('.agent-route-strip__active')).toContainText('Your AI receptionist');
	await expect(facts.locator('[data-testid="agent-route-fact-status"]')).toContainText('Answering now');
	await expect(facts.locator('[data-testid="agent-route-fact-hours"]')).toContainText('M-F 7a-7p');
	await expect(facts.locator('[data-testid="agent-route-fact-handoff"]')).toContainText('Maria after 2 tries');
});

test('Agents desktop status strip keeps local phone facts readable beside settings', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	const strip = page.locator('.agent-route-strip');
	const facts = page.locator('.agent-route-strip__facts > span');
	const settings = page.getByTestId('agents-workspace-settings');
	await expect(strip).toBeVisible();
	await expect(settings).toBeVisible();
	await expect(facts).toHaveCount(3);
	await expect(page.getByTestId('agent-route-fact-handoff')).toContainText('Maria after 2 tries');

	const layout = await strip.evaluate(element => {
		const stripBox = element.getBoundingClientRect();
		const settingsButton = element.querySelector('[data-testid="agents-workspace-settings"]');
		const settingsBox = settingsButton?.getBoundingClientRect();
		const chips = [...element.querySelectorAll('.agent-route-strip__facts > span')] as HTMLElement[];
		return {
			settingsContained: Boolean(settingsBox
				&& settingsBox.left >= stripBox.left
				&& settingsBox.right <= stripBox.right
				&& settingsBox.top >= stripBox.top
				&& settingsBox.bottom <= stripBox.bottom),
			horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
			chips: chips.map(chip => {
				const code = chip.querySelector('code') as HTMLElement | null;
				const chipBox = chip.getBoundingClientRect();
				return {
					text: chip.textContent?.trim().replace(/\s+/g, ' ') ?? '',
					chipContained: chipBox.left >= stripBox.left && chipBox.right <= stripBox.right,
					valueFits: Boolean(code && code.scrollWidth <= code.clientWidth + 1),
				};
			}),
		};
	});

	expect(layout.horizontalOverflow).toBe(false);
	expect(layout.settingsContained, `settings action escaped the route strip: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.chips.every(chip => chip.chipContained), `agent fact chips escaped the route strip: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.chips.every(chip => chip.valueFits), `agent fact values clipped or ellipsized: ${JSON.stringify(layout)}`).toBe(true);
	expect(layout.chips.some(chip => /handoff\s*Maria after 2 tries/i.test(chip.text))).toBe(true);
});

test('Agents status strip follows local phone setup edits', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	await page.getByTestId('phone-setup-hours-start').fill('08:30');
	await page.getByTestId('phone-setup-hours-end').fill('18:15');
	await page.getByTestId('phone-setup-handoff-input').fill('Jordan');
	await page.getByTestId('phone-setup-deflection-input').fill('4');

	const facts = page.locator('.agent-route-strip__facts');
	await expect(facts.locator('[data-testid="agent-route-fact-hours"]')).toContainText('M-F 8:30a-6:15p');
	await expect(facts.locator('[data-testid="agent-route-fact-handoff"]')).toContainText('Jordan after 4 tries');
	await expect(page.getByTestId('phone-setup-preview')).toContainText('08:30-18:15 · after-hours to Jordan after 4 tries');
	await expect(page.locator('.agent-session-strip')).toContainText('08:30-18:15');
	await expect(page.locator('.agent-session-strip')).toContainText('Jordan');
});

test('Agents phone setup save leaves an inline review state instead of a toast-only admin operation', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	const saveStatus = page.getByTestId('phone-setup-save-status');
	await expect(saveStatus).toHaveAttribute('data-state', 'clean');
	await expect(saveStatus).toContainText(/current registry settings/i);

	await page.getByTestId('phone-setup-hours-start').fill('08:30');
	await page.getByTestId('phone-setup-hours-end').fill('18:15');
	await page.getByTestId('phone-setup-handoff-input').fill('Jordan');
	await page.getByTestId('phone-setup-deflection-input').fill('4');

	await expect(saveStatus).toHaveAttribute('data-state', 'dirty');
	await expect(saveStatus).toContainText(/unsaved local edits/i);

	await page.getByTestId('phone-setup-save').click();
	await expect(saveStatus).toHaveAttribute('data-state', 'saved');
	await expect(saveStatus).toContainText(/saved/i);
	await expect(saveStatus).toContainText('08:30-18:15 · Jordan after 4 tries');
	await expect(page.locator('.toast', {hasText: /phone setup saved|wrapper saved/i})).toHaveCount(0);
});

test('Agents route keeps the selected Sales Coach wrapper named consistently', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1440, height: 900});
	await openConsole();
	await page.locator('[data-testid="sidebar-agent-route"][data-agent-key="sales_coach"]').click();

	await expect(page.locator('[data-testid="sidebar-agent-route"][data-agent-key="sales_coach"]')).toHaveAttribute('data-active', 'true');
	await expect(page.locator('.agent-route-strip__active')).toContainText('Local ElevenLabs agent');
	await expect(page.locator('.agent-route-strip__active')).toContainText('Sales Coach');
	await expect(page.locator('[data-testid="agent-route-fact-status"]')).toContainText('Ready for coaching');
	await expect(page.locator('[data-testid="agent-route-fact-surface"]')).toContainText('all pages');
	await expect(page.locator('[data-testid="agent-playground-title"]')).toHaveText('Sales Coach');
	await expect(page.locator('[data-testid="agent-playground-subtitle"]')).toContainText('Deal coaching agent');
	await expect(page.locator('.agent-admin-quick strong')).toHaveText('Sales Coach');
	await expect(page.locator('[data-testid="agent-local-wrapper-id"]')).toHaveText('opening line · context · tools');
	await expect(page.locator('.card__title:has-text("Sales Coach wrapper")')).toBeVisible();
	await expect(page.locator('[data-testid="phone-setup-greeting"] .field__label')).toHaveText('Opening line');
	await expect(page.locator('[data-testid="phone-setup-greeting-input"]')).toHaveValue(/Wranngle Sales Coach here/);
	await expect(page.getByTestId('agent-playground-play-greeting')).toHaveText(/play opening/i);
	await expect(page.locator('.page--agents')).not.toContainText('Your receptionist');
});

test('ElevenLabs has one explicit external escape after local admin is surfaced', async ({openConsole, page}) => {
	await page.setViewportSize({width: 1280, height: 720});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	const settingsCta = page.getByTestId('agents-workspace-settings');
	await expect(settingsCta).toHaveText(/elevenlabs settings/i);
	await expect(settingsCta).toHaveAccessibleName(/elevenlabs workspace settings/i);
	await expect(page.locator('a[href*="elevenlabs.io"], a[href*="elevenlabs.com"]')).toHaveCount(0);
	await settingsCta.click();

	const elevenLabsConfig = page.getByRole('region', {name: /^elevenlabs configuration$/i});
	await expect(elevenLabsConfig).toBeVisible();
	await expect(elevenLabsConfig.locator('[data-testid="integration-open-elevenlabs-local-admin"]')).toBeVisible();
	const escape = elevenLabsConfig.locator('[data-testid="integration-elevenlabs-escape"]');
	await expect(escape).toBeVisible();
	await expect(escape).toHaveClass(/btn--external/);
	await expect(escape).toHaveAttribute('href', 'https://elevenlabs.io/app/agents');
	await expect(escape).toHaveAttribute('target', '_blank');
	await expect(escape).toHaveAccessibleName('Open ElevenLabs Agents dashboard in a new tab');
	await expect(elevenLabsConfig.locator('[data-testid="integration-elevenlabs-escape-note"]')).toContainText(/one explicit dashboard escape hatch/i);
	await expect(page.locator('a[href*="elevenlabs.io"], a[href*="elevenlabs.com"]')).toHaveCount(1);

	const popupPromise = page.waitForEvent('popup');
	await escape.click();
	const popup = await popupPromise;
	await popup.close();
	await expect(elevenLabsConfig.locator('[data-testid="integration-operation-log"]')).toContainText(/Dashboard escape opened/);
	await expect(elevenLabsConfig.locator('[data-testid="integration-operation-log"]')).toContainText(/single settings escape hatch/i);

	await elevenLabsConfig.locator('[data-testid="integration-open-elevenlabs-local-admin"]').click();
	await expect(page.locator('.tb__crumb--active')).toContainText('Agents');
	await expect(page.locator('[data-testid="agent-local-admin-panel"]')).toBeVisible();
	await expect(page.locator('[data-testid="phone-setup-panel"]')).toBeVisible();
	await expect(page.locator('a[href*="elevenlabs.io"], a[href*="elevenlabs.com"]')).toHaveCount(0);
});

test('Agents mobile playground header keeps identity readable above the bars', async ({openConsole, page}) => {
	await page.setViewportSize({width: 390, height: 844});
	await openConsole();
	await page.locator('.sb__item:has-text("Agents")').first().click();

	const head = page.locator('.agent-playground-frame .el-agent-panel__head').first();
	await expect(head).toBeVisible();
	await expect(head.locator('[data-testid="agent-playground-title"]')).toHaveText('Sarah Intake');
	await expect(head.locator('[data-testid="agent-playground-subtitle"]')).toContainText(/AI receptionist/iu);

	const layout = await head.evaluate(node => {
		const identity = node.querySelector('.agent-playground-frame__identity');
		const title = node.querySelector('[data-testid="agent-playground-title"]');
		const subtitle = node.querySelector('[data-testid="agent-playground-subtitle"]');
		const bars = node.querySelector('.el-bars');
		const box = (element: Element | null | undefined) => {
			if (!element) {
				return null;
			}

			const rect = element.getBoundingClientRect();
			const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 1;
			return {
				width: rect.width,
				height: rect.height,
				top: rect.top,
				bottom: rect.bottom,
				lines: rect.height / lineHeight,
			};
		};

		return {
			identity: box(identity),
			title: box(title),
			subtitle: box(subtitle),
			bars: box(bars),
			horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
		};
	});

	expect(layout.horizontalOverflow).toBe(false);
	expect(layout.identity?.width, 'agent identity should not collapse to a one-word column').toBeGreaterThan(140);
	expect(layout.title?.lines, 'agent name should stay on one readable line at phone width').toBeLessThanOrEqual(1.5);
	expect(layout.subtitle?.lines, 'role/mode copy should wrap as a phrase, not one word per line').toBeLessThanOrEqual(2.5);
	expect(layout.bars?.top, 'bar visualizer should stack below the identity row on mobile').toBeGreaterThanOrEqual((layout.identity?.bottom ?? 0) - 1);
});
