/**
 * Scope of Work Sheet Page Object
 * Encapsulates interactions with the scope/technical approach section
 *
 * Actual HTML structure:
 * - Scope sheet: #report-scope-of-work
 * - Scope sections: .scope-section
 * - Scope columns: .scope-column.in-scope, .scope-column.out-scope
 * - Scope lists: .scope-list li
 * - Tech stack: .tech-pills, .badge
 * - Integrations: table with .integration-generic rows
 */
import { Page, Locator } from '@playwright/test';

export class ScopePage {
  readonly page: Page;
  readonly scopeSheet: Locator;
  readonly scopeSections: Locator;
  readonly inScopeColumn: Locator;
  readonly outScopeColumn: Locator;
  readonly inScopeItems: Locator;
  readonly outOfScopeItems: Locator;
  readonly techPills: Locator;
  readonly badges: Locator;
  readonly integrationsTable: Locator;
  readonly integrationRows: Locator;
  readonly genericIntegrations: Locator;
  readonly assumptionsList: Locator;
  readonly deliverablesList: Locator;
  readonly scopeLists: Locator;
  readonly sectionHeaders: Locator;

  constructor(page: Page) {
    this.page = page;
    this.scopeSheet = page.locator('#report-scope-of-work');
    // Scope sections and columns
    this.scopeSections = page.locator('.scope-section');
    this.inScopeColumn = page.locator('.scope-column.in-scope');
    this.outScopeColumn = page.locator('.scope-column.out-scope');
    this.inScopeItems = page.locator('.scope-column.in-scope .scope-list li');
    this.outOfScopeItems = page.locator('.scope-column.out-scope .scope-list li');
    this.scopeLists = page.locator('.scope-list');
    // Tech stack uses badges
    this.techPills = page.locator('.tech-pills .badge, .badge--code');
    this.badges = page.locator('.badge');
    // Integrations table
    this.integrationsTable = page.locator('#report-scope-of-work table, .integrations-table');
    this.integrationRows = page.locator('#report-scope-of-work table tbody tr');
    this.genericIntegrations = page.locator('.integration-generic');
    // Assumptions and deliverables from scope lists
    this.assumptionsList = page.locator('.scope-list').nth(2);
    this.deliverablesList = page.locator('.deliverables-list li');
    this.sectionHeaders = page.locator('.section-header');
  }

  async getTechStackCount(): Promise<number> {
    return await this.techPills.count();
  }

  async getTechStackNames(): Promise<string[]> {
    const names: string[] = [];
    const count = await this.techPills.count();
    for (let i = 0; i < count; i++) {
      const name = await this.techPills.nth(i).textContent();
      if (name) names.push(name.trim());
    }
    return names;
  }

  // Alias for backwards compatibility with spec files
  async getTechStackItems(): Promise<string[]> {
    return await this.getTechStackNames();
  }

  async getIntegrationCount(): Promise<number> {
    return await this.integrationRows.count();
  }

  async getIntegrations(): Promise<{ name: string; type: string; complexity: string }[]> {
    const integrations: { name: string; type: string; complexity: string }[] = [];
    const count = await this.integrationRows.count();
    for (let i = 0; i < count; i++) {
      const row = this.integrationRows.nth(i);
      const cells = row.locator('td');
      integrations.push({
        name: (await cells.nth(0).textContent() || '').trim(),
        type: (await cells.nth(1).textContent() || '').trim(),
        complexity: (await cells.nth(2).textContent() || '').trim(),
      });
    }
    return integrations;
  }

  async getInScopeCount(): Promise<number> {
    return await this.inScopeItems.count();
  }

  // Alias for backwards compatibility with spec files
  async getInScopeItems(): Promise<string[]> {
    const items: string[] = [];
    const count = await this.inScopeItems.count();
    for (let i = 0; i < count; i++) {
      const text = await this.inScopeItems.nth(i).textContent();
      if (text) items.push(text.trim());
    }
    return items;
  }

  async getOutOfScopeCount(): Promise<number> {
    return await this.outOfScopeItems.count();
  }

  // Alias for backwards compatibility with spec files  
  async getOutOfScopeItems(): Promise<string[]> {
    const items: string[] = [];
    const count = await this.outOfScopeItems.count();
    for (let i = 0; i < count; i++) {
      const text = await this.outOfScopeItems.nth(i).textContent();
      if (text) items.push(text.trim());
    }
    return items;
  }

  async getDeliverableCount(): Promise<number> {
    return await this.deliverablesList.count();
  }

  async getBadgeCount(): Promise<number> {
    return await this.badges.count();
  }

  async getSectionCount(): Promise<number> {
    return await this.sectionHeaders.count();
  }

  async hasN8nInStack(): Promise<boolean> {
    const names = await this.getTechStackNames();
    return names.some(n => n.toLowerCase().includes('n8n'));
  }

  async hasLLMInStack(): Promise<boolean> {
    const names = await this.getTechStackNames();
    return names.some(n => 
      n.toLowerCase().includes('llm') || 
      n.toLowerCase().includes('gpt') || 
      n.toLowerCase().includes('claude') ||
      n.toLowerCase().includes('ai')
    );
  }

  async hasGenericIntegrations(): Promise<boolean> {
    return await this.genericIntegrations.count() > 0;
  }
}
