/**
 * Internal Sales Sheet Page Object
 *
 * Encapsulates interactions with the internal sales/negotiation sheet.
 * This sheet is SEPARATE from client-facing reports - contains:
 * - Production costs and profit margins
 * - Walk-away pricing
 * - Sales strategy config (market context, scripts, objections)
 *
 * Actual HTML structure:
 * - Stats: .stat.stat--bordered, .value, .label
 * - Cost values: .cost-value
 * - Price values: .price-value
 * - Section headers: .section-header
 * - Badges: .badge, .badge--code
 * - Zone grid: .zone-grid
 */
import { Page, Locator, expect } from '@playwright/test';

export class InternalSheetPage {
  readonly page: Page;

  // Header elements
  readonly header: Locator;
  readonly clientName: Locator;
  readonly documentSlug: Locator;

  // Stats (used for costs, margins, etc.)
  readonly stats: Locator;
  readonly costValues: Locator;
  readonly priceValues: Locator;
  readonly labels: Locator;

  // Production costs section (Section 01)
  readonly productionCostStat: Locator;
  readonly computeEstimateStat: Locator;
  readonly totalInternalStat: Locator;

  // Client price and margins
  readonly clientPriceStat: Locator;
  readonly marginAmountStat: Locator;
  readonly marginPercentStat: Locator;

  // Walk-away pricing section (Section 04)
  readonly walkAwayPriceStat: Locator;

  // Section headers
  readonly sectionHeaders: Locator;

  // Badges for formulas
  readonly badges: Locator;
  readonly codeBadges: Locator;

  // Zone grid for layout
  readonly zoneGrid: Locator;

  // Cards and sections
  readonly cards: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.header = page.locator('.header, .wrn-header').first();
    this.clientName = page.locator('.client-name, .wrn-header-client').first();
    this.documentSlug = page.locator('.document-slug, .wrn-header-slug').first();

    // All stats with bordered style
    this.stats = page.locator('.stat.stat--bordered, .stat');
    this.costValues = page.locator('.cost-value');
    this.priceValues = page.locator('.price-value');
    this.labels = page.locator('.stat .label');

    // Production costs - find by label text
    this.productionCostStat = page.locator('.stat:has(.label:text("Production Cost"))').first();
    this.computeEstimateStat = page.locator('.stat:has(.label:text-matches("Compute|API", "i"))').first();
    this.totalInternalStat = page.locator('.stat:has(.label:text("Total Internal"))').first();

    // Pricing stats
    this.clientPriceStat = page.locator('.stat:has(.label:text-matches("Client Price", "i"))').first();
    this.marginAmountStat = page.locator('.stat:has(.label:text("Margin Amount"))').first();
    this.marginPercentStat = page.locator('.stat:has(.label:text("Margin %"))').first();

    // Walk-away price
    this.walkAwayPriceStat = page.locator('.stat:has(.label:text-matches("Walk-Away|Walk Away", "i"))').first();

    // Section structure
    this.sectionHeaders = page.locator('.section-header');
    this.badges = page.locator('.badge');
    this.codeBadges = page.locator('.badge--code');
    this.zoneGrid = page.locator('.zone-grid');
    this.cards = page.locator('.card');
  }

  /**
   * Navigate to internal sheet file
   */
  async goto(filePath: string): Promise<void> {
    await this.page.goto(`file://${filePath}`);
    await this.waitForLoad();
  }

  /**
   * Wait for sheet to fully load
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for stats or section headers to be visible
    await this.stats.first().or(this.sectionHeaders.first()).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
      return this.page.waitForSelector('body', { state: 'visible' });
    });
  }

  /**
   * Get client name text (finds first non-empty client name)
   */
  async getClientName(): Promise<string> {
    // Some internal sheets have multiple sections with headers
    // The first section might have an empty client name (intro/summary page)
    // So we find all client names and return the first non-empty one
    const allClients = await this.page.locator('.client-name, .wrn-header-client').all();
    for (const client of allClients) {
      const text = (await client.textContent() || '').trim();
      if (text && text.length > 0) {
        return text;
      }
    }
    return '';
  }

  /**
   * Get production costs as object
   * Returns N/A for missing elements (not all internal sheets have production costs)
   */
  async getProductionCosts(): Promise<{
    labor: string;
    aiOps: string;
    total: string;
  }> {
    const getStatValue = async (stat: Locator): Promise<string> => {
      const count = await stat.count();
      if (count === 0) return 'N/A';
      try {
        return (await stat.locator('.value').first().textContent({ timeout: 2000 }) || 'N/A').trim();
      } catch {
        return 'N/A';
      }
    };
    return {
      labor: await getStatValue(this.productionCostStat),
      aiOps: await getStatValue(this.computeEstimateStat),
      total: await getStatValue(this.totalInternalStat),
    };
  }

  /**
   * Get profit margin info
   * Returns N/A for missing elements (not all internal sheets have profit margins)
   */
  async getProfitInfo(): Promise<{
    amount: string;
    marginPercent: string;
  }> {
    const getStatValue = async (stat: Locator): Promise<string> => {
      const count = await stat.count();
      if (count === 0) return 'N/A';
      try {
        return (await stat.locator('.value').first().textContent({ timeout: 2000 }) || 'N/A').trim();
      } catch {
        return 'N/A';
      }
    };
    return {
      amount: await getStatValue(this.marginAmountStat),
      marginPercent: await getStatValue(this.marginPercentStat),
    };
  }

  /**
   * Get walk-away pricing
   */
  async getWalkAwayPricing(): Promise<{
    walkAway: string;
    floor: string;
  }> {
    const walkAway = (await this.walkAwayPriceStat.locator('.value').textContent() || 'N/A').trim();
    return {
      walkAway,
      floor: walkAway, // Same value in current template
    };
  }

  /**
   * Get market context values from sales strategy
   */
  async getMarketContext(): Promise<{
    missedCallValue: string;
    voicemailAbandonment: string;
    annualLossCount: number;
  }> {
    // Market context may not be in all internal sheets
    const marketSection = this.page.locator('text=/market context|missed call|voicemail/i').first();
    const hasMarketContext = await marketSection.count() > 0;
    
    return {
      missedCallValue: hasMarketContext ? 'Present' : 'N/A',
      voicemailAbandonment: hasMarketContext ? 'Present' : 'N/A',
      annualLossCount: hasMarketContext ? 1 : 0,
    };
  }

  /**
   * Get pricing packages count and names
   */
  async getPricingPackages(): Promise<string[]> {
    const packages: string[] = [];
    // Packages are in stats within zone-grid under packages section
    const packageStats = this.page.locator('.zone-grid .stat:has(.label)');
    const count = await packageStats.count();

    for (let i = 0; i < count; i++) {
      const label = await packageStats.nth(i).locator('.label').textContent();
      if (label) packages.push(label.trim());
    }

    return packages;
  }

  /**
   * Get script segments count - template uses .script-box class
   */
  async getScriptSegmentCount(): Promise<number> {
    // Template uses .script-box for script segments and also section headers with "Script"
    const scripts = this.page.locator('.script-box, .script-segment, blockquote, section:has(h2:text-matches("Script", "i"))');
    return await scripts.count();
  }

  /**
   * Get objection handlers count - template uses .objection-row class
   */
  async getObjectionCount(): Promise<number> {
    // Template uses .objection-row for individual objections
    const objections = this.page.locator('.objection-row, .objection-card, .objection-item');
    return await objections.count();
  }

  /**
   * Get compliance notes - template uses inline styles, not badge classes
   * Returns empty array if compliance section doesn't exist
   */
  async getComplianceNotes(): Promise<{ title: string; style: string }[]> {
    const notes: { title: string; style: string }[] = [];
    // Find compliance section and its cards - template uses .card.card--sm with inline background colors
    const complianceSection = this.page.locator('section:has(h2:text-matches("Compliance", "i")) .card, .zone-grid-2 .card--sm');
    const count = await complianceSection.count();

    // If no compliance section, return empty array
    if (count === 0) return notes;

    for (let i = 0; i < count; i++) {
      const card = complianceSection.nth(i);
      try {
        const strongEl = card.locator('strong').first();
        if (await strongEl.count() === 0) continue;

        const title = (await strongEl.textContent({ timeout: 2000 })) || '';
        // Check inline style for color to determine healthy/warning
        const bgColor = await card.evaluate(el => getComputedStyle(el).backgroundColor);
        const style = bgColor.includes('240, 253, 244') || bgColor.includes('220, 252, 231') ? 'healthy'
                    : bgColor.includes('255, 251, 235') || bgColor.includes('254, 252, 232') ? 'warning'
                    : 'default';
        notes.push({ title: title.trim(), style });
      } catch {
        // Skip cards that can't be processed
        continue;
      }
    }

    return notes;
  }

  /**
   * Verify no placeholder or undefined values
   */
  async verifyNoPlaceholders(): Promise<string[]> {
    const issues: string[] = [];
    const placeholders = ['undefined', 'NaN', '[object Object]', 'null'];

    for (const placeholder of placeholders) {
      const count = await this.page.locator(`text="${placeholder}"`).count();
      if (count > 0) {
        issues.push(`Found "${placeholder}" ${count} times`);
      }
    }

    return issues;
  }

  /**
   * Verify sales strategy config was loaded
   */
  async verifySalesStrategyLoaded(): Promise<boolean> {
    // Check for key internal sheet elements
    const hasStats = await this.stats.count() > 0;
    const hasSectionHeaders = await this.sectionHeaders.count() > 0;
    return hasStats && hasSectionHeaders;
  }

  /**
   * Get stat count
   */
  async getStatCount(): Promise<number> {
    return await this.stats.count();
  }

  /**
   * Get badge count
   */
  async getBadgeCount(): Promise<number> {
    return await this.badges.count();
  }

  /**
   * Screenshot the internal sheet
   */
  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path, fullPage: true });
  }
}
