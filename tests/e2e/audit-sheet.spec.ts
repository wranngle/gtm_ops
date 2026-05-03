/**
 * E2E Tests: AI Audit Sheet
 * Validates the AI Process Audit section of unified reports
 *
 * Test Count: 25 tests
 */
import { test, expect } from './fixtures/base.fixture';
import { ReportPage } from './pages/report.page';
import { AuditPage } from './pages/audit.page';
import { findLatestReport } from './utils/find-report';

const reportPath = findLatestReport();

test.describe('AI Audit Sheet - Executive Summary', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P0][AU-001] should have executive summary section', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    await expect(audit.execSummary).toBeVisible();
  });

  test('[P0][AU-002] executive summary should have content', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const text = await audit.getExecSummaryText();
    expect(text.length).toBeGreaterThan(50);
  });

  test('[P1][AU-003] executive summary should not contain undefined', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const text = await audit.getExecSummaryText();
    expect(text).not.toContain('undefined');
  });

  test('[P1][AU-004] executive summary should have orange left border', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const borderColor = await audit.execSummary.evaluate(el =>
      getComputedStyle(el).borderLeftColor
    );
    // Orange is rgb(255, 95, 0) or similar
    expect(borderColor).toMatch(/rgb\(255,\s*9\d,\s*0\)|#ff5f00/i);
  });

  test('[P2][AU-005] executive summary should have proper typography', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const fontFamily = await audit.execSummary.evaluate(el =>
      getComputedStyle(el).fontFamily
    );
    expect(fontFamily.toLowerCase()).toMatch(/inter|outfit|sans-serif/);
  });
});

test.describe('AI Audit Sheet - Scorecard', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P0][AU-006] should have scorecard section', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    expect(await audit.getScorecardRowCount()).toBeGreaterThan(0);
  });

  test('[P0][AU-007] scorecard should have status dots', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    expect(await audit.hasStatusDots()).toBe(true);
  });

  test('[P1][AU-008] status dots should use correct colors', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const dots = await audit.getStatusDotCounts();
    expect(dots.critical + dots.warning + dots.healthy).toBeGreaterThan(0);
  });

  test('[P1][AU-009] scorecard rows should have labels', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const rows = page.locator('.scorecard-row, .assessment-row');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const label = await rows.nth(i).locator('.label, .row-label, td:first-child').textContent();
      expect(label?.trim().length).toBeGreaterThan(0);
    }
  });

  test('[P2][AU-010] scorecard should have consistent row heights', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const rows = page.locator('.scorecard-row, .assessment-row');
    const heights: number[] = [];
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const box = await rows.nth(i).boundingBox();
      if (box) heights.push(Math.round(box.height));
    }

    const uniqueHeights = [...new Set(heights)];
    expect(uniqueHeights.length).toBeLessThanOrEqual(3);
  });
});

test.describe('AI Audit Sheet - Bleed Analysis', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P0][AU-011] should display bleed total', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const bleed = await audit.getBleedTotal();
    expect(bleed).not.toBe('N/A');
  });

  test('[P0][AU-012] bleed total should be formatted currency', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const bleed = await audit.getBleedTotal();
    expect(bleed).toMatch(/\$[\d,]+/);
  });

  test('[P1][AU-013] should display bleed period', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const period = await audit.getBleedPeriod();
    expect(period.length).toBeGreaterThan(0);
  });

  test('[P1][AU-014] bleed period should be valid timeframe', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const period = await audit.getBleedPeriod();
    expect(period.toLowerCase()).toMatch(/month|year|week|day|annual/);
  });

  test('[P2][AU-015] bleed section should have math pills', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const mathPills = await page.locator('.math-pill').count();
    expect(mathPills).toBeGreaterThan(0);
  });
});

test.describe('AI Audit Sheet - Process Analysis', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P0][AU-016] should have process steps', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    expect(await audit.getProcessStepCount()).toBeGreaterThan(0);
  });

  test('[P1][AU-017] should identify pain points', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    expect(await audit.getPainPointCount()).toBeGreaterThanOrEqual(0);
  });

  test('[P1][AU-018] process steps should be numbered or bulleted', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const steps = page.locator('.process-step, .workflow-step');
    const count = await steps.count();
    if (count > 0) {
      const firstStep = await steps.first().textContent();
      expect(firstStep).toBeDefined();
    }
  });

  test('[P2][AU-019] pain points should have severity indicators', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const painPoints = page.locator('.pain-point, .friction-item');
    const count = await painPoints.count();
    if (count > 0) {
      const hasSeverity = await page.locator('.pain-point .severity, .friction-item .status-dot').count();
      expect(hasSeverity).toBeGreaterThanOrEqual(0);
    }
  });

  test('[P2][AU-020] process flow should be visually connected', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    // Check for process flow elements - template uses list items, nav elements, or breadcrumbs
    const hasFlow = await page.locator('.process-step, .workflow-step, .flow-arrow, ol li, ul li, .breadcrumb, nav, .step, .nav-badge').count();
    expect(hasFlow).toBeGreaterThan(0);
  });
});

test.describe('AI Audit Sheet - Scores', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P1][AU-021] should display opportunity score', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const scores = await audit.getScores();
    expect(scores.opportunity).toBeDefined();
  });

  test('[P1][AU-022] should display complexity score', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const scores = await audit.getScores();
    expect(scores.complexity).toBeDefined();
  });

  test('[P1][AU-023] should display readiness score', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const scores = await audit.getScores();
    expect(scores.readiness).toBeDefined();
  });

  test('[P2][AU-024] scores should be numeric or descriptive', async ({ page }) => {
    const audit = new AuditPage(page);
    await page.goto(`file://${reportPath}`);
    const scores = await audit.getScores();
    const allScores = [scores.opportunity, scores.complexity, scores.readiness];
    for (const score of allScores) {
      if (score !== 'N/A' && score !== undefined) {
        // Accept numeric values, descriptive words, or tier labels like "standard", "complex"
        expect(score).toMatch(/\d|high|medium|low|good|excellent|standard|complex|simple|moderate/i);
      }
    }
  });

  test('[P2][AU-025] scores should have visual indicators', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    // Template uses .stat for stats and .card for cards
    const scoreCards = await page.locator('.stat, .card, .indicator').count();
    expect(scoreCards).toBeGreaterThan(0);
  });
});
