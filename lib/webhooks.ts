// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * Webhook Delivery System
 * Provides webhook management and delivery for pipeline events.
 *
 * @module lib/webhooks
 */

import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { withRetry } from './resilience.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'config', 'webhooks.db');

// =============================================================================
// WEBHOOK EVENT TYPES
// =============================================================================

export const WebhookEvent = {
  PIPELINE_STARTED: 'pipeline.started',
  PIPELINE_COMPLETED: 'pipeline.completed',
  PIPELINE_FAILED: 'pipeline.failed'
};

export const ALL_WEBHOOK_EVENTS = Object.values(WebhookEvent);

// =============================================================================
// WEBHOOK DELIVERY STATUS
// =============================================================================

export const DeliveryStatus = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  RETRYING: 'retrying'
};

// =============================================================================
// WEBHOOK MANAGER CLASS
// =============================================================================

/**
 * @typedef {Object} Webhook
 * @property {number} id - Webhook ID
 * @property {string} workspace_id - Workspace identifier
 * @property {string} name - Human-readable name
 * @property {string} url - Webhook endpoint URL
 * @property {string} secret - HMAC signing secret
 * @property {string[]} events - Subscribed event types
 * @property {boolean} enabled - Whether webhook is active
 * @property {string} created_at - Creation timestamp
 */

/**
 * @typedef {Object} WebhookDelivery
 * @property {number} id - Delivery ID
 * @property {number} webhook_id - Associated webhook
 * @property {string} event_type - Event that triggered delivery
 * @property {string} payload - JSON payload sent
 * @property {string} status - Delivery status
 * @property {number} attempts - Number of delivery attempts
 * @property {number} response_status - HTTP response status
 * @property {string} response_body - HTTP response body (truncated)
 * @property {string} created_at - Creation timestamp
 */

export class WebhookManager {
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
      // Webhooks table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS webhooks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id TEXT DEFAULT 'default',
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          secret TEXT NOT NULL,
          events TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Webhook deliveries table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS webhook_deliveries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          webhook_id INTEGER NOT NULL,
          delivery_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          attempts INTEGER DEFAULT 0,
          response_status INTEGER,
          response_body TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT,
          FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
        )
      `);

      // Indexes
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_webhooks_workspace
        ON webhooks(workspace_id)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_deliveries_webhook_created
        ON webhook_deliveries(webhook_id, created_at)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_deliveries_status
        ON webhook_deliveries(status)
      `);
    });
  }

  // ===========================================================================
  // WEBHOOK CRUD
  // ===========================================================================

  /**
   * Create a new webhook
   * @param {Object} data - Webhook data
   * @returns {Promise<Webhook>}
   */
  async createWebhook(data) {
    const {
      workspace_id = 'default',
      name,
      url,
      events = ALL_WEBHOOK_EVENTS,
      enabled = true
    } = data;

    // Validate URL
    if (!this._isValidUrl(url)) {
      throw new Error('Invalid webhook URL. Must be HTTPS (or localhost for testing).');
    }

    // Validate events
    const invalidEvents = events.filter(e => !ALL_WEBHOOK_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      throw new Error(`Invalid event types: ${invalidEvents.join(', ')}`);
    }

    // Generate secret
    const secret = crypto.randomBytes(32).toString('hex');

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO webhooks (workspace_id, name, url, secret, events, enabled)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [workspace_id, name, url, secret, JSON.stringify(events), enabled ? 1 : 0],
        function(err) {
          if (err) return reject(err);
          resolve({
            id: this.lastID,
            workspace_id,
            name,
            url,
            secret,
            events,
            enabled
          });
        }
      );
    });
  }

  /**
   * Get webhook by ID
   * @param {number} id - Webhook ID
   * @returns {Promise<Webhook|null>}
   */
  async getWebhook(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM webhooks WHERE id = ?', [id], (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        resolve(this._parseWebhookRow(row));
      });
    });
  }

  /**
   * List webhooks for a workspace
   * @param {string} workspace_id - Workspace ID
   * @returns {Promise<Webhook[]>}
   */
  async listWebhooks(workspace_id = 'default') {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM webhooks WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC',
        [workspace_id],
        (err, rows) => {
          if (err) return reject(err);
          resolve((rows || []).map(row => this._parseWebhookRow(row)));
        }
      );
    });
  }

  /**
   * Update a webhook
   * @param {number} id - Webhook ID
   * @param {Object} data - Update data
   * @returns {Promise<Webhook>}
   */
  async updateWebhook(id, data) {
    const existing = await this.getWebhook(id);
    if (!existing) {
      throw new Error('Webhook not found');
    }

    const updates = [];
    const params = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }

    if (data.url !== undefined) {
      if (!this._isValidUrl(data.url)) {
        throw new Error('Invalid webhook URL');
      }

      updates.push('url = ?');
      params.push(data.url);
    }

    if (data.events !== undefined) {
      const invalidEvents = data.events.filter(e => !ALL_WEBHOOK_EVENTS.includes(e));
      if (invalidEvents.length > 0) {
        throw new Error(`Invalid event types: ${invalidEvents.join(', ')}`);
      }

      updates.push('events = ?');
      params.push(JSON.stringify(data.events));
    }

    if (data.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(data.enabled ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?`,
        params,
        async (err) => {
          if (err) return reject(err);
          resolve(await this.getWebhook(id));
        }
      );
    });
  }

  /**
   * Delete a webhook
   * @param {number} id - Webhook ID
   * @returns {Promise<boolean>}
   */
  async deleteWebhook(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM webhooks WHERE id = ?', [id], function(err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      });
    });
  }

  // ===========================================================================
  // WEBHOOK DELIVERY
  // ===========================================================================

  /**
   * Deliver webhook for an event
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   * @param {string} [workspace_id='default'] - Workspace ID
   */
  async deliverEvent(eventType, eventData, workspace_id = 'default') {
    // Get all enabled webhooks subscribed to this event
    const webhooks = await this._getWebhooksForEvent(eventType, workspace_id);

    // Deliver to each webhook
    const deliveries = await Promise.allSettled(
      webhooks.map(webhook => this._deliverToWebhook(webhook, eventType, eventData))
    );

    return {
      total: webhooks.length,
      successful: deliveries.filter(d => d.status === 'fulfilled').length,
      failed: deliveries.filter(d => d.status === 'rejected').length
    };
  }

  /**
   * Get webhooks subscribed to an event
   * @private
   */
  async _getWebhooksForEvent(eventType, workspace_id) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM webhooks
         WHERE workspace_id = ? AND enabled = 1
         AND events LIKE ?`,
        [workspace_id, `%"${eventType}"%`],
        (err, rows) => {
          if (err) return reject(err);
          resolve((rows || []).map(row => this._parseWebhookRow(row)));
        }
      );
    });
  }

  /**
   * Deliver event to a specific webhook
   * @private
   */
  async _deliverToWebhook(webhook, eventType, eventData) {
    const deliveryId = crypto.randomUUID();
    const timestamp = Date.now();

    const payload = {
      event: eventType,
      timestamp,
      delivery_id: deliveryId,
      data: eventData
    };

    const payloadStr = JSON.stringify(payload);

    // Create delivery record
    const deliveryRecordId = await this._createDeliveryRecord(
      webhook.id,
      deliveryId,
      eventType,
      payloadStr
    );

    // Sign payload
    const signature = this._signPayload(payloadStr, webhook.secret);

    // Attempt delivery with retry
    try {
      const result = await withRetry(
        async () => {
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Signature': `sha256=${signature}`,
              'X-Webhook-Delivery-ID': deliveryId,
              'X-Webhook-Timestamp': timestamp.toString()
            },
            body: payloadStr
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          return response;
        },
        {
          maxAttempts: 3,
          baseDelayMs: 5000,  // 5s, 10s, 20s
          maxDelayMs: 30_000,
          isRetryable(error) {
            const message = error.message || '';
            // Retry on 5xx errors and network issues
            return message.includes('5') ||
              message.includes('fetch') ||
              message.includes('network') ||
              message.includes('timeout');
          },
          onRetry: async (attempt, _delay, _error) => {
            await this._updateDeliveryAttempt(deliveryRecordId, attempt, 'retrying');
          }
        }
      );

      // Success
      await this._updateDeliveryComplete(deliveryRecordId, 'success', result.status);
      return { success: true, deliveryId };
    } catch (error) {
      // Failed after all retries
      await this._updateDeliveryComplete(
        deliveryRecordId,
        'failed',
        null,
        error.message
      );
      throw error;
    }
  }

  /**
   * Sign payload with HMAC-SHA256
   * @private
   */
  _signPayload(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify webhook signature
   * @param {string} payload - Raw payload string
   * @param {string} signature - Signature from header (sha256=...)
   * @param {string} secret - Webhook secret
   * @returns {boolean}
   */
  static verifySignature(payload, signature, secret) {
    const expectedSig = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;

    // timingSafeEqual requires same length buffers
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  }

  /**
   * Create delivery record
   * @private
   */
  async _createDeliveryRecord(webhookId, deliveryId, eventType, payload) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO webhook_deliveries
         (webhook_id, delivery_id, event_type, payload, status, attempts)
         VALUES (?, ?, ?, ?, 'pending', 1)`,
        [webhookId, deliveryId, eventType, payload],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  /**
   * Update delivery attempt count
   * @private
   */
  async _updateDeliveryAttempt(id, attempts, status) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE webhook_deliveries SET attempts = ?, status = ? WHERE id = ?',
        [attempts, status, id],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Update delivery as complete
   * @private
   */
  async _updateDeliveryComplete(id, status, responseStatus, responseBody = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE webhook_deliveries
         SET status = ?, response_status = ?, response_body = ?,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [status, responseStatus, responseBody?.slice(0, 1000), id],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  // ===========================================================================
  // DELIVERY HISTORY
  // ===========================================================================

  /**
   * Get delivery history for a webhook
   * @param {number} webhookId - Webhook ID
   * @param {Object} options - Query options
   * @returns {Promise<{deliveries: WebhookDelivery[], total: number}>}
   */
  async getDeliveryHistory(webhookId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COUNT(*) as total FROM webhook_deliveries WHERE webhook_id = ?',
        [webhookId],
        (err, count) => {
          if (err) return reject(err);

          this.db.all(
            `SELECT * FROM webhook_deliveries
             WHERE webhook_id = ?
             ORDER BY created_at DESC, rowid DESC
             LIMIT ? OFFSET ?`,
            [webhookId, limit, offset],
            (err, rows) => {
              if (err) return reject(err);

              const deliveries = (rows || []).map(row => ({
                ...row,
                payload: row.payload ? JSON.parse(row.payload) : null
              }));

              resolve({
                deliveries,
                total: count?.total || 0,
                has_more: offset + deliveries.length < (count?.total || 0)
              });
            }
          );
        }
      );
    });
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Validate URL
   * @private
   */
  _isValidUrl(url) {
    try {
      const parsed = new URL(url);
      // Allow HTTPS or localhost for testing
      return parsed.protocol === 'https:' ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }

  /**
   * Parse webhook row from database
   * @private
   */
  _parseWebhookRow(row) {
    return {
      ...row,
      events: row.events ? JSON.parse(row.events) : [],
      enabled: row.enabled === 1
    };
  }

  /**
   * Test webhook endpoint
   * @param {number} id - Webhook ID
   * @returns {Promise<{success: boolean, status?: number, error?: string}>}
   */
  async testWebhook(id) {
    const webhook = await this.getWebhook(id);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const testPayload = {
      event: 'webhook.test',
      timestamp: Date.now(),
      delivery_id: crypto.randomUUID(),
      data: { test: true, message: 'Webhook test from Unified Presales Pipeline' }
    };

    const payloadStr = JSON.stringify(testPayload);
    const signature = this._signPayload(payloadStr, webhook.secret);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Delivery-ID': testPayload.delivery_id,
          'X-Webhook-Timestamp': testPayload.timestamp.toString()
        },
        body: payloadStr
      });

      return {
        success: response.ok,
        status: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
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
 * Get singleton WebhookManager instance
 * @returns {WebhookManager}
 */
export function getWebhookManager() {
  _instance ||= new WebhookManager();
  return _instance;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Deliver event to all subscribed webhooks
 * @param {string} eventType
 * @param {Object} eventData
 * @param {string} workspace_id
 */
export async function deliverWebhookEvent(eventType, eventData, workspace_id = 'default') {
  return getWebhookManager().deliverEvent(eventType, eventData, workspace_id);
}
