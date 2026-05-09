/**
 * apps/ops-console/_redirects content guard. Mirrors the
 * tests/unit/headers.test.ts pattern — asserts the Cloudflare Pages
 * redirect rules that route the bare landing path (/) to /console/
 * on whatever host the request arrived on (app.wranngle.com is the
 * canonical, gtm-ops.pages.dev is the project host).
 *
 * Without these 301s, the marketing index.html becomes a dead
 * middleman operators have to click through. The earlier shape sent
 * `/` to https://app.wranngle.com/ as an absolute URL; that worked
 * for gtm-ops.pages.dev but caused a self-redirect loop on the
 * canonical host (path-only `_redirects` rules can't host-
 * discriminate). Relative target avoids the loop and still removes
 * the middleman.
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

  it('redirects / → /console/ as a 301', () => {
    // Relative target keeps the rule host-neutral: works on
    // app.wranngle.com AND gtm-ops.pages.dev, and avoids the
    // self-loop an absolute https://app.wranngle.com/ target hits
    // on the canonical host.
    expect(text).toMatch(/^\/\s+\/console\/\s+301\b/m);
  });

  it('redirects /index.html → /console/ as a 301', () => {
    expect(text).toMatch(/^\/index\.html\s+\/console\/\s+301\b/m);
  });

  it('keeps the legacy /api/eval-runs alias to the fixture', () => {
    // Defensive: the UI briefly used /api/eval-runs before the canonical
    // /api/eval/runs landed in server.ts. The 302 alias is what keeps
    // any deep link in the wild from 404'ing.
    expect(text).toMatch(/^\/api\/eval-runs\s+\/fixtures\/eval-runs\.json\s+302\b/m);
  });
});
