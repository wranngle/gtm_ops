// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'config', 'history.db');

export class HistoryManager {
  constructor(dbPath: string | null = null) {
    this.dbPath = dbPath || DEFAULT_DB_PATH;
    this.db = new sqlite3.Database(this.dbPath);
    this.init();
  }

  init() {
    this.db.serialize(() => {
      // Increase GROUP_CONCAT limit for long artifact lists
      this.db.run('PRAGMA group_concat_max_len = 10000');

      this.db.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          client_slug TEXT NOT NULL,
          project_slug TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(client_slug, project_slug)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS executions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER,
          timestamp INTEGER,
          revision INTEGER NOT NULL,
          input_hash TEXT,
          input_path TEXT,
          output_dir TEXT,
          status TEXT, -- 'running', 'completed', 'failed'
          slug TEXT,
          metadata TEXT, -- JSON string
          FOREIGN KEY(project_id) REFERENCES projects(id)
        )
      `);

      // Migration: Add new columns if they don't exist
      const columns = [
        { name: 'total_price', type: 'REAL' },
        { name: 'total_hours', type: 'REAL' },
        { name: 'risk_score', type: 'INTEGER' },
        { name: 'monthly_bleed', type: 'REAL' },
        { name: 'audit_score', type: 'INTEGER' }
      ];

      for (const col of columns) {
        this.db.run(`ALTER TABLE executions ADD COLUMN ${col.name} ${col.type}`, (err) => {
          if (err && !err.message.includes('duplicate column name') && // Silence duplicate column errors, but log others
            !err.message.includes('duplicate')) console.error(`Migration error for ${col.name}:`, err.message);
        });
      }

      this.db.run(`
        CREATE TABLE IF NOT EXISTS artifacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          execution_id INTEGER,
          type TEXT, -- 'html', 'pdf', 'json'
          path TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(execution_id) REFERENCES executions(id)
        )
      `);

      // Migration: Add versioning columns to artifacts
      const artifactColumns = [
        { name: 'version', type: 'INTEGER DEFAULT 1' },
        { name: 'previous_version_id', type: 'INTEGER REFERENCES artifacts(id)' },
        { name: 'is_deleted', type: 'INTEGER DEFAULT 0' },
        { name: 'content_hash', type: 'TEXT' }
      ];

      for (const col of artifactColumns) {
        this.db.run(`ALTER TABLE artifacts ADD COLUMN ${col.name} ${col.type}`, (err) => {
          if (err && !err.message.includes('duplicate column name') && !err.message.includes('duplicate')) console.error(`Migration error for ${col.name}:`, err.message);
        });
      }

      // Create index for version lookups
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_artifacts_version ON artifacts(execution_id, type, version)`);
    });
  }

  async getProject(clientSlug, projectSlug, name) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM projects WHERE client_slug = ? AND project_slug = ?',
        [clientSlug, projectSlug],
        (err, row) => {
          if (err) return reject(err);
          if (row) return resolve(row);

          this.db.run(
            'INSERT INTO projects (name, client_slug, project_slug) VALUES (?, ?, ?)',
            [name, clientSlug, projectSlug],
            function(err) {
              if (err) return reject(err);
              resolve({ id: this.lastID, name, clientSlug, projectSlug });
            }
          );
        }
      );
    });
  }

  async getNextRevision(clientSlug, projectSlug) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT MAX(e.revision) as max_rev 
         FROM executions e 
         JOIN projects p ON e.project_id = p.id 
         WHERE p.client_slug = ? AND p.project_slug = ?`,
        [clientSlug, projectSlug],
        (err, row) => {
          if (err) return reject(err);
          resolve((row?.max_rev || 0) + 1);
        }
      );
    });
  }

  async startExecution(projectIdentity, inputPath, inputHash) {
    const { client_slug, project_slug, project_name, document_slug } = projectIdentity;
    const project = await this.getProject(client_slug, project_slug, project_name);
    // The identity carries the revision the pipeline computed via
    // getNextRevision (generateProjectIdentity exposes it explicitly).
    // Slug parsing (…-26r5 → 5) is only a fallback for legacy callers, and a
    // slug that doesn't encode a revision is a loud warning, not a silent 1.
    let revision = projectIdentity.revision;
    if (!Number.isInteger(revision) || revision < 1) {
      const match = document_slug.match(/r(\d+)$/);
      if (match) {
        revision = Number.parseInt(match[1], 10);
      } else {
        console.warn(`[History] No explicit revision and none parseable from slug "${document_slug}" — recording revision 1`);
        revision = 1;
      }
    }
    const now = Date.now();

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO executions (project_id, timestamp, revision, input_hash, input_path, status, slug, metadata) 
               VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`,
        [project.id, now, revision, inputHash, inputPath, document_slug, JSON.stringify(projectIdentity)],
        function(err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, revision });
        }
      );
    });
  }

  async updateExecutionStatus(id, status, outputDir, summary = {}) {
    return new Promise((resolve, reject) => {
      const { totalPrice, totalHours, riskScore, monthlyBleed, auditScore } = summary;
          
      this.db.run(
        `UPDATE executions SET 
               status = ?, 
               output_dir = ?,
               total_price = ?,
               total_hours = ?,
               risk_score = ?,
               monthly_bleed = ?,
               audit_score = ?
               WHERE id = ?`,
        [status, outputDir, totalPrice ?? null, totalHours ?? null, riskScore ?? null, monthlyBleed ?? null, auditScore ?? null, id],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }
  
  async addArtifact(executionId, type, filePath, contentHash = null) {
    return new Promise((resolve, reject) => {
      // First, get the previous version to link to
      this.db.get(
        `SELECT id, version FROM artifacts
               WHERE execution_id = ? AND type = ? AND is_deleted = 0
               ORDER BY version DESC LIMIT 1`,
        [executionId, type],
        (err, previousArtifact) => {
          if (err) return reject(err);

          const version = previousArtifact ? previousArtifact.version + 1 : 1;
          const previousVersionId = previousArtifact ? previousArtifact.id : null;

          this.db.run(
            `INSERT INTO artifacts (execution_id, type, path, version, previous_version_id, content_hash)
                       VALUES (?, ?, ?, ?, ?, ?)`,
            [executionId, type, filePath, version, previousVersionId, contentHash],
            function(err) {
              if (err) return reject(err);
              resolve({ id: this.lastID, version, previousVersionId });
            }
          );
        }
      );
    });
  }

  async getArtifactVersions(executionId, type, options = {}) {
    const { limit = 10, includeDeleted = false } = options;
    return new Promise((resolve, reject) => {
      const deletedClause = includeDeleted ? '' : 'AND is_deleted = 0';
      this.db.all(
        `SELECT id, execution_id, type, path, version, previous_version_id,
                      content_hash, is_deleted, created_at
               FROM artifacts
               WHERE execution_id = ? AND type = ? ${deletedClause}
               ORDER BY version DESC
               LIMIT ?`,
        [executionId, type, limit],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });
  }

  async getArtifactByVersion(executionId, type, version) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT id, execution_id, type, path, version, previous_version_id,
                      content_hash, is_deleted, created_at
               FROM artifacts
               WHERE execution_id = ? AND type = ? AND version = ?`,
        [executionId, type, version],
        (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        }
      );
    });
  }

  async getArtifactById(artifactId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT id, execution_id, type, path, version, previous_version_id,
                      content_hash, is_deleted, created_at
               FROM artifacts WHERE id = ?`,
        [artifactId],
        (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        }
      );
    });
  }

  async softDeleteArtifact(artifactId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE artifacts SET is_deleted = 1 WHERE id = ?',
        [artifactId],
        (err) => {
          if (err) return reject(err);
          resolve(true);
        }
      );
    });
  }

  async cleanupOldVersions(executionId, type, keepCount = 10) {
    return new Promise((resolve, reject) => {
      // Get all versions except the most recent `keepCount`
      this.db.all(
        `SELECT id FROM artifacts
               WHERE execution_id = ? AND type = ? AND is_deleted = 0
               ORDER BY version DESC
               LIMIT -1 OFFSET ?`,
        [executionId, type, keepCount],
        (err, rows) => {
          if (err) return reject(err);
          if (!rows || rows.length === 0) return resolve(0);

          const ids = rows.map(r => r.id);
          const placeholders = ids.map(() => '?').join(',');

          this.db.run(
            `UPDATE artifacts SET is_deleted = 1 WHERE id IN (${placeholders})`,
            ids,
            function(err) {
              if (err) return reject(err);
              resolve(this.changes);
            }
          );
        }
      );
    });
  }

  async getLatestArtifact(executionId, type) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT id, execution_id, type, path, version, previous_version_id,
                      content_hash, is_deleted, created_at
               FROM artifacts
               WHERE execution_id = ? AND type = ? AND is_deleted = 0
               ORDER BY version DESC LIMIT 1`,
        [executionId, type],
        (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        }
      );
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}
