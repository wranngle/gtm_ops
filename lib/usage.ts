// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * Usage Tracking Module
 * Provides usage metering and cost estimation for pipeline executions.
 *
 * @module lib/usage
 */

import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'config', 'usage.db');

// =============================================================================
// COST CONSTANTS (as of 2024)
// =============================================================================

export const COST_CONFIG = {
  gemini: {
    // Gemini 1.5 Flash pricing per 1M tokens
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.3
  },
  groq: {
    // Groq pricing (approximate)
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.08
  },
  puppeteer: {
    // Estimated compute cost per PDF page
    costPerPage: 0.001
  }
};

// =============================================================================
// EVENT TYPES
// =============================================================================

export const EventType = {
  PIPELINE_STARTED: 'pipeline.started',
  PIPELINE_COMPLETED: 'pipeline.completed',
  PIPELINE_FAILED: 'pipeline.failed',
  GEMINI_API_CALL: 'gemini.api_call',
  GROQ_API_CALL: 'groq.api_call',
  PUPPETEER_PDF: 'puppeteer.pdf_generated'
};

// =============================================================================
// USAGE TRACKER CLASS
// =============================================================================

/**
 * @typedef {Object} UsageEvent
 * @property {string} [workspace_id] - Workspace identifier (for multi-tenant)
 * @property {string} [user_id] - User identifier
 * @property {string} event_type - Event type from EventType enum
 * @property {string} [resource_id] - Associated resource (execution_id, etc.)
 * @property {Object} [metadata] - Additional event data
 */

/**
 * @typedef {Object} UsageSummary
 * @property {number} total_executions - Total pipeline executions
 * @property {number} successful_executions - Successful completions
 * @property {number} failed_executions - Failed executions
 * @property {number} total_api_calls - Total LLM API calls
 * @property {number} total_input_tokens - Total input tokens used
 * @property {number} total_output_tokens - Total output tokens used
 * @property {number} total_pdfs_generated - Total PDFs created
 * @property {number} total_pdf_pages - Total PDF pages
 * @property {number} estimated_cost - Estimated total cost in USD
 * @property {number} avg_execution_time_ms - Average execution time
 */

export class UsageTracker {
  constructor(dbPath = DB_PATH) {
    this.dbPath = dbPath;
    this.db = new sqlite3.Database(dbPath);
    this._initSchema();
  }

  /**
   * Initialize database schema
   * @private
   */
  _initSchema() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS usage_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id TEXT DEFAULT 'default',
          user_id TEXT DEFAULT 'anonymous',
          event_type TEXT NOT NULL,
          resource_id TEXT,
          metadata TEXT,
          timestamp INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Indexes for efficient queries
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_usage_workspace_timestamp
        ON usage_events(workspace_id, timestamp)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_usage_event_type_timestamp
        ON usage_events(event_type, timestamp)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_usage_resource
        ON usage_events(resource_id)
      `);
    });
  }

  /**
   * Track a usage event
   * @param {UsageEvent} event - Event to track
   * @returns {Promise<number>} - Event ID
   */
  async trackEvent(event) {
    return new Promise((resolve, reject) => {
      const {
        workspace_id = 'default',
        user_id = 'anonymous',
        event_type,
        resource_id = null,
        metadata = {}
      } = event;

      const timestamp = Date.now();

      this.db.run(
        `INSERT INTO usage_events
         (workspace_id, user_id, event_type, resource_id, metadata, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [workspace_id, user_id, event_type, resource_id, JSON.stringify(metadata), timestamp],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  /**
   * Track pipeline started event
   * @param {string} executionId - Execution ID
   * @param {Object} [options] - Additional options
   */
  async trackPipelineStarted(executionId, options = {}) {
    return this.trackEvent({
      event_type: EventType.PIPELINE_STARTED,
      resource_id: executionId,
      workspace_id: options.workspace_id,
      user_id: options.user_id,
      metadata: {
        input_type: options.input_type || 'text',
        input_size: options.input_size || 0
      }
    });
  }

  /**
   * Track pipeline completed event
   * @param {string} executionId - Execution ID
   * @param {number} durationMs - Execution duration in ms
   * @param {Object} [options] - Additional options
   */
  async trackPipelineCompleted(executionId, durationMs, options = {}) {
    return this.trackEvent({
      event_type: EventType.PIPELINE_COMPLETED,
      resource_id: executionId,
      workspace_id: options.workspace_id,
      user_id: options.user_id,
      metadata: {
        duration_ms: durationMs,
        output_files: options.output_files || [],
        total_price: options.total_price,
        total_hours: options.total_hours
      }
    });
  }

  /**
   * Track pipeline failed event
   * @param {string} executionId - Execution ID
   * @param {string} errorMessage - Error message
   * @param {Object} [options] - Additional options
   */
  async trackPipelineFailed(executionId, errorMessage, options = {}) {
    return this.trackEvent({
      event_type: EventType.PIPELINE_FAILED,
      resource_id: executionId,
      workspace_id: options.workspace_id,
      user_id: options.user_id,
      metadata: {
        error: errorMessage,
        stage: options.stage || 'unknown',
        duration_ms: options.duration_ms
      }
    });
  }

  /**
   * Track LLM API call
   * @param {string} provider - 'gemini' or 'groq'
   * @param {string} model - Model name
   * @param {number} inputTokens - Input token count
   * @param {number} outputTokens - Output token count
   * @param {Object} [options] - Additional options
   */
  async trackApiCall(provider, model, inputTokens, outputTokens, options = {}) {
    const eventType = provider === 'groq' ? EventType.GROQ_API_CALL : EventType.GEMINI_API_CALL;

    return this.trackEvent({
      event_type: eventType,
      resource_id: options.execution_id,
      workspace_id: options.workspace_id,
      user_id: options.user_id,
      metadata: {
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        latency_ms: options.latency_ms
      }
    });
  }

  /**
   * Track PDF generation
   * @param {string} executionId - Execution ID
   * @param {number} pageCount - Number of pages
   * @param {Object} [options] - Additional options
   */
  async trackPdfGenerated(executionId, pageCount, options = {}) {
    return this.trackEvent({
      event_type: EventType.PUPPETEER_PDF,
      resource_id: executionId,
      workspace_id: options.workspace_id,
      user_id: options.user_id,
      metadata: {
        page_count: pageCount,
        file_size: options.file_size,
        duration_ms: options.duration_ms
      }
    });
  }

  /**
   * Get usage summary for a time period
   * @param {Object} options - Query options
   * @param {string} [options.workspace_id] - Filter by workspace
   * @param {number} [options.start_date] - Start timestamp (ms)
   * @param {number} [options.end_date] - End timestamp (ms)
   * @returns {Promise<UsageSummary>}
   */
  async getUsageSummary(options = {}) {
    const {
      workspace_id,
      start_date = Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
      end_date = Date.now()
    } = options;

    return new Promise((resolve, reject) => {
      const params = [start_date, end_date];
      let whereClause = 'WHERE timestamp >= ? AND timestamp <= ?';

      if (workspace_id) {
        whereClause += ' AND workspace_id = ?';
        params.push(workspace_id);
      }

      // Get execution counts
      this.db.get(`
        SELECT
          COUNT(CASE WHEN event_type = '${EventType.PIPELINE_STARTED}' THEN 1 END) as total_executions,
          COUNT(CASE WHEN event_type = '${EventType.PIPELINE_COMPLETED}' THEN 1 END) as successful_executions,
          COUNT(CASE WHEN event_type = '${EventType.PIPELINE_FAILED}' THEN 1 END) as failed_executions,
          COUNT(CASE WHEN event_type IN ('${EventType.GEMINI_API_CALL}', '${EventType.GROQ_API_CALL}') THEN 1 END) as total_api_calls,
          COUNT(CASE WHEN event_type = '${EventType.PUPPETEER_PDF}' THEN 1 END) as total_pdfs_generated
        FROM usage_events
        ${whereClause}
      `, params, (err, counts) => {
        if (err) return reject(err);

        // Get token totals
        this.db.get(`
          SELECT
            COALESCE(SUM(json_extract(metadata, '$.input_tokens')), 0) as total_input_tokens,
            COALESCE(SUM(json_extract(metadata, '$.output_tokens')), 0) as total_output_tokens,
            COALESCE(SUM(json_extract(metadata, '$.page_count')), 0) as total_pdf_pages
          FROM usage_events
          ${whereClause}
          AND event_type IN ('${EventType.GEMINI_API_CALL}', '${EventType.GROQ_API_CALL}', '${EventType.PUPPETEER_PDF}')
        `, params, (err, tokens) => {
          if (err) return reject(err);

          // Get average execution time
          this.db.get(`
            SELECT AVG(json_extract(metadata, '$.duration_ms')) as avg_execution_time_ms
            FROM usage_events
            ${whereClause}
            AND event_type = '${EventType.PIPELINE_COMPLETED}'
          `, params, (err, timing) => {
            if (err) return reject(err);

            // Calculate estimated cost
            const inputTokens = tokens?.total_input_tokens || 0;
            const outputTokens = tokens?.total_output_tokens || 0;
            const pdfPages = tokens?.total_pdf_pages || 0;

            const estimatedCost =
              (inputTokens / 1_000_000) * COST_CONFIG.gemini.inputCostPer1M +
              (outputTokens / 1_000_000) * COST_CONFIG.gemini.outputCostPer1M +
              pdfPages * COST_CONFIG.puppeteer.costPerPage;

            resolve({
              total_executions: counts?.total_executions || 0,
              successful_executions: counts?.successful_executions || 0,
              failed_executions: counts?.failed_executions || 0,
              total_api_calls: counts?.total_api_calls || 0,
              total_input_tokens: inputTokens,
              total_output_tokens: outputTokens,
              total_pdfs_generated: counts?.total_pdfs_generated || 0,
              total_pdf_pages: pdfPages,
              estimated_cost: Math.round(estimatedCost * 10_000) / 10_000, // 4 decimal places
              avg_execution_time_ms: Math.round(timing?.avg_execution_time_ms || 0),
              period: {
                start: new Date(start_date).toISOString(),
                end: new Date(end_date).toISOString()
              }
            });
          });
        });
      });
    });
  }

  /**
   * Get detailed usage events with pagination
   * @param {Object} options - Query options
   * @param {string} [options.workspace_id] - Filter by workspace
   * @param {string} [options.event_type] - Filter by event type
   * @param {number} [options.start_date] - Start timestamp (ms)
   * @param {number} [options.end_date] - End timestamp (ms)
   * @param {number} [options.limit=50] - Page size
   * @param {number} [options.offset=0] - Offset for pagination
   * @returns {Promise<{events: Array, total: number, has_more: boolean}>}
   */
  async getUsageDetail(options = {}) {
    const {
      workspace_id,
      event_type,
      start_date = Date.now() - 30 * 24 * 60 * 60 * 1000,
      end_date = Date.now(),
      limit = 50,
      offset = 0
    } = options;

    return new Promise((resolve, reject) => {
      const params = [start_date, end_date];
      let whereClause = 'WHERE timestamp >= ? AND timestamp <= ?';

      if (workspace_id) {
        whereClause += ' AND workspace_id = ?';
        params.push(workspace_id);
      }

      if (event_type) {
        whereClause += ' AND event_type = ?';
        params.push(event_type);
      }

      // Get total count
      this.db.get(`
        SELECT COUNT(*) as total FROM usage_events ${whereClause}
      `, params, (err, count) => {
        if (err) return reject(err);

        // Get paginated events
        const queryParams = [...params, limit, offset];
        this.db.all(`
          SELECT * FROM usage_events
          ${whereClause}
          ORDER BY timestamp DESC, rowid DESC
          LIMIT ? OFFSET ?
        `, queryParams, (err, rows) => {
          if (err) return reject(err);

          const events = (rows || []).map(row => ({
            ...row,
            metadata: row.metadata ? JSON.parse(row.metadata) : {},
            timestamp_iso: new Date(row.timestamp).toISOString()
          }));

          const total = count?.total || 0;

          resolve({
            events,
            total,
            has_more: offset + events.length < total,
            pagination: {
              limit,
              offset,
              returned: events.length
            }
          });
        });
      });
    });
  }

  /**
   * Get cost breakdown for a time period
   * @param {Object} options - Query options
   * @returns {Promise<Object>}
   */
  async getCostBreakdown(options = {}) {
    const summary = await this.getUsageSummary(options);

    const geminiInputCost = (summary.total_input_tokens / 1_000_000) * COST_CONFIG.gemini.inputCostPer1M;
    const geminiOutputCost = (summary.total_output_tokens / 1_000_000) * COST_CONFIG.gemini.outputCostPer1M;
    const puppeteerCost = summary.total_pdf_pages * COST_CONFIG.puppeteer.costPerPage;

    return {
      gemini: {
        input_tokens: summary.total_input_tokens,
        output_tokens: summary.total_output_tokens,
        input_cost: Math.round(geminiInputCost * 10_000) / 10_000,
        output_cost: Math.round(geminiOutputCost * 10_000) / 10_000,
        total_cost: Math.round((geminiInputCost + geminiOutputCost) * 10_000) / 10_000
      },
      puppeteer: {
        pdf_pages: summary.total_pdf_pages,
        total_cost: Math.round(puppeteerCost * 10_000) / 10_000
      },
      total_estimated_cost: summary.estimated_cost,
      cost_per_execution: summary.total_executions > 0
        ? Math.round((summary.estimated_cost / summary.total_executions) * 10_000) / 10_000
        : 0
    };
  }

  /**
   * Close database connection
   */
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let _instance = null;

/**
 * Get singleton UsageTracker instance
 * @returns {UsageTracker}
 */
export function getUsageTracker() {
  _instance ||= new UsageTracker();
  return _instance;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Track a pipeline start
 * @param {string} executionId
 * @param {Object} options
 */
export async function trackPipelineStart(executionId, options = {}) {
  return getUsageTracker().trackPipelineStarted(executionId, options);
}

/**
 * Track a pipeline completion
 * @param {string} executionId
 * @param {number} durationMs
 * @param {Object} options
 */
export async function trackPipelineComplete(executionId, durationMs, options = {}) {
  return getUsageTracker().trackPipelineCompleted(executionId, durationMs, options);
}

/**
 * Track a pipeline failure
 * @param {string} executionId
 * @param {string} error
 * @param {Object} options
 */
export async function trackPipelineError(executionId, error, options = {}) {
  return getUsageTracker().trackPipelineFailed(executionId, error, options);
}

/**
 * Track an API call
 * @param {string} provider
 * @param {string} model
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @param {Object} options
 */
export async function trackApiUsage(provider, model, inputTokens, outputTokens, options = {}) {
  return getUsageTracker().trackApiCall(provider, model, inputTokens, outputTokens, options);
}
