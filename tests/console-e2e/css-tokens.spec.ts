/**
 * CSS custom-property hygiene — every var(--token) used in the console must
 * resolve to a non-empty value on both dark and light themes. Catches drift
 * between JSX inline styles and the token map (e.g. var(--text-1) when the
 * actual token is --text).
 */
import { test, expect } from './_helpers.js';

const REQUIRED_TOKENS = [
  // text
  '--text', '--text-2', '--text-3',
  // surfaces
  '--bg', '--bg-elev', '--bg-elev-2', '--bg-card', '--bg-inset', '--bg-hover',
  '--bg-press', '--bg-selected',
  // borders
  '--border', '--border-strong', '--border-accent',
  // radii
  '--r-sm', '--r-md', '--r-lg', '--r-xl', '--r-2xl', '--r-pill',
  // accents (set on root via tweaks panel)
  '--sunset-500',
  // type system
  '--font-mono', '--font-display',
  // shadow
  '--shadow-sm', '--shadow-md', '--shadow-lg',
];

for (const theme of ['dark', 'light'] as const) {
  test(`css tokens · all required tokens resolve in ${theme} theme`, async ({ openConsole }) => {
    const page = await openConsole();
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    const missing = await page.evaluate((tokens) => {
      const cs = getComputedStyle(document.documentElement);
      return tokens.filter((tok) => !cs.getPropertyValue(tok).trim());
    }, REQUIRED_TOKENS);
    expect(missing, `missing tokens in ${theme} theme: ${missing.join(', ')}`).toEqual([]);
  });
}

test('css tokens · no JSX inline-style refers to a undefined token (sanity grep)', async ({ openConsole }) => {
  const page = await openConsole();
  // Walk every element with an inline style attribute, extract var(--x) refs,
  // and assert each resolves to a non-empty value.
  const undefinedRefs = await page.evaluate(() => {
    const out: Array<{ token: string; selector: string }> = [];
    const re = /var\(\s*(--[a-z0-9_-]+)/gi;
    const cs = getComputedStyle(document.documentElement);
    document.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
      const text = el.getAttribute('style') || '';
      let m: RegExpExecArray | null;
       
      while ((m = re.exec(text))) {
        const tok = m[1];
        if (!cs.getPropertyValue(tok).trim()) {
          out.push({ token: tok, selector: el.tagName + (el.className ? '.' + (el.className as string).split(' ')[0] : '') });
        }
      }
    });
    return out;
  });
  expect(undefinedRefs, `undefined CSS vars in inline styles: ${JSON.stringify(undefinedRefs)}`).toEqual([]);
});
