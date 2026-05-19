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
 * Puppeteer's PDF output encodes text as CID-mapped glyph indices, so a raw
 * substring search against the FlateDecode-compressed bytes will not find the
 * literal. The robust contract: scan every ToUnicode CMap inside the PDF, build
 * the set of unicode codepoints each font reaches, then assert at least one
 * font's reachable-character set covers every character of the watermark. The
 * watermark uses a distinct font/page-fixed div, so production-mode PDFs (which
 * contain only the body text fonts) cannot satisfy the same superset check.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  generatePDFFromContent,
  DEMO_WATERMARK_TEXT
} from '../../lib/pdf-generator.js';

const DEMO_TEMPLATE_HTML = `<!doctype html>
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

/**
 * Inflate every `stream … endstream` payload in the PDF and return the decoded
 * latin1 text of streams that decompress as ASCII (text & CMap streams).
 */
function decodeTextStreams(pdfBuf: Buffer): string[] {
  const bytes = pdfBuf;
  const STREAM_TAG = Buffer.from('stream');
  const END_STREAM_TAG = Buffer.from('endstream');
  const out: string[] = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const startIdx = bytes.indexOf(STREAM_TAG, cursor);
    if (startIdx === -1) break;
    let payloadStart = startIdx + STREAM_TAG.length;
    if (bytes[payloadStart] === 0x0d) payloadStart += 1;
    if (bytes[payloadStart] === 0x0a) payloadStart += 1;
    const endIdx = bytes.indexOf(END_STREAM_TAG, payloadStart);
    if (endIdx === -1) break;
    let payloadEnd = endIdx;
    while (payloadEnd > payloadStart && (bytes[payloadEnd - 1] === 0x0a || bytes[payloadEnd - 1] === 0x0d)) {
      payloadEnd -= 1;
    }
    try {
      out.push(zlib.inflateSync(bytes.subarray(payloadStart, payloadEnd)).toString('latin1'));
    } catch {
      out.push(bytes.subarray(payloadStart, payloadEnd).toString('latin1'));
    }
    cursor = endIdx + END_STREAM_TAG.length;
  }
  return out;
}

/**
 * Parse the unicode codepoints reachable through a ToUnicode CMap stream.
 * Returns null if the stream does not look like a CMap.
 */
function parseCmapUnicodeSet(streamText: string): Set<number> | null {
  if (!streamText.includes('beginbfchar') && !streamText.includes('beginbfrange')) {
    return null;
  }
  const set = new Set<number>();
  // bfchar: `<srcCid> <dstUtf16>` pairs.
  const bfcharRegex = /<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/g;
  // Split into bfchar and bfrange windows so we don't double-parse.
  for (const block of streamText.split(/begin(?:bfchar|bfrange)/).slice(1)) {
    const end = block.search(/end(?:bfchar|bfrange)/);
    const body = end === -1 ? block : block.slice(0, end);
    const matches = [...body.matchAll(/<([0-9A-Fa-f]+)>(?:\s+<([0-9A-Fa-f]+)>)?(?:\s+<([0-9A-Fa-f]+)>)?/g)];
    for (const m of matches) {
      const [, a, b, c] = m;
      if (a && b && c) {
        // bfrange: srcStart srcEnd dstStart
        const sStart = parseInt(a, 16);
        const sEnd = parseInt(b, 16);
        const dStart = parseInt(c, 16);
        for (let i = 0; i <= sEnd - sStart; i += 1) set.add(dStart + i);
      } else if (a && b) {
        // bfchar: srcCid dstUtf16
        set.add(parseInt(b, 16));
      }
    }
  }
  return set;
}

function pdfTextLayerCovers(pdfBuf: Buffer, target: string): boolean {
  const wantChars = new Set<number>();
  for (const ch of target) wantChars.add(ch.codePointAt(0)!);
  for (const stream of decodeTextStreams(pdfBuf)) {
    const reachable = parseCmapUnicodeSet(stream);
    if (!reachable) continue;
    let covers = true;
    for (const cp of wantChars) {
      if (!reachable.has(cp)) { covers = false; break; }
    }
    if (covers) return true;
  }
  return false;
}

describe('pdf-generator DEMO_MODE watermark', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-watermark-'));
  const demoPdfPath = path.join(tmpDir, 'demo.pdf');
  const prodPdfPath = path.join(tmpDir, 'prod.pdf');
  let demoBuf: Buffer;
  let prodBuf: Buffer;

  beforeAll(async () => {
    // Ensure env-var path can't bleed across test runs.
    delete process.env.DEMO_MODE;

    await generatePDFFromContent(DEMO_TEMPLATE_HTML, demoPdfPath, { demoMode: true });
    await generatePDFFromContent(DEMO_TEMPLATE_HTML, prodPdfPath, { demoMode: false });

    demoBuf = fs.readFileSync(demoPdfPath);
    prodBuf = fs.readFileSync(prodPdfPath);
  }, 60_000);

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  });

  it('exports a non-empty watermark constant', () => {
    expect(typeof DEMO_WATERMARK_TEXT).toBe('string');
    expect(DEMO_WATERMARK_TEXT.length).toBeGreaterThan(0);
    expect(DEMO_WATERMARK_TEXT).toBe('SYNTHETIC FIXTURE - NOT A REAL QUOTE');
  });

  it('stamps the watermark into the PDF buffer when demoMode=true', () => {
    expect(demoBuf.length).toBeGreaterThan(1000);
    expect(pdfTextLayerCovers(demoBuf, DEMO_WATERMARK_TEXT)).toBe(true);
  });

  it('omits the watermark from the PDF buffer in production mode', () => {
    expect(prodBuf.length).toBeGreaterThan(1000);
    expect(pdfTextLayerCovers(prodBuf, DEMO_WATERMARK_TEXT)).toBe(false);
  });
});
