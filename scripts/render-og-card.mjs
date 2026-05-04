#!/usr/bin/env bun
/**
 * Rasterize apps/ops-console/assets/og-card.svg → og-card.png at the
 * canonical OG image dimension (1200×630). Run after editing the SVG:
 *
 *   bun scripts/render-og-card.mjs
 *
 * Background: Twitter/X explicitly rejects SVG og:images, and several
 * other social link previewers (LinkedIn, iMessage) have unreliable
 * SVG support. Twitter/X rendering is the lowest-common-denominator
 * we target, so the source-of-truth lives as SVG (editable) and the
 * deployed og:image is the PNG output of this script.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const svgPath = resolve(root, 'apps/ops-console/assets/og-card.svg');
const pngPath = resolve(root, 'apps/ops-console/assets/og-card.png');

const svg = readFileSync(svgPath, 'utf8');
const html = `<!doctype html><html><head><style>html,body{margin:0;padding:0;}svg{display:block;}</style></head><body>${svg}</body></html>`;

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const buf = await page.screenshot({ fullPage: false, omitBackground: false });
  writeFileSync(pngPath, buf);
  console.log(`rendered ${pngPath} (${buf.length} bytes)`);
} finally {
  await browser.close();
}
