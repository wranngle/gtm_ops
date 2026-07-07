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

  it('carries no /api/* rules — the Pages Function catch-all owns that surface', () => {
    // The old `/api/* → /fixtures/:splat.json 302` wildcard (and the
    // /api/eval-runs alias) fired on the production host too, converting
    // unported-route 404s into 200s of demo data. functions/api/[[path]].ts
    // now decides per-host: fixture fallback on preview hosts, honest JSON
    // 404 on production. Legacy /api/eval-runs deep links are served by the
    // dedicated functions/api/eval-runs.ts.
    expect(text).not.toMatch(/^\/api\//m);
  });

  it('the /api catch-all function backing the removed wildcard exists', () => {
    expect(existsSync(resolve(root, 'functions', 'api', '[[path]].ts'))).toBe(true);
    expect(existsSync(resolve(root, 'lib', 'api-fallback.ts'))).toBe(true);
  });
});
