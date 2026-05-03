/**
 * Case Study Corpus - Storage and retrieval for evaluation ground truth
 * @module lib/evaluation/corpus
 *
 * Provides CRUD operations for case studies used in pipeline evaluation.
 * Uses SQLite for persistence with JSON columns for flexible schema.
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import {
  CaseStudySchema,
  CreateCaseStudySchema,
  UpdateCaseStudyMetaSchema,
  generateCaseStudyId,
} from '../schemas/case_study.schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', 'config', 'evaluation.db');
const FIXTURES_DIR = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'case_studies');

// =============================================================================
// Database Initialization
// =============================================================================

/**
 * SQL schema for evaluation database
 */
const SCHEMA_SQL = `
-- Case studies (ground truth corpus)
CREATE TABLE IF NOT EXISTS case_studies (
  id TEXT PRIMARY KEY,
  source_json TEXT NOT NULL,
  problem_json TEXT NOT NULL,
  solution_json TEXT NOT NULL,
  meta_json TEXT NOT NULL,
  harvested_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_case_studies_vendor
  ON case_studies(json_extract(source_json, '$.vendor'));

CREATE INDEX IF NOT EXISTS idx_case_studies_holdout
  ON case_studies(json_extract(meta_json, '$.holdout'));

CREATE INDEX IF NOT EXISTS idx_case_studies_quality
  ON case_studies(json_extract(meta_json, '$.quality_score'));

-- Evaluation runs
CREATE TABLE IF NOT EXISTS evaluation_runs (
  id TEXT PRIMARY KEY,
  case_study_id TEXT NOT NULL REFERENCES case_studies(id),
  pipeline_version TEXT NOT NULL,
  schema_version TEXT DEFAULT '1.0.0',
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  error_message TEXT,
  input_json TEXT NOT NULL,
  output_json TEXT,
  scores_json TEXT,
  aggregate_score REAL,
  flaws_detected TEXT DEFAULT '[]',
  triggered_by TEXT DEFAULT 'manual',
  run_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for evaluation queries
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_case_study
  ON evaluation_runs(case_study_id);

CREATE INDEX IF NOT EXISTS idx_evaluation_runs_status
  ON evaluation_runs(status);

CREATE INDEX IF NOT EXISTS idx_evaluation_runs_score
  ON evaluation_runs(aggregate_score);

CREATE INDEX IF NOT EXISTS idx_evaluation_runs_version
  ON evaluation_runs(pipeline_version);

-- Flaw patterns (detected systematic issues)
CREATE TABLE IF NOT EXISTS flaw_patterns (
  id TEXT PRIMARY KEY,
  pattern_code TEXT NOT NULL,
  description TEXT NOT NULL,
  business_impact TEXT,
  affected_runs TEXT DEFAULT '[]',
  total_evaluations INTEGER DEFAULT 0,
  frequency_percent REAL DEFAULT 0,
  severity TEXT CHECK(severity IN ('low', 'medium', 'high', 'critical')),
  severity_rationale TEXT,
  recommendations TEXT DEFAULT '[]',
  affected_code_paths TEXT DEFAULT '[]',
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'investigating', 'fixed', 'wont_fix')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_flaw_patterns_code
  ON flaw_patterns(pattern_code);

CREATE INDEX IF NOT EXISTS idx_flaw_patterns_severity
  ON flaw_patterns(severity);

-- Batch evaluation summaries
CREATE TABLE IF NOT EXISTS batch_evaluations (
  id TEXT PRIMARY KEY,
  total_cases INTEGER NOT NULL,
  completed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  mean_score REAL,
  median_score REAL,
  min_score REAL,
  max_score REAL,
  std_dev REAL,
  score_distribution_json TEXT,
  top_flaws_json TEXT,
  run_ids TEXT DEFAULT '[]',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  total_duration_ms INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

/**
 * Database connection singleton
 */
let db = null;

/**
 * Get or create database connection
 */
export async function getDb(dbPath = DB_PATH) {
  if (db) return db;

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);

      // Enable foreign keys and initialize schema
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) console.warn('Could not enable foreign keys:', err.message);

        db.exec(SCHEMA_SQL, (err) => {
          if (err) return reject(err);
          // Auto-seed from fixtures if corpus is empty
          db.get('SELECT COUNT(*) as count FROM case_studies', (err, row) => {
            if (err || row.count > 0) return resolve(db);
            seedFromFixtures(db).then(() => resolve(db)).catch(() => resolve(db));
          });
        });
      });
    });
  });
}

/**
 * Seed corpus from fixture files (runs once when DB is empty)
 *
 * Aligned with the canonical case_studies schema:
 *   id, source_json, problem_json, solution_json, meta_json, harvested_at
 *
 * Vendor lives inside source_json (extracted via the idx_case_studies_vendor
 * JSON index). Errors per-row are swallowed so a single malformed fixture
 * cannot crash the host process.
 */
async function seedFromFixtures(database) {
  if (!fs.existsSync(FIXTURES_DIR)) return;
  const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) return;

  let stmt;
  try {
    stmt = database.prepare(
      `INSERT OR IGNORE INTO case_studies
         (id, source_json, problem_json, solution_json, meta_json, harvested_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
  } catch (err) {
    console.warn('Eval corpus: could not prepare seed insert:', err.message);
    return;
  }

  let count = 0;
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8'));
      const id = data.id || generateCaseStudyId(data);
      const source = data.source || { vendor: data.vendor || 'unknown' };
      const harvestedAt = data.harvested_at || new Date().toISOString();
      stmt.run(
        id,
        JSON.stringify(source),
        JSON.stringify(data.problem || {}),
        JSON.stringify(data.solution || {}),
        JSON.stringify(data.meta || {}),
        harvestedAt,
        (err) => {
          if (err) {
            // Per-row insert errors should not propagate; corpus seeding is
            // best-effort and a bad fixture must never crash the process.
            console.warn(`Eval corpus: skipped fixture ${file}: ${err.message}`);
          }
        }
      );
      count++;
    } catch (err) {
      // Skip malformed files; log so we know seeding was incomplete.
      console.warn(`Eval corpus: skipped malformed fixture ${file}: ${err.message}`);
    }
  }
  await new Promise((resolve) => stmt.finalize(resolve));
  if (count > 0) console.log(`Eval corpus: auto-seeded ${count} case studies`);
}

/**
 * Close database connection
 */
export async function closeDb() {
  if (!db) return;

  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) return reject(err);
      db = null;
      resolve();
    });
  });
}

/**
 * Reset database connection (for testing)
 */
export function resetDb() {
  db = null;
}

// =============================================================================
// Case Study CRUD
// =============================================================================

/**
 * Create a new case study
 */
export async function createCaseStudy(data) {
  const database = await getDb();

  // Validate input
  const parseResult = CreateCaseStudySchema.safeParse(data);
  if (!parseResult.success) {
    throw new Error(`Invalid case study data: ${parseResult.error.message}`);
  }

  const caseStudy = parseResult.data;

  // Generate ID if not provided
  const id = caseStudy.id || generateCaseStudyId(
    caseStudy.source.vendor,
    caseStudy.problem.industry,
    Date.now() % 1000
  );

  const harvestedAt = new Date().toISOString();

  return new Promise((resolve, reject) => {
    database.run(
      `INSERT INTO case_studies (id, source_json, problem_json, solution_json, meta_json, harvested_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        JSON.stringify(caseStudy.source),
        JSON.stringify(caseStudy.problem),
        JSON.stringify(caseStudy.solution),
        JSON.stringify(caseStudy.meta),
        harvestedAt,
      ],
      function (err) {
        if (err) return reject(err);

        // Return full case study object
        resolve({
          id,
          source: caseStudy.source,
          problem: caseStudy.problem,
          solution: caseStudy.solution,
          meta: caseStudy.meta,
          harvested_at: harvestedAt,
        });
      }
    );
  });
}

/**
 * Get case study by ID
 */
export async function getCaseStudyById(id) {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    database.get(
      `SELECT id, source_json, problem_json, solution_json, meta_json, harvested_at
       FROM case_studies WHERE id = ?`,
      [id],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);

        resolve({
          id: row.id,
          source: JSON.parse(row.source_json),
          problem: JSON.parse(row.problem_json),
          solution: JSON.parse(row.solution_json),
          meta: JSON.parse(row.meta_json),
          harvested_at: row.harvested_at,
        });
      }
    );
  });
}

/**
 * List case studies with optional filters
 */
export async function listCaseStudies(options = {}) {
  const database = await getDb();

  const {
    vendor = null,
    holdout = null,
    minQuality = null,
    tags = null,
    limit = 100,
    offset = 0,
  } = options;

  // Build query with filters
  let sql = `SELECT id, source_json, problem_json, meta_json, harvested_at FROM case_studies WHERE 1=1`;
  const params = [];

  if (vendor !== null) {
    sql += ` AND json_extract(source_json, '$.vendor') = ?`;
    params.push(vendor);
  }

  if (holdout !== null) {
    sql += ` AND json_extract(meta_json, '$.holdout') = ?`;
    params.push(holdout ? 1 : 0);
  }

  if (minQuality !== null) {
    sql += ` AND json_extract(meta_json, '$.quality_score') >= ?`;
    params.push(minQuality);
  }

  sql += ` ORDER BY harvested_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return new Promise((resolve, reject) => {
    database.all(sql, params, (err, rows) => {
      if (err) return reject(err);

      const caseStudies = rows.map((row) => ({
        id: row.id,
        source: JSON.parse(row.source_json),
        problem: JSON.parse(row.problem_json),
        meta: JSON.parse(row.meta_json),
        harvested_at: row.harvested_at,
      }));

      // Filter by tags if specified (post-query since SQLite JSON is limited)
      if (tags && tags.length > 0) {
        resolve(
          caseStudies.filter((cs) =>
            tags.some((tag) => cs.meta.domain_tags?.includes(tag))
          )
        );
      } else {
        resolve(caseStudies);
      }
    });
  });
}

/**
 * Update case study meta
 */
export async function updateCaseStudyMeta(id, metaUpdate) {
  const database = await getDb();

  // Validate update
  const parseResult = UpdateCaseStudyMetaSchema.safeParse(metaUpdate);
  if (!parseResult.success) {
    throw new Error(`Invalid meta update: ${parseResult.error.message}`);
  }

  // Get current meta
  const existing = await getCaseStudyById(id);
  if (!existing) {
    throw new Error(`Case study not found: ${id}`);
  }

  // Merge updates
  const updatedMeta = { ...existing.meta, ...parseResult.data };

  return new Promise((resolve, reject) => {
    database.run(
      `UPDATE case_studies
       SET meta_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(updatedMeta), id],
      function (err) {
        if (err) return reject(err);
        resolve({ ...existing, meta: updatedMeta });
      }
    );
  });
}

/**
 * Delete case study
 */
export async function deleteCaseStudy(id) {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    database.run(`DELETE FROM case_studies WHERE id = ?`, [id], function (err) {
      if (err) return reject(err);
      resolve({ deleted: this.changes > 0 });
    });
  });
}

/**
 * Get source distribution (count by vendor)
 */
export async function getSourceDistribution() {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    database.all(
      `SELECT json_extract(source_json, '$.vendor') as vendor, COUNT(*) as count
       FROM case_studies GROUP BY vendor ORDER BY count DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);

        const distribution = {};
        for (const row of rows) {
          distribution[row.vendor] = row.count;
        }
        resolve(distribution);
      }
    );
  });
}

/**
 * Get corpus statistics
 */
export async function getCorpusStats() {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    database.get(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN json_extract(meta_json, '$.holdout') = 1 THEN 1 ELSE 0 END) as holdout,
         AVG(json_extract(meta_json, '$.quality_score')) as avg_quality,
         MIN(harvested_at) as oldest,
         MAX(harvested_at) as newest
       FROM case_studies`,
      [],
      (err, row) => {
        if (err) return reject(err);

        resolve({
          total: row.total || 0,
          holdout: row.holdout || 0,
          training: (row.total || 0) - (row.holdout || 0),
          avgQuality: row.avg_quality ? parseFloat(row.avg_quality.toFixed(2)) : null,
          oldest: row.oldest,
          newest: row.newest,
        });
      }
    );
  });
}

// =============================================================================
// Evaluation Run CRUD
// =============================================================================

/**
 * Create a new evaluation run
 */
export async function createEvaluationRun(data) {
  const database = await getDb();

  const id = randomUUID();
  const runAt = new Date().toISOString();

  return new Promise((resolve, reject) => {
    database.run(
      `INSERT INTO evaluation_runs
       (id, case_study_id, pipeline_version, status, input_json, triggered_by, run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.case_study_id,
        data.pipeline_version,
        data.status || 'pending',
        JSON.stringify(data.input_json),
        data.triggered_by || 'manual',
        runAt,
      ],
      function (err) {
        if (err) return reject(err);

        resolve({
          id,
          case_study_id: data.case_study_id,
          pipeline_version: data.pipeline_version,
          status: data.status || 'pending',
          input_json: data.input_json,
          triggered_by: data.triggered_by || 'manual',
          run_at: runAt,
        });
      }
    );
  });
}

/**
 * Update evaluation run with results
 */
export async function updateEvaluationRun(id, updates) {
  const database = await getDb();

  const setClauses = [];
  const params = [];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);
  }
  if (updates.output_json !== undefined) {
    setClauses.push('output_json = ?');
    params.push(JSON.stringify(updates.output_json));
  }
  if (updates.scores !== undefined) {
    setClauses.push('scores_json = ?');
    params.push(JSON.stringify(updates.scores));
    if (updates.scores.aggregate_score !== undefined) {
      setClauses.push('aggregate_score = ?');
      params.push(updates.scores.aggregate_score);
    }
  }
  if (updates.flaws_detected !== undefined) {
    setClauses.push('flaws_detected = ?');
    params.push(JSON.stringify(updates.flaws_detected));
  }
  if (updates.error_message !== undefined) {
    setClauses.push('error_message = ?');
    params.push(updates.error_message);
  }
  if (updates.completed_at !== undefined) {
    setClauses.push('completed_at = ?');
    params.push(updates.completed_at);
  }
  if (updates.duration_ms !== undefined) {
    setClauses.push('duration_ms = ?');
    params.push(updates.duration_ms);
  }

  if (setClauses.length === 0) {
    throw new Error('No updates provided');
  }

  params.push(id);

  return new Promise((resolve, reject) => {
    database.run(
      `UPDATE evaluation_runs SET ${setClauses.join(', ')} WHERE id = ?`,
      params,
      function (err) {
        if (err) return reject(err);
        resolve({ updated: this.changes > 0 });
      }
    );
  });
}

/**
 * Get evaluation run by ID
 */
export async function getEvaluationRunById(id) {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    database.get(
      `SELECT * FROM evaluation_runs WHERE id = ?`,
      [id],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);

        resolve({
          ...row,
          input_json: JSON.parse(row.input_json || '{}'),
          output_json: row.output_json ? JSON.parse(row.output_json) : null,
          scores_json: row.scores_json ? JSON.parse(row.scores_json) : null,
          flaws_detected: JSON.parse(row.flaws_detected || '[]'),
        });
      }
    );
  });
}

/**
 * List evaluation runs for a case study
 */
export async function getEvaluationsForCaseStudy(caseStudyId, options = {}) {
  const database = await getDb();
  const { limit = 10 } = options;

  return new Promise((resolve, reject) => {
    database.all(
      `SELECT id, pipeline_version, status, aggregate_score, flaws_detected, run_at, completed_at
       FROM evaluation_runs
       WHERE case_study_id = ?
       ORDER BY run_at DESC
       LIMIT ?`,
      [caseStudyId, limit],
      (err, rows) => {
        if (err) return reject(err);

        resolve(
          rows.map((row) => ({
            ...row,
            flaws_detected: JSON.parse(row.flaws_detected || '[]'),
          }))
        );
      }
    );
  });
}

/**
 * List all evaluation runs with filters
 */
export async function listEvaluationRuns(options = {}) {
  const database = await getDb();

  const {
    status = null,
    minScore = null,
    flaw = null,
    pipelineVersion = null,
    limit = 50,
    offset = 0,
  } = options;

  let sql = `SELECT * FROM evaluation_runs WHERE 1=1`;
  const params = [];

  if (status !== null) {
    sql += ` AND status = ?`;
    params.push(status);
  }
  if (minScore !== null) {
    sql += ` AND aggregate_score >= ?`;
    params.push(minScore);
  }
  if (pipelineVersion !== null) {
    sql += ` AND pipeline_version = ?`;
    params.push(pipelineVersion);
  }

  sql += ` ORDER BY run_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return new Promise((resolve, reject) => {
    database.all(sql, params, (err, rows) => {
      if (err) return reject(err);

      let results = rows.map((row) => ({
        ...row,
        input_json: JSON.parse(row.input_json || '{}'),
        output_json: row.output_json ? JSON.parse(row.output_json) : null,
        scores_json: row.scores_json ? JSON.parse(row.scores_json) : null,
        flaws_detected: JSON.parse(row.flaws_detected || '[]'),
      }));

      // Filter by flaw if specified
      if (flaw !== null) {
        results = results.filter((r) => r.flaws_detected.includes(flaw));
      }

      resolve(results);
    });
  });
}

// =============================================================================
// Exports
// =============================================================================

export default {
  // Database
  getDb,
  closeDb,
  resetDb,

  // Case studies
  createCaseStudy,
  getCaseStudyById,
  listCaseStudies,
  updateCaseStudyMeta,
  deleteCaseStudy,
  getSourceDistribution,
  getCorpusStats,

  // Evaluation runs
  createEvaluationRun,
  updateEvaluationRun,
  getEvaluationRunById,
  getEvaluationsForCaseStudy,
  listEvaluationRuns,
};
