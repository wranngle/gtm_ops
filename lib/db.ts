// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.


/**
 * Database Abstraction Layer
 *
 * Provides unified interface for both SQLite and PostgreSQL.
 * Automatically detects database type from DATABASE_URL environment variable.
 *
 * Usage:
 *   import { getDb, query, transaction } from './db.js';
 *   const rows = await query('SELECT * FROM users WHERE id = $1', [userId]);
 */
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Database types
export const DbType = {
  SQLITE: 'sqlite',
  POSTGRESQL: 'postgresql',
};

// Detect database type from environment
export function detectDbType() {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
    return DbType.POSTGRESQL;
  }

  return DbType.SQLITE;
}

/**
 * Convert PostgreSQL-style parameters ($1, $2) to SQLite-style (?)
 */
function convertParams(sql, dbType) {
  if (dbType === DbType.SQLITE) {
    // Replace $1, $2, etc. with ?
    return sql.replaceAll(/\$\d+/g, '?');
  }

  return sql;
}

/**
 * SQLite Database Adapter
 */
class SqliteAdapter {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '..', 'config', 'presales.db');
    this.db = null;
    this.type = DbType.SQLITE;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) return reject(err);
        // Enable foreign keys
        this.db.run('PRAGMA foreign_keys = ON', (err) => {
          if (err) console.warn('Could not enable foreign keys:', err.message);
          resolve(this);
        });
      });
    });
  }

  async query(sql, params = []) {
    const convertedSql = convertParams(sql, this.type);
    return new Promise((resolve, reject) => {
      this.db.all(convertedSql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  async queryOne(sql, params = []) {
    const convertedSql = convertParams(sql, this.type);
    return new Promise((resolve, reject) => {
      this.db.get(convertedSql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  async run(sql, params = []) {
    const convertedSql = convertParams(sql, this.type);
    return new Promise((resolve, reject) => {
      this.db.run(convertedSql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  async transaction(callback) {
    await this.run('BEGIN TRANSACTION');
    try {
      const result = await callback(this);
      await this.run('COMMIT');
      return result;
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }
      this.db.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        this.db = null;
        resolve();
      });
    });
  }
}

/**
 * PostgreSQL Database Adapter (placeholder - requires 'pg' package)
 */
class PostgresAdapter {
  constructor(connectionString) {
    this.connectionString = connectionString || process.env.DATABASE_URL;
    this.pool = null;
    this.type = DbType.POSTGRESQL;
  }

  async connect() {
    // Dynamic import to avoid errors when pg is not installed
    try {
      const { Pool } = await import('pg');
      this.pool = new Pool({
        connectionString: this.connectionString,
        min: 2,
        max: 20,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5000,
      });

      // Test connection
      const client = await this.pool.connect();
      client.release();
      return this;
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error('PostgreSQL driver (pg) not installed. Run: npm install pg');
      }

      throw error;
    }
  }

  async query(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  async queryOne(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return result.rows[0] || null;
  }

  async run(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return { rowCount: result.rowCount, rows: result.rows };
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback({
        query: (sql, params) => client.query(sql, params).then((r) => r.rows),
        queryOne: (sql, params) => client.query(sql, params).then((r) => r.rows[0] || null),
        run: (sql, params) => client.query(sql, params),
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

// Singleton database instance
let dbInstance = null;

/**
 * Get or create database instance
 */
export async function getDb(options = {}) {
  if (dbInstance) return dbInstance;

  const dbType = options.type || detectDbType();

  dbInstance = dbType === DbType.POSTGRESQL ? new PostgresAdapter(options.connectionString) : new SqliteAdapter(options.dbPath);

  await dbInstance.connect();
  return dbInstance;
}

/**
 * Execute a query (convenience function)
 */
export async function query(sql, params = []) {
  const db = await getDb();
  return db.query(sql, params);
}

/**
 * Execute a query and return single row
 */
export async function queryOne(sql, params = []) {
  const db = await getDb();
  return db.queryOne(sql, params);
}

/**
 * Execute a write query (INSERT, UPDATE, DELETE)
 */
export async function run(sql, params = []) {
  const db = await getDb();
  return db.run(sql, params);
}

/**
 * Execute queries in a transaction
 */
export async function transaction(callback) {
  const db = await getDb();
  return db.transaction(callback);
}

/**
 * Close database connection
 */
export async function closeDb() {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Reset database instance (for testing)
 */
export function resetDbInstance() {
  dbInstance = null;
}

export { SqliteAdapter, PostgresAdapter };
