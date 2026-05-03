/**
 * Unit Tests for lib/health.js
 *
 * Tests health check functionality:
 * - Database health check
 * - Gemini API health check
 * - File system health check
 * - Aggregate health status
 * - Server state management
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

let checkDatabase: any;
let checkGeminiAPI: any;
let checkFileSystem: any;
let healthCheck: any;
let serverState: any;
let trackRequest: any;

beforeEach(async () => {
  vi.resetModules();
  const module = await import('../../lib/health.js');
  checkDatabase = module.checkDatabase;
  checkGeminiAPI = module.checkGeminiAPI;
  checkFileSystem = module.checkFileSystem;
  healthCheck = module.healthCheck;
  serverState = module.serverState;
  trackRequest = module.trackRequest;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('[P0] checkDatabase - SQLite Health', () => {
  it('[P0] should return healthy when database responds correctly', async () => {
    // GIVEN: A mock database that responds to queries
    const mockDb = {
      get: vi.fn((query, callback) => {
        callback(null, { health_check: 1 });
      })
    };

    // WHEN: Checking database health
    const result = await checkDatabase(mockDb);

    // THEN: Should return healthy status
    expect(result.status).toBe('healthy');
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.message).toBeUndefined();
  });

  it('[P0] should return unhealthy when database is null', async () => {
    // GIVEN: No database
    const mockDb = null;

    // WHEN: Checking database health
    const result = await checkDatabase(mockDb);

    // THEN: Should return unhealthy status
    expect(result.status).toBe('unhealthy');
    expect(result.message).toBe('Database not initialized');
  });

  it('[P0] should return unhealthy on database error', async () => {
    // GIVEN: A database that returns an error
    const mockDb = {
      get: vi.fn((query, callback) => {
        callback(new Error('Connection refused'), null);
      })
    };

    // WHEN: Checking database health
    const result = await checkDatabase(mockDb);

    // THEN: Should return unhealthy status with error message
    expect(result.status).toBe('unhealthy');
    expect(result.message).toContain('Database error');
  });

  it('[P1] should return degraded on unexpected response', async () => {
    // GIVEN: A database that returns unexpected data
    const mockDb = {
      get: vi.fn((query, callback) => {
        callback(null, { health_check: 'unexpected' });
      })
    };

    // WHEN: Checking database health
    const result = await checkDatabase(mockDb);

    // THEN: Should return degraded status
    expect(result.status).toBe('degraded');
    expect(result.message).toContain('Unexpected');
  });
});

describe('[P0] checkFileSystem - Write Permissions', () => {
  it('[P0] should return healthy when filesystem is writable', async () => {
    // WHEN: Checking filesystem health (uses real filesystem)
    const result = await checkFileSystem();

    // THEN: Should return healthy status (output dir should be writable)
    expect(result.status).toBe('healthy');
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });
});

describe('[P1] checkGeminiAPI - API Accessibility', () => {
  it('[P1] should return degraded when API key is missing', async () => {
    // GIVEN: No API key
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    // WHEN: Checking Gemini API health
    const result = await checkGeminiAPI();

    // THEN: Should return degraded status
    expect(result.status).toBe('degraded');
    expect(result.message).toContain('not configured');

    // Cleanup
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });
});

describe('[P0] healthCheck - Aggregate Health', () => {
  it('[P0] should aggregate component health correctly', async () => {
    // GIVEN: A working mock database
    const mockDb = {
      get: vi.fn((query, callback) => {
        callback(null, { health_check: 1 });
      })
    };

    // WHEN: Running full health check
    const result = await healthCheck(mockDb);

    // THEN: Should return aggregated health status
    expect(result.status).toBeDefined();
    expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
    expect(result.components).toBeDefined();
    expect(result.components.database).toBeDefined();
    expect(result.components.gemini).toBeDefined();
    expect(result.components.filesystem).toBeDefined();
    expect(result.timestamp).toBeDefined();
  });

  it('[P0] should return unhealthy if any component is unhealthy', async () => {
    // GIVEN: A failing database
    const mockDb = {
      get: vi.fn((query, callback) => {
        callback(new Error('Database crashed'), null);
      })
    };

    // WHEN: Running full health check
    const result = await healthCheck(mockDb);

    // THEN: Overall status should be unhealthy
    expect(result.status).toBe('unhealthy');
    expect(result.components.database.status).toBe('unhealthy');
  });

  it('[P1] should respond in under 100ms for database check', async () => {
    // GIVEN: A responsive mock database
    const mockDb = {
      get: vi.fn((query, callback) => {
        callback(null, { health_check: 1 });
      })
    };

    // WHEN: Checking database health
    const start = Date.now();
    const result = await checkDatabase(mockDb);
    const elapsed = Date.now() - start;

    // THEN: Should respond quickly
    expect(elapsed).toBeLessThan(100);
    expect(result.latency_ms).toBeLessThan(100);
  });
});

describe('[P0] serverState - State Management', () => {
  it('[P0] should initialize with correct defaults', () => {
    // THEN: Server state should have correct initial values
    expect(serverState).toBeDefined();
    expect(typeof serverState.isReady).toBe('boolean');
    expect(typeof serverState.isShuttingDown).toBe('boolean');
    expect(typeof serverState.activeRequests).toBe('number');
  });

  it('[P0] should track active requests correctly', () => {
    // GIVEN: Initial state
    const initialCount = serverState.activeRequests;

    // WHEN: Tracking a request
    const done = trackRequest();

    // THEN: Count should increment
    expect(serverState.activeRequests).toBe(initialCount + 1);

    // WHEN: Request completes
    done();

    // THEN: Count should decrement
    expect(serverState.activeRequests).toBe(initialCount);
  });

  it('[P1] should handle multiple concurrent requests', () => {
    // GIVEN: Initial state
    const initialCount = serverState.activeRequests;

    // WHEN: Tracking multiple requests
    const done1 = trackRequest();
    const done2 = trackRequest();
    const done3 = trackRequest();

    // THEN: Count should reflect all active requests
    expect(serverState.activeRequests).toBe(initialCount + 3);

    // WHEN: Some requests complete
    done1();
    done2();

    // THEN: Count should update correctly
    expect(serverState.activeRequests).toBe(initialCount + 1);

    // Cleanup
    done3();
  });
});
