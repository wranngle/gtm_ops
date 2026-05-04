/**
 * Public asset hygiene — favicon coverage on every HTML entrypoint
 * and og:image / twitter:image referencing a raster format that
 * social link previewers actually accept.
 */
import { test, expect } from './_helpers.js';

test('landing og:image is a PNG (Twitter/X rejects SVG og:images)', async ({ page }) => {
  await page.goto('/');
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(ogImage, 'no og:image meta').toBeTruthy();
  expect(ogImage).toMatch(/\.png(\?|$)/);
  // Width + height meta improve crawler crop fidelity.
  const w = await page.locator('meta[property="og:image:width"]').getAttribute('content');
  const h = await page.locator('meta[property="og:image:height"]').getAttribute('content');
  expect(w).toBe('1200');
  expect(h).toBe('630');
  // Twitter alt text is part of basic social-share hygiene.
  const alt = await page.locator('meta[name="twitter:image:alt"]').getAttribute('content');
  expect(alt).toBeTruthy();
});

test('og-card.png is fetchable and is a real PNG', async ({ page }) => {
  const r = await page.request.get('/assets/og-card.png');
  expect(r.status()).toBe(200);
  const ct = r.headers()['content-type'] || '';
  expect(ct).toMatch(/image\/png/);
  const body = await r.body();
  // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
  expect(body[0]).toBe(0x89);
  expect(body[1]).toBe(0x50);
  expect(body[2]).toBe(0x4e);
  expect(body[3]).toBe(0x47);
});

const HTML_ENTRYPOINTS = [
  '/',
  '/console/',
  '/evaluation/',
  '/eval-runs/',
  '/404.html',
];
for (const path of HTML_ENTRYPOINTS) {
  test(`favicon link present on ${path}`, async ({ page }) => {
    await page.goto(path);
    const href = await page
      .locator('link[rel="icon"]')
      .first()
      .getAttribute('href');
    expect(href, `${path} has no <link rel="icon">`).toBeTruthy();
    expect(href).toMatch(/favicon/);
  });
}
