/**
 * AI Audit Sheet Page Object
 * Encapsulates interactions with the AI process audit section
 *
 * Actual HTML structure:
 * - Executive Summary: .card.card--accent
 * - Scorecard: table.scorecard
 * - Bleed Section: .zone.zone-bleed
 * - Status indicators: .indicator (not .status-dot)
 * - Math pills: .math-pill
 * - Fix cards: .card in .zone-fixes
 */
import { type Page, type Locator } from '@playwright/test';

export class AuditPage {
  readonly page: Page;
  readonly auditSheet: Locator;
  readonly execSummary: Locator;
  readonly scorecard: Locator;
  readonly scorecardRows: Locator;
  readonly bleedSection: Locator;
  readonly bleedTotal: Locator;
  readonly bleedPeriod: Locator;
  readonly fixesSection: Locator;
  readonly fixCards: Locator;
  readonly mathPills: Locator;
  readonly indicators: Locator;
  readonly cards: Locator;
  readonly stats: Locator;

  constructor(page: Page) {
    this.page = page;
    this.auditSheet = page.locator('#report-ai-process');
    // Executive summary is a card with accent styling containing "Executive Summary" heading
    this.execSummary = page.locator('.card.card--accent, section.card:has(h2:text("Executive Summary"))').first();
    this.scorecard = page.locator('table.scorecard');
    this.scorecardRows = page.locator('table.scorecard tbody tr');
    this.bleedSection = page.locator('.zone.zone-bleed');
    this.bleedTotal = page.locator('.bleed-amount');
    this.bleedPeriod = page.locator('.bleed-period');
    this.fixesSection = page.locator('.zone.zone-fixes');
    this.fixCards = page.locator('.fix-container .card');
    this.mathPills = page.locator('.math-pill');
    // Status indicators use .indicator class, not .status-dot
    this.indicators = page.locator('.indicator');
    this.cards = page.locator('.card');
    this.stats = page.locator('.stat');
  }

  async getExecSummaryText(): Promise<string> {
    return await this.execSummary.textContent() || '';
  }

  async getScorecardRowCount(): Promise<number> {
    return this.scorecardRows.count();
  }

  async getBleedTotal(): Promise<string> {
    return await this.bleedTotal.textContent() || 'N/A';
  }

  async getBleedPeriod(): Promise<string> {
    return await this.bleedPeriod.textContent() || '';
  }

  async getFixCount(): Promise<number> {
    return this.fixCards.count();
  }

  async getMathPillCount(): Promise<number> {
    return this.mathPills.count();
  }

  async hasIndicators(): Promise<boolean> {
    const count = await this.indicators.count();
    return count > 0;
  }

  // Alias for backwards compatibility with spec files
  async hasStatusDots(): Promise<boolean> {
    return this.hasIndicators();
  }

  async getIndicatorCounts(): Promise<{ critical: number; warning: number; healthy: number }> {
    return {
      critical: await this.page.locator('.indicator--critical').count(),
      warning: await this.page.locator('.indicator--warning').count(),
      healthy: await this.page.locator('.indicator--healthy').count(),
    };
  }

  // Alias for backwards compatibility with spec files
  async getStatusDotCounts(): Promise<{ critical: number; warning: number; healthy: number }> {
    return this.getIndicatorCounts();
  }

  async getCategoryNames(): Promise<string[]> {
    const categories = await this.page.locator('table.scorecard .category').allTextContents();
    return categories;
  }

  // Process steps - check for list items or numbered items in workflow sections
  async getProcessStepCount(): Promise<number> {
    const steps = this.page.locator('.process-step, .workflow-step, .scorecard tbody tr, ol li, .card:has(h4)');
    return steps.count();
  }

  // Pain points - friction items or warning indicators
  async getPainPointCount(): Promise<number> {
    const painPoints = this.page.locator('.pain-point, .friction-item, .indicator--critical, .indicator--warning');
    return painPoints.count();
  }

  // Get scores - look for stat cards with score-related labels
  async getScores(): Promise<{ opportunity: string; complexity: string; readiness: string }> {
    // Use resilient approach - check element count before getting text
    let opportunity = 'N/A';
    let complexity = 'N/A';
    let readiness = 'N/A';

    try {
      const opportunityEl = this.page.locator('.stat:has(.stat__label:text-matches("Opportunity|Score", "i")) .stat__value, .badge:text-matches("High|Medium|Low", "i")').first();
      if (await opportunityEl.count() > 0) {
        opportunity = (await opportunityEl.textContent()) || 'N/A';
      }
    } catch { /* element not found */ }

    try {
      const complexityEl = this.page.locator('.stat:has(.stat__label:text-matches("Complexity|Risk", "i")) .stat__value, .badge--warning, .badge--critical').first();
      if (await complexityEl.count() > 0) {
        complexity = (await complexityEl.textContent()) || 'N/A';
      }
    } catch { /* element not found */ }

    try {
      const readinessEl = this.page.locator('.stat:has(.stat__label:text-matches("Readiness|Status", "i")) .stat__value, .badge--healthy').first();
      if (await readinessEl.count() > 0) {
        readiness = (await readinessEl.textContent()) || 'N/A';
      }
    } catch { /* element not found */ }

    return { opportunity, complexity, readiness };
  }
}
