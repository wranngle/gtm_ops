import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
	afterAll, describe, expect, it,
} from 'vitest';
import {generatePDFFromContent} from '../../lib/pdf-generator.js';

const fixedSheetHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>layout fixture</title>
<style>
  html, body { margin: 0; padding: 0; }
  .sheet { width: 8.5in; min-height: 11in; padding: 0.4in; box-sizing: border-box; page-break-after: always; }
  .page-card { border: 1px solid #ebdfc8; padding: 18px; min-height: 9.8in; }
  h1 { font: 700 26pt Arial, sans-serif; margin: 0 0 16px; }
  p, li { font: 11pt Arial, sans-serif; line-height: 1.45; }
</style></head><body>
  <section class="sheet"><div class="page-card"><h1>Proposal summary</h1><p>First client-facing sheet.</p></div></section>
  <section class="sheet"><div class="page-card"><h1>Commercial terms</h1><p>Second client-facing sheet.</p></div></section>
  <section class="sheet internal" id="report-internal-strategy"><h1>Internal strategy only</h1></section>
</body></html>`;

function resolvePython(): string {
	const localVenvPython = path.join(process.cwd(), '.venv/bin/python');
	return fs.existsSync(localVenvPython) ? localVenvPython : 'python3';
}

type PdfInspection = {
	pageCount: number;
	pageSize: {
		width: number;
		height: number;
	};
	text: string;
};

function hasObjectShape(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isPdfInspection(value: unknown): value is PdfInspection {
	if (!hasObjectShape(value) || !hasObjectShape(value.pageSize)) {
		return false;
	}

	return typeof value.pageCount === 'number'
		&& typeof value.pageSize.width === 'number'
		&& typeof value.pageSize.height === 'number'
		&& typeof value.text === 'string';
}

function inspectPdf(pdfPath: string): PdfInspection {
	const result = spawnSync(resolvePython(), [
		'-c',
		String.raw`import json, pymupdf, sys
doc=pymupdf.open(sys.argv[1])
payload={"pageCount": doc.page_count, "pageSize": {"width": doc[0].rect.width, "height": doc[0].rect.height}, "text": "\n".join(page.get_text() for page in doc)}
print(json.dumps(payload))`,
		pdfPath,
	], {encoding: 'utf8'});

	if (result.status !== 0) {
		throw new Error(result.stderr || 'Failed to inspect PDF with PyMuPDF');
	}

	const parsed: unknown = JSON.parse(result.stdout);
	if (!isPdfInspection(parsed)) {
		throw new Error(`Unexpected PDF inspection payload: ${result.stdout}`);
	}

	return parsed;
}

describe('pdf-generator PyMuPDF layout', () => {
	const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-layout-'));
	const pdfPath = path.join(temporaryDir, 'layout.pdf');

	afterAll(() => {
		try {
			fs.rmSync(temporaryDir, {recursive: true, force: true});
		} catch {
			// Noop
		}
	});

	it('renders fixed proposal sheets as Letter pages and hides internal sheets', async () => {
		const result = await generatePDFFromContent(fixedSheetHtml, pdfPath, {demoMode: false});
		const inspected = inspectPdf(pdfPath);

		expect(result.engine).toBe('pymupdf');
		expect(result.sheetsFound).toBe(2);
		expect(result.pageCount).toBe(2);
		expect(inspected.pageCount).toBe(2);
		expect(inspected.pageSize.width).toBe(612);
		expect(inspected.pageSize.height).toBe(792);
		expect(inspected.text).toContain('Proposal summary');
		expect(inspected.text).toContain('Commercial terms');
		expect(inspected.text).not.toContain('Internal strategy only');
	});
});
