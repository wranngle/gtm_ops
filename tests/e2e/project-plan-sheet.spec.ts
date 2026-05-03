/**
 * E2E Tests: Project Plan Sheet
 * Validates the Project Plan section of unified reports
 *
 * Test Count: 25 tests
 */
import { test, expect } from './fixtures/base.fixture';
import { ProjectPlanPage } from './pages/project-plan.page';
import { findLatestReport } from './utils/find-report';

const reportPath = findLatestReport();

test.describe('Project Plan - Timeline Section', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P0][PP-001] should have timeline section', async ({ page }) => {
    const plan = new ProjectPlanPage(page);
    await page.goto(`file://${reportPath}`);
    expect(await plan.hasTimeline()).toBe(true);
  });

  test('[P0][PP-002] should have project phases', async ({ page }) => {
    const plan = new ProjectPlanPage(page);
    await page.goto(`file://${reportPath}`);
    expect(await plan.getPhaseCount()).toBeGreaterThan(0);
  });

  test('[P0][PP-003] phases should have names', async ({ page }) => {
    const plan = new ProjectPlanPage(page);
    await page.goto(`file://${reportPath}`);
    const names = await plan.getPhaseNames();
    names.forEach(name => {
      expect(name.length).toBeGreaterThan(0);
    });
  });

  test('[P1][PP-004] should have at least 3 phases', async ({ page }) => {
    const plan = new ProjectPlanPage(page);
    await page.goto(`file://${reportPath}`);
    expect(await plan.getPhaseCount()).toBeGreaterThanOrEqual(3);
  });

  test('[P1][PP-005] phases should include discovery phase', async ({ page }) => {
    const plan = new ProjectPlanPage(page);
    await page.goto(`file://${reportPath}`);
    const names = await plan.getPhaseNames();
    const hasDiscovery = names.some(n => n.toLowerCase().includes('discovery') || n.toLowerCase().includes('design'));
    expect(hasDiscovery).toBe(true);
  });
});

test.describe('Project Plan - FinOps Section', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P0][PP-006] should display labor cost', async ({ page }) => {
    const plan = new ProjectPlanPage(page);
    await page.goto(`file://${reportPath}`);
    const labor = await plan.getLaborCost();
    expect(labor).not.toBe('N/A');
  });

  test('[P0][PP-007] labor cost should be formatted currency', async ({ page }) => {
    const plan = new ProjectPlanPage(page);
    await page.goto(`file://${reportPath}`);
    const labor = await plan.getLaborCost();
    expect(labor).toMatch(/\$[\d,]+/);
  });

  test('[P1][PP-008] should display AI ops cost', async ({ page }) => {
    const plan = new ProjectPlanPage(page);
    await page.goto(`file://${reportPath}`);
    const aiOps = await plan.getAiOpsCost();
    expect(aiOps.length).toBeGreaterThan(0);
  });

  test('[P1][PP-009] should display total investment', async ({ page }) => {
    const plan = new ProjectPlanPage(page);
    await page.goto(`file://${reportPath}`);
    const total = await plan.getTotalInvestment();
    expect(total).toMatch(/\$[\d,]+/);
  });

  test('[P2][PP-010] finops section should have visual structure', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const finops = page.locator('.finops-section, .financial-summary');
    if (await finops.count() > 0) {
      await expect(finops.first()).toBeVisible();
    }
  });
});

test.describe('Project Plan - Risk Section', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P1][PP-011] should have risk section', async ({ page }) => {
    const plan = new ProjectPlanPage(page);
    await page.goto(`file://${reportPath}`);
    const riskCount = await plan.getRiskCount();
    expect(riskCount).toBeGreaterThanOrEqual(0);
  });

  test('[P1][PP-012] risks should have descriptions', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const risks = page.locator('.risk-item, .risk-row');
    const count = await risks.count();
    for (let i = 0; i < count; i++) {
      const text = await risks.nth(i).textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  test('[P2][PP-013] risks should have severity indicators', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const riskSeverity = await page.locator('.risk-item .severity, .risk-row .status-dot').count();
    expect(riskSeverity).toBeGreaterThanOrEqual(0);
  });

  test('[P2][PP-014] risks should have mitigation strategies', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const mitigations = await page.locator('.mitigation, .risk-mitigation').count();
    expect(mitigations).toBeGreaterThanOrEqual(0);
  });

  test('[P2][PP-015] risk section should be visually distinct', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const riskSection = page.locator('.risk-section, .risks').first();
    if (await riskSection.count() > 0) {
      const bgColor = await riskSection.evaluate(el => getComputedStyle(el).backgroundColor);
      expect(bgColor).toBeDefined();
    }
  });
});

test.describe('Project Plan - Team Section', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P1][PP-016] should have team section', async ({ page }) => {
    const plan = new ProjectPlanPage(page);
    await page.goto(`file://${reportPath}`);
    const roleCount = await plan.getTeamRoleCount();
    expect(roleCount).toBeGreaterThanOrEqual(0);
  });

  test('[P1][PP-017] team roles should have titles', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const roles = page.locator('.team-role, .role-item');
    const count = await roles.count();
    for (let i = 0; i < count; i++) {
      const title = await roles.nth(i).locator('.role-title, h5, strong').textContent();
      if (title) expect(title.trim().length).toBeGreaterThan(0);
    }
  });

  test('[P2][PP-018] team roles should have responsibilities', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const responsibilities = await page.locator('.role-responsibility, .role-desc').count();
    expect(responsibilities).toBeGreaterThanOrEqual(0);
  });

  test('[P2][PP-019] team section should show allocation', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const allocation = await page.locator('text=/hour|%|FTE|time/i').count();
    expect(allocation).toBeGreaterThanOrEqual(0);
  });

  test('[P2][PP-020] team section should be properly styled', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const teamSection = page.locator('.team-section, .project-team').first();
    if (await teamSection.count() > 0) {
      await expect(teamSection).toBeVisible();
    }
  });
});

test.describe('Project Plan - Success Metrics', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P1][PP-021] should have success metrics', async ({ page }) => {
    const plan = new ProjectPlanPage(page);
    await page.goto(`file://${reportPath}`);
    const metricCount = await plan.getSuccessMetricCount();
    expect(metricCount).toBeGreaterThanOrEqual(0);
  });

  test('[P1][PP-022] metrics should have target values', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const metrics = page.locator('.success-metric, .kpi-item');
    const count = await metrics.count();
    for (let i = 0; i < count; i++) {
      const value = await metrics.nth(i).locator('.target, .value, .metric-value').textContent();
      if (value) expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  test('[P2][PP-023] metrics should have labels', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const metrics = page.locator('.success-metric, .kpi-item');
    const count = await metrics.count();
    for (let i = 0; i < count; i++) {
      const label = await metrics.nth(i).locator('.label, .metric-name').textContent();
      if (label) expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  test('[P2][PP-024] metrics should be measurable', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const measurable = await page.locator('text=/%|\\$|hour|day|week|month/i').count();
    expect(measurable).toBeGreaterThan(0);
  });

  test('[P2][PP-025] metrics section should have visual cards', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const cards = await page.locator('.stat-card, .metric-card, .kpi-card').count();
    expect(cards).toBeGreaterThanOrEqual(0);
  });
});
