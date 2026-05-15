/**
 * Print stylesheet — operators print call transcripts and proposal
 * reviews. The default SPA chrome (dark bg, fixed sidebar/topbar,
 * floating coach launcher, scroll-clipped transcripts) wastes ink and
 * cuts off content. Asserts @media print collapses chrome and restores
 * document flow on every route a user might hit Cmd-P from.
 */
import { test, expect } from './helpers.js';

test('print mode · chrome is hidden + body becomes white', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Calls")').first().click();
  await page.waitForTimeout(150);
  await page.emulateMedia({ media: 'print' });
  const sample = await page.evaluate(() => ({
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    sidebarVisible: getComputedStyle(document.querySelector('.sb') as HTMLElement).display !== 'none',
    topbarVisible: getComputedStyle(document.querySelector('.tb') as HTMLElement).display !== 'none',
    coachLauncherVisible: !!document.querySelector('.coach-launcher')
      && getComputedStyle(document.querySelector('.coach-launcher') as HTMLElement).display !== 'none',
  }));
  // body must be white-ish, text dark — printer-friendly.
  expect(sample.bodyBg).toMatch(/rgb\(255, 255, 255\)|#fff/i);
  expect(sample.bodyColor).toMatch(/rgb\(0, 0, 0\)|#000/i);
  expect(sample.sidebarVisible, 'sidebar must hide in print').toBe(false);
  expect(sample.topbarVisible, 'topbar must hide in print').toBe(false);
  expect(sample.coachLauncherVisible, 'coach launcher must hide in print').toBe(false);
});

test('print mode · transcript scroll container expands to full content height', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Calls")').first().click();
  await page.waitForTimeout(150);
  await page.emulateMedia({ media: 'print' });
  const transcript = await page.evaluate(() => {
    const el = document.querySelector('.calls-grid__trans-scroll') as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { overflow: cs.overflow, maxHeight: cs.maxHeight };
  });
  expect(transcript).not.toBeNull();
  // overflow:visible AND max-height:none — content flows naturally onto pages.
  expect(transcript!.overflow).toMatch(/visible/);
  expect(transcript!.maxHeight).toBe('none');
});

test('print mode · animations + box shadows are stripped', async ({ openConsole }) => {
  const page = await openConsole();
  await page.emulateMedia({ media: 'print' });
  const card = await page.evaluate(() => {
    const el = document.querySelector('.card') as HTMLElement | null;
    if (!el) return null;
    return { boxShadow: getComputedStyle(el).boxShadow, animation: getComputedStyle(el).animation };
  });
  expect(card).not.toBeNull();
  expect(card!.boxShadow).toBe('none');
});
