// Contract test for /api/health (new `checks` block) and /api/version.
//
// Central promise: an external uptime probe can read /api/health to know
// the service is up + ready, and /api/version to know what's running.
// Both endpoints are stable JSON shapes — tests pin field presence, types,
// and the few invariants downstream tooling depends on (7-char short sha,
// node version string, deps as flat name->version map).

import {describe, expect, it} from 'vitest';
import {buildLightHealthPayload, DEFAULT_MODEL_NAME} from '../../lib/health.js';
import {buildVersionPayload, RUNTIME_DEPS} from '../../lib/version.js';

describe('[P0] /api/health structured `checks` block', () => {
  it('[P0] payload includes ok:true and checks:{fixtures,db,model}', () => {
    const payload = buildLightHealthPayload({}, {uptime: () => 0});
    expect(payload.ok).toBe(true);
    expect(payload.checks).toBeDefined();
    expect(payload.checks.fixtures).toBe('present');
    expect(payload.checks.db).toBe('n/a');
    expect(payload.checks.model).toBe(DEFAULT_MODEL_NAME);
  });

  it('[P0] checks.model respects GEMINI_MODEL env override', () => {
    const payload = buildLightHealthPayload(
      {GEMINI_MODEL: 'gemini-2.5-pro'},
      {uptime: () => 0},
    );
    expect(payload.checks.model).toBe('gemini-2.5-pro');
  });

  it('[P0] caller-supplied checks override env defaults', () => {
    const payload = buildLightHealthPayload({}, {uptime: () => 0}, {db: 'ok', fixtures: 'present'});
    expect(payload.checks.db).toBe('ok');
    expect(payload.checks.fixtures).toBe('present');
  });

  it('[P0] preserves the legacy fields (status, version, commit, uptime_s) so existing probers do not break', () => {
    const payload = buildLightHealthPayload({}, {uptime: () => 0});
    expect(payload).toHaveProperty('status', 'ok');
    expect(payload).toHaveProperty('version');
    expect(payload).toHaveProperty('commit');
    expect(payload).toHaveProperty('uptime_s');
    expect(payload).toHaveProperty('timestamp');
  });
});

describe('[P0] /api/version build-provenance payload', () => {
  it('[P0] returns version, commit, node_version, deps', () => {
    const payload = buildVersionPayload({GIT_SHA: 'abcdef1234567'}, {version: 'v22.12.0'});
    expect(payload).toHaveProperty('version');
    expect(payload).toHaveProperty('commit');
    expect(payload).toHaveProperty('node_version');
    expect(payload).toHaveProperty('deps');
  });

  it('[P0] commit is truncated to 7 chars (downstream tooling expects short SHA)', () => {
    const payload = buildVersionPayload(
      {GIT_SHA: 'abcdef1234567890fedcba9876543210'},
      {version: 'v22.12.0'},
    );
    expect(payload.commit).toBe('abcdef1');
    expect(payload.commit).toHaveLength(7);
  });

  it('[P0] commit falls back to "unknown" when no SHA is present', () => {
    const payload = buildVersionPayload({}, {version: 'v22.12.0'});
    expect(payload.commit).toBe('unknown');
  });

  it('[P0] commit accepts CF_PAGES_COMMIT_SHA when GIT_SHA is unset (Cloudflare Pages provenance)', () => {
    const payload = buildVersionPayload(
      {CF_PAGES_COMMIT_SHA: 'cf1234567890'},
      {version: 'v22.12.0'},
    );
    expect(payload.commit).toBe('cf12345');
  });

  it('[P0] node_version reflects proc.version', () => {
    const payload = buildVersionPayload({}, {version: 'v22.12.0'});
    expect(payload.node_version).toBe('v22.12.0');
  });

  it('[P0] node_version is "unknown" when proc.version is missing', () => {
    const payload = buildVersionPayload({}, {});
    expect(payload.node_version).toBe('unknown');
  });

  it('[P0] deps is a flat string-to-string map of runtime dependency names to version specs', () => {
    const payload = buildVersionPayload({}, {version: 'v22.12.0'});
    expect(payload.deps).toBeTypeOf('object');
    expect(Array.isArray(payload.deps)).toBe(false);
    for (const [name, spec] of Object.entries(payload.deps)) {
      expect(typeof name).toBe('string');
      expect(typeof spec).toBe('string');
      expect(spec.length).toBeGreaterThan(0);
    }
  });

  it('[P0] deps covers every runtime dep declared in package.json (no missing keys)', () => {
    const payload = buildVersionPayload({}, {version: 'v22.12.0'});
    const depNames = Object.keys(payload.deps).sort();
    expect(depNames).toEqual(RUNTIME_DEPS);
  });

  it('[P1] version field matches the package.json semver', () => {
    const payload = buildVersionPayload({}, {version: 'v22.12.0'});
    expect(payload.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
