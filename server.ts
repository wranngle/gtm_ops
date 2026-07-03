import path from 'path';
import fsSync from 'fs';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { UnifiedPipeline } from './lib/pipeline.js';
import { HistoryManager } from './lib/history.js';
import { healthCheck, serverState, trackRequest, buildLightHealthPayload } from './lib/health.js';
import { buildVersionPayload } from './lib/version.js';
import {
  corsMiddleware,
  securityHeadersMiddleware,
  apiNoStoreMiddleware,
  inputValidationMiddleware,
  generateLimiter,
  historyLimiter,
  generalLimiter,
  safeFilenameForHeader,
  resolveRequestId
} from './lib/security.js';
import { getUsageTracker } from './lib/usage.js';
import { getWebhookManager, ALL_WEBHOOK_EVENTS } from './lib/webhooks.js';
import { VersionManager } from './lib/versioning.js';
import { getAuditLogger, auditContextMiddleware, RetentionPolicy } from './lib/audit.js';
import { BrandingManager } from './lib/branding.js';
import { AdminManager } from './lib/admin.js';
import { getTickerEvents } from './lib/ticker.js';
import { GdprManager } from './lib/gdpr.js';
import { Role, getPermissionSummary, getUserManager, requireRole, resolveDevAuthRole } from './lib/rbac.js';

// =============================================================================
// Evaluation API endpoints
// =============================================================================

import {
  getCorpusStats,
  listCaseStudies,
  listEvaluationRuns,
  getEvaluationRunById,
} from './lib/evaluation/corpus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 3000;
// Bind to loopback by default so the local dev server isn't reachable
// from other hosts on a shared LAN / dev VM. RBAC now covers every
// mutation route and every sensitive read route (lint-rbac-coverage.sh
// is the forcing function), and the production-default role is `viewer`
// (lib/rbac.ts#resolveDevAuthRole), so 0.0.0.0 is no longer the
// catastrophic failure mode it once was — but loopback-by-default is
// kept as defense in depth: a misconfigured WRANNGLE_AUTH_DEFAULT_ROLE
// or a future un-guarded route can't be reached over the network.
// Override with HOST=0.0.0.0 when the deployment genuinely needs
// broader binding (e.g. Docker container where 0.0.0.0 is the only
// reachable interface).
const host = process.env.HOST || '127.0.0.1';
// eslint-disable-next-line unicorn/prefer-event-target -- need Node EventEmitter API (.on/.off/.emit) used by SSE handlers below
const logEmitter = new EventEmitter();

app.use(express.json({ limit: '10mb' }));

// Security middleware
app.use(corsMiddleware);
app.use(securityHeadersMiddleware);
app.use(inputValidationMiddleware);

app.use(express.static('public'));
app.use('/output', express.static('output', { dotfiles: 'allow' }));
app.use('/old', express.static('old'));
app.use('/exports', express.static('exports'));

// Forbid caching of API responses. Scoped to /api so it doesn't
// disable caching for static assets above. Route handlers (e.g. the
// SSE log stream) may still override Cache-Control.
app.use('/api', apiNoStoreMiddleware);

// Track active requests for graceful shutdown
app.use((req, res, next) => {
  if (serverState.isShuttingDown) {
    return res.status(503).json({ error: 'Server is shutting down' });
  }

  const done = trackRequest();
  res.on('finish', done);
  res.on('close', done);
  next();
});

// Request-ID middleware. Tags every inbound request with a UUID via
// `req.id`, mirrors it on the X-Request-Id response header, and accepts
// an inbound X-Request-Id from upstream proxies (Cloudflare, n8n) so a
// single request can be traced end-to-end through structured logs.
// Route handlers should include `req.id` in their console.error lines
// when something goes wrong — that's the correlation surface.
app.use((req, res, next) => {
  req.id = resolveRequestId(req.headers, () => crypto.randomUUID());
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Structured request-finish log. One JSON line per request — id, method,
// path, status, duration. Emitted via process.stdout.write so log shippers
// (Vector / fluent-bit / Cloudflare logpush) see it as a single record.
// Skips the high-volume probes (/health, /ready, /api/health) so the
// signal isn't drowned by the kubelet's polling. Errors in route handlers
// still console.error directly; this middleware is the always-on
// access-log surface.
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/ready' || req.path === '/api/health') {
    return next();
  }

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const duration_ms = Number((process.hrtime.bigint() - start) / 1_000_000n);
    process.stdout.write(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      kind: 'request',
      id: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms,
      ip: req.ip || req.headers['x-forwarded-for']?.split(',')[0] || null,
      ua: req.headers['user-agent'] || null,
    }) + '\n');
  });
  next();
});

const history = new HistoryManager();

// Initialize enterprise module managers
let brandingManager = null;
let adminManager = null;
let gdprManager = null;

function getBrandingManager() {
  brandingManager ||= new BrandingManager();
  return brandingManager;
}

function getAdminManager() {
  adminManager ||= new AdminManager();
  return adminManager;
}

function getGdprManager() {
  gdprManager ||= new GdprManager();
  return gdprManager;
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await healthCheck(history.db);
    const statusCode = health.status === 'healthy' ? 200 :
      health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Readiness endpoint
app.get('/ready', (req, res) => {
  if (serverState.isShuttingDown) {
    return res.status(503).json({
      ready: false,
      reason: 'Server is shutting down'
    });
  }

  if (!serverState.isReady) {
    return res.status(503).json({
      ready: false,
      reason: 'Server is starting up'
    });
  }

  res.status(200).json({ ready: true });
});

app.get('/api/ticker', generalLimiter, async (req, res) => {
  res.set('Cache-Control', 'public, max-age=30').json(await getTickerEvents({}));
});

app.get('/api/history', historyLimiter, (req, res) => {
  const query = `
    SELECT 
      e.*, 
      p.client_slug, 
      p.project_slug, 
      p.name as project_name,
      (SELECT COUNT(*) FROM artifacts WHERE execution_id = e.id) as artifact_count,
      (SELECT GROUP_CONCAT(type || ':::' || path, '|||') FROM artifacts WHERE execution_id = e.id) as artifact_list
    FROM executions e
    LEFT JOIN projects p ON e.project_id = p.id
    ORDER BY e.timestamp DESC
  `;
  
  try {
    history.db.all(query, (err, rows) => {
      if (err) {
        console.error('[HISTORY] Query error:', err.message);
        return res.status(500).json({ error: err.message }); 
      }
      
      // Parse artifact_list into structured objects
      const sanitizedRows = rows.map(row => {
        row.timestamp = Number(row.timestamp);
        const artifacts = [];
        if (row.artifact_list) {
          for (const item of row.artifact_list.split('|||')) {
            const [type, ...pathParts] = item.split(':::');
            const fullPath = pathParts.join(':::');
            let webPath = fullPath;
            const markers = ['output', 'old'];
            for (const marker of markers) {
              const idx = webPath.indexOf(marker);
              if (idx !== -1) {
                webPath = '/' + webPath.slice(Math.max(0, idx)).replaceAll('\\', '/');
                break;
              }
            }

            artifacts.push({ type, path: fullPath, webPath });
          }
        }

        return { ...row, artifacts };
      });
      
      res.json(sanitizedRows);
    });
  } catch (error) {
    console.error('[HISTORY] API error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/logs/:executionId', (req, res) => {
  const { executionId } = req.params;
  history.db.get('SELECT output_dir FROM executions WHERE id = ?', [executionId], (err, row) => {
    if (err || !row || !row.output_dir) return res.status(404).json({ error: 'Logs not found' });
    const logPath = path.join(row.output_dir, 'pipeline.log');
    if (fsSync.existsSync(logPath)) {
      res.json({ logs: fsSync.readFileSync(logPath, 'utf8') });
    } else {
      res.status(404).json({ error: 'Log file missing' });
    }
  });
});

app.get('/api/artifacts/:executionId', (req, res) => {
  const { executionId } = req.params;
  history.db.all('SELECT * FROM artifacts WHERE execution_id = ?', [executionId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(row => {
      let webPath = row.path;
      const markers = ['output', 'old'];
      for (const marker of markers) {
        const idx = webPath.indexOf(marker);
        if (idx !== -1) {
          webPath = '/' + webPath.slice(Math.max(0, idx)).replaceAll('\\', '/');
          break;
        }
      }

      return { ...row, webPath };
    }));
  });
});

// Usage tracking endpoints
app.get('/api/usage/summary', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { workspace_id, start_date, end_date } = req.query;
    const options = {};

    if (workspace_id) options.workspace_id = workspace_id;
    if (start_date) options.start_date = Number.parseInt(start_date, 10);
    if (end_date) options.end_date = Number.parseInt(end_date, 10);

    const summary = await getUsageTracker().getUsageSummary(options);
    res.json(summary);
  } catch (error) {
    console.error('[USAGE] Summary error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/usage/detail', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { workspace_id, event_type, start_date, end_date, limit, offset } = req.query;
    const options = {};

    if (workspace_id) options.workspace_id = workspace_id;
    if (event_type) options.event_type = event_type;
    if (start_date) options.start_date = Number.parseInt(start_date, 10);
    if (end_date) options.end_date = Number.parseInt(end_date, 10);
    if (limit) options.limit = Math.min(Number.parseInt(limit, 10), 100); // Cap at 100
    if (offset) options.offset = Number.parseInt(offset, 10);

    const detail = await getUsageTracker().getUsageDetail(options);
    res.json(detail);
  } catch (error) {
    console.error('[USAGE] Detail error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/usage/costs', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { workspace_id, start_date, end_date } = req.query;
    const options = {};

    if (workspace_id) options.workspace_id = workspace_id;
    if (start_date) options.start_date = Number.parseInt(start_date, 10);
    if (end_date) options.end_date = Number.parseInt(end_date, 10);

    const costs = await getUsageTracker().getCostBreakdown(options);
    res.json(costs);
  } catch (error) {
    console.error('[USAGE] Costs error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Webhook management endpoints
app.post('/api/webhooks', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { name, url, events, workspace_id } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required' });
    }

    const webhook = await getWebhookManager().createWebhook({
      name,
      url,
      events: events || ALL_WEBHOOK_EVENTS,
      workspace_id
    });

    res.status(201).json(webhook);
  } catch (error) {
    console.error('[WEBHOOKS] Create error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/webhooks', generalLimiter, async (req, res) => {
  try {
    const { workspace_id } = req.query;
    const webhooks = await getWebhookManager().listWebhooks(workspace_id);

    // Don't expose secrets in list view
    const sanitized = webhooks.map(w => ({
      ...w,
      secret: w.secret.slice(0, 8) + '...'
    }));

    res.json(sanitized);
  } catch (error) {
    console.error('[WEBHOOKS] List error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/webhooks/:id', generalLimiter, async (req, res) => {
  try {
    const webhook = await getWebhookManager().getWebhook(Number.parseInt(req.params.id, 10));

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.json(webhook);
  } catch (error) {
    console.error('[WEBHOOKS] Get error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/webhooks/:id', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { name, url, events, enabled } = req.body;

    const webhook = await getWebhookManager().updateWebhook(
      Number.parseInt(req.params.id, 10),
      { name, url, events, enabled }
    );

    res.json(webhook);
  } catch (error) {
    console.error('[WEBHOOKS] Update error:', error.message);
    res.status(error.message.includes('not found') ? 404 : 400).json({ error: error.message });
  }
});

app.delete('/api/webhooks/:id', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const deleted = await getWebhookManager().deleteWebhook(Number.parseInt(req.params.id, 10));

    if (!deleted) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('[WEBHOOKS] Delete error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/webhooks/:id/test', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const result = await getWebhookManager().testWebhook(Number.parseInt(req.params.id, 10));
    res.json(result);
  } catch (error) {
    console.error('[WEBHOOKS] Test error:', error.message);
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
});

app.get('/api/webhooks/:id/deliveries', generalLimiter, async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const options = {};

    if (limit) options.limit = Math.min(Number.parseInt(limit, 10), 100);
    if (offset) options.offset = Number.parseInt(offset, 10);

    const history = await getWebhookManager().getDeliveryHistory(
      Number.parseInt(req.params.id, 10),
      options
    );

    res.json(history);
  } catch (error) {
    console.error('[WEBHOOKS] Deliveries error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Document versioning endpoints
const versionManager = new VersionManager(history);

app.get('/api/documents/:executionId/versions', generalLimiter, async (req, res) => {
  try {
    const { executionId } = req.params;
    const { type, limit, include_deleted } = req.query;

    if (!type) {
      return res.status(400).json({ error: 'type query parameter required (e.g., json, html, pdf)' });
    }

    const options = {};
    if (limit) options.limit = Math.min(Number.parseInt(limit, 10), 50);
    if (include_deleted === 'true') options.includeDeleted = true;

    const versions = await versionManager.listVersions(
      Number.parseInt(executionId, 10),
      type,
      options
    );

    res.json(versions);
  } catch (error) {
    console.error('[VERSIONS] List error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/documents/:executionId/versions/:version', generalLimiter, async (req, res) => {
  try {
    const { executionId, version } = req.params;
    const { type } = req.query;

    if (!type) {
      return res.status(400).json({ error: 'type query parameter required' });
    }

    const artifact = await versionManager.getVersion(
      Number.parseInt(executionId, 10),
      type,
      Number.parseInt(version, 10)
    );

    if (!artifact) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Add file existence info
    const fileExists = fsSync.existsSync(artifact.path);
    res.json({ ...artifact, file_exists: fileExists });
  } catch (error) {
    console.error('[VERSIONS] Get error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/documents/:executionId/rollback/:version', requireRole(Role.OWNER, Role.ADMIN, Role.MEMBER), generalLimiter, async (req, res) => {
  try {
    const { executionId, version } = req.params;
    const { type } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'type is required in request body' });
    }

    const result = await versionManager.rollback(
      Number.parseInt(executionId, 10),
      type,
      Number.parseInt(version, 10)
    );

    res.json({
      success: true,
      message: `Rolled back to version ${version}`,
      new_version: result
    });
  } catch (error) {
    console.error('[VERSIONS] Rollback error:', error.message);
    const statusCode = error.message.includes('not found') ? 404 :
      error.message.includes('deleted') ? 400 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

app.get('/api/documents/:executionId/diff/:v1/:v2', generalLimiter, async (req, res) => {
  try {
    const { executionId, v1, v2 } = req.params;
    const { type } = req.query;

    if (!type) {
      return res.status(400).json({ error: 'type query parameter required' });
    }

    const diff = await versionManager.compareVersions(
      Number.parseInt(executionId, 10),
      type,
      Number.parseInt(v1, 10),
      Number.parseInt(v2, 10)
    );

    res.json(diff);
  } catch (error) {
    console.error('[VERSIONS] Diff error:', error.message);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

// Dev-mode auth shim. lib/rbac.ts#requireRole reads `req.user_role` and
// 401s if it's missing. Production is expected to wire this through a
// real auth flow (session cookie, JWT, OAuth) that populates user_role
// before route handlers run. The shim accepts an X-User-Role header so
// curl/Postman can simulate any role without standing up an OAuth flow.
//
// Default behavior (see lib/rbac.ts#resolveDevAuthRole):
//   - X-User-Role header wins when present
//   - WRANNGLE_AUTH_DEFAULT_ROLE env var is the operator-set override
//   - Otherwise: production → 'viewer' (least privilege; mutation
//     routes 403 unless a role is explicit — fail-closed). Dev/test
//     → 'owner' so the local curl workflow stays friction-free.
app.use((req, res, next) => {
  req.user_role = resolveDevAuthRole(req.headers, process.env);
  next();
});

// Audit logging endpoints
app.use(auditContextMiddleware);

app.get('/api/audit-logs', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { workspace_id, user_id, action, resource_type, start_date, end_date, limit, offset } = req.query;
    const filters = {};

    if (workspace_id) filters.workspace_id = workspace_id;
    if (user_id) filters.user_id = user_id;
    if (action) filters.action = action;
    if (resource_type) filters.resource_type = resource_type;
    if (start_date) filters.start_date = Number.parseInt(start_date, 10);
    if (end_date) filters.end_date = Number.parseInt(end_date, 10);
    if (limit) filters.limit = Math.min(Number.parseInt(limit, 10), 100);
    if (offset) filters.offset = Number.parseInt(offset, 10);

    const result = await getAuditLogger().query(filters);
    res.json(result);
  } catch (error) {
    console.error('[AUDIT] Query error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/audit-logs/export', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { workspace_id, user_id, action, start_date, end_date } = req.query;
    const filters = {};

    if (workspace_id) filters.workspace_id = workspace_id;
    if (user_id) filters.user_id = user_id;
    if (action) filters.action = action;
    if (start_date) filters.start_date = Number.parseInt(start_date, 10);
    if (end_date) filters.end_date = Number.parseInt(end_date, 10);

    const csv = await getAuditLogger().exportToCsv(filters);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=audit_logs_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('[AUDIT] Export error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/audit-logs/verify', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const limit = req.query.limit ? Number.parseInt(req.query.limit, 10) : 1000;
    const result = await getAuditLogger().verifyIntegrity(limit);
    res.json(result);
  } catch (error) {
    console.error('[AUDIT] Verify error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/audit-logs/:logId', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const log = await getAuditLogger().getLog(req.params.logId);
    if (!log) {
      return res.status(404).json({ error: 'Audit log not found' });
    }

    res.json(log);
  } catch (error) {
    console.error('[AUDIT] Get error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/audit-logs/cleanup', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const plan = req.body.plan || 'free';
    const retentionDays = RetentionPolicy[plan] || RetentionPolicy.free;
    const result = await getAuditLogger().cleanup(retentionDays);
    res.json({ success: true, ...result, retention_days: retentionDays });
  } catch (error) {
    console.error('[AUDIT] Cleanup error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Branding endpoints
app.get('/api/branding', generalLimiter, async (req, res) => {
  try {
    const { workspace_id } = req.query;
    const branding = await getBrandingManager().getBranding(workspace_id || 'default');
    res.json(branding);
  } catch (error) {
    console.error('[BRANDING] Get error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/branding', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { workspace_id, ...updates } = req.body;
    const result = await getBrandingManager().setBranding(workspace_id || 'default', updates);
    res.json(result);
  } catch (error) {
    console.error('[BRANDING] Set error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/branding/logo', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { workspace_id, filename, mimetype, data } = req.body;

    // Validate inputs
    if (!data || !filename) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (!validTypes.includes(mimetype)) {
      return res.status(400).json({ error: 'Invalid file type. Must be PNG, JPEG, or SVG.' });
    }

    // Extract base64 data (remove data:image/xxx;base64, prefix)
    const base64Data = data.split(',')[1];
    if (!base64Data) {
      return res.status(400).json({ error: 'Invalid base64 data' });
    }

    // Check file size (max 2MB)
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large. Max 2MB allowed.' });
    }

    // Create logos directory if it doesn't exist
    const logosDir = path.join(import.meta.dirname || process.cwd(), 'public', 'logos');
    await fs.mkdir(logosDir, { recursive: true });

    // Generate unique filename
    const ext = path.extname(filename) || (mimetype === 'image/svg+xml' ? '.svg' : '.png');
    const safeWorkspace = (workspace_id || 'default').replaceAll(/[^\w-]/gi, '_');
    const logoFilename = `${safeWorkspace}_logo_${Date.now()}${ext}`;
    const logoPath = path.join(logosDir, logoFilename);

    // Write file
    await fs.writeFile(logoPath, buffer);

    const logoUrl = `/logos/${logoFilename}`;
    console.log(`[BRANDING] Logo uploaded: ${logoUrl}`);

    res.json({ success: true, logo_url: logoUrl });
  } catch (error) {
    console.error('[BRANDING] Logo upload error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/branding/domain/verify', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { domain, workspace_id } = req.query;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    // Real verification: registers the domain (idempotent), resolves the TXT
    // + CNAME records via node:dns/promises, and persists VERIFIED on match —
    // see BrandingManager.verifyCustomDomain for the lifecycle.
    const result = await getBrandingManager().verifyCustomDomain(workspace_id || 'default', domain);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error('[BRANDING] Domain verify error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Admin dashboard endpoints
app.get('/api/admin/dashboard', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { workspace_id, period } = req.query;
    const metrics = await getAdminManager().getDashboardMetrics(workspace_id || 'default', period || 'this_month');
    res.json(metrics);
  } catch (error) {
    console.error('[ADMIN] Dashboard error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/health', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const health = await getAdminManager().getSystemHealth();
    res.json(health);
  } catch (error) {
    console.error('[ADMIN] Health error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Minimal liveness probe for external callers (Cloudflare, uptime monitors,
// the legacy presales pipeline deployment). Intentionally has zero
// runtime dependencies so it stays green even when downstream managers/DBs
// are degraded — use `/api/admin/health` for deep checks.
//
// Includes deploy provenance (commit + uptime) so an operator looking at
// a bug report can correlate "what's deployed" with the runtime instance.
// commit comes from GIT_SHA env (set by deploy pipelines) or falls back
// to "unknown" when not provided.
app.get('/api/health', generalLimiter, (req, res) => {
  res.status(200).json(buildLightHealthPayload());
});

// Build-provenance probe — answers "what's deployed?" so an operator
// triaging a bug can match a stack trace to a specific commit + dep set.
// Shape pinned by lib/version.ts + tests/unit/version.test.ts. Mirrors
// the Cloudflare Pages function in functions/api/version.ts so local dev
// and prod return identical JSON (same triple-deploy pattern as PR #169).
app.get('/api/version', generalLimiter, (req, res) => {
  res.status(200).json(buildVersionPayload());
});

// GDPR endpoints
app.get('/api/gdpr/consent', generalLimiter, async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const consents = await getGdprManager().getAllConsents(user_id);
    res.json(consents);
  } catch (error) {
    console.error('[GDPR] Consent get error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gdpr/consent', requireRole(Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER), generalLimiter, async (req, res) => {
  try {
    const { user_id, consent_type, consented } = req.body;
    if (!user_id || !consent_type) {
      return res.status(400).json({ error: 'user_id and consent_type required' });
    }

    const context = {
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    };
    const result = await getGdprManager().recordConsent(user_id, consent_type, consented, context);
    res.json(result);
  } catch (error) {
    console.error('[GDPR] Consent set error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gdpr/export', requireRole(Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER), generalLimiter, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const gdpr = getGdprManager();
    const job = await gdpr.createExportJob(user_id);

    // Process the export job asynchronously
    gdpr.processExportJob(job.job_id).catch((error) => {
      console.error('[GDPR] Export processing error:', error.message);
    });

    res.json(job);
  } catch (error) {
    console.error('[GDPR] Export create error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gdpr/export/:jobId', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const job = await getGdprManager().getExportJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Export job not found' });
    res.json(job);
  } catch (error) {
    console.error('[GDPR] Export get error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gdpr/export/:jobId/download', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const job = await getGdprManager().getExportJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Export job not found' });
    if (job.status !== 'completed') {
      return res.status(400).json({ error: 'Export not ready', status: job.status });
    }

    if (!job.file_path) {
      return res.status(404).json({ error: 'Export file not found' });
    }

    const filePath = path.join(import.meta.dirname || process.cwd(), job.file_path);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilenameForHeader(path.basename(job.file_path))}"`,
    );
    res.sendFile(filePath);
  } catch (error) {
    console.error('[GDPR] Export download error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gdpr/delete', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { user_id, reason } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const request = await getGdprManager().requestDeletion(user_id, reason);
    res.json(request);
  } catch (error) {
    console.error('[GDPR] Delete request error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gdpr/delete/cancel', requireRole(Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER), generalLimiter, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const result = await getGdprManager().cancelDeletion(user_id);
    res.json(result);
  } catch (error) {
    console.error('[GDPR] Delete cancel error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// RBAC endpoints
app.get('/api/roles', generalLimiter, (req, res) => {
  const roles = [
    { role: Role.OWNER, ...getPermissionSummary(Role.OWNER), description: 'Full control including billing and workspace deletion' },
    { role: Role.ADMIN, ...getPermissionSummary(Role.ADMIN), description: 'Manage users, documents, and settings' },
    { role: Role.MEMBER, ...getPermissionSummary(Role.MEMBER), description: 'Create and edit own documents' },
    { role: Role.VIEWER, ...getPermissionSummary(Role.VIEWER), description: 'Read-only access to all documents' }
  ];
  res.json(roles);
});

app.get('/api/workspace/:id/users', requireRole(Role.OWNER, Role.ADMIN, Role.MEMBER), generalLimiter, async (req, res) => {
  try {
    const userManager = getUserManager();
    // Ensure default workspace has an owner
    await userManager.ensureWorkspaceOwner(req.params.id, 'owner@localhost');
    const users = await userManager.getWorkspaceUsers(req.params.id);
    res.json(users);
  } catch (error) {
    console.error('[RBAC] Get users error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:id/role', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { workspace_id, new_role } = req.body;
    const userId = req.params.id;

    if (!workspace_id || !new_role) {
      return res.status(400).json({ error: 'workspace_id and new_role required' });
    }

    const userManager = getUserManager();
    const targetUser = await userManager.getUser(workspace_id, userId);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // In production, would validate actor permissions via canChangeRole()
    await userManager.updateUserRole(workspace_id, userId, new_role);
    res.json({ success: true, message: 'Role updated' });
  } catch (error) {
    console.error('[RBAC] Role change error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workspace/:id/invite', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    const workspaceId = req.params.id;
    const userManager = getUserManager();

    // Create invitation (in production, would also send email)
    const invitation = await userManager.createInvitation(workspaceId, email, role || 'member');

    // For demo purposes, auto-accept the invitation to add user immediately
    const user = await userManager.acceptInvitation(invitation.invitation_id);

    res.json({ success: true, message: 'User added', user });
  } catch (error) {
    console.error('[RBAC] Invite error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/workspace/:wid/users/:uid', requireRole(Role.OWNER, Role.ADMIN), generalLimiter, async (req, res) => {
  try {
    const { wid: workspaceId, uid: userId } = req.params;
    const userManager = getUserManager();

    const user = await userManager.getUser(workspaceId, userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'owner') {
      return res.status(403).json({ error: 'Cannot remove workspace owner' });
    }

    await userManager.removeUser(workspaceId, userId);
    res.status(204).send();
  } catch (error) {
    console.error('[RBAC] Remove user error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(`data: ${JSON.stringify({ msg: '✓ Stream connected' })}\n\n`);
  const onLog = (msg) => res.write(`data: ${JSON.stringify({ msg })}\n\n`);
  logEmitter.on('log', onLog);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30_000);
  req.on('close', () => { clearInterval(heartbeat); logEmitter.off('log', onLog); });
});

app.get('/api/sample', generalLimiter, async (req, res) => {
  const inputDir = path.join(__dirname, 'input');
  const samples = ['upwork_job_post.txt', 'healthcare_intake.txt', 'test_receptionist.txt'];

  // Helper: Load a packaged fixture (DEMO_MODE / no-API-key path).
  // Order: apps/ops-console/fixtures/sample.json (canonical demo fixture used
  // by the static Cloudflare Pages build), then any examples/*.json that
  // expose a client_brief/text field, then legacy input/*.txt samples.
  // Always returns the {text, note} shape that existing /api/sample callers
  // (apps/ops-console/index.html, public/index.html) expect — never the raw
  // fixture envelope.
  const loadFileSample = (reason) => {
    // 1. Canonical demo fixture
    const fixturePath = path.join(__dirname, 'apps', 'ops-console', 'fixtures', 'sample.json');
    if (fsSync.existsSync(fixturePath)) {
      try {
        const raw = fsSync.readFileSync(fixturePath, 'utf8');
        const parsed = JSON.parse(raw);
        const text = parsed.client_brief || parsed.text || (typeof parsed === 'string' ? parsed : null);
        if (text && String(text).trim().length > 0) {
          return { text: String(text), note: `Demo fixture: apps/ops-console/fixtures/sample.json (${reason})` };
        }
      } catch (parseErr) {
        console.warn('[SAMPLE] Failed to parse fixtures/sample.json:', parseErr.message);
      }
    }

    // 2. examples/*.json (only if any contain a client_brief / text field)
    const examplesDir = path.join(__dirname, 'examples');
    if (fsSync.existsSync(examplesDir)) {
      const candidates = fsSync.readdirSync(examplesDir).filter((f) => f.endsWith('.json'));
      for (const file of candidates) {
        try {
          const raw = fsSync.readFileSync(path.join(examplesDir, file), 'utf8');
          const parsed = JSON.parse(raw);
          const text = parsed.client_brief || parsed.text;
          if (text && String(text).trim().length > 0) {
            return { text: String(text), note: `Example fixture: examples/${file} (${reason})` };
          }
        } catch {
          // Skip non-parseable / non-matching examples
        }
      }
    }

    // 3. Legacy input/*.txt samples
    if (fsSync.existsSync(inputDir)) {
      const randomSample = samples[Math.floor(Math.random() * samples.length)];
      const samplePath = path.join(inputDir, randomSample);
      if (fsSync.existsSync(samplePath)) {
        const text = fsSync.readFileSync(samplePath, 'utf8');
        return { text, note: `Fallback sample: ${randomSample} (${reason})` };
      }
    }

    // 4. Hardcoded emergency fallback (ensure demo mode always has something to show)
    return {
      text: "Acme HVAC Services is a regional HVAC contractor (~30 employees) handling residential and light commercial. They want a voice agent that answers after-hours, gathers caller details, and routes urgency-tagged dispatches to the on-call tech via SMS.",
      note: `Static demo fallback (${reason})`
    };
  };

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log('[SAMPLE] No GEMINI_API_KEY, using file fallback');
      const fallback = loadFileSample('no API key');
      return res.json(fallback);
    }

    const genai = new GoogleGenAI({ apiKey });

    const industries = [
      'healthcare clinic', 'real estate agency', 'law firm', 'e-commerce business',
      'marketing agency', 'construction company', 'accounting firm', 'dental practice',
      'insurance agency', 'property management', 'recruiting firm', 'auto dealership'
    ];
    const processes = [
      'customer intake and onboarding', 'lead qualification and follow-up',
      'appointment scheduling and reminders', 'invoice and payment processing',
      'document collection and verification', 'support ticket management',
      'quote generation and approval', 'inventory and order tracking'
    ];

    const industry = industries[Math.floor(Math.random() * industries.length)];
    const businessProcess = processes[Math.floor(Math.random() * processes.length)];

    const prompt = `Generate a realistic business automation intake document for a ${industry} that needs help with ${businessProcess}.

Include these sections in a natural, conversational format (as if a client filled out a form or sent an email):

1. **Company Info**: Company name, industry, size (employees), current challenges
2. **Current Process**: How they handle ${businessProcess} today, pain points, manual steps
3. **Systems Used**: CRM, email, phone system, databases, spreadsheets (be specific with real product names)
4. **Volume & Timing**: How many transactions/calls/leads per day/week, peak times
5. **Cost of Problems**: Time wasted, missed opportunities, error rates, labor costs
6. **Desired Outcome**: What success looks like, automation goals

Make it sound authentic like a real client submission. Include specific numbers and realistic details.
Keep it between 150-300 words. Do not use markdown formatting - plain text only.`;

    console.log(`[SAMPLE] Calling Gemini API for ${industry} / ${businessProcess}...`);
    
    const response = await genai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt
    });

    // Extract text from response
    const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (text && text.trim().length > 0) {
      console.log(`[SAMPLE] Gemini generated ${text.length} chars`);
      res.json({ text: text.trim(), note: `Generated by Gemini: ${industry} / ${businessProcess}` });
    } else {
      console.error('[SAMPLE] Empty response from Gemini:', JSON.stringify(response, null, 2));
      const fallback = loadFileSample('empty Gemini response');
      if (fallback) return res.json(fallback);
      res.status(500).json({ error: 'Empty response from Gemini and no fallback files' });
    }
  } catch (error) {
    // Log full error details
    console.error('[SAMPLE] Gemini API error:', error.message);
    if (error.response) console.error('[SAMPLE] Response data:', error.response.data);
    if (error.stack) console.error('[SAMPLE] Stack:', error.stack);
    
    // Try file fallback
    const fallback = loadFileSample(error.message);
    if (fallback) return res.json(fallback);
    
    res.status(500).json({ error: `Gemini error: ${error.message}` });
  }
});

// Removed /api/restart — was an unauthenticated POST that called
// process.exit(0) and respawned the node process. Zero callers in the
// repo (no UI button, no script). PR #92 narrowed the listen host to
// 127.0.0.1 by default; even so an unauthenticated process-restart
// surface is a footgun on localhost (any local script could DOS the
// dev server with `curl -X POST localhost:3000/api/restart`). Use
// `kill <pid>` or `pkill -HUP -f 'node server.ts'` instead.

app.post('/api/generate', requireRole(Role.OWNER, Role.ADMIN, Role.MEMBER), generateLimiter, async (req, res) => {
  const { input, structured, async: asyncMode, business_profile } = req.body;
  if (!input) return res.status(400).json({ error: 'Input required' });

  // Validate business_profile if provided
  let validatedProfile;
  if (business_profile) {
    const { type } = await import('arktype');
    const { BusinessProfileSchema } = await import('./lib/schemas/business-profile.schema.js');
    const parsed = BusinessProfileSchema(business_profile);
    if (parsed instanceof type.errors) {
      return res.status(400).json({
        error: 'Invalid business_profile',
        details: [...parsed].map((issue: any) => ({
          path: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path ?? ''),
          message: issue.message ?? String(issue),
        })),
      });
    }

    validatedProfile = parsed;
    
    // Centralized Lead Enrichment Microservice
    if (validatedProfile.company_url || validatedProfile.email) {
      try {
        const enrichmentWebhook = process.env.N8N_ENRICHMENT_WEBHOOK_URL || 'https://n8n.wranngle.com/webhook/lead-enrichment';
        const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
        if (!webhookSecret) {
          // Graceful no-op: still call the webhook (useful in dev where the
          // n8n instance may be unsecured), but warn so prod operators notice.
          // Mirrors the contract in lib/enrichment.ts.
          console.warn(
            'N8N_WEBHOOK_SECRET is not set; calling lead-enrichment webhook without auth header. Set N8N_WEBHOOK_SECRET in production.'
          );
        }
        const enrichHeaders = { 'Content-Type': 'application/json' };
        if (webhookSecret) enrichHeaders['X-Webhook-Secret'] = webhookSecret;
        const enrichRes = await fetch(enrichmentWebhook, {
          method: 'POST',
          headers: enrichHeaders,
          body: JSON.stringify({
            email: validatedProfile.email,
            company_url: validatedProfile.company_url,
            company_name: validatedProfile.company_name
          })
        });

        if (enrichRes.ok) {
          const enrichedData = await enrichRes.json();
          validatedProfile = {
            ...validatedProfile,
            company_name: enrichedData.company_name || validatedProfile.company_name,
            company_url: enrichedData.company_domain ? `https://${enrichedData.company_domain}` : validatedProfile.company_url,
            enrichment_source: 'central_n8n',
            enriched_at: new Date().toISOString(),
            ai_research: enrichedData.ai_research
          };
        }
      } catch (error) {
        console.error('Centralized data enrichment failed, continuing with basic data:', error.message);
      }
    }
  }

  // Use .json extension for structured input to trigger auto-detection
  const ext = structured ? 'json' : 'txt';
  const tempPath = path.join(__dirname, 'input', `web_${Date.now()}.${ext}`);
  fsSync.writeFileSync(tempPath, input);

  // Async mode: return immediately, stream logs via SSE (legacy behavior)
  if (asyncMode) {
    res.status(202).json({ message: 'Started' });
    try {
      const pipeline = new UnifiedPipeline({
        logHandler: (msg) => logEmitter.emit('log', msg),
        structured,
        businessProfile: validatedProfile
      });
      await pipeline.run(tempPath, path.join(__dirname, 'output'));
    } catch (error) { logEmitter.emit('log', `❌ ERROR: ${error.message}`); }
    finally { try { fsSync.unlinkSync(tempPath); } catch {} }

    return;
  }

  // Default: wait for completion and return results
  try {
    const pipeline = new UnifiedPipeline({
      logHandler: (msg) => logEmitter.emit('log', msg),
      structured,
      businessProfile: business_profile
    });
    const result = await pipeline.run(tempPath, path.join(__dirname, 'output'));

    if (result.success) {
      res.json({
        success: true,
        execution_id: pipeline.executionId,
        artifacts: {
          html: result.outputs?.html || null,
          pdf: result.outputs?.pdf || null,
          json: result.outputs?.json || null
        },
        summary: {
          client: result.schema?.project_identity?.client_slug || null,
          total_price: result.stats?.stages?.proposal?.totalPrice || 0,
          total_hours: result.stats?.stages?.projectPlan?.estimatedHours || 0,
          audit_score: result.schema?.audit_report?.scorecard?.overall_score || null
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error?.message || 'Pipeline failed',
        execution_id: pipeline.executionId
      });
    }
  } catch (error) {
    logEmitter.emit('log', `❌ ERROR: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    try { fsSync.unlinkSync(tempPath); } catch {}
  }
});

app.get('/api/eval/stats', generalLimiter, async (req, res) => {
  try {
    const stats = await getCorpusStats();
    const runs = await listEvaluationRuns({ limit: 100 });
    const completed = runs.filter(r => r.status === 'completed');
    const scores = completed
      .map(r => {
        const s = typeof r.scores_json === 'string' ? JSON.parse(r.scores_json) : r.scores_json;
        return s?.aggregate_score;
      })
      .filter(s => s != null);

    res.json({
      corpus: stats,
      evaluations: {
        total: runs.length,
        completed: completed.length,
        failed: runs.filter(r => r.status === 'failed').length,
      },
      scores: scores.length > 0 ? {
        mean: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
        min: Math.min(...scores),
        max: Math.max(...scores),
      } : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Shared handler so the canonical `/api/eval/runs` and the legacy
// `/api/eval-runs` alias (used by apps/ops-console/eval-runs/index.html)
// stay in lockstep. Adding the alias is safer than renaming because it
// preserves any external callers still hitting either path.
async function evalRunsHandler(req, res) {
  try {
    const limit = Number.parseInt(req.query.limit, 10) || 50;
    const runs = await listEvaluationRuns({ limit });
    res.json(runs.map(r => ({
      id: r.id,
      case_study_id: r.case_study_id,
      status: r.status,
      pipeline_version: r.pipeline_version,
      aggregate_score: (() => {
        try {
          const s = typeof r.scores_json === 'string' ? JSON.parse(r.scores_json) : r.scores_json;
          return s?.aggregate_score ?? null;
        } catch { return null; }
      })(),
      flaws: (() => {
        try {
          return typeof r.flaws_detected === 'string' ? JSON.parse(r.flaws_detected) : (r.flaws_detected || []);
        } catch { return []; }
      })(),
      duration_ms: r.duration_ms,
      created_at: r.created_at,
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

app.get('/api/eval/runs', generalLimiter, evalRunsHandler);
app.get('/api/eval-runs', generalLimiter, evalRunsHandler);

app.get('/api/eval/runs/:id', generalLimiter, async (req, res) => {
  try {
    const run = await getEvaluationRunById(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/eval/cases', generalLimiter, async (req, res) => {
  try {
    const cases = await listCaseStudies({});
    res.json(cases.map(c => ({
      id: c.id,
      industry: c.problem?.industry,
      company_type: c.problem?.company_type,
      tier: c.solution?.inferred_tier,
      agent_type: c.solution?.agent_type,
      holdout: c.meta?.holdout,
      quality_score: c.meta?.quality_score,
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(port, host, () => {
  serverState.isReady = true;
  console.log(`Server running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(`  Dashboard:  http://localhost:${port}/`);
  console.log(`  Eval:       http://localhost:${port}/console/?route=evals`);
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.warn(`  WARNING: bound to ${host} — exposed to other hosts. Auth checks on unprotected POST routes are NOT YET in place.`);
  }
});

// Graceful shutdown handling
const SHUTDOWN_TIMEOUT_MS = 120_000; // 2 minutes max wait for in-flight requests

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  serverState.isShuttingDown = true;
  serverState.isReady = false;

  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed - no longer accepting connections');
  });

  // Wait for active requests to complete
  const startTime = Date.now();
  const checkInterval = 1000; // Check every second

  while (serverState.activeRequests > 0) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= SHUTDOWN_TIMEOUT_MS) {
      console.log(`Shutdown timeout reached with ${serverState.activeRequests} active requests`);
      break;
    }

    console.log(`Waiting for ${serverState.activeRequests} active request(s) to complete...`);
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  // Close database connection
  if (history?.db) {
    await new Promise((resolve) => {
      history.db.close((err) => {
        if (err) console.error('Error closing database:', err.message);
        else console.log('Database connection closed');
        resolve();
      });
    });
  }

  console.log('Graceful shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
