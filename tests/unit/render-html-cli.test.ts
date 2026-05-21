import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
	afterAll, describe, expect, it,
} from 'vitest';

const repoRoot = process.cwd();

// Legacy pipeline schemas are snake_case at the app boundary.
/* eslint-disable @typescript-eslint/naming-convention */
const schema = {
	identity: {
		client_name: 'Acme HVAC',
	},
	project_identity: {
		client_name: 'Acme HVAC',
	},
	intake: {
		classification: {
			project_type: 'custom',
			is_product: false,
		},
		section_c_systems_handoffs: {
			q10_systems_involved: [],
		},
	},
	pricing: {},
	proposal: {},
	project_plan: {},
	audit_report: {},
};
/* eslint-enable @typescript-eslint/naming-convention */

function runCli(args: string[]) {
	return spawnSync('bun', ['cli.ts', ...args], {
		cwd: repoRoot,
		encoding: 'utf8',
		env: process.env,
	});
}

describe('render:html CLI', () => {
	const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-html-cli-'));
	const templatePath = path.join(temporaryDir, 'template.html');

	afterAll(() => {
		try {
			fs.rmSync(temporaryDir, {recursive: true, force: true});
		} catch {
			// Noop
		}
	});

	it('defaults extensionless JSON input to a distinct HTML output path', () => {
		const inputPath = path.join(temporaryDir, 'schema');
		const outputPath = `${inputPath}.html`;
		const sourceJson = JSON.stringify(schema);
		fs.writeFileSync(templatePath, '<!doctype html><html><body>{{identity.client_name}}</body></html>');
		fs.writeFileSync(inputPath, sourceJson);

		const result = runCli(['render:html', inputPath, '--template', templatePath]);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe('');
		expect(fs.readFileSync(inputPath, 'utf8')).toBe(sourceJson);
		expect(fs.readFileSync(outputPath, 'utf8')).toContain('Acme HVAC');
	});

	it('keeps HTML and PDF output distinct when --output has no HTML suffix', () => {
		const inputPath = path.join(temporaryDir, 'schema.json');
		const outputPath = path.join(temporaryDir, 'proposal');
		const pdfPath = `${outputPath}.pdf`;
		fs.writeFileSync(templatePath, '<!doctype html><html><body><section class="sheet">Acme HVAC</section></body></html>');
		fs.writeFileSync(inputPath, JSON.stringify(schema));

		const result = runCli(['render:html', inputPath, '--template', templatePath, '--output', outputPath, '--pdf']);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe('');
		expect(fs.readFileSync(outputPath, 'utf8')).toContain('<!doctype html>');
		expect(fs.statSync(pdfPath).size).toBeGreaterThan(1000);
	});
});
