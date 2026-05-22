/**
 * Pins the Sales Coach launcher contract: default routes keep the docked
 * bottom-right pill; dense workbenches may compact the launcher when the
 * full pill would cover local review/admin controls.
 */
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cssPath = resolve(root, 'apps', 'ops-console', 'console', 'app.css');

describe('apps/ops-console coach launcher position', () => {
	const css = readFileSync(cssPath, 'utf8');

	it('base .coach-launcher rule docks bottom-right', () => {
		const match = /^\.coach-launcher\s*{([^}]*)}/m.exec(css);
		expect(match, 'base .coach-launcher rule should exist').toBeTruthy();
		const body = match![1];
		expect(body).toMatch(/position\s*:\s*fixed/);
		expect(body).toMatch(/bottom\s*:\s*\d+px/);
		expect(body).toMatch(/right\s*:\s*\d+px/);
	});

	it('route-specific tuning uses the app route state, not stale html attrs', () => {
		expect(css).not.toContain('html[data-console-route=');
	});

	it('Proposals route compacts the launcher away from review rows', () => {
		const match = /\.app\[data-route="proposals"]\s*~\s*\.coach-launcher\s*{([^}]*)}/m.exec(css);
		expect(match, 'Proposals route should have an explicit dense-workbench launcher rule').toBeTruthy();
		const body = match![1];
		expect(body).toMatch(/top\s*:\s*calc\(var\(--topbar-h\)\s*\+\s*4px\)/);
		expect(body).toMatch(/bottom\s*:\s*auto/);
		expect(body).toMatch(/width\s*:\s*44px/);
		expect(body).toMatch(/height\s*:\s*44px/);

		const labelMatch = /\.app\[data-route="proposals"]\s*~\s*\.coach-launcher\s+\.coach-launcher__label\s*{([^}]*)}/m.exec(css);
		expect(labelMatch, 'Proposals route should hide the full pill label').toBeTruthy();
		expect(labelMatch![1]).toMatch(/display\s*:\s*none/);
	});

	it('Evals route docks the compact launcher above the run-plan surface', () => {
		const match = /\.app\[data-route="evals"]\s*~\s*\.coach-launcher,\s*\n\.app\[data-route="settings"]\s*~\s*\.coach-launcher\s*{([^}]*)}/m.exec(css);
		expect(match, 'Evals route should share an explicit dense-workbench launcher rule').toBeTruthy();
		const body = match![1];
		expect(body).toMatch(/top\s*:\s*calc\(var\(--topbar-h\)\s*\+\s*4px\)/);
		expect(body).toMatch(/bottom\s*:\s*auto/);
		expect(body).toMatch(/width\s*:\s*44px/);
		expect(body).toMatch(/height\s*:\s*44px/);

		const labelMatch = /\.app\[data-route="evals"]\s*~\s*\.coach-launcher\s+\.coach-launcher__label,\s*\n\.app\[data-route="settings"]\s*~\s*\.coach-launcher\s+\.coach-launcher__label\s*{([^}]*)}/m.exec(css);
		expect(labelMatch, 'Evals route should hide the duplicate coach label').toBeTruthy();
		expect(labelMatch![1]).toMatch(/display\s*:\s*none/);
	});

	it('Settings route uses the same compact launcher so auth controls stay uncovered', () => {
		const match = /\.app\[data-route="evals"]\s*~\s*\.coach-launcher,\s*\n\.app\[data-route="settings"]\s*~\s*\.coach-launcher\s*{([^}]*)}/m.exec(css);
		expect(match, 'Settings route should share the compact dense-workbench launcher rule').toBeTruthy();
		const body = match![1];
		expect(body).toMatch(/top\s*:\s*calc\(var\(--topbar-h\)\s*\+\s*4px\)/);
		expect(body).toMatch(/bottom\s*:\s*auto/);
		expect(body).toMatch(/width\s*:\s*44px/);
		expect(body).toMatch(/height\s*:\s*44px/);

		const labelMatch = /\.app\[data-route="evals"]\s*~\s*\.coach-launcher\s+\.coach-launcher__label,\s*\n\.app\[data-route="settings"]\s*~\s*\.coach-launcher\s+\.coach-launcher__label\s*{([^}]*)}/m.exec(css);
		expect(labelMatch, 'Settings route should hide the full pill label').toBeTruthy();
		expect(labelMatch![1]).toMatch(/display\s*:\s*none/);
	});
});
