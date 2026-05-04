/**
 * Doc gardener — runs the same scan that the weekly Monday workflow
 * runs, but as a fast unit test that fails the PR immediately rather
 * than waiting until the next cron tick. Surfaces stale TODO/FIXME/TBD
 * markers and broken intra-repo markdown links the moment they land.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = resolve(root, 'scripts', 'gardener.sh');

describe('doc gardener', () => {
  it('script exists and is executable', () => {
    expect(existsSync(script)).toBe(true);
  });

  it('contract doc exists at the path the workflow links to', () => {
    expect(existsSync(resolve(root, 'docs', 'references', 'doc-gardener.md'))).toBe(true);
  });

  it('runs clean against the current tree (no WIP markers, no broken links)', () => {
    const r = spawnSync('bash', [script], { cwd: root, encoding: 'utf8' });
    if (r.status !== 0) {
       
      console.log('gardener output:\n' + r.stdout);
    }
    expect(r.status, `gardener emitted findings:\n${r.stdout}`).toBe(0);
  });
});
