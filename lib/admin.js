/**
 * Admin Dashboard Module
 *
 * Provides workspace-level metrics, analytics, and management utilities.
 *
 * Usage:
 *   import { AdminManager, MetricType } from './admin.js';
 *
 *   const admin = new AdminManager(dbPath);
 *   const metrics = await admin.getDashboardMetrics(workspaceId);
 */
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'config', 'admin.db');

/**
 * Metric types for tracking
 */
export const MetricType = {
  // Document metrics
  DOCUMENTS_CREATED: 'documents.created',
  DOCUMENTS_VIEWED: 'documents.viewed',
  DOCUMENTS_DOWNLOADED: 'documents.downloaded',
  DOCUMENTS_DELETED: 'documents.deleted',

  // API usage
  API_CALLS_LLM: 'api.calls.llm',
  API_CALLS_PDF: 'api.calls.pdf',
  API_TOKENS_INPUT: 'api.tokens.input',
  API_TOKENS_OUTPUT: 'api.tokens.output',

  // User activity
  USER_LOGINS: 'users.logins',
  USER_SIGNUPS: 'users.signups',

  // Revenue (for platform admin)
  REVENUE_MRR: 'revenue.mrr',
  REVENUE_ARR: 'revenue.arr',
};

/**
 * Time period presets
 */
export const TimePeriod = {
  TODAY: 'today',
  THIS_WEEK: 'this_week',
  THIS_MONTH: 'this_month',
  THIS_QUARTER: 'this_quarter',
  THIS_YEAR: 'this_year',
  LAST_7_DAYS: 'last_7_days',
  LAST_30_DAYS: 'last_30_days',
  LAST_90_DAYS: 'last_90_days',
  ALL_TIME: 'all_time',
};

/**
 * Get timestamp range for a period
 * @param {string} period - Period name
 * @returns {{ start: number, end: number }}
 */
function getTimestampRange(period) {
  const now = new Date();
  const end = now.getTime();
  let start;

  switch (period) {
    case TimePeriod.TODAY:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      break;
    case TimePeriod.THIS_WEEK: {
      const dayOfWeek = now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
      break;
    }
    case TimePeriod.THIS_MONTH:
      start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      break;
    case TimePeriod.THIS_QUARTER: {
      const quarter = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), quarter * 3, 1).getTime();
      break;
    }
    case TimePeriod.THIS_YEAR:
      start = new Date(now.getFullYear(), 0, 1).getTime();
      break;
    case TimePeriod.LAST_7_DAYS:
      start = end - 7 * 24 * 60 * 60 * 1000;
      break;
    case TimePeriod.LAST_30_DAYS:
      start = end - 30 * 24 * 60 * 60 * 1000;
      break;
    case TimePeriod.LAST_90_DAYS:
      start = end - 90 * 24 * 60 * 60 * 1000;
      break;
    case TimePeriod.ALL_TIME:
    default:
      start = 0;
      break;
  }

  return { start, end };
}

/**
 * Admin Manager - provides dashboard metrics and management utilities
 */
export class AdminManager {
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

    // Metrics aggregation table (hourly buckets)
    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS metric_buckets (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        bucket_hour INTEGER NOT NULL,
        value REAL NOT NULL DEFAULT 0,
        count INTEGER NOT NULL DEFAULT 1,
        UNIQUE(workspace_id, metric_type, bucket_hour)
      )
    `);

    // Daily aggregates for faster queries
    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS metric_daily (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        bucket_date INTEGER NOT NULL,
        value REAL NOT NULL DEFAULT 0,
        count INTEGER NOT NULL DEFAULT 0,
        UNIQUE(workspace_id, metric_type, bucket_date)
      )
    `);

    // Activity feed entries
    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS activity_feed (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        user_id TEXT,
        activity_type TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        description TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    // System health snapshots
    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS health_snapshots (
        id TEXT PRIMARY KEY,
        component TEXT NOT NULL,
        status TEXT NOT NULL,
        latency_ms INTEGER,
        error_count INTEGER DEFAULT 0,
        metadata TEXT,
        captured_at INTEGER NOT NULL
      )
    `);

    // Indexes
    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_buckets_ws_type ON metric_buckets(workspace_id, metric_type)'
    );
    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_buckets_hour ON metric_buckets(bucket_hour)'
    );
    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_daily_ws_type ON metric_daily(workspace_id, metric_type)'
    );
    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_activity_ws ON activity_feed(workspace_id, created_at)'
    );
    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_health_component ON health_snapshots(component, captured_at)'
    );

    this._initialized = true;
  }

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

  // ========== METRICS RECORDING ==========

  /**
   * Record a metric value
   * @param {string} workspaceId - Workspace ID
   * @param {string} metricType - Metric type
   * @param {number} value - Value to record (default: 1 for counters)
   * @returns {Promise<void>}
   */
  async recordMetric(workspaceId, metricType, value = 1) {
    const now = Date.now();
    const bucketHour = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);
    // Use local-midnight bucket so getMetric() period ranges (also computed in
    // local time via new Date(year, month, date)) align across timezones.
    // Previously this used UTC midnight which silently dropped same-day metrics
    // for any non-UTC runner: when local midnight > UTC midnight, the bucket
    // fell BEFORE the queried `start` and aggregates returned 0.
    const nowDate = new Date(now);
    const bucketDate = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate()
    ).getTime();

    // Upsert hourly bucket
    await this._run(
      `INSERT INTO metric_buckets (id, workspace_id, metric_type, bucket_hour, value, count)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(workspace_id, metric_type, bucket_hour)
       DO UPDATE SET value = value + ?, count = count + 1`,
      [
        `mb_${workspaceId}_${metricType}_${bucketHour}`,
        workspaceId,
        metricType,
        bucketHour,
        value,
        value,
      ]
    );

    // Upsert daily aggregate
    await this._run(
      `INSERT INTO metric_daily (id, workspace_id, metric_type, bucket_date, value, count)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(workspace_id, metric_type, bucket_date)
       DO UPDATE SET value = value + ?, count = count + 1`,
      [
        `md_${workspaceId}_${metricType}_${bucketDate}`,
        workspaceId,
        metricType,
        bucketDate,
        value,
        value,
      ]
    );
  }

  /**
   * Get aggregated metric for a period
   * @param {string} workspaceId - Workspace ID
   * @param {string} metricType - Metric type
   * @param {string} period - Time period
   * @returns {Promise<{ total: number, count: number, average: number }>}
   */
  async getMetric(workspaceId, metricType, period = TimePeriod.THIS_MONTH) {
    const { start, end } = getTimestampRange(period);

    const row = await this._get(
      `SELECT SUM(value) as total, SUM(count) as count
       FROM metric_daily
       WHERE workspace_id = ? AND metric_type = ? AND bucket_date >= ? AND bucket_date < ?`,
      [workspaceId, metricType, start, end]
    );

    const total = row?.total || 0;
    const count = row?.count || 0;

    return {
      total,
      count,
      average: count > 0 ? total / count : 0,
    };
  }

  /**
   * Get metrics time series for charts
   * @param {string} workspaceId - Workspace ID
   * @param {string} metricType - Metric type
   * @param {string} period - Time period
   * @param {string} granularity - 'hourly' or 'daily'
   * @returns {Promise<Array<{ timestamp: number, value: number }>>}
   */
  async getMetricTimeSeries(workspaceId, metricType, period = TimePeriod.LAST_7_DAYS, granularity = 'daily') {
    const { start, end } = getTimestampRange(period);

    if (granularity === 'hourly') {
      const rows = await this._all(
        `SELECT bucket_hour as timestamp, value
         FROM metric_buckets
         WHERE workspace_id = ? AND metric_type = ? AND bucket_hour >= ? AND bucket_hour < ?
         ORDER BY bucket_hour`,
        [workspaceId, metricType, start, end]
      );
      return rows.map((r) => ({ timestamp: r.timestamp, value: r.value }));
    }

    const rows = await this._all(
      `SELECT bucket_date as timestamp, value
       FROM metric_daily
       WHERE workspace_id = ? AND metric_type = ? AND bucket_date >= ? AND bucket_date < ?
       ORDER BY bucket_date`,
      [workspaceId, metricType, start, end]
    );
    return rows.map((r) => ({ timestamp: r.timestamp, value: r.value }));
  }

  /**
   * Get multiple metrics for dashboard
   * @param {string} workspaceId - Workspace ID
   * @param {string[]} metricTypes - Array of metric types
   * @param {string} period - Time period
   * @returns {Promise<Object>}
   */
  async getMetrics(workspaceId, metricTypes, period = TimePeriod.THIS_MONTH) {
    const results = {};
    for (const type of metricTypes) {
      results[type] = await this.getMetric(workspaceId, type, period);
    }
    return results;
  }

  // ========== ACTIVITY FEED ==========

  /**
   * Log an activity
   * @param {object} activity - Activity details
   * @returns {Promise<string>} Activity ID
   */
  async logActivity({
    workspaceId,
    userId = null,
    activityType,
    resourceType = null,
    resourceId = null,
    description = null,
    metadata = {},
  }) {
    const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    await this._run(
      `INSERT INTO activity_feed
       (id, workspace_id, user_id, activity_type, resource_type, resource_id, description, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        workspaceId,
        userId,
        activityType,
        resourceType,
        resourceId,
        description,
        JSON.stringify(metadata),
        now,
      ]
    );

    return id;
  }

  /**
   * Get activity feed
   * @param {string} workspaceId - Workspace ID
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async getActivityFeed(workspaceId, { limit = 20, offset = 0, userId = null } = {}) {
    let sql = `SELECT * FROM activity_feed WHERE workspace_id = ?`;
    const params = [workspaceId];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await this._all(sql, params);

    return rows.map((row) => ({
      id: row.id,
      workspace_id: row.workspace_id,
      user_id: row.user_id,
      activity_type: row.activity_type,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      description: row.description,
      metadata: JSON.parse(row.metadata || '{}'),
      created_at: row.created_at,
    }));
  }

  // ========== DASHBOARD METRICS ==========

  /**
   * Get comprehensive dashboard metrics
   * @param {string} workspaceId - Workspace ID
   * @param {string} period - Time period
   * @returns {Promise<object>}
   */
  async getDashboardMetrics(workspaceId, period = TimePeriod.THIS_MONTH) {
    const documentMetrics = await this.getMetrics(
      workspaceId,
      [
        MetricType.DOCUMENTS_CREATED,
        MetricType.DOCUMENTS_VIEWED,
        MetricType.DOCUMENTS_DOWNLOADED,
      ],
      period
    );

    const apiMetrics = await this.getMetrics(
      workspaceId,
      [
        MetricType.API_CALLS_LLM,
        MetricType.API_CALLS_PDF,
        MetricType.API_TOKENS_INPUT,
        MetricType.API_TOKENS_OUTPUT,
      ],
      period
    );

    const recentActivity = await this.getActivityFeed(workspaceId, { limit: 10 });

    return {
      period,
      documents: {
        created: documentMetrics[MetricType.DOCUMENTS_CREATED]?.total || 0,
        viewed: documentMetrics[MetricType.DOCUMENTS_VIEWED]?.total || 0,
        downloaded: documentMetrics[MetricType.DOCUMENTS_DOWNLOADED]?.total || 0,
      },
      api_usage: {
        llm_calls: apiMetrics[MetricType.API_CALLS_LLM]?.total || 0,
        pdf_calls: apiMetrics[MetricType.API_CALLS_PDF]?.total || 0,
        tokens_input: apiMetrics[MetricType.API_TOKENS_INPUT]?.total || 0,
        tokens_output: apiMetrics[MetricType.API_TOKENS_OUTPUT]?.total || 0,
      },
      recent_activity: recentActivity,
    };
  }

  // ========== SYSTEM HEALTH ==========

  /**
   * Record health snapshot
   * @param {string} component - Component name
   * @param {string} status - 'healthy', 'degraded', 'unhealthy'
   * @param {object} details - Additional details
   * @returns {Promise<void>}
   */
  async recordHealthSnapshot(component, status, details = {}) {
    const id = `hs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    await this._run(
      `INSERT INTO health_snapshots
       (id, component, status, latency_ms, error_count, metadata, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        component,
        status,
        details.latency_ms || null,
        details.error_count || 0,
        JSON.stringify(details.metadata || {}),
        now,
      ]
    );
  }

  /**
   * Get latest health status for all components
   * @returns {Promise<object>}
   */
  async getSystemHealth() {
    const rows = await this._all(`
      SELECT h1.*
      FROM health_snapshots h1
      INNER JOIN (
        SELECT component, MAX(captured_at) as max_captured
        FROM health_snapshots
        GROUP BY component
      ) h2 ON h1.component = h2.component AND h1.captured_at = h2.max_captured
    `);

    const health = {};
    for (const row of rows) {
      health[row.component] = {
        status: row.status,
        latency_ms: row.latency_ms,
        error_count: row.error_count,
        metadata: JSON.parse(row.metadata || '{}'),
        captured_at: row.captured_at,
      };
    }

    return {
      overall: this._calculateOverallHealth(health),
      components: health,
      captured_at: Date.now(),
    };
  }

  _calculateOverallHealth(components) {
    const statuses = new Set(Object.values(components).map((c) => c.status));
    if (statuses.has('unhealthy')) return 'unhealthy';
    if (statuses.has('degraded')) return 'degraded';
    return 'healthy';
  }

  /**
   * Get health history for a component
   * @param {string} component - Component name
   * @param {number} limit - Max records
   * @returns {Promise<Array>}
   */
  async getHealthHistory(component, limit = 100) {
    const rows = await this._all(
      `SELECT * FROM health_snapshots
       WHERE component = ?
       ORDER BY captured_at DESC
       LIMIT ?`,
      [component, limit]
    );

    return rows.map((row) => ({
      status: row.status,
      latency_ms: row.latency_ms,
      error_count: row.error_count,
      metadata: JSON.parse(row.metadata || '{}'),
      captured_at: row.captured_at,
    }));
  }

  // ========== ANALYTICS ==========

  /**
   * Get top users by activity
   * @param {string} workspaceId - Workspace ID
   * @param {string} metricType - Metric to rank by
   * @param {string} period - Time period
   * @param {number} limit - Max results
   * @returns {Promise<Array>}
   */
  async getTopUsers(workspaceId, _metricType = MetricType.DOCUMENTS_CREATED, period = TimePeriod.THIS_MONTH, limit = 10) {
    const { start, end } = getTimestampRange(period);

    // Note: This would join with a users table in production
    // For now, we aggregate from activity feed
    const rows = await this._all(
      `SELECT user_id, COUNT(*) as activity_count
       FROM activity_feed
       WHERE workspace_id = ? AND user_id IS NOT NULL
         AND created_at >= ? AND created_at < ?
       GROUP BY user_id
       ORDER BY activity_count DESC
       LIMIT ?`,
      [workspaceId, start, end, limit]
    );

    return rows.map((row, index) => ({
      rank: index + 1,
      user_id: row.user_id,
      activity_count: row.activity_count,
    }));
  }

  /**
   * Get usage breakdown by resource type
   * @param {string} workspaceId - Workspace ID
   * @param {string} period - Time period
   * @returns {Promise<object>}
   */
  async getUsageBreakdown(workspaceId, period = TimePeriod.THIS_MONTH) {
    const { start, end } = getTimestampRange(period);

    const rows = await this._all(
      `SELECT resource_type, COUNT(*) as count
       FROM activity_feed
       WHERE workspace_id = ? AND resource_type IS NOT NULL
         AND created_at >= ? AND created_at < ?
       GROUP BY resource_type`,
      [workspaceId, start, end]
    );

    const breakdown = {};
    for (const row of rows) {
      breakdown[row.resource_type] = row.count;
    }

    return breakdown;
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

// Export for convenience (TimePeriod already exported above)
export { getTimestampRange };
