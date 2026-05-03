/**
 * Settings Modal Page Object
 *
 * Provides methods for interacting with the Enterprise Settings modal
 */
import { type Page, type Locator, expect } from '@playwright/test';

export class SettingsPage {
  readonly page: Page;
  readonly modal: Locator;
  readonly openButton: Locator;
  readonly closeButton: Locator;
  readonly tabs: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.locator('#settings-modal');
    this.openButton = page.locator('button:has-text("Settings")');
    this.closeButton = page.locator('#settings-modal .btn-close-modal');
    this.tabs = page.locator('.settings-tab');
  }

  async open() {
    await this.openButton.click();
    await expect(this.modal).toBeVisible();
  }

  async close() {
    await this.closeButton.click();
    await expect(this.modal).not.toBeVisible();
  }

  async selectTab(tabName: string) {
    await this.page.click(`.settings-tab[data-settings-tab="${tabName}"]`);
  }

  async isOpen(): Promise<boolean> {
    return this.modal.isVisible();
  }

  // Webhooks Tab Methods
  async createWebhook(name: string, url: string, events: string[]) {
    await this.selectTab('webhooks');
    await this.page.fill('#webhook-name', name);
    await this.page.fill('#webhook-url', url);

    for (const event of events) {
      await this.page.check(`input[value="${event}"]`);
    }

    await this.page.click('button:has-text("Create Webhook")');
  }

  async getWebhookCount(): Promise<number> {
    await this.selectTab('webhooks');
    const table = this.page.locator('#webhooks-list table tbody tr');
    return table.count();
  }

  // Audit Tab Methods
  async filterAuditLogs(action?: string, startDate?: string, endDate?: string) {
    await this.selectTab('audit');

    if (action) {
      await this.page.selectOption('#audit-action-filter', action);
    }

    if (startDate) {
      await this.page.fill('#audit-start-date', startDate);
    }

    if (endDate) {
      await this.page.fill('#audit-end-date', endDate);
    }

    await this.page.click('button:has-text("Apply Filters")');
  }

  async exportAuditLogs() {
    await this.selectTab('audit');
    await this.page.click('button:has-text("Export CSV")');
  }

  // Usage Tab Methods
  async getUsageStats(): Promise<{
    documents: string;
    apiCalls: string;
    tokens: string;
    cost: string;
  }> {
    await this.selectTab('usage');

    return {
      documents: await this.page.locator('#usage-documents').textContent() || '',
      apiCalls: await this.page.locator('#usage-api-calls').textContent() || '',
      tokens: await this.page.locator('#usage-tokens').textContent() || '',
      cost: await this.page.locator('#usage-cost').textContent() || '',
    };
  }

  // GDPR Tab Methods
  async requestDataExport() {
    await this.selectTab('gdpr');
    await this.page.click('button:has-text("Request Data Export")');
  }

  async getExportStatus(): Promise<string> {
    await this.selectTab('gdpr');
    return await this.page.locator('#gdpr-export-status').textContent() || '';
  }

  async setConsent(type: string, enabled: boolean) {
    await this.selectTab('gdpr');
    const checkbox = this.page.locator(`#consent-${type}`);
    await (enabled ? checkbox.check() : checkbox.uncheck());
  }

  // Branding Tab Methods
  async setBrandingColors(primary: string, secondary: string) {
    await this.selectTab('branding');
    await this.page.fill('#branding-primary-hex', primary);
    await this.page.fill('#branding-secondary-hex', secondary);
    await this.page.click('button:has-text("Save Branding")');
  }

  async uploadLogo(filePath: string) {
    await this.selectTab('branding');
    const fileInput = this.page.locator('#branding-logo-file');
    await fileInput.setInputFiles(filePath);
  }

  // Users Tab Methods
  async inviteUser(email: string, role: string) {
    await this.selectTab('users');
    await this.page.fill('#invite-email', email);
    await this.page.selectOption('#invite-role', role);
    await this.page.click('button:has-text("Send Invitation")');
  }

  // Versions Tab Methods
  async selectExecution(executionId: string) {
    await this.selectTab('versions');
    await this.page.selectOption('#version-execution-select', executionId);
  }

  async getVersionCount(): Promise<number> {
    await this.selectTab('versions');
    const table = this.page.locator('#versions-list table tbody tr');
    return table.count();
  }
}
