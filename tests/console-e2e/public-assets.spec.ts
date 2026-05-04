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

test('favicon.svg is fetchable, well-formed SVG, and uses brand colors', async ({ page }) => {
  const r = await page.request.get('/assets/favicon.svg');
  expect(r.status()).toBe(200);
  const ct = r.headers()['content-type'] || '';
  expect(ct).toMatch(/image\/svg\+xml/);
  const body = await r.text();
  // Well-formed SVG root.
  expect(body).toMatch(/<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  expect(body).toMatch(/viewBox="0 0 \d+ \d+"/);
  // Brand colors: sunset-500 + violet-500 + night-950 surface.
  expect(body, 'favicon should use sunset-500 (#ff5f00)').toMatch(/#ff5f00/i);
  expect(body, 'favicon should use violet-500 (#cf3c69)').toMatch(/#cf3c69/i);
  expect(body, 'favicon should use night-950 surface (#12111a)').toMatch(/#12111a/i);
  // No external resource loads — favicons must be self-contained or
  // browsers fail to render them in offline / restrictive contexts.
  // (xmlns="http://www.w3.org/2000/svg" is the SVG namespace declaration,
  // not a fetched resource — explicitly allowed.)
  expect(body, 'favicon must not <image> external URLs').not.toMatch(/<image[^>]+(?:href|xlink:href)=/i);
  expect(body, 'favicon must not <use> external URLs').not.toMatch(/<use[^>]+(?:href|xlink:href)=["']https?:/i);
  expect(body, 'favicon must not @import external CSS').not.toMatch(/@import\s+(?:url\()?["']?https?:/i);
  expect(body, 'favicon must not contain scripts').not.toMatch(/<script/i);
  // Reasonable byte budget — favicons under ~2KB are healthy.
  expect(body.length, 'favicon byte budget').toBeLessThan(2048);
});
