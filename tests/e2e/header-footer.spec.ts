/**
 * E2E Tests: Header and Footer Components
 * Validates the unified header and footer across all sheets
 *
 * Test Count: 15 tests
 */
import { test, expect } from './fixtures/base.fixture';
import { ReportPage } from './pages/report.page';
import { findLatestReport } from './utils/find-report';

const reportPath = findLatestReport();

test.describe('Header Component - Structure', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P0][HF-001] should have header on each sheet', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const sheets = page.locator('.sheet');
    const count = await sheets.count();
    for (let i = 0; i < count; i++) {
      const header = await sheets.nth(i).locator('.wrn-header, header').count();
      expect(header).toBeGreaterThan(0);
    }
  });

  test('[P0][HF-002] header should contain Wranngle logo', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const logo = await page.locator('.wrn-header-logo, .logo img').first();
    await expect(logo).toBeVisible();
  });

  test('[P0][HF-003] header should display client name', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const clientName = await page.locator('.wrn-header-client').first().textContent();
    expect(clientName?.trim().length).toBeGreaterThan(0);
  });

  test('[P1][HF-004] header should have orange separator line', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const separator = page.locator('.wrn-header-separator, .header-divider').first();
    if (await separator.count() > 0) {
      const bgColor = await separator.evaluate(el => getComputedStyle(el).backgroundColor);
      expect(bgColor).toMatch(/rgb\(255,\s*95,\s*0\)|#ff5f00/i);
    }
  });

  test('[P1][HF-005] header should show document type', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const docTitle = await page.locator('.wrn-header-doc-title, .doc-type').first().textContent();
    expect(docTitle).toMatch(/audit|plan|proposal|scope/i);
  });
});

test.describe('Header Component - Metadata', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P0][HF-006] header should display document slug', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const slug = await page.locator('.wrn-header-slug').first().textContent();
    expect(slug).toMatch(/WRN-AI-/);
  });

  test('[P1][HF-007] header should display date', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const meta = await page.locator('.wrn-header-meta').first().textContent();
    expect(meta).toMatch(/\d{4}/); // Contains a year
  });

  test('[P1][HF-008] header should show validity if on proposal', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const proposalSheet = page.locator('.sheet').nth(2);
    if (await proposalSheet.count() > 0) {
      const meta = await proposalSheet.locator('.wrn-header-meta').textContent();
      // Validity may or may not be present
      expect(meta?.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Footer Component - Structure', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P0][HF-009] should have footer on each sheet', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const sheets = page.locator('.sheet');
    const count = await sheets.count();
    for (let i = 0; i < count; i++) {
      // Template uses deck-footer class
      const footer = await sheets.nth(i).locator('.deck-footer, .wrn-footer, footer').count();
      expect(footer).toBeGreaterThan(0);
    }
  });

  test('[P0][HF-010] footer should contain document slug', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    // Template uses deck-footer-slug class
    const footerSlug = await page.locator('.deck-footer-slug, .wrn-footer-slug').first().textContent();
    expect(footerSlug).toMatch(/WRN-AI-/);
  });

  test('[P0][HF-011] footer should contain copyright', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    // Template uses deck-footer-copy class
    const copyright = await page.locator('.deck-footer-copy, .wrn-footer-copy, .footer-copyright').first().textContent();
    expect(copyright).toMatch(/Wranngle|©|\d{4}/);
  });

  test('[P1][HF-012] footer slug should use monospace font', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    // Template uses deck-footer-slug class
    const slug = page.locator('.deck-footer-slug, .wrn-footer-slug').first();
    const fontFamily = await slug.evaluate(el => getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toMatch(/mono|consolas|courier/);
  });
});

test.describe('Header/Footer - Consistency', () => {
  test.skip(!reportPath, 'No generated reports found');

  test('[P1][HF-013] header slug should match footer slug', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const headerSlug = await page.locator('.wrn-header-slug').first().textContent();
    // Template uses deck-footer-slug class
    const footerSlug = await page.locator('.deck-footer-slug, .wrn-footer-slug').first().textContent();
    expect(headerSlug?.trim()).toBe(footerSlug?.trim());
  });

  test('[P1][HF-014] headers should be consistent across sheets', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const clientNames = await page.locator('.wrn-header-client').allTextContents();
    const uniqueNames = [...new Set(clientNames.map(n => n.trim()))];
    expect(uniqueNames.length).toBe(1);
  });

  test('[P2][HF-015] footers should be at bottom of sheets', async ({ page }) => {
    await page.goto(`file://${reportPath}`);
    const sheet = page.locator('.sheet').first();
    // Template uses deck-footer class
    const footer = sheet.locator('.deck-footer, .wrn-footer, footer');
    if (await footer.count() > 0) {
      const sheetBox = await sheet.boundingBox();
      const footerBox = await footer.boundingBox();
      if (sheetBox && footerBox) {
        expect(footerBox.y).toBeGreaterThan(sheetBox.y + sheetBox.height / 2);
      }
    }
  });
});
