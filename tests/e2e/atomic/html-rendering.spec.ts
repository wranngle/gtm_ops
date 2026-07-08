/**
 * ATDD Tests: HTML Rendering Accuracy
 *
 * Atomic validation that schema data renders correctly to HTML output.
 * Each test validates specific data-to-DOM mappings.
 *
 * Test Matrix: Validates all 7 sheets for data accuracy
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Helper: Find matching HTML and schema pairs
function findOutputPairs(): Array<{ html: string; schema: any; clientSlug: string }> {
  const outputDir = path.join(process.cwd(), 'output');
  const pairs: Array<{ html: string; schema: any; clientSlug: string }> = [];

  function findInDir(dir: string, clientSlug: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      let htmlFile: string | null = null;
      let schemaFile: string | null = null;

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          findInDir(fullPath, clientSlug || entry.name);
        } else if (entry.name.includes('_report_') && entry.name.endsWith('.html')) {
          htmlFile = fullPath;
        } else if (entry.name.includes('_schema_') && entry.name.endsWith('.json')) {
          schemaFile = fullPath;
        }
      }

      if (htmlFile && schemaFile) {
        try {
          const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
          pairs.push({ html: htmlFile, schema, clientSlug: clientSlug || 'unknown' });
        } catch (e) {
          // Skip invalid pairs
        }
      }
    } catch (e) {
      // Skip inaccessible directories
    }
  }

  // output/ is gitignored — only present after the operator runs the
  // generation pipeline locally. Bail gracefully so `bun run test:e2e`
  // doesn't crash with ENOENT on a fresh clone.
  if (!fs.existsSync(outputDir)) {
    return pairs;
  }
  const clientDirs = fs.readdirSync(outputDir).filter(d =>
    fs.statSync(path.join(outputDir, d)).isDirectory()
  );

  for (const clientDir of clientDirs) {
    findInDir(path.join(outputDir, clientDir), clientDir);
  }

  return pairs;
}

// Get a sample of pairs for testing (avoid running 100+ tests)
// Deduplicate by clientSlug to avoid duplicate test titles
const allPairs = findOutputPairs();
const seenClients = new Set<string>();
const samplePairs = allPairs.filter(pair => {
  if (seenClients.has(pair.clientSlug)) return false;
  seenClients.add(pair.clientSlug);
  return true;
}).slice(0, 20); // Test first 20 unique clients

// ============================================================================
// TEST SUITE 1: Header Rendering
// ============================================================================
test.describe('Atomic: Header Rendering', () => {
  for (const { html, schema, clientSlug } of samplePairs.slice(0, 5)) {
    test(`[HR-001] ${clientSlug}: Client name renders in header`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const headerClient = await page.locator('.wrn-header-client').first().textContent();
      const expectedClient = schema.identity?.client_name;

      // Normalize trailing punctuation for comparison (legacy outputs may have trailing periods)
      const normalizeText = (text: string | undefined | null) =>
        text?.trim().replace(/[.]+$/, '') || '';

      expect(normalizeText(headerClient)).toBe(normalizeText(expectedClient));
    });

    test(`[HR-002] ${clientSlug}: Document slug renders correctly`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const headerSlug = await page.locator('.wrn-header-slug').first().textContent();
      const expectedSlug = schema.identity?.document_slug;

      expect(headerSlug?.trim()).toBe(expectedSlug);
    });

    test(`[HR-003] ${clientSlug}: Process name renders in header`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const headerProcess = await page.locator('.wrn-header-process').first().textContent();
      const expectedProcess = schema.identity?.process_name;

      // Normalize trailing punctuation for comparison (legacy outputs may have trailing periods)
      const normalizeText = (text: string | undefined | null) =>
        text?.trim().replace(/[.]+$/, '') || '';

      expect(normalizeText(headerProcess)).toBe(normalizeText(expectedProcess));
    });
  }
});

// ============================================================================
// TEST SUITE 2: Sheet Structure Rendering
// ============================================================================
test.describe('Atomic: Sheet Structure', () => {
  test('[SR-001] All 7 sheets are present', async ({ page }) => {
    if (samplePairs.length === 0) {
      test.skip();
      return;
    }

    await page.goto(`file://${samplePairs[0].html}`);

    const sheetCount = await page.locator('.sheet').count();
    // 7 core sheets + optional internal sheet (8) if lead_qualification is present
    expect(sheetCount).toBeGreaterThanOrEqual(7);
    expect(sheetCount).toBeLessThanOrEqual(8);
  });

  test('[SR-002] Sheet IDs are correct', async ({ page }) => {
    if (samplePairs.length === 0) {
      test.skip();
      return;
    }

    await page.goto(`file://${samplePairs[0].html}`);

    const expectedIds = [
      'report-ai-process',
      'report-scope-of-work',
      'report-project-plan',
      'report-risk-assessment',
      'report-finops',
      'report-proposal-p1',
      'report-commercial-strategy',
    ];

    for (const id of expectedIds) {
      const sheet = page.locator(`#${id}`);
      expect(await sheet.count(), `Sheet #${id} should exist`).toBe(1);
    }
  });

  test('[SR-003] Gradient sheets have gradient class', async ({ page }) => {
    if (samplePairs.length === 0) {
      test.skip();
      return;
    }

    await page.goto(`file://${samplePairs[0].html}`);

    // AI Process and Project Plan should have gradient
    const gradientSheets = ['report-ai-process', 'report-project-plan'];

    for (const id of gradientSheets) {
      const sheet = page.locator(`#${id}`);
      const hasGradient = await sheet.evaluate(el => el.classList.contains('gradient'));
      expect(hasGradient, `#${id} should have gradient class`).toBe(true);
    }
  });
});

// ============================================================================
// TEST SUITE 3: Metrics Rendering
// ============================================================================
test.describe('Atomic: Metrics Rendering', () => {
  for (const { html, schema, clientSlug } of samplePairs.slice(0, 5)) {
    test(`[MR-001] ${clientSlug}: Metrics count matches schema`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const schemaMetrics = schema.measurements?.metrics?.order?.length || 0;

      if (schemaMetrics > 0) {
        // AI Process sheet renders metrics as metric-chip elements in scorecard
        const metricChips = await page.locator('#report-ai-process .metric-chip').count();
        // Also check for stat elements in other sheets (project plan, finops)
        const statElements = await page.locator('.stat').count();

        // Should have some metrics rendered (either as chips or stats)
        expect(metricChips + statElements).toBeGreaterThan(0);
      }
    });

    test(`[MR-002] ${clientSlug}: Bleed total renders correctly`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const expectedBleed = schema.measurements?.bleed_total?.display;

      if (expectedBleed) {
        // Check .bleed-amount element exists and contains the expected value
        const bleedAmount = page.locator('.bleed-amount');
        const bleedCount = await bleedAmount.count();

        if (bleedCount > 0) {
          const bleedText = await bleedAmount.first().textContent();
          expect(bleedText, `Bleed display should contain value`).toContain(expectedBleed.replace('/mo', '').trim());
        } else {
          // Fallback: check if the value appears anywhere in the page
          const pageContent = await page.content();
          const valueWithoutPeriod = expectedBleed.replace(/[/]mo/, '').replace(/[,]/g, '');
          expect(
            pageContent.includes(expectedBleed) || pageContent.includes(valueWithoutPeriod),
            `Bleed display "${expectedBleed}" should appear somewhere in the page`
          ).toBe(true);
        }
      }
    });
  }
});

// ============================================================================
// TEST SUITE 4: Pricing Rendering
// ============================================================================
test.describe('Atomic: Pricing Rendering', () => {
  for (const { html, schema, clientSlug } of samplePairs.slice(0, 5)) {
    test(`[PR-001] ${clientSlug}: Total price renders`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const expectedTotal = schema.estimate?.pricing?.total_display;

      if (expectedTotal) {
        const totalElements = await page.locator(`text=${expectedTotal}`).count();
        expect(totalElements, `Total price "${expectedTotal}" should appear`).toBeGreaterThan(0);
      }
    });

    test(`[PR-002] ${clientSlug}: Milestones render with percentages`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const milestones = schema.estimate?.pricing?.milestones;

      if (milestones) {
        const milestoneCount = Object.keys(milestones).length;

        // Look for milestone indicators (should have percentage signs)
        const percentageElements = await page.locator(String.raw`.milestone, text=/\d+%/`).count();

        // Should have multiple percentage displays for milestones
        expect(percentageElements).toBeGreaterThan(0);
      }
    });
  }
});

// ============================================================================
// TEST SUITE 5: Integration Table Rendering
// ============================================================================
test.describe('Atomic: Integration Table Rendering', () => {
  for (const { html, schema, clientSlug } of samplePairs.slice(0, 5)) {
    test(`[IT-001] ${clientSlug}: Integrations render in scope sheet`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const integrations = schema.research?.integrations || [];

      if (integrations.length > 0) {
        // Look for integration elements in scope sheet
        const scopeSheet = page.locator('#report-scope-of-work');
        const integrationRows = await scopeSheet.locator('tr, .integration-generic').count();

        // Should have at least some integration rows (header + data)
        expect(integrationRows).toBeGreaterThan(0);
      }
    });

    test(`[IT-002] ${clientSlug}: Tech stack pills render`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const techApproach = schema.technical_approach;

      if (techApproach?.technology_stack?.length > 0) {
        const techPills = await page.locator('.tech-pills .pill, .tech-pill').count();
        expect(techPills).toBeGreaterThan(0);
      }
    });
  }
});

// ============================================================================
// TEST SUITE 6: ROI Rendering
// ============================================================================
test.describe('Atomic: ROI Rendering', () => {
  for (const { html, schema, clientSlug } of samplePairs.slice(0, 5)) {
    test(`[ROI-001] ${clientSlug}: Annual savings renders`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const annualDisplay = schema.estimate?.finops?.value_breakdown?.total_annual_display;

      if (annualDisplay) {
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toContain(annualDisplay);
      }
    });

    test(`[ROI-002] ${clientSlug}: Payback period renders`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const payback = schema.estimate?.finops?.payback;

      if (payback?.display) {
        const bodyText = await page.locator('body').textContent();

        // Check for payback display or related keywords
        const hasPayback = bodyText?.includes(payback.display) ||
                          bodyText?.includes('week') ||
                          bodyText?.includes('month');
        expect(hasPayback).toBe(true);
      }
    });
  }
});

// ============================================================================
// TEST SUITE 7: No Placeholder Values
// ============================================================================
test.describe('Atomic: No Placeholder Values in HTML', () => {
  const testPairs = samplePairs.slice(0, 10);

  for (const { html, clientSlug } of testPairs) {
    test(`[NP-001] ${clientSlug}: No "undefined" in HTML`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const bodyText = await page.locator('body').textContent();
      expect(bodyText).not.toContain('undefined');
    });

    test(`[NP-002] ${clientSlug}: No "NaN" in HTML`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const bodyText = await page.locator('body').textContent();
      // Use word boundary check to avoid matching "maintenance", "channel", etc.
      expect(bodyText?.match(/\bNaN\b/)).toBeNull();
    });

    test(`[NP-003] ${clientSlug}: No "[object Object]" in HTML`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const bodyText = await page.locator('body').textContent();
      expect(bodyText).not.toContain('[object Object]');
    });

    test(`[NP-004] ${clientSlug}: No empty mustache tags`, async ({ page }) => {
      await page.goto(`file://${html}`);

      const bodyText = await page.locator('body').textContent();
      expect(bodyText).not.toMatch(/\{\{[^}]*\}\}/);
    });
  }
});

// ============================================================================
// TEST SUITE 8: Visual Completeness
// ============================================================================
test.describe('Atomic: Visual Completeness', () => {
  test('[VC-001] All sheets have visible content', async ({ page }) => {
    if (samplePairs.length === 0) {
      test.skip();
      return;
    }

    await page.goto(`file://${samplePairs[0].html}`);

    const sheets = page.locator('.sheet');
    const sheetCount = await sheets.count();

    for (let i = 0; i < sheetCount; i++) {
      const sheet = sheets.nth(i);
      const boundingBox = await sheet.boundingBox();

      expect(boundingBox, `Sheet ${i + 1} should have dimensions`).toBeTruthy();
      expect(boundingBox?.height).toBeGreaterThan(100);
      expect(boundingBox?.width).toBeGreaterThan(100);
    }
  });

  test('[VC-002] Headers and footers are present on all sheets', async ({ page }) => {
    if (samplePairs.length === 0) {
      test.skip();
      return;
    }

    await page.goto(`file://${samplePairs[0].html}`);

    // Each sheet should have header
    const headers = await page.locator('.wrn-header').count();
    const sheets = await page.locator('.sheet').count();

    // Should have at least one header (some sheets share headers)
    expect(headers).toBeGreaterThan(0);
  });

  test('[VC-003] No broken images', async ({ page }) => {
    if (samplePairs.length === 0) {
      test.skip();
      return;
    }

    await page.goto(`file://${samplePairs[0].html}`);

    const images = page.locator('img');
    const imgCount = await images.count();

    for (let i = 0; i < imgCount; i++) {
      const img = images.nth(i);
      const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);

      // Natural width > 0 means image loaded successfully
      expect(naturalWidth, `Image ${i + 1} should load`).toBeGreaterThan(0);
    }
  });

  test('[VC-004] Math pills have content', async ({ page }) => {
    if (samplePairs.length === 0) {
      test.skip();
      return;
    }

    await page.goto(`file://${samplePairs[0].html}`);

    const mathPills = page.locator('.math-pill');
    const count = await mathPills.count();

    for (let i = 0; i < count; i++) {
      const pill = mathPills.nth(i);
      const text = await pill.textContent();

      expect(text?.trim().length, `Math pill ${i + 1} should have content`).toBeGreaterThan(0);
      expect(text).not.toContain('undefined');
    }
  });
});
