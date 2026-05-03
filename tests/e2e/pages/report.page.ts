/**
 * Report Page Object
 *
 * Encapsulates interactions with the unified presales report HTML output.
 *
 * Actual sheet structure (7 sheets):
 * 1. report-ai-process - AI Process Audit (gradient)
 * 2. report-scope-of-work - Scope of Work (white)
 * 3. report-project-plan - Project Plan (gradient)
 * 4. report-risk-assessment - Risk Assessment (white)
 * 5. report-finops - FinOps (white)
 * 6. report-proposal-p1 - Proposal (white)
 * 7. report-commercial-strategy - Commercial Strategy (white)
 */
import { Page, Locator, expect } from '@playwright/test';

export class ReportPage {
  readonly page: Page;

  // Header elements
  readonly header: Locator;
  readonly clientName: Locator;
  readonly processName: Locator;
  readonly documentSlug: Locator;
  readonly logo: Locator;

  // Sheet containers
  readonly sheets: Locator;
  readonly auditSheet: Locator;
  readonly scopeSheet: Locator;
  readonly projectPlanSheet: Locator;
  readonly riskSheet: Locator;
  readonly finopsSheet: Locator;
  readonly proposalSheet: Locator;
  readonly commercialSheet: Locator;

  // Common elements
  readonly execSummary: Locator;
  readonly techStack: Locator;
  readonly integrations: Locator;
  readonly mathPills: Locator;
  readonly cards: Locator;
  readonly stats: Locator;

  // Footer (uses deck-footer, not wrn-footer)
  readonly footer: Locator;
  readonly footerSlug: Locator;
  readonly footerCopy: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.header = page.locator('.wrn-header').first();
    this.clientName = page.locator('.wrn-header-client').first();
    this.processName = page.locator('.wrn-header-process').first();
    this.documentSlug = page.locator('.wrn-header-slug').first();
    this.logo = page.locator('.wrn-header-logo').first();

    // Sheets - by ID for precise targeting
    this.sheets = page.locator('.sheet');
    this.auditSheet = page.locator('#report-ai-process');
    this.scopeSheet = page.locator('#report-scope-of-work');
    this.projectPlanSheet = page.locator('#report-project-plan');
    this.riskSheet = page.locator('#report-risk-assessment');
    this.finopsSheet = page.locator('#report-finops');
    this.proposalSheet = page.locator('#report-proposal-p1');
    this.commercialSheet = page.locator('#report-commercial-strategy');

    // Common elements with actual selectors
    this.execSummary = page.locator('.card.card--accent').first();
    this.techStack = page.locator('.tech-pills');
    this.integrations = page.locator('.integration-generic, table');
    this.mathPills = page.locator('.math-pill');
    this.cards = page.locator('.card');
    this.stats = page.locator('.stat');

    // Footer - actual classes (template uses deck-footer)
    this.footer = page.locator('.deck-footer, .wrn-footer').first();
    this.footerSlug = page.locator('.deck-footer-slug, .wrn-footer-slug').first();
    this.footerCopy = page.locator('.deck-footer-copy, .wrn-footer-copy').first();
  }

  /**
   * Navigate to a report file
   */
  async goto(filePath: string): Promise<void> {
    await this.page.goto(`file://${filePath}`);
    await this.waitForLoad();
  }

  /**
   * Wait for report to fully load
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.sheets.first().waitFor({ state: 'visible' });
  }

  /**
   * Get total sheet count
   */
  async getSheetCount(): Promise<number> {
    return await this.sheets.count();
  }

  /**
   * Get sheet by index (0-based)
   */
  getSheet(index: number): Locator {
    return this.sheets.nth(index);
  }

  /**
   * Verify header is properly rendered
   */
  async verifyHeader(): Promise<void> {
    await expect(this.header).toBeVisible();
    await expect(this.clientName).not.toBeEmpty();
    await expect(this.processName).not.toBeEmpty();
    await expect(this.documentSlug).toContainText('WRN-AI-');
  }

  /**
   * Verify no placeholder values remain
   */
  async verifyNoPlaceholders(): Promise<string[]> {
    const issues: string[] = [];

    // Check for common placeholder patterns
    const placeholders = [
      'Unknown Client',
      'Business Process',
      'undefined',
      'NaN',
      '[object Object]',
    ];

    for (const placeholder of placeholders) {
      const count = await this.page.locator(`text="${placeholder}"`).count();
      if (count > 0) {
        issues.push(`Found "${placeholder}" ${count} times`);
      }
    }

    return issues;
  }

  /**
   * Get all stat values from stat cards
   */
  async getStatValues(): Promise<Map<string, string>> {
    const stats = new Map<string, string>();
    const statElements = this.page.locator('.stat');
    const count = await statElements.count();

    for (let i = 0; i < count; i++) {
      try {
        const stat = statElements.nth(i);
        // Use more resilient selectors - check if element exists first
        const labelEl = stat.locator('.stat__label, .label');
        const valueEl = stat.locator('.stat__value, .value');
        
        let label = `stat-${i}`;
        let value = '';
        
        if (await labelEl.count() > 0) {
          label = (await labelEl.first().textContent()) || label;
        }
        if (await valueEl.count() > 0) {
          value = (await valueEl.first().textContent()) || '';
        }
        
        stats.set(label.trim(), value.trim());
      } catch {
        // Skip stats that can't be read
      }
    }

    return stats;
  }

  /**
   * Screenshot a specific sheet
   */
  async screenshotSheet(index: number, path: string): Promise<void> {
    const sheet = this.getSheet(index);
    await sheet.screenshot({ path });
  }

  /**
   * Screenshot all sheets
   */
  async screenshotAllSheets(basePath: string): Promise<string[]> {
    const count = await this.getSheetCount();
    const paths: string[] = [];

    for (let i = 0; i < count; i++) {
      const path = `${basePath}-sheet-${i + 1}.png`;
      await this.screenshotSheet(i, path);
      paths.push(path);
    }

    return paths;
  }

  /**
   * Get ROI values from finops sheet
   */
  async getROIValues(): Promise<{
    paybackPeriod: string;
    annualSavings: string;
    monthlySavings: string;
  }> {
    // Use resilient approach - check element count before getting text
    let paybackPeriod = 'N/A';
    let annualSavings = 'N/A';
    let monthlySavings = 'N/A';

    try {
      const paybackEl = this.page.locator('.stat:has(.stat__label:text("Payback")) .stat__value').first();
      if (await paybackEl.count() > 0) {
        paybackPeriod = (await paybackEl.textContent()) || 'N/A';
      }
    } catch { /* element not found */ }

    try {
      const annualEl = this.page.locator('.bleed-amount, .stat__value--accent').first();
      if (await annualEl.count() > 0) {
        annualSavings = (await annualEl.textContent()) || 'N/A';
      }
    } catch { /* element not found */ }

    try {
      const monthlyEl = this.page.locator('.stat:has(.stat__label:text("Monthly")) .stat__value').first();
      if (await monthlyEl.count() > 0) {
        monthlySavings = (await monthlyEl.textContent()) || 'N/A';
      }
    } catch { /* element not found */ }

    return {
      paybackPeriod: paybackPeriod.trim(),
      annualSavings: annualSavings.trim(),
      monthlySavings: monthlySavings.trim(),
    };
  }

  /**
   * Get integration list from scope sheet
   */
  async getIntegrations(): Promise<string[]> {
    const rows = this.scopeSheet.locator('.integration-generic, table tbody tr');
    const count = await rows.count();
    const integrations: string[] = [];

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const name = await row.locator('td:first-child, strong').first().textContent();
      if (name) {
        integrations.push(name.trim());
      }
    }

    return integrations;
  }

  /**
   * Get math pill count (calculations/formulas displayed)
   */
  async getMathPillCount(): Promise<number> {
    return await this.mathPills.count();
  }
}
