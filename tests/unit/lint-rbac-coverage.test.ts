/**
 * Tests for scripts/lint-rbac-coverage.sh.
 *
 * The lint is the forcing function that prevents future Express
 * mutation routes from landing without requireRole. These tests pin
 * its three contractual exit modes:
 *
 *   0 — every mutation route is role-guarded
 *   1 — at least one mutation route is missing requireRole
 *   2 — invocation error (target file does not exist)
 *
 * The current real server.js is also exercised as a smoke test so a
 * regression in either the lint or the server lights up immediately.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const lintPath = path.join(repoRoot, 'scripts', 'lint-rbac-coverage.sh');

let scratchPath: string | null = null;

afterEach(() => {
  if (scratchPath && fs.existsSync(scratchPath)) {
    try { fs.unlinkSync(scratchPath); } catch {}
  }
  scratchPath = null;
});

function writeScratch(content: string): string {
  scratchPath = path.join(os.tmpdir(), `rbac-lint-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(scratchPath, content, 'utf8');
  return scratchPath;
}

function runLint(target: string): { code: number; stdout: string; stderr: string } {
  const res = spawnSync('bash', [lintPath, target], { encoding: 'utf8' });
  return {
    code: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

describe('[P0] scripts/lint-rbac-coverage.sh - RBAC coverage lint', () => {
  it('[P0] should exit 0 when every mutation route is role-guarded', () => {
    const target = writeScratch([
      "app.get('/api/things', generalLimiter, async (req, res) => {});",
      "app.post('/api/things', requireRole(Role.OWNER), generalLimiter, async (req, res) => {});",
      "app.patch('/api/things/:id', requireRole(Role.OWNER, Role.ADMIN), async (req, res) => {});",
      "app.delete('/api/things/:id', requireRole(Role.OWNER), async (req, res) => {});",
    ].join('\n'));

    const { code, stdout } = runLint(target);
    expect(code).toBe(0);
    expect(stdout).toContain('all flagged routes');
  });

  it('[P0] should exit 1 and name the offending path when requireRole is missing', () => {
    const target = writeScratch([
      "app.post('/api/safe', requireRole(Role.OWNER), async (req, res) => {});",
      "app.post('/api/exposed', generalLimiter, async (req, res) => {});",
    ].join('\n'));

    const { code, stderr } = runLint(target);
    expect(code).toBe(1);
    expect(stderr).toContain('/api/exposed');
    expect(stderr).not.toContain('/api/safe');
  });

  it('[P0] should detect missing role on PATCH and DELETE, not just POST', () => {
    const target = writeScratch([
      "app.patch('/api/exposed-patch', async (req, res) => {});",
      "app.delete('/api/exposed-delete', async (req, res) => {});",
      "app.put('/api/exposed-put', async (req, res) => {});",
    ].join('\n'));

    const { code, stderr } = runLint(target);
    expect(code).toBe(1);
    expect(stderr).toContain('/api/exposed-patch');
    expect(stderr).toContain('/api/exposed-delete');
    expect(stderr).toContain('/api/exposed-put');
  });

  it('[P0] should ignore non-sensitive GET routes (read-only)', () => {
    const target = writeScratch([
      "app.get('/api/list', generalLimiter, async (req, res) => {});",
      "app.get('/api/item/:id', generalLimiter, async (req, res) => {});",
    ].join('\n'));

    const { code } = runLint(target);
    expect(code).toBe(0);
  });

  it('[P0] should flag unprotected GETs under /api/audit-logs/*', () => {
    const target = writeScratch([
      "app.get('/api/audit-logs', generalLimiter, async (req, res) => {});",
      "app.get('/api/audit-logs/:logId', generalLimiter, async (req, res) => {});",
      "app.get('/api/audit-logs/export', generalLimiter, async (req, res) => {});",
    ].join('\n'));

    const { code, stderr } = runLint(target);
    expect(code).toBe(1);
    expect(stderr).toContain('/api/audit-logs');
    expect(stderr).toContain('/api/audit-logs/:logId');
    expect(stderr).toContain('/api/audit-logs/export');
  });

  it('[P0] should flag unprotected GETs under /api/admin/*', () => {
    const target = writeScratch([
      "app.get('/api/admin/dashboard', generalLimiter, async (req, res) => {});",
      "app.get('/api/admin/health', generalLimiter, async (req, res) => {});",
    ].join('\n'));

    const { code, stderr } = runLint(target);
    expect(code).toBe(1);
    expect(stderr).toContain('/api/admin/dashboard');
    expect(stderr).toContain('/api/admin/health');
  });

  it('[P1] should accept sensitive GETs once requireRole is added', () => {
    const target = writeScratch([
      "app.get('/api/audit-logs', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {});",
      "app.get('/api/admin/dashboard', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {});",
    ].join('\n'));

    const { code } = runLint(target);
    expect(code).toBe(0);
  });

  it('[P1] should not flag GETs whose path starts with the prefix-as-substring (boundary check)', () => {
    // /api/admin-thingy is not /api/admin/* — boundary check on the
    // sensitive-prefix regex. Prevents false positives on accidentally
    // similarly-named public endpoints.
    const target = writeScratch([
      "app.get('/api/admin-thingy', generalLimiter, async (req, res) => {});",
      "app.get('/api/audit-logs-public', generalLimiter, async (req, res) => {});",
    ].join('\n'));

    const { code } = runLint(target);
    expect(code).toBe(0);
  });

  it('[P1] should exit 2 when target file does not exist', () => {
    const missing = path.join(os.tmpdir(), `does-not-exist-${Date.now()}.js`);
    const { code, stderr } = runLint(missing);
    expect(code).toBe(2);
    expect(stderr).toContain('target file not found');
  });

  it('[P0] smoke: real server.js passes the lint', () => {
    // If this fails, either a real route lost its requireRole or the
    // lint regressed. Either way: a regression that needs attention,
    // not a flake.
    const stdout = execFileSync('bash', [lintPath, path.join(repoRoot, 'server.js')], {
      encoding: 'utf8',
    });
    expect(stdout).toContain('all flagged routes');
  });
});
