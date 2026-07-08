/**
 * Lockstep guard: the demo fixture served for /api/version must carry exactly
 * the runtime dependency set the live endpoint reports (lib/version.ts builds
 * `deps` from package.json dependencies). This is the drift lib/version.ts was
 * built to prevent — the fixture hand-drifting defeats the point.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const fixture = JSON.parse(
  readFileSync(resolve(root, 'apps', 'ops-console', 'fixtures', 'version.json'), 'utf8'),
);

describe('[P1] version.json fixture lockstep', () => {
  it('[P1] fixture deps carry exactly the package.json runtime dependencies', () => {
    expect(Object.keys(fixture.deps).sort()).toEqual(Object.keys(packageJson.dependencies).sort());
  });

  it('[P1] fixture dep versions match the declared ranges', () => {
    expect(fixture.deps).toEqual(packageJson.dependencies);
  });

  it('[P1] fixture version matches package.json version', () => {
    expect(fixture.version).toBe(packageJson.version);
  });
});
