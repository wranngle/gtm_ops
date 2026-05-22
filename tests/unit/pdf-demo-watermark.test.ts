/**
 * DEMO_MODE PDF watermark — repo-magic gtm_ops item 6.
 *
 * Contract:
 *   - When demoMode=true (option) or DEMO_MODE=1 (env), the PDF buffer
 *     contains the rendered watermark text "SYNTHETIC FIXTURE - NOT A REAL
 *     QUOTE" in the page text layer.
 *   - When demoMode is unset/false in production mode, the same text is
 *     absent from the PDF buffer.
 *
 * The robust contract is actual text extraction from the rendered PDF, not raw
 * byte matching. PyMuPDF owns both generation and test-side text extraction.
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
	describe, it, expect, beforeAll, afterAll,
} from 'vitest';
import {
	generatePDFFromContent,
	DEMO_WATERMARK_TEXT,
} from '../../lib/pdf-generator.js';

const demoTemplateHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>demo fixture</title>
<style>
  html, body { margin: 0; padding: 0; }
  .sheet { width: 8.5in; height: 11in; padding: 0.5in; box-sizing: border-box; }
  .page-card { width: 100%; height: 100%; }
  h1 { font: 700 24pt sans-serif; margin: 0 0 0.5in 0; }
</style></head>
<body>
  <section class="sheet"><div class="page-card">
    <h1>Acme HVAC pilot</h1>
    <p>Proposal body for the demo-mode watermark contract test.</p>
  </div></section>
</body></html>`;

function resolvePython(): string {
	const localVenvPython = path.join(process.cwd(), '.venv/bin/python');
	return fs.existsSync(localVenvPython) ? localVenvPython : 'python3';
}

function extractPdfText(pdfPath: string): string {
	const result = spawnSync(resolvePython(), [
		'-c',
		String.raw`import pymupdf, sys; doc=pymupdf.open(sys.argv[1]); print("\n".join(page.get_text() for page in doc))`,
		pdfPath,
	], {encoding: 'utf8'});

	if (result.status !== 0) {
		throw new Error(result.stderr || 'Failed to extract PDF text with PyMuPDF');
	}

	return result.stdout;
}

describe('pdf-generator DEMO_MODE watermark', () => {
	const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-watermark-'));
	const demoPdfPath = path.join(temporaryDir, 'demo.pdf');
	const prodPdfPath = path.join(temporaryDir, 'prod.pdf');
	let demoBuf: Uint8Array;
	let prodBuf: Uint8Array;

	beforeAll(async () => {
		// Ensure env-var path can't bleed across test runs.
		delete process.env.DEMO_MODE;

		await generatePDFFromContent(demoTemplateHtml, demoPdfPath, {demoMode: true});
		await generatePDFFromContent(demoTemplateHtml, prodPdfPath, {demoMode: false});

		demoBuf = fs.readFileSync(demoPdfPath);
		prodBuf = fs.readFileSync(prodPdfPath);
	}, 60_000);

	afterAll(() => {
		try {
			fs.rmSync(temporaryDir, {recursive: true, force: true});
		} catch {
			// Noop
		}
	});

	it('exports a non-empty watermark constant', () => {
		expect(typeof DEMO_WATERMARK_TEXT).toBe('string');
		expect(DEMO_WATERMARK_TEXT.length).toBeGreaterThan(0);
		expect(DEMO_WATERMARK_TEXT).toBe('SYNTHETIC FIXTURE - NOT A REAL QUOTE');
	});

	it('stamps the watermark into the PDF buffer when demoMode=true', () => {
		expect(demoBuf.length).toBeGreaterThan(1000);
		expect(extractPdfText(demoPdfPath)).toContain(DEMO_WATERMARK_TEXT);
	});

	it('omits the watermark from the PDF buffer in production mode', () => {
		expect(prodBuf.length).toBeGreaterThan(1000);
		expect(extractPdfText(prodPdfPath)).not.toContain(DEMO_WATERMARK_TEXT);
	});
});
