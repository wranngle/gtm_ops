/**
 * Integration test for scripts/audit-verify.mjs.
 *
 * Spawns the CLI as a real subprocess with --db= pointing at a
 * scratch SQLite file the test seeds itself, then asserts the exit
 * code + JSON line on stdout. Two cases pin the contract operators
 * see in the field:
 *   1. Untampered chain → exit 0, ok=true.
 *   2. Mutated metadata column → exit 1, ok=false, invalid_at set.
 *
 * This complements the in-process verifyIntegrity() tests in
 * tests/unit/audit.test.ts — they prove the algorithm; this proves
 * the script wired around it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'audit-verify.mjs');

let testDbPath: string;
let AuditLogger: any;
let AuditAction: any;

beforeEach(async () => {
  testDbPath = path.join(
    repoRoot,
    'config',
    `audit_verify_cli_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
  );
  const module = await import('../../lib/audit.js');
  AuditLogger = module.AuditLogger;
  AuditAction = module.AuditAction;
});

afterEach(() => {
  if (testDbPath && fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }
});

async function seedChain(rowCount: number) {
  const logger = new AuditLogger(testDbPath);
  for (let i = 0; i < rowCount; i += 1) {
     
    await logger.log(
      AuditAction.DOCUMENT_CREATED,
      'execution',
      `exec-${i}`,
      { idx: i },
      { user_id: 'u-1', workspace_id: 'w-1' },
    );
  }
  await logger.close();
}

function runCli(): { code: number; stdout: string; stderr: string } {
  // Use bun explicitly: lib/audit was migrated .js → .ts and node cannot resolve a `.js` specifier to a `.ts` source.
  try {
    const stdout = execFileSync('bun', [scriptPath, `--db=${testDbPath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      code: typeof err.status === 'number' ? err.status : -1,
      stdout: err.stdout?.toString?.() ?? '',
      stderr: err.stderr?.toString?.() ?? '',
    };
  }
}

describe('[P0] scripts/audit-verify.mjs - chain integrity CLI', () => {
  it('[P0] should exit 0 with ok=true on an untampered chain', async () => {
    await seedChain(5);

    const { code, stdout } = runCli();
    expect(code).toBe(0);

    const parsed = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(parsed.ok).toBe(true);
    expect(parsed.checked).toBe(5);
    expect(parsed.invalid_at).toBeNull();
  });

  it('[P0] should exit 1 with invalid_at set when metadata is mutated mid-chain', async () => {
    await seedChain(4);

    // Tamper: rewrite metadata on row #2 without rebuilding the hash.
    // The chain is now broken for rows 2..N inclusive.
    await new Promise<void>((resolve, reject) => {
      const db = new sqlite3.Database(testDbPath);
      db.run(
        "UPDATE audit_logs SET metadata = ? WHERE id = (SELECT id FROM audit_logs ORDER BY id ASC LIMIT 1 OFFSET 1)",
        [JSON.stringify({ idx: 1, tampered: true })],
        (err: Error | null) => {
          db.close();
          if (err) reject(err);
          else resolve();
        },
      );
    });

    const { code, stdout } = runCli();
    expect(code).toBe(1);

    const parsed = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(parsed.ok).toBe(false);
    expect(parsed.invalid_at).toBeTruthy();
  });

  it('[P1] should exit 2 when --db points at a missing file', () => {
    // Don't seed; testDbPath does not exist.
    const { code, stderr } = runCli();
    expect(code).toBe(2);
    const parsed = JSON.parse(stderr.trim().split('\n').pop()!);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toBe('audit-db-missing');
  });
});
