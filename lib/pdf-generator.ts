/**
 * PDF generation bridge for proposal HTML.
 *
 * PyMuPDF is the canonical renderer. The TypeScript layer keeps the app API
 * stable while the Python runner owns the HTML-to-PDF and PDF stamping work.
 */

import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const pageWidthPt = 612;
const pageHeightPt = 792;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');
const pdfRunnerPath = path.join(repoRoot, 'scripts/render-pdf-pymupdf.py');

// Watermark text stamped into every sheet when DEMO_MODE is on. Plain ASCII
// so consumers searching the rendered PDF text layer find it without
// normalization. Single source of truth — exported for tests.
export const demoWatermarkText = 'SYNTHETIC FIXTURE - NOT A REAL QUOTE';
export {demoWatermarkText as DEMO_WATERMARK_TEXT};

type PdfGeneratorOptions = {
	demoMode?: unknown;
	isInternalSheet?: boolean;
	verbose?: boolean;
};

type RunnerStats = {
	success: boolean;
	engine: 'pymupdf';
	pdfPath: string;
	pageCount: number;
	pageSize?: {
		width: number;
		height: number;
	} | undefined;
	textLengths?: number[];
};

type NormalizedPdfOptions = {
	demoMode: boolean;
	isInternalSheet: boolean;
	verbose: boolean;
};

type PdfResult = {
	success: true;
	engine: 'pymupdf';
	pdfPath: string;
	size: number;
	sizeDisplay: string;
	pageCount: number;
	pageSize: {
		width: number;
		height: number;
	};
	sheetsFound: number;
	isInternalSheet: boolean;
	demoMode: boolean;
};

function hasObjectShape(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isRunnerStats(value: unknown): value is RunnerStats {
	if (!hasObjectShape(value)) {
		return false;
	}

	return value.success === true
		&& value.engine === 'pymupdf'
		&& typeof value.pdfPath === 'string'
		&& typeof value.pageCount === 'number';
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function parseRunnerStats(stdout: string): RunnerStats {
	const lines = stdout
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean);
	let jsonLine: string | undefined;
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const line = lines[index];
		if (line?.startsWith('{') && line.endsWith('}')) {
			jsonLine = line;
			break;
		}
	}

	if (!jsonLine) {
		throw new Error(`missing JSON payload in stdout: ${stdout}`);
	}

	const parsed: unknown = JSON.parse(jsonLine);
	if (!isRunnerStats(parsed)) {
		throw new Error(`unexpected payload: ${jsonLine}`);
	}

	return parsed;
}

function isDemoMode(opt: unknown): boolean {
	if (opt === true) {
		return true;
	}

	if (opt === false || opt === 0) {
		return false;
	}

	if (opt === undefined || opt === null) {
		const raw = process.env.DEMO_MODE;
		return raw === '1' || raw === 'true';
	}

	return Boolean(opt);
}

function resolvePython(): string {
	if (process.env.PYMUPDF_PYTHON) {
		return process.env.PYMUPDF_PYTHON;
	}

	const localVenvPython = path.join(repoRoot, '.venv/bin/python');
	if (fs.existsSync(localVenvPython)) {
		return localVenvPython;
	}

	return 'python3';
}

function getHtmlAttribute(tag: string, attrName: string): string {
	const lowerTag = tag.toLowerCase();
	const marker = `${attrName.toLowerCase()}=`;
	const attrIndex = lowerTag.indexOf(marker);
	if (attrIndex === -1) {
		return '';
	}

	const valueStart = attrIndex + marker.length;
	const quote = tag[valueStart];
	if (quote === '"' || quote === '\'') {
		const valueEnd = tag.indexOf(quote, valueStart + 1);
		return valueEnd === -1 ? '' : tag.slice(valueStart + 1, valueEnd);
	}

	const valueEnd = tag.indexOf(' ', valueStart);
	return tag.slice(valueStart, valueEnd === -1 ? tag.length : valueEnd);
}

function hasClass(tag: string, className: string): boolean {
	const classValue = ` ${getHtmlAttribute(tag, 'class').toLowerCase()} `;
	return classValue.includes(` ${className.toLowerCase()} `);
}

function countSheets(htmlContent: string, isInternalSheet: boolean): number {
	let count = 0;
	let cursor = 0;

	while (cursor < htmlContent.length) {
		const tagStart = htmlContent.indexOf('<', cursor);
		if (tagStart === -1) {
			break;
		}

		const tagEnd = htmlContent.indexOf('>', tagStart + 1);
		if (tagEnd === -1) {
			break;
		}

		const tag = htmlContent.slice(tagStart, tagEnd + 1);
		cursor = tagEnd + 1;

		if (!hasClass(tag, 'sheet')) {
			continue;
		}

		const isInternal = hasClass(tag, 'internal') || getHtmlAttribute(tag, 'id') === 'report-internal-strategy';
		if (isInternalSheet || !isInternal) {
			count += 1;
		}
	}

	return count;
}

function isInternalArtifact(filePath?: string): boolean {
	return typeof filePath === 'string' && path.basename(filePath).toUpperCase().startsWith('INTERNAL_');
}

function normalizePdfOptions(options: PdfGeneratorOptions, sourceHtmlPath?: string): NormalizedPdfOptions {
	return {
		demoMode: isDemoMode(options.demoMode),
		isInternalSheet: options.isInternalSheet ?? isInternalArtifact(sourceHtmlPath),
		verbose: options.verbose === true,
	};
}

function replaceHtmlExtension(filePath: string): string {
	const lowerPath = filePath.toLowerCase();
	if (lowerPath.endsWith('.html')) {
		return `${filePath.slice(0, -5)}.pdf`;
	}

	if (lowerPath.endsWith('.htm')) {
		return `${filePath.slice(0, -4)}.pdf`;
	}

	return `${filePath}.pdf`;
}

async function runPyMuPdf(args: string[], stdin?: string): Promise<RunnerStats> {
	return new Promise((resolve, reject) => {
		const python = resolvePython();
		const child = spawn(python, [pdfRunnerPath, ...args], {
			cwd: repoRoot,
			env: process.env,
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';

		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk: string) => {
			stderr += chunk;
		});
		child.on('error', reject);
		child.on('close', code => {
			if (code !== 0) {
				reject(new Error(stderr.trim() || `PyMuPDF renderer exited with code ${code}`));
				return;
			}

			try {
				resolve(parseRunnerStats(stdout));
			} catch (error) {
				reject(new Error(`PyMuPDF renderer returned invalid JSON: ${errorMessage(error)}\n${stdout}`));
			}
		});

		if (stdin === undefined) {
			child.stdin.end();
		} else {
			child.stdin.end(stdin);
		}
	});
}

function buildRunnerArgs(
	pdfPath: string,
	options: PdfGeneratorOptions,
	sourceHtmlPath?: string,
): {args: string[]; runnerOptions: NormalizedPdfOptions} {
	const runnerOptions = normalizePdfOptions(options, sourceHtmlPath);
	const args = ['--output', pdfPath];

	if (runnerOptions.demoMode) {
		args.push('--demo-mode');
	}

	if (runnerOptions.isInternalSheet) {
		args.push('--internal-sheet');
	}

	if (runnerOptions.verbose) {
		args.push('--verbose');
	}

	return {args, runnerOptions};
}

function ensureOutputDir(pdfPath: string): void {
	const outputDir = path.dirname(pdfPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, {recursive: true});
	}
}

function toResult(
	pdfPath: string,
	stats: RunnerStats,
	runnerOptions: NormalizedPdfOptions,
	sheetsFound: number,
): PdfResult {
	const fileStats = fs.statSync(pdfPath);

	return {
		success: true,
		engine: 'pymupdf',
		pdfPath,
		size: fileStats.size,
		sizeDisplay: `${(fileStats.size / 1024).toFixed(1)} KB`,
		pageCount: stats.pageCount,
		pageSize: stats.pageSize ?? {width: pageWidthPt, height: pageHeightPt},
		sheetsFound,
		isInternalSheet: runnerOptions.isInternalSheet,
		demoMode: runnerOptions.demoMode,
	};
}

/**
 * Generate a PDF from an HTML file.
 */
export async function generatePdf(
	htmlPath: string,
	pdfPath?: string,
	options: PdfGeneratorOptions = {},
): Promise<PdfResult> {
	const absoluteHtmlPath = path.resolve(htmlPath);

	if (!fs.existsSync(absoluteHtmlPath)) {
		throw new Error(`HTML file not found: ${absoluteHtmlPath}`);
	}

	const htmlContent = fs.readFileSync(absoluteHtmlPath, 'utf8');
	const absolutePdfPath = path.resolve(pdfPath ?? replaceHtmlExtension(absoluteHtmlPath));
	ensureOutputDir(absolutePdfPath);

	const {args, runnerOptions} = buildRunnerArgs(absolutePdfPath, options, absoluteHtmlPath);
	const stats = await runPyMuPdf(['--input', absoluteHtmlPath, ...args]);

	return toResult(
		absolutePdfPath,
		stats,
		runnerOptions,
		countSheets(htmlContent, runnerOptions.isInternalSheet),
	);
}

/**
 * Generate a PDF from HTML string content.
 */
export async function generatePdfFromContent(
	htmlContent: string,
	pdfPath: string,
	options: PdfGeneratorOptions = {},
): Promise<PdfResult> {
	const absolutePdfPath = path.resolve(pdfPath);
	ensureOutputDir(absolutePdfPath);

	const {args, runnerOptions} = buildRunnerArgs(absolutePdfPath, options);
	const stats = await runPyMuPdf(['--stdin', ...args], htmlContent);

	return toResult(
		absolutePdfPath,
		stats,
		runnerOptions,
		countSheets(htmlContent, runnerOptions.isInternalSheet),
	);
}

export {generatePdf as generatePDF, generatePdfFromContent as generatePDFFromContent};

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.log(`
PDF Generator - Convert HTML reports to PDF

Usage:
  bun lib/pdf-generator.ts <input.html> [output.pdf] [--verbose]

Examples:
  bun lib/pdf-generator.ts samples/healthcare_report.html
  bun lib/pdf-generator.ts samples/report.html output/report.pdf
  bun lib/pdf-generator.ts samples/report.html --verbose
`);
		return;
	}

	const htmlPath = args[0];
	const verbose = args.includes('--verbose');
	const pdfPath = args.find(arg => arg !== htmlPath && !arg.startsWith('--'));

	console.log(`Generating PDF from ${htmlPath}...`);

	try {
		const result = await generatePdf(htmlPath, pdfPath, {verbose});
		console.log(`PDF saved: ${result.pdfPath} (${result.sizeDisplay}, ${result.pageCount} pages)`);
	} catch (error) {
		console.error(`PDF generation failed: ${errorMessage(error)}`);
		process.exitCode = 1;
	}
}

if (process.argv[1]?.endsWith('pdf-generator.ts')) {
	await main();
}
