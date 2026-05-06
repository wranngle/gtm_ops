#!/usr/bin/env bun
// scripts/audit-verify.mjs
//
// Walk the audit log hash chain and exit non-zero if any link breaks.
// Wraps lib/audit.js#AuditLogger.verifyIntegrity so operators can run
// the same check that the unit tests in tests/unit/audit.test.ts pin
// against an offline copy of config/audit.db.
//
// Usage:
//   bun run audit:verify                      # default: config/audit.db
//   bun run audit:verify -- --db=/path/to.db  # alternate path
//   bun run audit:verify -- --limit=50000     # check more rows (default 1000)
//
// Exit codes:
//   0  chain intact
//   1  tamper detected
//   2  invocation error (file missing / unreadable / SQLite open failed)

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getAuditLogger } from '../lib/audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const defaultDb = path.join(repoRoot, 'config', 'audit.db');

function parseArgs(argv) {
  const out = { db: defaultDb, limit: 1000 };
  for (const arg of argv.slice(2)) {
    const eq = arg.indexOf('=');
    if (arg.startsWith('--db=')) {
      out.db = path.resolve(arg.slice(eq + 1));
    } else if (arg.startsWith('--limit=')) {
      const n = Number.parseInt(arg.slice(eq + 1), 10);
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`audit-verify: --limit must be a positive integer (got "${arg.slice(eq + 1)}")`);
        process.exit(2);
      }
      out.limit = n;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: bun run audit:verify -- [--db=PATH] [--limit=N]');
      process.exit(0);
    } else {
      console.error(`audit-verify: unknown argument "${arg}"`);
      process.exit(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv);

if (!existsSync(args.db)) {
  console.error(JSON.stringify({
    ok: false,
    reason: 'audit-db-missing',
    db_path: args.db,
  }));
  process.exit(2);
}

let logger;
try {
  logger = getAuditLogger(args.db);
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    reason: 'audit-db-open-failed',
    db_path: args.db,
    error: err instanceof Error ? err.message : String(err),
  }));
  process.exit(2);
}

const result = await logger.verifyIntegrity(args.limit);
await logger.close();

const summary = {
  ok: result.valid,
  db_path: args.db,
  checked: result.checked,
  invalid_at: result.invalid_at ?? null,
};
console.log(JSON.stringify(summary));

process.exit(result.valid ? 0 : 1);
