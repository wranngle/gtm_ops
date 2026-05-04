/**
 * prefers-reduced-motion — WCAG 2.3.3 conformance. When the user's OS
 * advertises reduced-motion, the console must collapse animations and
 * transitions to instantaneous (effectively-zero) durations, including
 * the infinite pulse loops on live-status dots.
 */
import { test, expect } from './_helpers.js';

test.use({ colorScheme: 'dark', reducedMotion: 'reduce' });

test('reduced-motion · matchMedia confirms emulation is active', async ({ openConsole }) => {
  const page = await openConsole();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const matches = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  expect(matches).toBe(true);
});

test('reduced-motion · infinite pulse loops are disabled', async ({ openConsole }) => {
  const page = await openConsole();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The live-status dot uses `animation: pulse 2.4s ease-in-out infinite`.
  // Under reduced-motion, the override should clamp iteration-count to 1
  // and duration to ~0, so getComputedStyle reports the override.
  const dot = page.locator('.dot.dot--accent').first();
  await expect(dot).toBeVisible();
  const motion = await dot.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      animationDuration: cs.animationDuration,
      animationIterationCount: cs.animationIterationCount,
    };
  });
  expect(motion.animationIterationCount).toBe('1');
  // 0.001ms reads back as "0.001ms" or "0s" depending on browser; both fine.
  expect(motion.animationDuration).toMatch(/^(0s|0\.0+1ms|1e-0+6s)$/);
});

test('reduced-motion · transitions are clamped to ~0 duration', async ({ openConsole }) => {
  const page = await openConsole();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.sb__item:has-text("Calls")').first().click();
  // Pick something that we know has an explicit transition: the .btn rule.
  const btn = page.locator('.btn').first();
  await expect(btn).toBeVisible();
  const dur = await btn.evaluate(
    (el) => getComputedStyle(el).transitionDuration,
  );
  // transition-duration is a comma-list; every value should be ~0.
  for (const v of dur.split(',')) {
    expect(v.trim()).toMatch(/^(0s|0\.0+1ms|1e-0+6s)$/);
  }
});
