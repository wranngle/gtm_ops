/**
 * Base Fixtures for E2E Tests
 *
 * Provides:
 * - Authenticated page context
 * - Test data factories
 * - Cleanup utilities
 * - Report page helpers
 */
import * as fs from 'fs';
import * as path from 'path';
import { test as base, expect, type Page } from '@playwright/test';

// Extend test with custom fixtures
export const test = base.extend<{
  reportPage: Page;
  testOutputDir: string;
  cleanupFiles: string[];
}>({
  // Report page fixture - navigates to a generated report
  async reportPage({ page }, use) {
    // Default to first available report in output directory
    const outputDir = path.join(process.cwd(), 'output');

    if (fs.existsSync(outputDir)) {
      const clients = fs.readdirSync(outputDir).filter(f =>
        fs.statSync(path.join(outputDir, f)).isDirectory()
      );

      if (clients.length > 0) {
        const clientDir = path.join(outputDir, clients[0]);
        const htmlFiles = fs.readdirSync(clientDir).filter(f => f.endsWith('.html'));

        if (htmlFiles.length > 0) {
          const reportPath = path.join(clientDir, htmlFiles[0]);
          await page.goto(`file://${reportPath}`);
        }
      }
    }

    await use(page);
  },

  // Test output directory fixture with auto-cleanup
  async testOutputDir(_unused, use) {
    const testDir = path.join(process.cwd(), 'output_test', `test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    await use(testDir);

    // Cleanup after test
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  },

  // Track files for cleanup
  async cleanupFiles(_unused, use) {
    const files: string[] = [];

    await use(files);

    // Cleanup all tracked files
    for (const file of files) {
      if (fs.existsSync(file)) {
        fs.rmSync(file, { recursive: true, force: true });
      }
    }
  },
});

// Re-export expect for convenience


/**
 * Helper: Wait for all sheets to render
 */
export async function waitForSheetsToRender(page: Page, expectedCount = 4): Promise<void> {
  await page.waitForSelector('.sheet', { state: 'attached' });
  const sheets = await page.locator('.sheet').count();
  expect(sheets).toBeGreaterThanOrEqual(expectedCount);
}

/**
 * Helper: Get sheet by index (0-based)
 */
export async function getSheet(page: Page, index: number) {
  const sheets = page.locator('.sheet');
  return sheets.nth(index);
}

/**
 * Helper: Screenshot all sheets
 */
export async function screenshotAllSheets(page: Page, baseName: string): Promise<string[]> {
  const sheets = page.locator('.sheet');
  const count = await sheets.count();
  const screenshots: string[] = [];

  for (let i = 0; i < count; i++) {
    const sheet = sheets.nth(i);
    const screenshotPath = `${baseName}-sheet-${i + 1}.png`;
    await sheet.screenshot({ path: screenshotPath });
    screenshots.push(screenshotPath);
  }

  return screenshots;
}

/**
 * Helper: Verify no undefined values in rendered content
 */
export async function verifyNoUndefinedValues(page: Page): Promise<string[]> {
  const issues: string[] = [];

  // Check for literal "undefined" text
  const undefinedMatches = await page.locator('text=undefined').count();
  if (undefinedMatches > 0) {
    issues.push(`Found ${undefinedMatches} occurrences of "undefined" in rendered content`);
  }

  // Check for "N/A" in critical fields
  const naInValues = await page.locator('.value:has-text("N/A")').count();
  if (naInValues > 0) {
    issues.push(`Found ${naInValues} "N/A" values in critical fields`);
  }

  return issues;
}

/**
 * Helper: Verify all display fields are formatted
 */
export async function verifyDisplayFields(page: Page): Promise<boolean> {
  // Check that currency values are properly formatted ($X,XXX)
  const currencyPattern = /\$[\d,]+/;
  const values = await page.locator('.value, .stat-value, .amount').allTextContents();

  for (const value of values) {
    if (value.includes('$') && !currencyPattern.test(value)) {
      return false;
    }
  }

  return true;
}

export {expect} from '@playwright/test';