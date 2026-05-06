/**
 * Audit Logging Module
 *
 * Provides comprehensive audit logging for compliance (SOC 2, HIPAA).
 * Features:
 * - Immutable audit logs (write-only)
 * - Request context capture (IP, user agent)
 * - Hash chain for tamper detection
 * - Configurable retention policies
 */
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'config', 'audit.db');

// Audit action types
export const AuditAction = {
  // User actions
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_LOGIN_FAILED: 'user.login_failed',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',

  // Workspace actions
  WORKSPACE_CREATED: 'workspace.created',
  WORKSPACE_UPDATED: 'workspace.updated',
  WORKSPACE_DELETED: 'workspace.deleted',
  MEMBER_INVITED: 'member.invited',
  MEMBER_JOINED: 'member.joined',
  MEMBER_REMOVED: 'member.removed',
  MEMBER_ROLE_CHANGED: 'member.role_changed',

  // Document actions
  DOCUMENT_CREATED: 'document.created',
  DOCUMENT_VIEWED: 'document.viewed',
  DOCUMENT_UPDATED: 'document.updated',
  DOCUMENT_DELETED: 'document.deleted',
  DOCUMENT_SHARED: 'document.shared',
  DOCUMENT_EXPORTED: 'document.exported',
  DOCUMENT_DOWNLOADED: 'document.downloaded',

  // Pipeline actions
  PIPELINE_STARTED: 'pipeline.started',
  PIPELINE_COMPLETED: 'pipeline.completed',
  PIPELINE_FAILED: 'pipeline.failed',

  // Settings actions
  SETTINGS_UPDATED: 'settings.updated',
  API_KEY_CREATED: 'api_key.created',
  API_KEY_REVOKED: 'api_key.revoked',
  WEBHOOK_CREATED: 'webhook.created',
  WEBHOOK_UPDATED: 'webhook.updated',
  WEBHOOK_DELETED: 'webhook.deleted',

  // Billing actions
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_UPDATED: 'subscription.updated',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
};

// Retention policies by plan (days)
export const RetentionPolicy = {
  free: 30,
  pro: 90,
  enterprise: 730, // 2 years
};

export class AuditLogger {
  constructor(dbPath = null) {
    this.dbPath = dbPath || DEFAULT_DB_PATH;
    this.db = new sqlite3.Database(this.dbPath);
    this.init();
    this.lastHash = null;
  }

  init() {
    this.db.serialize(() => {
      // Create audit_logs table (immutable)
      this.db.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          log_id TEXT UNIQUE NOT NULL,
          workspace_id TEXT,
          user_id TEXT,
          action TEXT NOT NULL,
          resource_type TEXT,
          resource_id TEXT,
          ip_address TEXT,
          user_agent TEXT,
          metadata TEXT,
          hash TEXT NOT NULL,
          previous_hash TEXT,
          timestamp INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Indexes for efficient queries
      this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_workspace_ts ON audit_logs(workspace_id, timestamp)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_user_ts ON audit_logs(user_id, timestamp)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_action_ts ON audit_logs(action, timestamp)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id)');

      // Get the last hash for chain integrity
      this.db.get(
        'SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1',
        (err, row) => {
          if (!err && row) {
            this.lastHash = row.hash;
          }
        }
      );
    });
  }

  /**
   * Generate unique log ID
   */
  generateLogId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `aud_${timestamp}_${random}`;
  }

  /**
   * Compute hash for tamper detection (hash chain)
   */
  computeHash(logId, action, resourceType, resourceId, metadata, timestamp, previousHash) {
    const data = JSON.stringify({
      log_id: logId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
      timestamp,
      previous_hash: previousHash || 'GENESIS',
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Log an audit event
   * @param {string} action - Action type (from AuditAction)
   * @param {string} resourceType - Type of resource (user, workspace, document, etc.)
   * @param {string} resourceId - ID of the resource
   * @param {Object} metadata - Additional metadata
   * @param {Object} context - Request context (user_id, workspace_id, ip, user_agent)
   */
  async log(action, resourceType, resourceId, metadata = {}, context = {}) {
    return new Promise((resolve, reject) => {
      const logId = this.generateLogId();
      const timestamp = Date.now();
      const hash = this.computeHash(logId, action, resourceType, resourceId, metadata, timestamp, this.lastHash);

      this.db.run(
        `INSERT INTO audit_logs
         (log_id, workspace_id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata, hash, previous_hash, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          logId,
          context.workspace_id || null,
          context.user_id || null,
          action,
          resourceType || null,
          resourceId || null,
          context.ip_address || null,
          context.user_agent || null,
          JSON.stringify(metadata),
          hash,
          this.lastHash,
          timestamp,
        ],
        (err) => {
          if (err) return reject(err);
          this.lastHash = hash;
          resolve({ log_id: logId, hash });
        }
      );
    });
  }

  /**
   * Query audit logs with filters
   */
  async query(filters = {}) {
    return new Promise((resolve, reject) => {
      const { workspace_id, user_id, action, resource_type, start_date, end_date, limit = 50, offset = 0 } = filters;

      let sql = 'SELECT * FROM audit_logs WHERE 1=1';
      const params = [];

      if (workspace_id) {
        sql += ' AND workspace_id = ?';
        params.push(workspace_id);
      }

      if (user_id) {
        sql += ' AND user_id = ?';
        params.push(user_id);
      }

      if (action) {
        sql += ' AND action = ?';
        params.push(action);
      }

      if (resource_type) {
        sql += ' AND resource_type = ?';
        params.push(resource_type);
      }

      if (start_date) {
        sql += ' AND timestamp >= ?';
        params.push(start_date);
      }

      if (end_date) {
        sql += ' AND timestamp <= ?';
        params.push(end_date);
      }

      // Get total count
      const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
      this.db.get(countSql, params, (err, countRow) => {
        if (err) return reject(err);

        // Get paginated results
        sql += ' ORDER BY timestamp DESC, rowid DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        this.db.all(sql, params, (err, rows) => {
          if (err) return reject(err);

          const logs = rows.map((row) => ({
            ...row,
            metadata: JSON.parse(row.metadata || '{}'),
          }));

          resolve({
            logs,
            total: countRow.count,
            has_more: offset + logs.length < countRow.count,
            pagination: { limit, offset },
          });
        });
      });
    });
  }

  /**
   * Get a single audit log by ID
   */
  async getLog(logId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM audit_logs WHERE log_id = ?',
        [logId],
        (err, row) => {
          if (err) return reject(err);
          if (!row) return resolve(null);
          resolve({
            ...row,
            metadata: JSON.parse(row.metadata || '{}'),
          });
        }
      );
    });
  }

  /**
   * Verify hash chain integrity
   */
  async verifyIntegrity(limit = 1000) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM audit_logs ORDER BY id ASC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) return reject(err);
          if (rows.length === 0) return resolve({ valid: true, checked: 0 });

          let previousHash = null;
          let invalidAt = null;

          for (const row of rows) {
            const metadata = JSON.parse(row.metadata || '{}');
            const expectedHash = this.computeHash(
              row.log_id,
              row.action,
              row.resource_type,
              row.resource_id,
              metadata,
              row.timestamp,
              previousHash
            );

            if (row.hash !== expectedHash) {
              invalidAt = row.log_id;
              break;
            }

            previousHash = row.hash;
          }

          resolve({
            valid: invalidAt === null,
            checked: rows.length,
            invalid_at: invalidAt,
          });
        }
      );
    });
  }

  /**
   * Clean up old logs based on retention policy
   */
  async cleanup(retentionDays = RetentionPolicy.free) {
    return new Promise((resolve, reject) => {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      this.db.run(
        'DELETE FROM audit_logs WHERE timestamp < ?',
        [cutoff],
        function (err) {
          if (err) return reject(err);
          resolve({ deleted: this.changes });
        }
      );
    });
  }

  /**
   * Export logs to CSV format
   */
  async exportToCsv(filters = {}) {
    const result = await this.query({ ...filters, limit: 10_000 });
    const headers = [
      'log_id',
      'timestamp',
      'action',
      'resource_type',
      'resource_id',
      'user_id',
      'workspace_id',
      'ip_address',
      'metadata',
    ];

    const rows = result.logs.map((log) =>
      headers.map((h) => {
        const value = h === 'metadata' ? JSON.stringify(log[h]) : log[h] || '';
        // Escape CSV special characters
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replaceAll('"', '""')}"`;
        }

        return value;
      }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Close database connection
   */
  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

// Singleton instance
let auditLoggerInstance = null;

export function getAuditLogger(dbPath = null) {
  auditLoggerInstance ||= new AuditLogger(dbPath);
  return auditLoggerInstance;
}

/**
 * Express middleware to extract request context
 */
export function auditContextMiddleware(req, res, next) {
  req.auditContext = {
    user_id: req.user?.id || req.headers['x-user-id'] || null,
    workspace_id: req.workspace?.id || req.headers['x-workspace-id'] || null,
    ip_address: req.ip || req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress,
    user_agent: req.headers['user-agent'] || null,
  };
  next();
}

/**
 * Helper to log an audit event from an Express request
 */
export async function auditLog(req, action, resourceType, resourceId, metadata = {}) {
  const logger = getAuditLogger();
  const context = req.auditContext || {
    user_id: null,
    workspace_id: null,
    ip_address: req?.ip,
    user_agent: req?.headers?.['user-agent'],
  };
  return logger.log(action, resourceType, resourceId, metadata, context);
}
