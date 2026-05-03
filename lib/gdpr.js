/**
 * GDPR Compliance Module
 *
 * Implements GDPR requirements:
 * - Article 15: Right of access (data export)
 * - Article 17: Right to erasure (account deletion)
 * - Article 20: Right to data portability (machine-readable export)
 * - Consent management for data processing
 *
 * Usage:
 *   import { GdprManager, ConsentType } from './gdpr.js';
 *
 *   const gdpr = new GdprManager(dbPath);
 *   await gdpr.createExportJob(userId);
 *   await gdpr.recordConsent(userId, ConsentType.TERMS, true, context);
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import sqlite3 from 'sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'config', 'gdpr.db');

/**
 * Consent type enum
 */
export const ConsentType = {
  TERMS: 'terms',
  PRIVACY: 'privacy',
  MARKETING: 'marketing',
  ANALYTICS: 'analytics',
  COOKIES: 'cookies',
};

/**
 * Export job status enum
 */
export const ExportStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired',
};

/**
 * Deletion request status enum
 */
export const DeletionStatus = {
  PENDING: 'pending',
  GRACE_PERIOD: 'grace_period',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/**
 * Retention periods (in days)
 */
export const RetentionPeriod = {
  EXPORT_FILE: 7, // Export files available for 7 days
  DELETION_GRACE: 30, // 30-day grace period before deletion
  BACKUP: 90, // Backups retained 90 days after deletion
};

/**
 * GDPR Manager - handles data export, deletion, and consent
 */
export class GdprManager {
  constructor(dbPath = null) {
    this.dbPath = dbPath || DEFAULT_DB_PATH;
    this.db = new sqlite3.Database(this.dbPath);
    this._initialized = false;
    this._initPromise = null;
  }

  async _ensureInit() {
    if (this._initialized) return;
    if (this._initPromise) {
      await this._initPromise;
      return;
    }

    this._initPromise = this._init();
    await this._initPromise;
  }

  async _init() {
    if (this._initialized) return;

    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS user_consents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        consent_type TEXT NOT NULL,
        version TEXT NOT NULL,
        consented INTEGER NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        consented_at INTEGER NOT NULL
      )
    `);

    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS export_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        file_path TEXT,
        file_size INTEGER,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        expires_at INTEGER,
        error TEXT
      )
    `);

    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS deletion_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        requested_at INTEGER NOT NULL,
        grace_period_ends INTEGER NOT NULL,
        processing_started_at INTEGER,
        completed_at INTEGER,
        cancelled_at INTEGER,
        anonymization_log TEXT
      )
    `);

    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS legal_documents (
        id TEXT PRIMARY KEY,
        document_type TEXT NOT NULL,
        version TEXT NOT NULL,
        content TEXT NOT NULL,
        effective_date INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(document_type, version)
      )
    `);

    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS data_processing (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        purpose TEXT NOT NULL,
        legal_basis TEXT NOT NULL,
        data_types TEXT,
        retention_period TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS access_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        request_type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      )
    `);

    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_consents_user ON user_consents(user_id)'
    );
    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_consents_type ON user_consents(consent_type)'
    );
    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_exports_user ON export_jobs(user_id)'
    );
    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_exports_status ON export_jobs(status)'
    );
    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_deletions_status ON deletion_requests(status)'
    );

    this._initialized = true;
  }

  // Raw run without init check (for initialization)
  async _runRaw(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  async _run(sql, params = []) {
    await this._ensureInit();
    return this._runRaw(sql, params);
  }

  async _get(sql, params = []) {
    await this._ensureInit();
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  async _all(sql, params = []) {
    await this._ensureInit();
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  // ========== CONSENT MANAGEMENT ==========

  /**
   * Record user consent
   * @param {string} userId - User ID
   * @param {string} consentType - Type of consent (terms, privacy, marketing, etc.)
   * @param {boolean} consented - Whether user consented
   * @param {object} context - Request context (ip, userAgent)
   * @param {string} version - Version of the document being consented to
   * @returns {Promise<object>}
   */
  async recordConsent(userId, consentType, consented, context = {}, version = '1.0') {
    const id = `cns_${randomBytes(12).toString('hex')}`;
    const now = Date.now();

    await this._run(
      `INSERT INTO user_consents
       (id, user_id, consent_type, version, consented, ip_address, user_agent, consented_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        consentType,
        version,
        consented ? 1 : 0,
        context.ip_address || null,
        context.user_agent || null,
        now,
      ]
    );

    return {
      consent_id: id,
      user_id: userId,
      consent_type: consentType,
      version,
      consented,
      consented_at: now,
    };
  }

  /**
   * Get user's consent status for a type
   * @param {string} userId - User ID
   * @param {string} consentType - Type of consent
   * @returns {Promise<object|null>}
   */
  async getConsent(userId, consentType) {
    const row = await this._get(
      `SELECT * FROM user_consents
       WHERE user_id = ? AND consent_type = ?
       ORDER BY consented_at DESC
       LIMIT 1`,
      [userId, consentType]
    );

    if (!row) return null;

    return {
      consent_id: row.id,
      user_id: row.user_id,
      consent_type: row.consent_type,
      version: row.version,
      consented: row.consented === 1,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      consented_at: row.consented_at,
    };
  }

  /**
   * Get all consents for a user
   * @param {string} userId - User ID
   * @returns {Promise<object[]>}
   */
  async getAllConsents(userId) {
    const rows = await this._all(
      `SELECT * FROM user_consents
       WHERE user_id = ?
       ORDER BY consented_at DESC`,
      [userId]
    );

    return rows.map((row) => ({
      consent_id: row.id,
      user_id: row.user_id,
      consent_type: row.consent_type,
      version: row.version,
      consented: row.consented === 1,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      consented_at: row.consented_at,
    }));
  }

  /**
   * Check if user has valid consent for processing
   * @param {string} userId - User ID
   * @param {string[]} requiredTypes - Required consent types
   * @returns {Promise<{ valid: boolean, missing: string[] }>}
   */
  async hasRequiredConsents(userId, requiredTypes = [ConsentType.TERMS, ConsentType.PRIVACY]) {
    const missing = [];

    for (const type of requiredTypes) {
      const consent = await this.getConsent(userId, type);
      if (!consent || !consent.consented) {
        missing.push(type);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Withdraw consent
   * @param {string} userId - User ID
   * @param {string} consentType - Type of consent to withdraw
   * @param {object} context - Request context
   * @returns {Promise<object>}
   */
  async withdrawConsent(userId, consentType, context = {}) {
    const current = await this.getConsent(userId, consentType);
    const version = current ? current.version : '1.0';

    return this.recordConsent(userId, consentType, false, context, version);
  }

  // ========== DATA EXPORT ==========

  /**
   * Create a data export job
   * @param {string} userId - User ID
   * @returns {Promise<object>}
   */
  async createExportJob(userId) {
    // Check for existing pending/processing job
    const existing = await this._get(
      `SELECT * FROM export_jobs
       WHERE user_id = ? AND status IN ('pending', 'processing')`,
      [userId]
    );

    if (existing) {
      return {
        job_id: existing.id,
        status: existing.status,
        created_at: existing.created_at,
        message: 'Export job already in progress',
      };
    }

    const id = `exp_${randomBytes(12).toString('hex')}`;
    const now = Date.now();
    const expiresAt = now + RetentionPeriod.EXPORT_FILE * 24 * 60 * 60 * 1000;

    await this._run(
      `INSERT INTO export_jobs
       (id, user_id, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, userId, ExportStatus.PENDING, now, expiresAt]
    );

    return {
      job_id: id,
      user_id: userId,
      status: ExportStatus.PENDING,
      created_at: now,
      expires_at: expiresAt,
    };
  }

  /**
   * Get export job status
   * @param {string} jobId - Job ID
   * @returns {Promise<object|null>}
   */
  async getExportJob(jobId) {
    const row = await this._get('SELECT * FROM export_jobs WHERE id = ?', [jobId]);

    if (!row) return null;

    return {
      job_id: row.id,
      user_id: row.user_id,
      status: row.status,
      file_path: row.file_path,
      file_size: row.file_size,
      created_at: row.created_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      expires_at: row.expires_at,
      error: row.error,
    };
  }

  /**
   * Update export job status
   * @param {string} jobId - Job ID
   * @param {object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async updateExportJob(jobId, updates) {
    const fields = [];
    const values = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (updates.file_path !== undefined) {
      fields.push('file_path = ?');
      values.push(updates.file_path);
    }

    if (updates.file_size !== undefined) {
      fields.push('file_size = ?');
      values.push(updates.file_size);
    }

    if (updates.started_at !== undefined) {
      fields.push('started_at = ?');
      values.push(updates.started_at);
    }

    if (updates.completed_at !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completed_at);
    }

    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }

    if (fields.length === 0) return;

    values.push(jobId);
    await this._run(
      `UPDATE export_jobs SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  /**
   * Get all export jobs for a user
   * @param {string} userId - User ID
   * @returns {Promise<object[]>}
   */
  async getUserExportJobs(userId) {
    const rows = await this._all(
      `SELECT * FROM export_jobs
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    return rows.map((row) => ({
      job_id: row.id,
      user_id: row.user_id,
      status: row.status,
      file_path: row.file_path,
      file_size: row.file_size,
      created_at: row.created_at,
      completed_at: row.completed_at,
      expires_at: row.expires_at,
    }));
  }

  /**
   * Process an export job - gather user data and create export file
   * @param {string} jobId - Job ID
   * @returns {Promise<object>}
   */
  async processExportJob(jobId) {
    const job = await this.getExportJob(jobId);
    if (!job) throw new Error('Export job not found');
    if (job.status !== ExportStatus.PENDING) {
      return job; // Already processed
    }

    const fs = await import('fs/promises');

    // Update status to processing
    await this.updateExportJob(jobId, {
      status: ExportStatus.PROCESSING,
      started_at: Date.now(),
    });

    try {
      // Gather user data
      const accessRequestRows = await this._all(
        `SELECT id, request_type, status, created_at, completed_at
           FROM access_requests WHERE user_id = ?
           ORDER BY created_at DESC`,
        [job.user_id]
      );
      const userExportJobs = await this.getUserExportJobs(job.user_id);
      const userData = {
        export_info: {
          job_id: jobId,
          user_id: job.user_id,
          generated_at: new Date().toISOString(),
          format_version: '1.0',
        },
        consents: await this.getAllConsents(job.user_id),
        processing_activities: await this._all(
          `SELECT category, purpose, legal_basis, data_types, retention_period
           FROM data_processing WHERE user_id = ?`,
          [job.user_id]
        ),
        access_requests: accessRequestRows.map((r) => ({
          request_id: r.id,
          type: r.request_type,
          status: r.status,
          created_at: r.created_at,
          completed_at: r.completed_at,
        })),
        export_jobs: userExportJobs.filter((j) => j.job_id !== jobId),
      };

      // Create export directory if needed
      const exportDir = path.join(__dirname, '..', 'exports');
      await fs.mkdir(exportDir, { recursive: true });

      // Write export file
      const filename = `gdpr_export_${job.user_id}_${Date.now()}.json`;
      const filePath = path.join(exportDir, filename);
      const content = JSON.stringify(userData, null, 2);
      await fs.writeFile(filePath, content, 'utf8');

      // Update job with file info
      const fileSize = Buffer.byteLength(content, 'utf8');
      await this.updateExportJob(jobId, {
        status: ExportStatus.COMPLETED,
        file_path: `/exports/${filename}`,
        file_size: fileSize,
        completed_at: Date.now(),
      });

      return {
        ...job,
        status: ExportStatus.COMPLETED,
        file_path: `/exports/${filename}`,
        file_size: fileSize,
        completed_at: Date.now(),
      };
    } catch (error) {
      await this.updateExportJob(jobId, {
        status: ExportStatus.FAILED,
        error: error.message,
        completed_at: Date.now(),
      });
      throw error;
    }
  }

  /**
   * Cleanup expired export jobs
   * @returns {Promise<{ deleted: number }>}
   */
  async cleanupExpiredExports() {
    const now = Date.now();

    const result = await this._run(
      `UPDATE export_jobs
       SET status = ?, file_path = NULL
       WHERE expires_at < ? AND status = ?`,
      [ExportStatus.EXPIRED, now, ExportStatus.COMPLETED]
    );

    return { deleted: result.changes };
  }

  // ========== ACCOUNT DELETION ==========

  /**
   * Request account deletion (starts grace period)
   * @param {string} userId - User ID
   * @param {string} reason - Optional reason for deletion
   * @returns {Promise<object>}
   */
  async requestDeletion(userId, reason = null) {
    // Check for existing request
    const existing = await this._get(
      `SELECT * FROM deletion_requests
       WHERE user_id = ? AND status IN ('pending', 'grace_period', 'processing')`,
      [userId]
    );

    if (existing) {
      return {
        request_id: existing.id,
        status: existing.status,
        grace_period_ends: existing.grace_period_ends,
        message: 'Deletion request already exists',
      };
    }

    const id = `del_${randomBytes(12).toString('hex')}`;
    const now = Date.now();
    const gracePeriodEnds = now + RetentionPeriod.DELETION_GRACE * 24 * 60 * 60 * 1000;

    await this._run(
      `INSERT INTO deletion_requests
       (id, user_id, status, reason, requested_at, grace_period_ends)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, DeletionStatus.GRACE_PERIOD, reason, now, gracePeriodEnds]
    );

    return {
      request_id: id,
      user_id: userId,
      status: DeletionStatus.GRACE_PERIOD,
      requested_at: now,
      grace_period_ends: gracePeriodEnds,
      days_remaining: RetentionPeriod.DELETION_GRACE,
    };
  }

  /**
   * Cancel a deletion request (within grace period)
   * @param {string} userId - User ID
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async cancelDeletion(userId) {
    const request = await this._get(
      `SELECT * FROM deletion_requests
       WHERE user_id = ? AND status = ?`,
      [userId, DeletionStatus.GRACE_PERIOD]
    );

    if (!request) {
      return {
        success: false,
        message: 'No cancellable deletion request found',
      };
    }

    const now = Date.now();

    await this._run(
      `UPDATE deletion_requests
       SET status = ?, cancelled_at = ?
       WHERE id = ?`,
      [DeletionStatus.CANCELLED, now, request.id]
    );

    return {
      success: true,
      message: 'Deletion request cancelled',
      request_id: request.id,
    };
  }

  /**
   * Get deletion request status
   * @param {string} userId - User ID
   * @returns {Promise<object|null>}
   */
  async getDeletionRequest(userId) {
    const row = await this._get(
      `SELECT * FROM deletion_requests
       WHERE user_id = ?
       ORDER BY requested_at DESC
       LIMIT 1`,
      [userId]
    );

    if (!row) return null;

    const now = Date.now();
    const daysRemaining = row.status === DeletionStatus.GRACE_PERIOD
      ? Math.ceil((row.grace_period_ends - now) / (24 * 60 * 60 * 1000))
      : 0;

    return {
      request_id: row.id,
      user_id: row.user_id,
      status: row.status,
      reason: row.reason,
      requested_at: row.requested_at,
      grace_period_ends: row.grace_period_ends,
      days_remaining: Math.max(0, daysRemaining),
      completed_at: row.completed_at,
      cancelled_at: row.cancelled_at,
    };
  }

  /**
   * Process pending deletions (run as background job)
   * @param {Function} deleteUserFn - Function to actually delete user data
   * @returns {Promise<{ processed: number, errors: string[] }>}
   */
  async processPendingDeletions(deleteUserFn) {
    const now = Date.now();

    const requests = await this._all(
      `SELECT * FROM deletion_requests
       WHERE status = ? AND grace_period_ends < ?`,
      [DeletionStatus.GRACE_PERIOD, now]
    );

    const errors = [];
    let processed = 0;

    for (const request of requests) {
      try {
        // Mark as processing
        await this._run(
          `UPDATE deletion_requests
           SET status = ?, processing_started_at = ?
           WHERE id = ?`,
          [DeletionStatus.PROCESSING, now, request.id]
        );

        // Execute deletion
        const log = await deleteUserFn(request.user_id);

        // Mark as completed
        await this._run(
          `UPDATE deletion_requests
           SET status = ?, completed_at = ?, anonymization_log = ?
           WHERE id = ?`,
          [DeletionStatus.COMPLETED, Date.now(), JSON.stringify(log), request.id]
        );

        processed++;
      } catch (error) {
        errors.push(`User ${request.user_id}: ${error.message}`);
      }
    }

    return { processed, errors };
  }

  // ========== LEGAL DOCUMENTS ==========

  /**
   * Add or update a legal document
   * @param {string} documentType - Type (terms, privacy, dpa)
   * @param {string} version - Version string
   * @param {string} content - Document content
   * @param {number} effectiveDate - When document becomes effective
   * @returns {Promise<object>}
   */
  async setLegalDocument(documentType, version, content, effectiveDate = Date.now()) {
    const id = `doc_${randomBytes(12).toString('hex')}`;
    const now = Date.now();

    await this._run(
      `INSERT OR REPLACE INTO legal_documents
       (id, document_type, version, content, effective_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, documentType, version, content, effectiveDate, now]
    );

    return {
      document_id: id,
      document_type: documentType,
      version,
      effective_date: effectiveDate,
    };
  }

  /**
   * Get latest legal document
   * @param {string} documentType - Type of document
   * @returns {Promise<object|null>}
   */
  async getLegalDocument(documentType) {
    const row = await this._get(
      `SELECT * FROM legal_documents
       WHERE document_type = ? AND effective_date <= ?
       ORDER BY effective_date DESC
       LIMIT 1`,
      [documentType, Date.now()]
    );

    if (!row) return null;

    return {
      document_id: row.id,
      document_type: row.document_type,
      version: row.version,
      content: row.content,
      effective_date: row.effective_date,
    };
  }

  /**
   * Check if user needs to accept new version
   * @param {string} userId - User ID
   * @param {string} documentType - Type of document
   * @returns {Promise<{ needsAcceptance: boolean, currentVersion: string|null, latestVersion: string|null }>}
   */
  async needsConsentUpdate(userId, documentType) {
    const consent = await this.getConsent(userId, documentType);
    const document = await this.getLegalDocument(documentType);

    if (!document) {
      return {
        needsAcceptance: false,
        currentVersion: consent?.version || null,
        latestVersion: null,
      };
    }

    const needsAcceptance = !consent || !consent.consented || consent.version !== document.version;

    return {
      needsAcceptance,
      currentVersion: consent?.version || null,
      latestVersion: document.version,
    };
  }

  // ========== DATA SUBJECT ACCESS REQUEST (DSAR) ==========

  /**
   * Generate a DSAR report (all data for a user)
   * @param {string} userId - User ID
   * @param {Function} getDataFn - Function to retrieve user data
   * @returns {Promise<object>}
   */
  async generateDsarReport(userId, getDataFn) {
    const data = await getDataFn(userId);
    const consents = await this.getAllConsents(userId);
    const exportJobs = await this.getUserExportJobs(userId);
    const deletionRequest = await this.getDeletionRequest(userId);

    return {
      generated_at: new Date().toISOString(),
      user_id: userId,
      consents: consents.map((c) => ({
        type: c.consent_type,
        version: c.version,
        consented: c.consented,
        date: new Date(c.consented_at).toISOString(),
      })),
      export_history: exportJobs.map((e) => ({
        job_id: e.job_id,
        status: e.status,
        created: new Date(e.created_at).toISOString(),
      })),
      deletion_request: deletionRequest
        ? {
          status: deletionRequest.status,
          requested: new Date(deletionRequest.requested_at).toISOString(),
          grace_period_ends: new Date(deletionRequest.grace_period_ends).toISOString(),
        }
        : null,
      user_data: data,
    };
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
