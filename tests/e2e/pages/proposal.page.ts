/**
 * Proposal Sheet Page Object
 * Encapsulates interactions with the proposal section of the unified report
 *
 * Actual HTML structure:
 * - Proposal sheet: #report-proposal-p1
 * - Investment section: .investment-section
 * - Investment table: .investment-table
 * - Milestones grid: .milestone-grid
 * - Tier cards: .tier-card
 * - Stats: .stat, .stat__value, .stat__label
 * - Timeline: .project-timeline
 */
import { Page, Locator } from '@playwright/test';

export class ProposalPage {
  readonly page: Page;
  readonly proposalSheet: Locator;
  readonly investmentSection: Locator;
  readonly investmentTable: Locator;
  readonly milestones: Locator;
  readonly milestoneGrid: Locator;
  readonly roiSection: Locator;
  readonly paybackPeriod: Locator;
  readonly annualSavings: Locator;
  readonly monthlySavings: Locator;
  readonly tierCards: Locator;
  readonly ctaButton: Locator;
  readonly validUntil: Locator;
  readonly projectTimeline: Locator;
  readonly stats: Locator;

  constructor(page: Page) {
    this.page = page;
    this.proposalSheet = page.locator('#report-proposal-p1');
    this.investmentSection = page.locator('.investment-section');
    this.investmentTable = page.locator('.investment-table');
    // Milestones are cards within milestone-grid
    this.milestoneGrid = page.locator('.milestone-grid, .milestones-grid');
    this.milestones = page.locator('.milestone-grid .card, .milestones-grid .card');
    // ROI section uses stats and bleed sections
    this.roiSection = page.locator('.zone-bleed, .value-breakdown');
    // Stats for financial values
    this.paybackPeriod = page.locator('.stat:has(.stat__label:text-matches("Payback", "i")) .stat__value').first();
    this.annualSavings = page.locator('.bleed-amount, .stat__value--accent').first();
    this.monthlySavings = page.locator('.stat:has(.stat__label:text-matches("Monthly", "i")) .stat__value').first();
    // Tier cards for Neural Ops options
    this.tierCards = page.locator('.tier-card');
    this.ctaButton = page.locator('.cta-button, .cta-box, .btn--primary');
    this.validUntil = page.locator('.wrn-header-meta, .validity-date');
    this.projectTimeline = page.locator('.project-timeline');
    this.stats = page.locator('.stat');
  }

  async getMilestoneCount(): Promise<number> {
    return await this.milestones.count();
  }

  async getMilestoneAmounts(): Promise<string[]> {
    const amounts: string[] = [];
    const count = await this.milestones.count();
    for (let i = 0; i < count; i++) {
      // Amount is in badge with --accent or in .amount class
      const amount = await this.milestones.nth(i).locator('.badge--accent, .amount').first().textContent();
      if (amount) amounts.push(amount.trim());
    }
    return amounts;
  }

  async getROIValues(): Promise<{ payback: string; annual: string; monthly: string }> {
    // Use more resilient approach - check if elements exist before getting text
    let payback = 'N/A';
    let annual = 'N/A';
    let monthly = 'N/A';

    try {
      if (await this.paybackPeriod.count() > 0) {
        payback = (await this.paybackPeriod.textContent()) || 'N/A';
      }
    } catch { /* element not found */ }

    try {
      if (await this.annualSavings.count() > 0) {
        annual = (await this.annualSavings.textContent()) || 'N/A';
      }
    } catch { /* element not found */ }

    try {
      if (await this.monthlySavings.count() > 0) {
        monthly = (await this.monthlySavings.textContent()) || 'N/A';
      }
    } catch { /* element not found */ }

    return { payback, annual, monthly };
  }

  async getTierCount(): Promise<number> {
    return await this.tierCards.count();
  }

  async hasCTAButton(): Promise<boolean> {
    return await this.ctaButton.count() > 0;
  }

  async getValidUntilDate(): Promise<string> {
    return await this.validUntil.textContent() || '';
  }

  async hasTimeline(): Promise<boolean> {
    return await this.projectTimeline.count() > 0;
  }

  async hasInvestmentTable(): Promise<boolean> {
    return await this.investmentTable.count() > 0;
  }

  async getStatCount(): Promise<number> {
    return await this.stats.count();
  }
}
