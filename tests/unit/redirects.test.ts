/**
 * apps/ops-console/_redirects content guard. Mirrors the
 * tests/unit/headers.test.ts pattern — asserts the Cloudflare Pages
 * redirect rules that route the bare gtm-ops.pages.dev landing page
 * (and its index.html) to the canonical app.wranngle.com console.
 *
 * Without these 301s, the marketing landing page becomes a dead
 * middleman the operator has to click through. PR #50 wired the
 * redirects; if a future edit silently drops them, the regression
 * lands on production with no failing test until someone notices a
 * stale-looking landing page.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const redirectsPath = resolve(root, 'apps', 'ops-console', '_redirects');

describe('apps/ops-console/_redirects', () => {
  it('file exists', () => {
    expect(existsSync(redirectsPath)).toBe(true);
  });

  const text = readFileSync(redirectsPath, 'utf8');

  it('redirects / → https://app.wranngle.com/ as a 301', () => {
    // Tolerate any whitespace; the contract is "/ goes to the
    // canonical host with a permanent redirect status".
    expect(text).toMatch(/^\/\s+https:\/\/app\.wranngle\.com\/\s+301\b/m);
  });

  it('redirects /index.html → https://app.wranngle.com/ as a 301', () => {
    expect(text).toMatch(/^\/index\.html\s+https:\/\/app\.wranngle\.com\/\s+301\b/m);
  });

  it('keeps the legacy /api/eval-runs alias to the fixture', () => {
    // Defensive: the UI briefly used /api/eval-runs before the canonical
    // /api/eval/runs landed in server.js. The 302 alias is what keeps
    // any deep link in the wild from 404'ing.
    expect(text).toMatch(/^\/api\/eval-runs\s+\/fixtures\/eval-runs\.json\s+302\b/m);
  });
});
