/**
 * Pins the fixture-fallback policy behind functions/api/[[path]].ts — the
 * catch-all that replaced the `_redirects` `/api/*` wildcard. The contract:
 * preview hosts (*.pages.dev, localhost) may serve bundled fixtures for
 * unported GET routes; production custom domains never do (honest 404), and
 * no path shape that could escape /fixtures/ ever resolves.
 */
import { describe, expect, it } from 'vitest';
import { isPreviewHost, resolveApiFallback } from '../../lib/api-fallback.js';

describe('[P0] isPreviewHost', () => {
  it('[P0] matches pages.dev and local hosts only', () => {
    expect(isPreviewHost('gtm-ops.pages.dev')).toBe(true);
    expect(isPreviewHost('deadbeef.gtm-ops.pages.dev')).toBe(true);
    expect(isPreviewHost('localhost')).toBe(true);
    expect(isPreviewHost('127.0.0.1')).toBe(true);
    expect(isPreviewHost('app.wranngle.com')).toBe(false);
    expect(isPreviewHost('wranngle.com')).toBe(false);
    expect(isPreviewHost('evil-pages.dev.example.com')).toBe(false);
  });
});

describe('[P0] resolveApiFallback', () => {
  it('[P0] serves fixtures for unported GETs on preview hosts', () => {
    expect(resolveApiFallback('/api/funnel', 'gtm-ops.pages.dev', 'GET')).toEqual({
      kind: 'fixture',
      fixturePath: '/fixtures/funnel.json',
    });
    expect(resolveApiFallback('/api/eval-runs', 'localhost', 'GET')).toEqual({
      kind: 'fixture',
      fixturePath: '/fixtures/eval-runs.json',
    });
    expect(resolveApiFallback('/api/admin/dashboard/', 'gtm-ops.pages.dev', 'get')).toEqual({
      kind: 'fixture',
      fixturePath: '/fixtures/admin/dashboard.json',
    });
  });

  it('[P0] returns not-found on production hosts regardless of route', () => {
    expect(resolveApiFallback('/api/funnel', 'app.wranngle.com', 'GET')).toEqual({ kind: 'not-found' });
  });

  it('[P0] returns not-found for non-GET methods everywhere', () => {
    expect(resolveApiFallback('/api/funnel', 'gtm-ops.pages.dev', 'POST')).toEqual({ kind: 'not-found' });
  });

  it('[P0] rejects path shapes that could escape /fixtures/', () => {
    for (const path of ['/api/../secrets', '/api/a..b', '/api/%2e%2e/x', '/api/a.b', '/api/', '/api']) {
      expect(resolveApiFallback(path, 'gtm-ops.pages.dev', 'GET')).toEqual({ kind: 'not-found' });
    }
  });
});
