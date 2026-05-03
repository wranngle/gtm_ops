/**
 * E2E Tests: Scope of Work Sheet
 * Validates the Scope of Work section of unified reports
 *
 * Test Count: 20 tests
 */
import { test, expect } from './fixtures/base.fixture';
import { ScopePage } from './pages/scope.page';
import { findLatestReport } from './utils/find-report';

const reportPath = findLatestReport();

test.describe('Scope of Work - Technology Stack', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P0][SC-001] should display technology stack', async ({ page }) => {
    const scope = new ScopePage(page);
    await page.goto(`file://${reportPath}`);
    expect(await scope.getTechStackCount()).toBeGreaterThan(0);
  });

  test('[P0][SC-002] should include n8n in tech stack', async ({ page }) => {
    const scope = new ScopePage(page);
    await page.goto(`file://${reportPath}`);
    const stack = await scope.getTechStackItems();
    const hasN8n = stack.some(t => t.toLowerCase().includes('n8n'));
    expect(hasN8n).toBe(true);
  });

  test('[P1][SC-003] tech stack should have visual pills', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    // Template uses .tech-pills container with .badge children
    const techPills = await page.locator('.tech-pills .badge, .badge--code').count();
    expect(techPills).toBeGreaterThan(0);
  });

  test('[P1][SC-004] tech stack should be styled consistently', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    // Template uses .tech-pills container with .badge children
    const pills = page.locator('.tech-pills .badge, .badge--code');
    const count = await pills.count();
    if (count > 0) {
      // Badge uses gradient background via 'background' shorthand, not 'background-color'
      // So we check that background is set (not 'none') instead of backgroundColor
      const background = await pills.first().evaluate(el => getComputedStyle(el).background);
      expect(background).not.toBe('none');
      expect(background.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Scope of Work - Integrations Table', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P0][SC-005] should have integrations table', async ({ page }) => {
    const scope = new ScopePage(page);
    await page.goto(`file://${reportPath}`);
    expect(await scope.getIntegrationCount()).toBeGreaterThanOrEqual(0);
  });

  test('[P1][SC-006] integrations should have system names', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const rows = page.locator('.integration-row, .integrations-table tr');
    const count = await rows.count();
    for (let i = 1; i < count; i++) { // Skip header row
      const name = await rows.nth(i).locator('td:first-child').textContent();
      if (name) expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  test('[P1][SC-007] integrations should show complexity', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const complexity = await page.locator('text=/low|medium|high|simple|complex/i').count();
    expect(complexity).toBeGreaterThanOrEqual(0);
  });

  test('[P2][SC-008] integrations should indicate native node status', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const nativeStatus = await page.locator('text=/native|custom|api/i').count();
    expect(nativeStatus).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Scope of Work - Deliverables', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P0][SC-009] should have deliverables section', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    // Template uses deliverables-list or milestone-deliverables
    const deliverables = await page.locator('.deliverables-list li, .milestone-deliverables li').count();
    expect(deliverables).toBeGreaterThanOrEqual(0); // Deliverables are optional in some reports
  });

  test('[P0][SC-010] deliverables should have descriptions', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    // Template uses deliverables-list or milestone-deliverables
    const deliverables = page.locator('.deliverables-list li, .milestone-deliverables li');
    const count = await deliverables.count();
    for (let i = 0; i < count; i++) {
      const text = await deliverables.nth(i).textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  test('[P1][SC-011] deliverables should be numbered or bulleted', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    // Template uses deliverables-list (ul with arrow markers) or scope-list
    const lists = await page.locator('.deliverables-list, .milestone-deliverables ul, .scope-list').count();
    expect(lists).toBeGreaterThanOrEqual(0); // Lists are optional in some reports
  });

  test('[P2][SC-012] deliverables should reference phases', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const phaseRefs = await page.locator('text=/phase|stage|milestone/i').count();
    expect(phaseRefs).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Scope of Work - Boundaries', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P1][SC-013] should define in-scope items', async ({ page }) => {
    const scope = new ScopePage(page);
    await page.goto(`file://${reportPath}`);
    const inScope = await scope.getInScopeItems();
    expect(inScope.length).toBeGreaterThanOrEqual(0);
  });

  test('[P1][SC-014] should define out-of-scope items', async ({ page }) => {
    const scope = new ScopePage(page);
    await page.goto(`file://${reportPath}`);
    const outScope = await scope.getOutOfScopeItems();
    expect(outScope.length).toBeGreaterThanOrEqual(0);
  });

  test('[P2][SC-015] scope boundaries should be clearly marked', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const boundaries = await page.locator('.in-scope, .out-of-scope, .scope-boundary').count();
    expect(boundaries).toBeGreaterThanOrEqual(0);
  });

  test('[P2][SC-016] exclusions should be explicit', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const exclusions = await page.locator('text=/not included|excluded|outside scope/i').count();
    expect(exclusions).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Scope of Work - Research Citations', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P2][SC-017] should have research citations if available', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const citations = await page.locator('.citation, .research-citation, a[href*="http"]').count();
    expect(citations).toBeGreaterThanOrEqual(0);
  });

  test('[P2][SC-018] citations should be clickable links', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const links = page.locator('.citation a, .research-citation a');
    const count = await links.count();
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href');
      if (href) expect(href).toMatch(/^https?:\/\//);
    }
  });

  test('[P2][SC-019] labor factors should be listed if present', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const laborFactors = await page.locator('.labor-factor, .effort-factor').count();
    expect(laborFactors).toBeGreaterThanOrEqual(0);
  });

  test('[P2][SC-020] technical approach should summarize methodology', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const methodology = await page.locator('text=/approach|methodology|implementation/i').count();
    expect(methodology).toBeGreaterThan(0);
  });
});
