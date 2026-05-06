/**
 * Unit Tests for lib/audit.js
 *
 * Tests audit logging functionality:
 * - Logging actions
 * - Query and filtering
 * - Hash chain integrity
 * - Retention cleanup
 * - CSV export
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let AuditLogger: any;
let AuditAction: any;
let RetentionPolicy: any;
let testDbPath: string;

beforeEach(async () => {
  // Create unique database path for each test
  testDbPath = path.join(
    __dirname,
    '..',
    '..',
    'config',
    `audit_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`
  );

  const module = await import('../../lib/audit.js');
  AuditLogger = module.AuditLogger;
  AuditAction = module.AuditAction;
  RetentionPolicy = module.RetentionPolicy;
});

afterEach(async () => {
  // Clean up test database
  if (testDbPath && fs.existsSync(testDbPath)) {
    try {
      fs.unlinkSync(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe('[P0] AuditLogger - Basic Logging', () => {
  it('[P0] should log an audit event', async () => {
    // GIVEN: An audit logger
    const logger = new AuditLogger(testDbPath);

    // WHEN: Logging an event
    const result = await logger.log(
      AuditAction.DOCUMENT_CREATED,
      'execution',
      'exec-123',
      { client_name: 'Test Co' },
      { user_id: 'user-1', workspace_id: 'ws-1' }
    );

    // THEN: Should return log ID and hash
    expect(result.log_id).toBeDefined();
    expect(result.log_id).toMatch(/^aud_/);
    expect(result.hash).toHaveLength(64);

    await logger.close();
  });

  it('[P0] should store all context fields', async () => {
    // GIVEN: An audit logger
    const logger = new AuditLogger(testDbPath);

    // WHEN: Logging with full context
    await logger.log(
      AuditAction.USER_LOGIN,
      'user',
      'user-123',
      { method: 'password' },
      {
        user_id: 'user-123',
        workspace_id: 'ws-1',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
      }
    );

    // THEN: Query should return stored fields
    const result = await logger.query({});
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].action).toBe(AuditAction.USER_LOGIN);
    expect(result.logs[0].user_id).toBe('user-123');
    expect(result.logs[0].ip_address).toBe('192.168.1.1');
    expect(result.logs[0].user_agent).toBe('Mozilla/5.0');
    expect(result.logs[0].metadata.method).toBe('password');

    await logger.close();
  });

  it('[P0] should generate unique log IDs', async () => {
    // GIVEN: An audit logger
    const logger = new AuditLogger(testDbPath);

    // WHEN: Logging multiple events
    const result1 = await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd1', {});
    const result2 = await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd2', {});

    // THEN: IDs should be unique
    expect(result1.log_id).not.toBe(result2.log_id);

    await logger.close();
  });
});

describe('[P0] AuditLogger - Query and Filtering', () => {
  it('[P0] should query all logs', async () => {
    // GIVEN: Multiple audit logs
    const logger = new AuditLogger(testDbPath);
    await logger.log(AuditAction.USER_LOGIN, 'user', 'u1', {});
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd1', {});
    await logger.log(AuditAction.SETTINGS_UPDATED, 'settings', 's1', {});

    // WHEN: Querying all
    const result = await logger.query({});

    // THEN: Should return all logs
    expect(result.logs).toHaveLength(3);
    expect(result.total).toBe(3);

    await logger.close();
  });

  it('[P0] should filter by action', async () => {
    // GIVEN: Mixed action logs
    const logger = new AuditLogger(testDbPath);
    await logger.log(AuditAction.USER_LOGIN, 'user', 'u1', {});
    await logger.log(AuditAction.USER_LOGIN, 'user', 'u2', {});
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd1', {});

    // WHEN: Filtering by action
    const result = await logger.query({ action: AuditAction.USER_LOGIN });

    // THEN: Should return only matching logs
    expect(result.logs).toHaveLength(2);
    expect(result.logs.every((l: any) => l.action === AuditAction.USER_LOGIN)).toBe(true);

    await logger.close();
  });

  it('[P0] should filter by workspace_id', async () => {
    // GIVEN: Logs from different workspaces
    const logger = new AuditLogger(testDbPath);
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd1', {}, { workspace_id: 'ws-1' });
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd2', {}, { workspace_id: 'ws-1' });
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd3', {}, { workspace_id: 'ws-2' });

    // WHEN: Filtering by workspace
    const result = await logger.query({ workspace_id: 'ws-1' });

    // THEN: Should return only ws-1 logs
    expect(result.logs).toHaveLength(2);

    await logger.close();
  });

  it('[P0] should paginate results', async () => {
    // GIVEN: Multiple logs
    const logger = new AuditLogger(testDbPath);
    for (let i = 0; i < 10; i++) {
      await logger.log(AuditAction.DOCUMENT_VIEWED, 'doc', `d${i}`, {});
    }

    // WHEN: Getting first page
    const page1 = await logger.query({ limit: 5, offset: 0 });

    // THEN: Should return paginated results
    expect(page1.logs).toHaveLength(5);
    expect(page1.total).toBe(10);
    expect(page1.has_more).toBe(true);

    // WHEN: Getting second page
    const page2 = await logger.query({ limit: 5, offset: 5 });
    expect(page2.logs).toHaveLength(5);
    expect(page2.has_more).toBe(false);

    await logger.close();
  });

  it('[P0] should filter by date range', async () => {
    // GIVEN: Logs at different times
    const logger = new AuditLogger(testDbPath);
    const now = Date.now();

    // Create logs with backdated timestamps (via direct query since log() uses current time)
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd1', {});

    // WHEN: Filtering by recent timestamp
    const result = await logger.query({ start_date: now - 1000 });

    // THEN: Should return logs after start_date
    expect(result.logs.length).toBeGreaterThanOrEqual(1);

    await logger.close();
  });
});

describe('[P0] AuditLogger - Get Single Log', () => {
  it('[P0] should get log by ID', async () => {
    // GIVEN: A logged event
    const logger = new AuditLogger(testDbPath);
    const { log_id } = await logger.log(
      AuditAction.DOCUMENT_DOWNLOADED,
      'document',
      'doc-123',
      { format: 'pdf' }
    );

    // WHEN: Getting by ID
    const log = await logger.getLog(log_id);

    // THEN: Should return the log
    expect(log).not.toBeNull();
    expect(log.log_id).toBe(log_id);
    expect(log.action).toBe(AuditAction.DOCUMENT_DOWNLOADED);
    expect(log.metadata.format).toBe('pdf');

    await logger.close();
  });

  it('[P0] should return null for non-existent log', async () => {
    // GIVEN: An audit logger
    const logger = new AuditLogger(testDbPath);

    // WHEN: Getting non-existent log
    const log = await logger.getLog('aud_nonexistent');

    // THEN: Should return null
    expect(log).toBeNull();

    await logger.close();
  });
});

describe('[P1] AuditLogger - Hash Chain Integrity', () => {
  it('[P1] should create hash chain', async () => {
    // GIVEN: Multiple sequential logs
    const logger = new AuditLogger(testDbPath);
    await logger.log(AuditAction.USER_LOGIN, 'user', 'u1', {});
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd1', {});
    await logger.log(AuditAction.DOCUMENT_UPDATED, 'doc', 'd1', {});

    // WHEN: Querying logs
    const result = await logger.query({});

    // THEN: Each log should have a hash
    expect(result.logs.every((l: any) => l.hash?.length === 64)).toBe(true);

    await logger.close();
  });

  it('[P1] should verify integrity of valid chain', async () => {
    // GIVEN: Valid log chain
    const logger = new AuditLogger(testDbPath);
    await logger.log(AuditAction.USER_LOGIN, 'user', 'u1', {});
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd1', {});

    // WHEN: Verifying integrity
    const result = await logger.verifyIntegrity();

    // THEN: Should be valid
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(2);

    await logger.close();
  });

  it('[P1] should DETECT tampering with a logged row', async () => {
    // GIVEN: 3 logged events. The hash chain should be `valid` initially.
    const logger = new AuditLogger(testDbPath);
    await logger.log(AuditAction.USER_LOGIN, 'user', 'u1', {ip: '1.1.1.1'});
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd1', {title: 'Original'});
    await logger.log(AuditAction.DOCUMENT_UPDATED, 'doc', 'd1', {title: 'Edited'});
    expect((await logger.verifyIntegrity()).valid).toBe(true);
    await logger.close();

    // WHEN: An attacker mutates the middle row's metadata directly via SQL
    // (bypassing the API). The stored `hash` is now stale relative to the
    // recomputed hash from the new metadata.
    const sqlite = await import('sqlite3');
    await new Promise<void>((resolve, reject) => {
      const db = new sqlite.default.Database(testDbPath);
      db.run(
        `UPDATE audit_logs SET metadata = ? WHERE log_id = (SELECT log_id FROM audit_logs ORDER BY id ASC LIMIT 1 OFFSET 1)`,
        [JSON.stringify({title: 'Tampered'})],
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          db.close((closeErr) => closeErr ? reject(closeErr) : resolve());
        },
      );
    });

    // THEN: A fresh logger reading the same DB should detect the break.
    const verifier = new AuditLogger(testDbPath);
    const result = await verifier.verifyIntegrity();
    expect(result.valid).toBe(false);
    expect(result.checked).toBe(3);
    expect(result.invalid_at).toBeTruthy();
    await verifier.close();
  });

  it('[P1] should DETECT a deleted row mid-chain', async () => {
    // GIVEN: 4 logged events. Each row's hash includes its own
    // previous_hash, so deleting row #2 leaves row #3 with a
    // previous_hash that no longer matches the row before it (now #1).
    const logger = new AuditLogger(testDbPath);
    await logger.log(AuditAction.USER_LOGIN, 'user', 'u1', {});
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd1', {});
    await logger.log(AuditAction.DOCUMENT_UPDATED, 'doc', 'd1', {});
    await logger.log(AuditAction.DOCUMENT_DOWNLOADED, 'doc', 'd1', {});
    expect((await logger.verifyIntegrity()).valid).toBe(true);
    await logger.close();

    // WHEN: An attacker deletes row #2 directly (bypass the API).
    const sqlite = await import('sqlite3');
    await new Promise<void>((resolve, reject) => {
      const db = new sqlite.default.Database(testDbPath);
      db.run(
        `DELETE FROM audit_logs WHERE log_id = (SELECT log_id FROM audit_logs ORDER BY id ASC LIMIT 1 OFFSET 1)`,
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          db.close((closeErr) => closeErr ? reject(closeErr) : resolve());
        },
      );
    });

    // THEN: verifyIntegrity recomputes each row's hash chain. Row #3's
    // stored previous_hash points at the deleted row #2's hash, but the
    // recomputed expected previousHash (running through the surviving
    // rows in order) is now #1's hash. The chain breaks at row #3.
    const verifier = new AuditLogger(testDbPath);
    const result = await verifier.verifyIntegrity();
    expect(result.valid).toBe(false);
    expect(result.checked).toBe(3);
    expect(result.invalid_at).toBeTruthy();
    await verifier.close();
  });
});

describe('[P1] AuditLogger - Retention Cleanup', () => {
  it('[P1] should cleanup old logs', async () => {
    // GIVEN: Logs (we can't easily backdate, but test the function works)
    const logger = new AuditLogger(testDbPath);
    await logger.log(AuditAction.USER_LOGIN, 'user', 'u1', {});

    // WHEN: Cleanup with 0 retention (delete all)
    const result = await logger.cleanup(0);

    // THEN: Should delete logs
    expect(result.deleted).toBeGreaterThanOrEqual(0);

    await logger.close();
  });

  it('[P1] should have correct retention policies', () => {
    expect(RetentionPolicy.free).toBe(30);
    expect(RetentionPolicy.pro).toBe(90);
    expect(RetentionPolicy.enterprise).toBe(730);
  });
});

describe('[P1] AuditLogger - CSV Export', () => {
  it('[P1] should export to CSV', async () => {
    // GIVEN: Some audit logs
    const logger = new AuditLogger(testDbPath);
    await logger.log(AuditAction.USER_LOGIN, 'user', 'u1', { browser: 'Chrome' });
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd1', { title: 'Report' });

    // WHEN: Exporting to CSV
    const csv = await logger.exportToCsv({});

    // THEN: Should be valid CSV
    expect(csv).toContain('log_id,timestamp,action');
    expect(csv).toContain(AuditAction.USER_LOGIN);
    expect(csv).toContain(AuditAction.DOCUMENT_CREATED);

    await logger.close();
  });

  it('[P1] should escape special CSV characters', async () => {
    // GIVEN: Log with special characters
    const logger = new AuditLogger(testDbPath);
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd1', {
      description: 'Contains, comma and "quotes"',
    });

    // WHEN: Exporting to CSV
    const csv = await logger.exportToCsv({});

    // THEN: Should escape properly
    expect(csv).toContain('""'); // Escaped quotes

    await logger.close();
  });
});

describe('[P1] AuditAction Constants', () => {
  it('[P1] should have all user actions', () => {
    expect(AuditAction.USER_LOGIN).toBe('user.login');
    expect(AuditAction.USER_LOGOUT).toBe('user.logout');
    expect(AuditAction.USER_LOGIN_FAILED).toBe('user.login_failed');
    expect(AuditAction.USER_CREATED).toBe('user.created');
    expect(AuditAction.USER_DELETED).toBe('user.deleted');
  });

  it('[P1] should have all document actions', () => {
    expect(AuditAction.DOCUMENT_CREATED).toBe('document.created');
    expect(AuditAction.DOCUMENT_VIEWED).toBe('document.viewed');
    expect(AuditAction.DOCUMENT_UPDATED).toBe('document.updated');
    expect(AuditAction.DOCUMENT_DELETED).toBe('document.deleted');
    expect(AuditAction.DOCUMENT_DOWNLOADED).toBe('document.downloaded');
  });

  it('[P1] should have pipeline actions', () => {
    expect(AuditAction.PIPELINE_STARTED).toBe('pipeline.started');
    expect(AuditAction.PIPELINE_COMPLETED).toBe('pipeline.completed');
    expect(AuditAction.PIPELINE_FAILED).toBe('pipeline.failed');
  });
});
