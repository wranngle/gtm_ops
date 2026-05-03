/**
 * Project Plan Sheet Page Object
 * Encapsulates interactions with the project plan section
 *
 * Actual HTML structure:
 * - Plan sheet: #report-project-plan
 * - Timeline: .project-timeline, .timeline-label, .timeline-value
 * - Milestones: .milestone-grid .card
 * - Stats: .stat, .stat__value, .stat__label
 * - Key stats: .key-stats
 * - Phases shown via milestone sections
 */
import { Page, Locator } from '@playwright/test';

export class ProjectPlanPage {
  readonly page: Page;
  readonly planSheet: Locator;
  readonly projectTimeline: Locator;
  readonly timelineValue: Locator;
  readonly milestoneGrid: Locator;
  readonly milestones: Locator;
  readonly keyStats: Locator;
  readonly stats: Locator;
  readonly finopsSection: Locator;
  readonly laborCost: Locator;
  readonly totalInvestment: Locator;
  readonly riskSection: Locator;
  readonly riskBadges: Locator;
  readonly cards: Locator;
  readonly sectionHeaders: Locator;

  constructor(page: Page) {
    this.page = page;
    this.planSheet = page.locator('#report-project-plan');
    // Timeline with duration
    this.projectTimeline = page.locator('.project-timeline');
    this.timelineValue = page.locator('.timeline-value');
    // Milestones grid
    this.milestoneGrid = page.locator('.milestone-grid, .milestones-grid');
    this.milestones = page.locator('.milestone-grid .card, .milestones-grid .card');
    // Key stats section
    this.keyStats = page.locator('.key-stats');
    this.stats = page.locator('.stat');
    // FinOps info (may be on separate sheet)
    this.finopsSection = page.locator('#report-finops, .finops-section');
    this.laborCost = page.locator('.stat:has(.stat__label:text-matches("Labor|Hours", "i")) .stat__value').first();
    this.totalInvestment = page.locator('.stat:has(.stat__label:text-matches("Price|Investment|Total", "i")) .stat__value').first();
    // Risk section (may be on separate sheet)
    this.riskSection = page.locator('#report-risk-assessment, .risk-section');
    this.riskBadges = page.locator('.badge--critical, .badge--warning, .badge--healthy');
    this.cards = page.locator('.card');
    this.sectionHeaders = page.locator('.section-header');
  }

  async getMilestoneCount(): Promise<number> {
    return await this.milestones.count();
  }

  async getMilestoneNames(): Promise<string[]> {
    const names: string[] = [];
    const count = await this.milestones.count();
    for (let i = 0; i < count; i++) {
      const name = await this.milestones.nth(i).locator('.milestone-name, h4, h5').first().textContent();
      if (name) names.push(name.trim());
    }
    return names;
  }

  async getLaborCost(): Promise<string> {
    // Template shows "Total Hours" not "Labor Cost" on project plan - look for Client Price or hours
    const clientPrice = this.page.locator('.stat:has(.stat__label:text-matches("Client Price|Price|Investment", "i")) .stat__value').first();
    if (await clientPrice.count() > 0) {
      return await clientPrice.textContent() || 'N/A';
    }
    return await this.laborCost.textContent() || 'N/A';
  }

  async getTotalInvestment(): Promise<string> {
    return await this.totalInvestment.textContent() || 'N/A';
  }

  async getStatCount(): Promise<number> {
    return await this.stats.count();
  }

  async getCardCount(): Promise<number> {
    return await this.cards.count();
  }

  async hasTimeline(): Promise<boolean> {
    return await this.projectTimeline.count() > 0;
  }

  async getTimelineValue(): Promise<string> {
    return await this.timelineValue.first().textContent() || '';
  }

  async getSectionCount(): Promise<number> {
    return await this.sectionHeaders.count();
  }

  // Phase methods - phases are represented by milestone cards in the grid
  async getPhaseCount(): Promise<number> {
    return await this.getMilestoneCount();
  }

  async getPhaseNames(): Promise<string[]> {
    return await this.getMilestoneNames();
  }

  // AI Ops cost - look for AI-related stat
  async getAiOpsCost(): Promise<string> {
    try {
      const aiOpsEl = this.page.locator('.stat:has(.stat__label:text-matches("AI|Neural|Ops", "i")) .stat__value').first();
      if (await aiOpsEl.count() > 0) {
        return (await aiOpsEl.textContent()) || 'N/A';
      }
    } catch { /* element not found */ }
    return 'N/A';
  }

  // Risk section methods
  async getRiskCount(): Promise<number> {
    const riskItems = this.page.locator('#report-risk-assessment .card, .risk-item, .risk-row');
    return await riskItems.count();
  }

  async hasRiskSection(): Promise<boolean> {
    return await this.riskSection.count() > 0;
  }

  // Team section methods
  async hasTeamSection(): Promise<boolean> {
    const teamSection = this.page.locator('.team-section, .team-grid, section:has(h2:text-matches("Team", "i"))');
    return await teamSection.count() > 0;
  }

  async getTeamMemberCount(): Promise<number> {
    const teamMembers = this.page.locator('.team-member, .role-card');
    return await teamMembers.count();
  }

  // Alias for spec file compatibility
  async getTeamRoleCount(): Promise<number> {
    return await this.getTeamMemberCount();
  }

  // Success metrics methods
  async hasSuccessMetrics(): Promise<boolean> {
    const metrics = this.page.locator('.success-metrics, .kpi-section, section:has(h2:text-matches("Success|Metrics|KPI", "i"))');
    return await metrics.count() > 0;
  }

  async getSuccessMetricCount(): Promise<number> {
    const metrics = this.page.locator('.metric-card, .kpi-card, .success-metric');
    return await metrics.count();
  }
}
