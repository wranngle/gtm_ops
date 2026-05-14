// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * pdf-generator.js - Automated PDF generation from HTML reports
 *
 * Uses Puppeteer to render HTML and save as PDF with proper styling.
 * Includes dynamic scaling to fit content within page boundaries.
 */
/* global document */

import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

// Page dimensions in pixels (96 DPI)
const PAGE_WIDTH_PX = 816;   // 8.5 inches
const PAGE_HEIGHT_PX = 1056; // 11 inches
const SAFE_HEIGHT_PX = 1008; // 10.5 inches (leaving margin for safety)
const PADDING_PX = 48;       // 0.5in total padding (0.25in each side)

// Watermark text stamped into every sheet when DEMO_MODE is on. Plain ASCII
// (no em-dash) so consumers searching the rendered PDF text layer find it
// without normalization. Single source of truth — exported for tests.
export const DEMO_WATERMARK_TEXT = 'SYNTHETIC FIXTURE - NOT A REAL QUOTE';

function isDemoMode(opt) {
  if (opt === true) return true;
  if (opt === false || opt === 0) return false;
  if (opt === undefined || opt === null) {
    const raw = process.env.DEMO_MODE;
    return raw === '1' || raw === 'true';
  }
  return Boolean(opt);
}

/**
 * Default PDF options for Traffic Light Reports
 */
const DEFAULT_PDF_OPTIONS = {
  format: 'Letter',
  printBackground: true,
  preferCSSPageSize: false,
  margin: {
    top: '0',
    right: '0',
    bottom: '0',
    left: '0'
  }
};

/**
 * Measure and scale each sheet to fit within page bounds
 * Uses injected <style> tag with !important to override print CSS
 */
async function measureAndScaleSheets(page, options = {}) {
  const { isInternalSheet = false } = options;
  
  return await page.evaluate((config) => {
    const { safeHeight, padding, isInternal } = config;
    // For internal sheets, select all .sheet elements; for client PDFs, exclude .internal
    const selector = isInternal ? '.sheet' : '.sheet:not(.internal)';
    const sheets = document.querySelectorAll(selector);
    const results = [];
    const availableHeight = safeHeight - padding;
    const scaleRules = [];

    for (const [index, sheet] of sheets.entries()) {
      // Ensure sheet has an ID for targeting
      sheet.id ||= `sheet-auto-${index}`;
      const sheetId = sheet.id;

      // Find the content container - either .page-card or the sheet itself
      let contentContainer = sheet.querySelector('.page-card');
      const hasPageCard = Boolean(contentContainer);

      contentContainer ||= sheet;

      // Temporarily reset transforms to measure natural size
      const origTransform = contentContainer.style.transform;
      const origWidth = contentContainer.style.width;
      contentContainer.style.transform = 'none';
      contentContainer.style.width = '100%';

      // Force layout recalculation (reading offsetHeight triggers reflow)
      const _forceReflow = contentContainer.offsetHeight;

      // Measure the natural content height
      const naturalHeight = contentContainer.scrollHeight;
      const naturalWidth = contentContainer.scrollWidth;

      // Restore original styles
      contentContainer.style.transform = origTransform;
      contentContainer.style.width = origWidth;

      // Calculate scale factor needed to fit content
      const scale = naturalHeight > availableHeight
        ? availableHeight / naturalHeight
        : 1;

      // Apply a minimum scale to prevent unreadable text
      // Round to nearest 0.05 for cleaner font anti-aliasing
      const roundedScale = Math.round(scale * 20) / 20;
      const finalScale = Math.max(roundedScale, 0.6);
      const widthCompensation = 100 / finalScale;

      // Build CSS rule for this sheet (will be injected with !important)
      if (hasPageCard) {
        scaleRules.push(`
          #${sheetId} > .page-card {
            transform: scale(${finalScale}) !important;
            transform-origin: top left !important;
            width: ${widthCompensation}% !important;
            display: flex !important;
            flex-direction: column !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
          }
          #${sheetId} .flight-deck {
            margin-top: auto !important;
            flex-shrink: 0 !important;
          }
        `);
      } else {
        scaleRules.push(`
          #${sheetId} {
            transform: scale(${finalScale}) !important;
            transform-origin: top left !important;
            width: ${widthCompensation}% !important;
          }
        `);
      }

      results.push({
        index,
        sheetId,
        hasPageCard,
        naturalHeight,
        naturalWidth,
        availableHeight,
        scale: finalScale,
        wasScaled: finalScale < 1
      });
    }

    // Inject all scale rules as a single <style> tag with !important
    // This MUST use !important to override @media print rules
    const styleEl = document.createElement('style');
    styleEl.id = 'pdf-dynamic-scaling';
    styleEl.textContent = `
      /* PDF Dynamic Scaling - Generated by pdf-generator.js */
      @media print {
        ${scaleRules.join('\n')}

        /* Ensure sheets contain scaled content without overflow */
        .sheet:not(.internal) {
          width: 8.5in !important;
          height: 11in !important;
          max-height: 11in !important;
          overflow: hidden !important;
          page-break-after: always !important;
          break-after: page !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          position: relative !important;
          box-sizing: border-box !important;
        }
        .sheet:last-of-type:not(.internal) {
          page-break-after: auto !important;
          break-after: auto !important;
        }
      }
    `;
    document.head.append(styleEl);

    return results;
  }, { safeHeight: SAFE_HEIGHT_PX, padding: PADDING_PX, isInternal: isInternalSheet });
}

/**
 * Apply print-specific CSS fixes via JavaScript
 * @param {Page} page - Puppeteer page
 * @param {Object} options - Options including isInternalSheet flag
 */
async function applyPrintFixes(page, options = {}) {
  const { isInternalSheet = false } = options;
  
  await page.evaluate((hideInternal) => {
    // Only hide internal sheets when generating client-facing PDF
    if (hideInternal) {
      for (const el of document.querySelectorAll('.sheet.internal, #report-internal-strategy')) {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.height = '0';
        el.style.overflow = 'hidden';
      }
    }

    // Force color printing and verbatim scaling
    const style = document.createElement('style');
    style.textContent = `
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @page {
        size: 8.5in 11in;
        margin: 0;
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        width: 8.5in !important;
      }
      .sheet {
        width: 8.5in !important;
        height: 11in !important;
        max-height: 11in !important;
        min-height: 11in !important;
        margin: 0 !important;
        padding: 0.25in !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }
      .sheet:last-of-type:not(.internal) {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .page-card {
        transform: none !important;
        width: 100% !important;
        height: 100% !important;
        display: flex !important;
        flex-direction: column !important;
      }
    `;
    document.head.append(style);
  }, !isInternalSheet);
}

/**
 * Stamp a synthetic-fixture watermark footer onto every printed sheet.
 * Text-layer (not background image) so PDF text search/extraction finds it.
 */
async function applyDemoWatermark(page, watermarkText) {
  await page.evaluate((text) => {
    const stamp = document.createElement('div');
    stamp.dataset.demoWatermark = '1';
    stamp.textContent = text;
    stamp.style.cssText = [
      'position: fixed',
      'left: 0',
      'right: 0',
      'bottom: 0',
      'width: 100%',
      'padding: 4px 0',
      'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'font-size: 9pt',
      'font-weight: 700',
      'letter-spacing: 0.08em',
      'text-align: center',
      'color: #b91c1c',
      'background: rgba(254, 226, 226, 0.92)',
      'border-top: 1px solid #b91c1c',
      'z-index: 2147483647',
      'pointer-events: none'
    ].join(';');
    document.body.append(stamp);

    const style = document.createElement('style');
    style.id = 'pdf-demo-watermark';
    style.textContent = `
      @media print {
        [data-demo-watermark="1"] {
          position: fixed !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          display: block !important;
          visibility: visible !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;
    document.head.append(style);
  }, watermarkText);
}

/**
 * Generate PDF from HTML file
 */
export async function generatePDF(htmlPath, pdfPath = null, options = {}) {
  console.log('[generatePDF CALLED]', { htmlPath, pdfPath, isInternal: htmlPath?.includes('INTERNAL') });
  const absoluteHtmlPath = path.resolve(htmlPath);

  if (!fs.existsSync(absoluteHtmlPath)) {
    throw new Error(`HTML file not found: ${absoluteHtmlPath}`);
  }

  pdfPath ||= absoluteHtmlPath.replace(/\.html?$/i, '.pdf');
  const absolutePdfPath = path.resolve(pdfPath);

  const outputDir = path.dirname(absolutePdfPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const pdfOptions = {
    ...DEFAULT_PDF_OPTIONS,
    ...options,
    path: absolutePdfPath
  };

  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none'
      ]
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: PAGE_WIDTH_PX,
      height: PAGE_HEIGHT_PX,
      deviceScaleFactor: 2
    });

    const fileUrl = `file:///${absoluteHtmlPath.replaceAll('\\', '/')}`;
    await page.goto(fileUrl, {
      waitUntil: 'networkidle0',
      timeout: 60_000
    });

    await page.evaluateHandle('document.fonts.ready');
    await new Promise(resolve => setTimeout(resolve, 500));

    const isInternalSheet = path.basename(htmlPath).startsWith('INTERNAL_') || 
      options.isInternalSheet === true;

    await applyPrintFixes(page, { isInternalSheet });
    const demoMode = isDemoMode(options.demoMode);
    if (demoMode) {
      await applyDemoWatermark(page, DEMO_WATERMARK_TEXT);
    }
    await new Promise(resolve => setTimeout(resolve, 200));

    await page.pdf(pdfOptions);

    const stats = fs.statSync(absolutePdfPath);

    return {
      success: true,
      pdfPath: absolutePdfPath,
      size: stats.size,
      sizeDisplay: `${(stats.size / 1024).toFixed(1)} KB`,
      isInternalSheet,
      demoMode
    };

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Generate PDF from HTML string content with dynamic scaling
 */
export async function generatePDFFromContent(htmlContent, pdfPath, options = {}) {
  const absolutePdfPath = path.resolve(pdfPath);

  const outputDir = path.dirname(absolutePdfPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const pdfOptions = {
    ...DEFAULT_PDF_OPTIONS,
    ...options,
    path: absolutePdfPath
  };

  let browser = null;
  let scalingResults = [];

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none'
      ]
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: PAGE_WIDTH_PX,
      height: PAGE_HEIGHT_PX,
      deviceScaleFactor: 2
    });

    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0',
      timeout: 30_000
    });

    await page.evaluateHandle('document.fonts.ready');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Check if this is an internal sheet
    const isInternalSheet = options.isInternalSheet === true;

    await applyPrintFixes(page, { isInternalSheet });
    await new Promise(resolve => setTimeout(resolve, 100));

    scalingResults = await measureAndScaleSheets(page, { isInternalSheet });

    const demoMode = isDemoMode(options.demoMode);
    if (demoMode) {
      await applyDemoWatermark(page, DEMO_WATERMARK_TEXT);
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    await page.pdf(pdfOptions);

    const stats = fs.statSync(absolutePdfPath);

    return {
      success: true,
      pdfPath: absolutePdfPath,
      size: stats.size,
      sizeDisplay: `${(stats.size / 1024).toFixed(1)} KB`,
      scaling: scalingResults,
      sheetsFound: scalingResults.length,
      isInternalSheet,
      demoMode
    };

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
PDF Generator - Convert HTML reports to PDF

Usage:
  node lib/pdf-generator.ts <input.html> [output.pdf] [--verbose]

Examples:
  node lib/pdf-generator.ts samples/healthcare_report.html
  node lib/pdf-generator.ts samples/report.html output/report.pdf
  node lib/pdf-generator.ts samples/report.html --verbose
`);
    process.exit(0);
  }

  const htmlPath = args[0];
  const verbose = args.includes('--verbose');
  const pdfPath = args.find(a => a !== htmlPath && !a.startsWith('--')) || null;

  console.log(`Generating PDF from ${htmlPath}...`);

  try {
    const result = await generatePDF(htmlPath, pdfPath, { verbose });
    console.log(`✓ PDF saved: ${result.pdfPath} (${result.sizeDisplay})`);

    const scaled = result.scaling?.filter(s => s.wasScaled) || [];
    if (scaled.length > 0) {
      console.log(`  ${scaled.length} sheet(s) were scaled to fit page bounds`);
    }
  } catch (error) {
    console.error(`✗ PDF generation failed: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('pdf-generator.js')) {
  main();
}
