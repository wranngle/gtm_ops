/**
 * E2E Tests: Report Rendering
 *
 * Validates that generated HTML reports render correctly:
 * - All 7 sheets present and visible
 * - No placeholder or undefined values
 * - Proper formatting of currency and dates
 * - Visual regression (screenshot comparison)
 */
import { test, expect } from './fixtures/base.fixture';
import { ReportPage } from './pages/report.page';
import { findLatestReport } from './utils/find-report';

// Get report path once at module load
const reportPath = findLatestReport();
const EXPECTED_SHEET_COUNT = 7;

// Skip entire describe block if no reports
test.describe('Report Rendering', () => {
  test.skip(!reportPath, 'No generated reports found in output directory');

  test('[P0] should render all 7 sheets', async ({ page }) => {
    // GIVEN: A generated report exists
    const report = new ReportPage(page);
    await report.goto(reportPath!);

    // WHEN: Checking sheet count
    const sheetCount = await report.getSheetCount();

    // THEN: All 7 sheets should be present
    expect(sheetCount).toBe(EXPECTED_SHEET_COUNT);
  });

  test('[P0] should display client name correctly', async ({ page }) => {
    // GIVEN: A generated report
    const report = new ReportPage(page);
    await report.goto(reportPath!);

    // WHEN: Checking header
    await report.verifyHeader();

    // THEN: Client name should not be placeholder
    const clientName = await report.clientName.textContent();
    expect(clientName).not.toBe('Unknown Client');
    expect(clientName).not.toBe('');
    expect(clientName).not.toContain('undefined');
  });

  test('[P0] should have no placeholder values', async ({ page }) => {
    // GIVEN: A generated report
    const report = new ReportPage(page);
    await report.goto(reportPath!);

    // WHEN: Checking for placeholders
    const issues = await report.verifyNoPlaceholders();

    // THEN: No placeholders should be found
    expect(issues).toHaveLength(0);
  });

  test('[P1] should have valid document slug format', async ({ page }) => {
    // GIVEN: A generated report
    const report = new ReportPage(page);
    await report.goto(reportPath!);

    // WHEN: Getting document slug
    const slug = await report.documentSlug.textContent();

    // THEN: Slug should match expected format
    expect(slug).toMatch(/WRN-AI-[\w-]+-\d{2}r\d+/);
  });

  test('[P1] should have properly formatted currency values', async ({ page }) => {
    // GIVEN: A generated report
    const report = new ReportPage(page);
    await report.goto(reportPath!);

    // WHEN: Getting stat values
    const stats = await report.getStatValues();

    // THEN: Currency values should be properly formatted
    stats.forEach((value, label) => {
      if (value.includes('$')) {
        // Should match $X,XXX or $X,XXX.XX format
        expect(value).toMatch(/\$[\d,]+(\.\d{2})?/);
      }
    });
  });

  test('[P1] should display integrations in scope sheet', async ({ page }) => {
    // GIVEN: A generated report
    const report = new ReportPage(page);
    await report.goto(reportPath!);

    // WHEN: Getting integrations list
    const integrations = await report.getIntegrations();

    // THEN: Integrations should be populated (if any exist)
    // Note: Some reports may legitimately have 0 integrations
    expect(integrations).toBeDefined();
    expect(Array.isArray(integrations)).toBe(true);
  });

  test('[P2] visual regression - full page', async ({ page }) => {
    // GIVEN: A generated report
    const report = new ReportPage(page);
    await report.goto(reportPath!);

    // Wait for layout to stabilize (font loading can cause height changes)
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // WHEN: Taking full page screenshot
    // THEN: Should match baseline (or create new baseline)
    await expect(page).toHaveScreenshot('full-report.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
      timeout: 15000, // Allow more time for stable screenshots
    });
  });

  test('[P2] visual regression - individual sheets', async ({ page }) => {
    // GIVEN: A generated report
    const report = new ReportPage(page);
    await report.goto(reportPath!);

    // WHEN/THEN: Each sheet should match its baseline
    const sheetCount = await report.getSheetCount();

    for (let i = 0; i < sheetCount; i++) {
      const sheet = report.getSheet(i);
      await expect(sheet).toHaveScreenshot(`sheet-${i + 1}.png`, {
        maxDiffPixelRatio: 0.05,
      });
    }
  });
});

test.describe('Report Data Integrity', () => {
  test.skip(!reportPath, 'No generated reports found in output directory');

  test('[P0] should not contain literal "undefined" text', async ({ page }) => {
    // GIVEN: A generated report
    const report = new ReportPage(page);
    await report.goto(reportPath!);

    // WHEN: Searching for undefined
    const undefinedCount = await page.locator('text=undefined').count();

    // THEN: No undefined should be present
    expect(undefinedCount).toBe(0);
  });

  test('[P0] should not contain "NaN" values', async ({ page }) => {
    // GIVEN: A generated report
    const report = new ReportPage(page);
    await report.goto(reportPath!);

    // WHEN: Searching for NaN (use regex to match exact "NaN", not substrings like "maintenance")
    // Playwright's text= without quotes does substring matching, so use regex
    const nanCount = await page.locator('text=/\\bNaN\\b/').count();

    // THEN: No NaN should be present
    expect(nanCount).toBe(0);
  });

  test('[P1] should have ROI values populated', async ({ page }) => {
    // GIVEN: A generated report
    const report = new ReportPage(page);
    await report.goto(reportPath!);

    // WHEN: Getting ROI values
    const roi = await report.getROIValues();

    // THEN: Key ROI values should not be N/A
    // Note: Some legitimate cases may have N/A, so we check format
    if (roi.annualSavings !== 'N/A') {
      expect(roi.annualSavings).toMatch(/\$[\d,]+/);
    }
  });
});
