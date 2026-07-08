/**
 * API fixture-fallback policy for unported /api/* routes on the Pages deploy.
 *
 * Preview hosts (*.pages.dev, localhost) get the bundled fixture so direct
 * curl / uptime probes see the same data the in-page DEMO_MODE shim serves.
 * Production custom domains get an honest JSON 404 — the old `_redirects`
 * wildcard (`/api/* → /fixtures/:splat.json 302`) fired on every host, which
 * made unported routes indistinguishable from live ones in production.
 *
 * Pure policy module (no CF types) so it unit-tests under the root tsconfig;
 * functions/api/[[path]].ts is the thin Pages Function wrapper.
 */

export type ApiFallbackDecision =
  | { kind: 'fixture'; fixturePath: string }
  | { kind: 'not-found' };

export function isPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.endsWith('.pages.dev') ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]'
  );
}

export function resolveApiFallback(
  pathname: string,
  hostname: string,
  method: string,
): ApiFallbackDecision {
  if (method.toUpperCase() !== 'GET' || !isPreviewHost(hostname)) {
    return { kind: 'not-found' };
  }

  const sub = pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  // Path-shape allowlist: fixture names are word chars, hyphens, and nested
  // segments — anything else (dots, encodings) must not reach ASSETS.fetch.
  if (!sub || !/^[\w-]+(\/[\w-]+)*$/.test(sub)) {
    return { kind: 'not-found' };
  }

  return { kind: 'fixture', fixturePath: `/fixtures/${sub}.json` };
}
