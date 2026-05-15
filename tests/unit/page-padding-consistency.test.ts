/**
 * Pins the apps/ops-console page-padding contract so per-route
 * overrides can't drift back. Original ask: punch-list item #19
 * (May 5 04:22 UTC) — "Each page of left nav has inconsistent
 * margins." `.page--generate` had 30/34/78, `.page--evals` had
 * 24/34/80, and the unmodified `.page` baseline was 22/28/56 — every
 * route felt different. This test reads the CSS file and asserts
 * neither override declares its own `padding`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cssPath = resolve(root, 'apps', 'ops-console', 'console', 'app.css');

describe('apps/ops-console page padding consistency', () => {
  const css = readFileSync(cssPath, 'utf8');

  const ruleBody = (selector: string): string | null => {
    // Match the FIRST top-level rule for the selector (no media-query
    // wrapper). The regex is intentionally narrow: the selector at
    // start of a line, then `{`, then the body.
    const re = new RegExp(`^\\s*${selector.replace('--', '\\-\\-')}\\s*\\{([^}]*)\\}`, 'm');
    const match = css.match(re);
    return match ? match[1] : null;
  };

  it('.page declares the canonical padding', () => {
    const body = ruleBody('\\.page');
    expect(body, '.page rule should exist').toBeTruthy();
    expect(body!).toMatch(/padding\s*:/);
  });

  for (const variant of ['.page--generate', '.page--evals']) {
    it(`${variant} does NOT override padding (inherits .page)`, () => {
      const body = ruleBody(variant.replace('.', '\\.'));
      expect(body, `${variant} rule should exist`).toBeTruthy();
      expect(body!, `${variant} must not redeclare padding`).not.toMatch(/(^|;)\s*padding\s*:/);
    });
  }
});
