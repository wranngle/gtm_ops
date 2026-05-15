#!/usr/bin/env bun
/**
 * scripts/build-presales-db.js
 *
 * Deterministically rebuild config/presales.db from the committed SQL seed
 * (`config/seed_presales.sql`). The .db file itself is gitignored; this script
 * is the canonical regenerator so any developer (or fresh CI checkout) can
 * recreate the file without copying a binary around.
 *
 * What it produces:
 *   - config/presales.db, populated with the configuration tables that
 *     `config/index.js` reads at runtime: labor_rates, engagement_bands,
 *     service_agreements, adjustment_factors, phase_allocations,
 *     technology_profiles, discount_policies, payment_policies,
 *     operational_params.
 *
 * Why a SQL seed (not the JSON files in config/):
 *   The pricing/config tables have no JSON twin in the repo — they were
 *   originally hand-curated inside SQLite. `config/seed_presales.sql` is the
 *   text-committable, reviewable source of truth dumped from the last
 *   known-good DB. JSON seeds (`intake_questions.json`, `sales_strategy.json`,
 *   `systems_catalog.json`) describe a different surface (questionnaire,
 *   marketing copy, vendor catalog) and are loaded directly by feature code
 *   rather than via this DB.
 *
 * Usage:
 *   bun scripts/build-presales-db.js
 *   bun scripts/build-presales-db.js --out /tmp/test.db
 *
 * Exit codes:
 *   0 — DB written successfully
 *   1 — seed missing, schema mismatch, or write error
 */

import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import initSqlJs from 'sql.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SEED_PATH = join(REPO_ROOT, 'config', 'seed_presales.sql');
const DEFAULT_OUT = join(REPO_ROOT, 'config', 'presales.db');

// Tables index.js queries — used to verify the seed is internally consistent.
const REQUIRED_TABLES = [
  'labor_rates',
  'engagement_bands',
  'service_agreements',
  'adjustment_factors',
  'phase_allocations',
  'technology_profiles',
  'discount_policies',
  'payment_policies',
  'operational_params',
];

function parseArgs(argv) {
  const args = {out: DEFAULT_OUT};
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--out' || flag === '-o') {
      args.out = resolve(argv[++i]);
    } else if (flag === '--help' || flag === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return args;
}

async function buildDatabase({out}) {
  if (!existsSync(SEED_PATH)) {
    throw new Error(`Seed file missing: ${SEED_PATH}`);
  }

  const seedSql = readFileSync(SEED_PATH, 'utf8');
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  try {
    db.exec(seedSql);
  } catch (error) {
    db.close();
    throw new Error(`Seed execution failed: ${error.message}`);
  }

  // Verify required tables exist and are non-empty.
  const existing = new Set();
  const stmt = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  while (stmt.step()) {
    existing.add(stmt.getAsObject().name);
  }

  stmt.free();

  const missing = REQUIRED_TABLES.filter(t => !existing.has(t));
  if (missing.length > 0) {
    db.close();
    throw new Error(
      `Seed produced DB missing required tables: ${missing.join(', ')}`
    );
  }

  const counts = {};
  for (const t of REQUIRED_TABLES) {
    const c = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`);
    c.step();
    counts[t] = c.getAsObject().n;
    c.free();
    if (counts[t] === 0) {
      db.close();
      throw new Error(`Seed produced empty table: ${t}`);
    }
  }

  const buffer = Buffer.from(db.export());
  db.close();
  writeFileSync(out, buffer);
  return {out, bytes: buffer.length, counts};
}

function printHelp() {
  process.stdout.write(
    `build-presales-db.js — rebuild config/presales.db from seed SQL\n\n`
      + `Usage:\n`
      + `  bun scripts/build-presales-db.js [--out <path>]\n\n`
      + `Options:\n`
      + `  --out, -o   Output path (default: config/presales.db)\n`
      + `  --help, -h  Show this message\n`
  );
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    return;
  }

  try {
    const {out, bytes, counts} = await buildDatabase(args);
    process.stdout.write(
      `Wrote ${out} (${bytes.toLocaleString()} bytes)\n`
        + `Rows: ${Object.entries(counts)
          .map(([t, n]) => `${t}=${n}`)
          .join(', ')}\n`
    );
  } catch (error) {
    process.stderr.write(`build_presales_db failed: ${error.message}\n`);
    process.exit(1);
  }
}

await main();
