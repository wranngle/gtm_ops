/**
 * Health Check Module
 * Provides health and readiness checks for production deployment.
 *
 * @module lib/health
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Database } from 'sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

// =============================================================================
// TYPES
// =============================================================================

export type HealthStatusLevel = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Health status for a single component
 */
export type ComponentHealth = {
  status: HealthStatusLevel;
  message?: string;
  latency_ms: number;
};

/**
 * Overall health status
 */
export type HealthStatus = {
  status: HealthStatusLevel;
  components: Record<string, ComponentHealth>;
  timestamp: string;
};

/**
 * Server state for readiness checks
 */
export type ServerState = {
  isReady: boolean;
  isShuttingDown: boolean;
  activeRequests: number;
};

// =============================================================================
// COMPONENT HEALTH CHECKS
// =============================================================================

/**
 * Check SQLite database health
 */
export async function checkDatabase(db: Database | undefined): Promise<ComponentHealth> {
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
    db.get('SELECT 1 as health_check', (err, row: any) => {
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
 */
export async function checkGeminiAPI(): Promise<ComponentHealth> {
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
    const timeoutId = setTimeout(() => { controller.abort(); }, 5000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.slice(0, 10)}...`,
      {
        method: 'HEAD',
        signal: controller.signal
      }
    ).catch(async () => 
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
    
  } catch (error: any) {
    return {
      status: 'unhealthy',
      message: error.name === 'AbortError' ? 'API timeout (5s)' : error.message,
      latency_ms: Date.now() - start
    };
  }
}

/**
 * Check file system write permissions
 */
export async function checkFileSystem(): Promise<ComponentHealth> {
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
    
  } catch (error: any) {
    return {
      status: 'unhealthy',
      message: `Filesystem error: ${error.message}`,
      latency_ms: Date.now() - start
    };
  }
}

// =============================================================================
// AGGREGATE HEALTH
// =============================================================================

/**
 * Aggregate component health into overall status
 */
function aggregateHealth(components: Record<string, ComponentHealth>): HealthStatusLevel {
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
 */
export async function healthCheck(db: Database | undefined): Promise<HealthStatus> {
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

// =============================================================================
// LIGHTWEIGHT HEALTH PAYLOAD
// =============================================================================

export type LightHealthPayload = {
  status: 'ok';
  timestamp: string;
  version: string;
  commit: string;
  uptime_s: number;
};

/**
 * Build the lightweight /api/health response payload. Pure function
 * so the contract can be pinned by unit tests without spinning up
 * an Express app or pulling server.ts into the test process.
 */
export function buildLightHealthPayload(
  env: Record<string, string | undefined> = process.env,
  proc: { uptime?: () => number } = process,
): LightHealthPayload {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: env?.npm_package_version || '1.0.0',
    commit: (env?.GIT_SHA || 'unknown').slice(0, 7),
    uptime_s: Math.floor(proc?.uptime?.() ?? 0),
  };
}

// =============================================================================
// SERVER STATE
// =============================================================================

/**
 * Server state for readiness checks
 */
export const serverState: ServerState = {
  isReady: false,
  isShuttingDown: false,
  activeRequests: 0
};

/**
 * Track active request (middleware helper)
 */
export function trackRequest(): () => void {
  serverState.activeRequests++;
  return () => {
    serverState.activeRequests--;
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  checkDatabase,
  checkGeminiAPI,
  checkFileSystem,
  healthCheck,
  serverState,
  trackRequest
};
