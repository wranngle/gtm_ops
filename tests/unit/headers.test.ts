/**
 * apps/ops-console/_headers content guard. Catches accidental
 * regressions in security-header policy that would either (a) silently
 * block the ConvAI widget's voice mode (microphone allowlist), (b)
 * relax XSS protection (CSP), or (c) re-introduce the preview-branch
 * URL in the sitemap link.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const headersPath = resolve(root, 'apps', 'ops-console', '_headers');

describe('apps/ops-console/_headers', () => {
  it('file exists', () => {
    expect(existsSync(headersPath)).toBe(true);
  });

  const text = readFileSync(headersPath, 'utf8');

  it('declares Content-Security-Policy with the ConvAI widget origins', () => {
    expect(text).toMatch(/Content-Security-Policy:/);
    expect(text, 'frame-src must allow elevenlabs.io for the ConvAI iframe').toMatch(
      /frame-src[^;]*elevenlabs\.io/,
    );
    expect(text, 'script-src must allow unpkg.com for React + babel + ConvAI').toMatch(
      /script-src[^;]*unpkg\.com/,
    );
    expect(text, 'connect-src must allow wss for the ConvAI websocket').toMatch(
      /connect-src[^;]*wss:/,
    );
  });

  it('Permissions-Policy allows microphone for the ConvAI iframe', () => {
    // Without this, the widget's voice mode silently fails when a user
    // toggles from text → voice. Camera + geolocation + payment etc.
    // remain denied.
    expect(text).toMatch(/Permissions-Policy:/);
    expect(text, 'mic must be scoped to elevenlabs.io, not denied outright').toMatch(
      /microphone=\([^)]*"https:\/\/elevenlabs\.io"[^)]*\)/,
    );
    expect(text, 'camera must stay denied').toMatch(/camera=\(\)/);
    expect(text, 'geolocation must stay denied').toMatch(/geolocation=\(\)/);
  });

  it('does not reference the preview-branch URL', () => {
    expect(text).not.toMatch(/preview\.gtm-ops\.pages\.dev/);
  });

  it('keeps the standard hardening headers', () => {
    expect(text).toMatch(/X-Content-Type-Options:\s*nosniff/);
    expect(text).toMatch(/Referrer-Policy:/);
    expect(text).toMatch(/Strict-Transport-Security:/);
  });
});
