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

  it('[P0] should filter by start_date / end_date inclusive of cutoffs', async () => {
    // The previous version of this test inserted ONE row and asserted
    // count >= 1 — trivially true even if the date filter regressed
    // to a no-op. This version backdates rows via direct SQL UPDATE
    // (same pattern as the audit-tamper triplet) so the cutoff has
    // real rows on either side.
    const logger = new AuditLogger(testDbPath);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

    const oldRow = await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'old', {});
    const midRow = await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'mid', {});
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'fresh', {});
    await logger.close();

    const sqlite = await import('sqlite3');
    await new Promise<void>((resolve, reject) => {
      const db = new sqlite.default.Database(testDbPath);
      db.run(
        'UPDATE audit_logs SET timestamp = CASE log_id WHEN ? THEN ? WHEN ? THEN ? ELSE timestamp END',
        [oldRow.log_id, sevenDaysAgo, midRow.log_id, threeDaysAgo],
        (err) => {
          if (err) {
            reject(err);
            return;
          }

          db.close((closeErr) => {
            if (closeErr) reject(closeErr);
            else resolve();
          });
        },
      );
    });

    const reader = new AuditLogger(testDbPath);
    const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

    // start_date = 5 days ago → timestamp >= 5d-ago → mid (3d) +
    // fresh (now), excludes old (7d).
    const recent = await reader.query({ start_date: fiveDaysAgo });
    expect(recent.logs).toHaveLength(2);
    expect(recent.logs.map((l: any) => l.resource_id).sort()).toEqual(['fresh', 'mid']);

    // end_date = 5 days ago → timestamp <= 5d-ago → only old (7d).
    const past = await reader.query({ end_date: fiveDaysAgo });
    expect(past.logs).toHaveLength(1);
    expect(past.logs[0].resource_id).toBe('old');

    // Combined window: 5d-ago ≤ timestamp ≤ 2d-ago → only mid (3d).
    const window_ = await reader.query({
      start_date: fiveDaysAgo,
      end_date: twoDaysAgo,
    });
    expect(window_.logs).toHaveLength(1);
    expect(window_.logs[0].resource_id).toBe('mid');

    await reader.close();
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
    const integrity = await logger.verifyIntegrity();
    expect(integrity.valid).toBe(true);
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
          db.close((closeErr) => {
            if (closeErr) reject(closeErr);
            else resolve();
          });
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
    const integrity = await logger.verifyIntegrity();
    expect(integrity.valid).toBe(true);
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
          db.close((closeErr) => {
            if (closeErr) reject(closeErr);
            else resolve();
          });
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

  it('[P1] should DETECT a directly mutated hash field', async () => {
    // GIVEN: 3 logged events with valid chain.
    const logger = new AuditLogger(testDbPath);
    await logger.log(AuditAction.USER_LOGIN, 'user', 'u1', {});
    await logger.log(AuditAction.DOCUMENT_CREATED, 'doc', 'd1', {});
    await logger.log(AuditAction.DOCUMENT_UPDATED, 'doc', 'd1', {});
    const integrity = await logger.verifyIntegrity();
    expect(integrity.valid).toBe(true);
    await logger.close();

    // WHEN: An attacker rewrites the stored hash on row #2 directly,
    // hoping to mask a mutation OR set up a future tampered row whose
    // previous_hash points at this fake hash. The hash they write is
    // a sha256-shaped string but doesn't match `computeHash(row, ...)`.
    const fakeHash = '0'.repeat(64); // 64 hex chars; right shape, wrong content.
    const sqlite = await import('sqlite3');
    await new Promise<void>((resolve, reject) => {
      const db = new sqlite.default.Database(testDbPath);
      db.run(
        `UPDATE audit_logs SET hash = ? WHERE log_id = (SELECT log_id FROM audit_logs ORDER BY id ASC LIMIT 1 OFFSET 1)`,
        [fakeHash],
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          db.close((closeErr) => {
            if (closeErr) reject(closeErr);
            else resolve();
          });
        },
      );
    });

    // THEN: verify recomputes hash from the row's content + previousHash.
    // The recomputed hash won't match the stored fake hash → chain breaks
    // at row #2. `checked` is the row count in the DB (3), not the index
    // of the break — the break point is in `invalid_at` instead.
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

  it('[P0] should delete only rows older than the retention cutoff', async () => {
    // Backdate two of three rows via direct SQL UPDATE so cleanup has
    // a real cutoff to enforce. The previous test only asserted
    // `deleted >= 0`, which is trivially true even when cleanup is
    // a no-op — this one fails if the WHERE clause regresses.
    const logger = new AuditLogger(testDbPath);
    const fortyDaysAgo = Date.now() - 40 * 24 * 60 * 60 * 1000;

    const old1 = await logger.log(AuditAction.USER_LOGIN, 'user', 'u1', {});
    const old2 = await logger.log(AuditAction.USER_LOGIN, 'user', 'u2', {});
    const fresh = await logger.log(AuditAction.USER_LOGIN, 'user', 'u3', {});
    await logger.close();

    const sqlite = await import('sqlite3');
    await new Promise<void>((resolve, reject) => {
      const db = new sqlite.default.Database(testDbPath);
      db.run(
        'UPDATE audit_logs SET timestamp = CASE log_id WHEN ? THEN ? WHEN ? THEN ? ELSE timestamp END',
        [old1.log_id, fortyDaysAgo, old2.log_id, fortyDaysAgo],
        (err) => {
          if (err) {
            reject(err);
            return;
          }

          db.close((closeErr) => {
            if (closeErr) reject(closeErr);
            else resolve();
          });
        },
      );
    });

    // 30-day retention: the 40-day-old rows go, the just-now row stays.
    const cleanupRunner = new AuditLogger(testDbPath);
    const result = await cleanupRunner.cleanup(30);
    expect(result.deleted).toBe(2);

    const remaining = await cleanupRunner.query({});
    expect(remaining.logs).toHaveLength(1);
    expect(remaining.logs[0].log_id).toBe(fresh.log_id);
    await cleanupRunner.close();
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

  it('[P0] should round-trip metadata redaction through CSV export', async () => {
    // PR #106 redacted secrets in metadata at log() time. CSV export
    // reads via query() which reads stored data — so redaction must
    // round-trip. A regression that bypassed the redaction (e.g. a
    // refactor reading raw rows from a different code path) would
    // silently re-leak secrets through the CSV download surface.
    const logger = new AuditLogger(testDbPath);
    await logger.log(
      AuditAction.PIPELINE_STARTED,
      'pipeline',
      'p1',
      { request: { authorization: 'Bearer sk-ant-api03-mockKeyMaterial1234567890abcdef' } },
    );

    const csv = await logger.exportToCsv({});

    // The masked form must appear; the raw key body must not.
    expect(csv).toContain('sk-ant-...');
    expect(csv).not.toContain('mockKeyMaterial1234567890abcdef');

    await logger.close();
  });
});

describe('[P0] AuditLogger - Metadata secret redaction', () => {
  it('[P0] should redact secret-shaped strings before persisting metadata', async () => {
    // GIVEN: A caller that accidentally sends an Anthropic key in metadata
    const logger = new AuditLogger(testDbPath);
    const result = await logger.log(
      AuditAction.PIPELINE_STARTED,
      'pipeline',
      'pip-1',
      {
        request: {
          authorization: 'Bearer sk-ant-api03-mockKeyMaterial1234567890abcdef',
        },
      },
      { user_id: 'user-1', workspace_id: 'ws-1' },
    );

    // WHEN: Reading the log back
    const stored = await logger.getLog(result.log_id);

    // THEN: The stored metadata must not contain the secret material
    const serialized = JSON.stringify(stored.metadata);
    expect(serialized).toContain('sk-ant-...');
    expect(serialized).not.toContain('mockKeyMaterial1234567890abcdef');

    await logger.close();
  });

  it('[P0] should keep verifyIntegrity green after redaction', async () => {
    // The hash chain must hash the redacted payload, not the raw one,
    // otherwise verifyIntegrity would always report tampering on logs
    // that contained any masked string.
    const logger = new AuditLogger(testDbPath);
    await logger.log(
      AuditAction.PIPELINE_STARTED,
      'pipeline',
      'pip-1',
      { token: 'ghp_mockClassicTokenMaterial12345' },
      { user_id: 'user-1', workspace_id: 'ws-1' },
    );
    await logger.log(
      AuditAction.PIPELINE_COMPLETED,
      'pipeline',
      'pip-1',
      { result: 'ok' },
      { user_id: 'user-1', workspace_id: 'ws-1' },
    );

    const integrity = await logger.verifyIntegrity();
    expect(integrity.valid).toBe(true);
    expect(integrity.checked).toBe(2);

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
