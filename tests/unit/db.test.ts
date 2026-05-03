/**
 * Unit Tests for lib/db.js
 *
 * Tests database abstraction layer:
 * - SQLite adapter
 * - Parameter conversion
 * - Database type detection
 * - Singleton pattern
 * - Transaction handling
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let SqliteAdapter: any;
let DbType: any;
let detectDbType: any;
let resetDbInstance: any;
let testDbPath: string;

beforeEach(async () => {
  // Create unique database path for each test
  testDbPath = path.join(
    __dirname,
    '..',
    '..',
    'config',
    `db_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`
  );

  // Reset module state
  const module = await import('../../lib/db.js');
  SqliteAdapter = module.SqliteAdapter;
  DbType = module.DbType;
  detectDbType = module.detectDbType;
  resetDbInstance = module.resetDbInstance;

  // Reset singleton between tests
  resetDbInstance();
});

afterEach(async () => {
  // Reset singleton
  resetDbInstance();

  // Clean up test database
  if (testDbPath && fs.existsSync(testDbPath)) {
    try {
      fs.unlinkSync(testDbPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
});

describe('[P0] Database Type Detection', () => {
  it('[P0] should detect SQLite by default', () => {
    // GIVEN: No DATABASE_URL set
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      // WHEN: Detecting database type
      const dbType = detectDbType();

      // THEN: Should be SQLite
      expect(dbType).toBe(DbType.SQLITE);
    } finally {
      if (originalUrl) process.env.DATABASE_URL = originalUrl;
    }
  });

  it('[P0] should detect PostgreSQL from postgres:// URL', () => {
    // GIVEN: PostgreSQL URL
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';

    try {
      // WHEN: Detecting database type
      const dbType = detectDbType();

      // THEN: Should be PostgreSQL
      expect(dbType).toBe(DbType.POSTGRESQL);
    } finally {
      if (originalUrl) {
        process.env.DATABASE_URL = originalUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  it('[P0] should detect PostgreSQL from postgresql:// URL', () => {
    // GIVEN: PostgreSQL URL with full prefix
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';

    try {
      // WHEN: Detecting database type
      const dbType = detectDbType();

      // THEN: Should be PostgreSQL
      expect(dbType).toBe(DbType.POSTGRESQL);
    } finally {
      if (originalUrl) {
        process.env.DATABASE_URL = originalUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });
});

describe('[P0] SQLite Adapter - Connection', () => {
  it('[P0] should connect to database', async () => {
    // GIVEN: SQLite adapter
    const adapter = new SqliteAdapter(testDbPath);

    // WHEN: Connecting
    const result = await adapter.connect();

    // THEN: Should return adapter instance
    expect(result).toBe(adapter);
    expect(adapter.db).not.toBeNull();

    await adapter.close();
  });

  it('[P0] should create database file on connect', async () => {
    // GIVEN: Non-existent database path
    expect(fs.existsSync(testDbPath)).toBe(false);

    // WHEN: Connecting
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();

    // THEN: File should exist
    expect(fs.existsSync(testDbPath)).toBe(true);

    await adapter.close();
  });

  it('[P0] should close connection', async () => {
    // GIVEN: Connected adapter
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();

    // WHEN: Closing
    await adapter.close();

    // THEN: db should be null
    expect(adapter.db).toBeNull();
  });
});

describe('[P0] SQLite Adapter - Query Operations', () => {
  it('[P0] should execute query and return rows', async () => {
    // GIVEN: Connected adapter with a table
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    await adapter.run('INSERT INTO test (name) VALUES (?)', ['Alice']);
    await adapter.run('INSERT INTO test (name) VALUES (?)', ['Bob']);

    // WHEN: Querying
    const rows = await adapter.query('SELECT * FROM test ORDER BY id');

    // THEN: Should return all rows
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Alice');
    expect(rows[1].name).toBe('Bob');

    await adapter.close();
  });

  it('[P0] should execute queryOne and return single row', async () => {
    // GIVEN: Connected adapter with data
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    await adapter.run('INSERT INTO test (name) VALUES (?)', ['Alice']);

    // WHEN: Querying one
    const row = await adapter.queryOne('SELECT * FROM test WHERE id = ?', [1]);

    // THEN: Should return single row
    expect(row).not.toBeNull();
    expect(row.name).toBe('Alice');

    await adapter.close();
  });

  it('[P0] should return null for non-existent row', async () => {
    // GIVEN: Connected adapter with empty table
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

    // WHEN: Querying non-existent row
    const row = await adapter.queryOne('SELECT * FROM test WHERE id = ?', [999]);

    // THEN: Should return null
    expect(row).toBeNull();

    await adapter.close();
  });

  it('[P0] should return empty array for no results', async () => {
    // GIVEN: Connected adapter with empty table
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

    // WHEN: Querying empty table
    const rows = await adapter.query('SELECT * FROM test');

    // THEN: Should return empty array
    expect(rows).toEqual([]);

    await adapter.close();
  });
});

describe('[P0] SQLite Adapter - Parameter Conversion', () => {
  it('[P0] should convert PostgreSQL-style $1 params to ?', async () => {
    // GIVEN: Connected adapter
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, value INTEGER)');

    // WHEN: Using PostgreSQL-style parameters
    await adapter.run('INSERT INTO test (name, value) VALUES ($1, $2)', ['Test', 42]);

    // THEN: Should insert correctly
    const row = await adapter.queryOne('SELECT * FROM test WHERE name = $1', ['Test']);
    expect(row).not.toBeNull();
    expect(row.name).toBe('Test');
    expect(row.value).toBe(42);

    await adapter.close();
  });

  it('[P0] should handle multiple $N parameters', async () => {
    // GIVEN: Connected adapter
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (a TEXT, b TEXT, c TEXT)');

    // WHEN: Using multiple PostgreSQL params
    await adapter.run('INSERT INTO test (a, b, c) VALUES ($1, $2, $3)', ['X', 'Y', 'Z']);

    // THEN: Should insert in correct order
    const row = await adapter.queryOne('SELECT * FROM test');
    expect(row.a).toBe('X');
    expect(row.b).toBe('Y');
    expect(row.c).toBe('Z');

    await adapter.close();
  });
});

describe('[P0] SQLite Adapter - Run Operations', () => {
  it('[P0] should return lastID for INSERT', async () => {
    // GIVEN: Connected adapter
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

    // WHEN: Inserting
    const result = await adapter.run('INSERT INTO test (name) VALUES (?)', ['Alice']);

    // THEN: Should have lastID
    expect(result.lastID).toBe(1);

    await adapter.close();
  });

  it('[P0] should return changes for UPDATE', async () => {
    // GIVEN: Connected adapter with data
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    await adapter.run('INSERT INTO test (name) VALUES (?)', ['Alice']);
    await adapter.run('INSERT INTO test (name) VALUES (?)', ['Bob']);

    // WHEN: Updating
    const result = await adapter.run('UPDATE test SET name = ?', ['Updated']);

    // THEN: Should report changes
    expect(result.changes).toBe(2);

    await adapter.close();
  });

  it('[P0] should return changes for DELETE', async () => {
    // GIVEN: Connected adapter with data
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    await adapter.run('INSERT INTO test (name) VALUES (?)', ['Alice']);

    // WHEN: Deleting
    const result = await adapter.run('DELETE FROM test WHERE id = ?', [1]);

    // THEN: Should report changes
    expect(result.changes).toBe(1);

    await adapter.close();
  });
});

describe('[P1] SQLite Adapter - Transactions', () => {
  it('[P1] should commit successful transaction', async () => {
    // GIVEN: Connected adapter
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (id INTEGER PRIMARY KEY, value INTEGER)');

    // WHEN: Running transaction
    await adapter.transaction(async (tx) => {
      await tx.run('INSERT INTO test (value) VALUES (?)', [100]);
      await tx.run('INSERT INTO test (value) VALUES (?)', [200]);
    });

    // THEN: Both inserts should persist
    const rows = await adapter.query('SELECT * FROM test ORDER BY id');
    expect(rows).toHaveLength(2);
    expect(rows[0].value).toBe(100);
    expect(rows[1].value).toBe(200);

    await adapter.close();
  });

  it('[P1] should rollback failed transaction', async () => {
    // GIVEN: Connected adapter
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (id INTEGER PRIMARY KEY, value INTEGER)');

    // WHEN: Running failing transaction
    try {
      await adapter.transaction(async (tx) => {
        await tx.run('INSERT INTO test (value) VALUES (?)', [100]);
        throw new Error('Simulated failure');
      });
    } catch (e) {
      // Expected
    }

    // THEN: Insert should be rolled back
    const rows = await adapter.query('SELECT * FROM test');
    expect(rows).toHaveLength(0);

    await adapter.close();
  });

  it('[P1] should return value from transaction', async () => {
    // GIVEN: Connected adapter
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (id INTEGER PRIMARY KEY, value INTEGER)');

    // WHEN: Running transaction that returns value
    const result = await adapter.transaction(async (tx) => {
      await tx.run('INSERT INTO test (value) VALUES (?)', [42]);
      return 'success';
    });

    // THEN: Should return the value
    expect(result).toBe('success');

    await adapter.close();
  });
});

describe('[P1] Database Constants', () => {
  it('[P1] should have correct DbType values', () => {
    expect(DbType.SQLITE).toBe('sqlite');
    expect(DbType.POSTGRESQL).toBe('postgresql');
  });

  it('[P1] should set correct type on SQLite adapter', async () => {
    const adapter = new SqliteAdapter(testDbPath);
    expect(adapter.type).toBe(DbType.SQLITE);
  });
});

describe('[P1] SQLite Adapter - Error Handling', () => {
  it('[P1] should reject on invalid SQL', async () => {
    // GIVEN: Connected adapter
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();

    // WHEN/THEN: Invalid SQL should reject
    await expect(adapter.query('INVALID SQL STATEMENT')).rejects.toThrow();

    await adapter.close();
  });

  it('[P1] should reject on constraint violation', async () => {
    // GIVEN: Connected adapter with unique constraint
    const adapter = new SqliteAdapter(testDbPath);
    await adapter.connect();
    await adapter.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT UNIQUE)');
    await adapter.run('INSERT INTO test (name) VALUES (?)', ['Alice']);

    // WHEN/THEN: Duplicate should reject
    await expect(
      adapter.run('INSERT INTO test (name) VALUES (?)', ['Alice'])
    ).rejects.toThrow();

    await adapter.close();
  });
});
