/**
 * Health Check Module
 * Provides health and readiness checks for production deployment.
 *
 * @module lib/health
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

/**
 * Health status for a single component
 * @typedef {Object} ComponentHealth
 * @property {string} status - 'healthy' | 'degraded' | 'unhealthy'
 * @property {string} [message] - Optional status message
 * @property {number} latency_ms - Check latency in milliseconds
 */

/**
 * Overall health status
 * @typedef {Object} HealthStatus
 * @property {string} status - 'healthy' | 'degraded' | 'unhealthy'
 * @property {Object.<string, ComponentHealth>} components - Individual component statuses
 * @property {string} timestamp - ISO timestamp of check
 */

/**
 * Check SQLite database health
 * @param {import('sqlite3').Database} db - SQLite database instance
 * @returns {Promise<ComponentHealth>}
 */
export async function checkDatabase(db) {
  const start = Date.now();

  return new Promise((resolve) => {
    if (!db) {
      resolve({
        status: 'unhealthy',
        message: 'Database not initialized',
        latency_ms: Date.now() - start
      });
      return;
    }

    // Simple query to verify database is responsive
    db.get('SELECT 1 as health_check', (err, row) => {
      const latency = Date.now() - start;

      if (err) {
        resolve({
          status: 'unhealthy',
          message: `Database error: ${err.message}`,
          latency_ms: latency
        });
      } else if (row?.health_check === 1) {
        resolve({
          status: 'healthy',
          latency_ms: latency
        });
      } else {
        resolve({
          status: 'degraded',
          message: 'Unexpected database response',
          latency_ms: latency
        });
      }
    });
  });
}

/**
 * Check Gemini API accessibility with lightweight ping
 * @returns {Promise<ComponentHealth>}
 */
export async function checkGeminiAPI() {
  const start = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      status: 'degraded',
      message: 'GEMINI_API_KEY not configured',
      latency_ms: Date.now() - start
    };
  }

  try {
    // Lightweight check - just verify API endpoint is reachable
    // Use models list endpoint which is fast and doesn't consume tokens
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.slice(0, 10)}...`,
      {
        method: 'HEAD',
        signal: controller.signal
      }
    ).catch(() => 
      // HEAD might not be supported, try a simple GET with the actual key
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { signal: controller.signal }
      )
    );

    clearTimeout(timeoutId);
    const latency = Date.now() - start;

    if (response.ok || response.status === 200) {
      return {
        status: 'healthy',
        latency_ms: latency
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: 'unhealthy',
        message: 'Invalid API key',
        latency_ms: latency
      };
    }

    if (response.status === 429) {
      return {
        status: 'degraded',
        message: 'Rate limited',
        latency_ms: latency
      };
    }
 
    return {
      status: 'degraded',
      message: `API returned status ${response.status}`,
      latency_ms: latency
    };
    
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.name === 'AbortError' ? 'API timeout (5s)' : error.message,
      latency_ms: Date.now() - start
    };
  }
}

/**
 * Check file system write permissions
 * @returns {Promise<ComponentHealth>}
 */
export async function checkFileSystem() {
  const start = Date.now();
  const testFile = path.join(OUTPUT_DIR, `.health_check_${Date.now()}`);

  try {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Test write
    fs.writeFileSync(testFile, 'health_check');

    // Test read
    const content = fs.readFileSync(testFile, 'utf8');

    // Cleanup
    fs.unlinkSync(testFile);

    const latency = Date.now() - start;

    if (content === 'health_check') {
      return {
        status: 'healthy',
        latency_ms: latency
      };
    }
 
    return {
      status: 'degraded',
      message: 'File content mismatch',
      latency_ms: latency
    };
    
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Filesystem error: ${error.message}`,
      latency_ms: Date.now() - start
    };
  }
}

/**
 * Aggregate component health into overall status
 * @param {Object.<string, ComponentHealth>} components
 * @returns {string} 'healthy' | 'degraded' | 'unhealthy'
 */
function aggregateHealth(components) {
  const statuses = new Set(Object.values(components).map(c => c.status));

  if (statuses.has('unhealthy')) {
    return 'unhealthy';
  }

  if (statuses.has('degraded')) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Perform full health check
 * @param {import('sqlite3').Database} db - SQLite database instance
 * @returns {Promise<HealthStatus>}
 */
export async function healthCheck(db) {
  const [database, gemini, filesystem] = await Promise.all([
    checkDatabase(db),
    checkGeminiAPI(),
    checkFileSystem()
  ]);

  const components = { database, gemini, filesystem };

  return {
    status: aggregateHealth(components),
    components,
    timestamp: new Date().toISOString()
  };
}

/**
 * Build the lightweight /api/health response payload. Pure function
 * so the contract (status, version, commit, uptime_s, timestamp) can
 * be pinned by unit tests without spinning up an Express app or
 * pulling server.js into the test process.
 *
 * Operators correlate bug reports against the `commit` field; if it
 * silently disappears or the SHA grows past 7 chars, downstream
 * tooling (log dashboards, runbooks) breaks. The test in
 * tests/unit/health.test.ts pins exactly that contract.
 *
 * @param {Object} [env=process.env] - Environment to read from
 * @param {NodeJS.Process} [proc=process] - Process for uptime
 * @returns {Object} health payload
 */
export function buildLightHealthPayload(env = process.env, proc = process) {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: env?.npm_package_version || '1.0.0',
    commit: (env?.GIT_SHA || 'unknown').slice(0, 7),
    uptime_s: Math.floor(proc?.uptime?.() ?? 0),
  };
}

/**
 * Server state for readiness checks
 */
export const serverState = {
  isReady: false,
  isShuttingDown: false,
  activeRequests: 0
};

/**
 * Track active request (middleware helper)
 */
export function trackRequest() {
  serverState.activeRequests++;
  return () => {
    serverState.activeRequests--;
  };
}
