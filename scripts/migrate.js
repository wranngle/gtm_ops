#!/usr/bin/env bun
/**
 * Database Migration Runner
 *
 * Usage:
 *   node scripts/migrate.js up     - Run all pending migrations
 *   node scripts/migrate.js down   - Rollback last migration
 *   node scripts/migrate.js status - Show migration status
 *
 * Requires DATABASE_URL environment variable for PostgreSQL.
 * Falls back to SQLite if not set (with limited migration support).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function getPostgresClient() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.startsWith('postgres')) {
    throw new Error('DATABASE_URL must be set to a PostgreSQL connection string');
  }

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: dbUrl });
  return pool;
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(pool) {
  const result = await pool.query(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  return result.rows.map((r) => r.version);
}

function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.sql') && !f.includes('.down.'))
    .sort();
}

async function runMigration(pool, filename, direction = 'up') {
  const filePath =
    direction === 'up'
      ? path.join(MIGRATIONS_DIR, filename)
      : path.join(MIGRATIONS_DIR, filename.replace('.sql', '.down.sql'));

  if (!fs.existsSync(filePath)) {
    throw new Error(`Migration file not found: ${filePath}`);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  const version = filename.replace('.sql', '');

  console.log(`${direction === 'up' ? 'Applying' : 'Rolling back'}: ${version}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Run migration SQL
    await client.query(sql);

    // Update migrations table
    if (direction === 'up') {
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [version]
      );
    } else {
      await client.query(
        'DELETE FROM schema_migrations WHERE version = $1',
        [version]
      );
    }

    await client.query('COMMIT');
    console.log(`  ✓ ${direction === 'up' ? 'Applied' : 'Rolled back'}: ${version}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function migrateUp() {
  const pool = await getPostgresClient();

  try {
    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);
    const files = getMigrationFiles();

    const pending = files.filter(
      (f) => !applied.includes(f.replace('.sql', ''))
    );

    if (pending.length === 0) {
      console.log('No pending migrations');
      return;
    }

    console.log(`Found ${pending.length} pending migration(s)`);

    for (const file of pending) {
      await runMigration(pool, file, 'up');
    }

    console.log('All migrations applied successfully');
  } finally {
    await pool.end();
  }
}

async function migrateDown() {
  const pool = await getPostgresClient();

  try {
    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);

    if (applied.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    const lastVersion = applied[applied.length - 1];
    const filename = `${lastVersion}.sql`;

    await runMigration(pool, filename, 'down');
    console.log('Rollback completed successfully');
  } finally {
    await pool.end();
  }
}

async function showStatus() {
  const pool = await getPostgresClient();

  try {
    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);
    const files = getMigrationFiles();

    console.log('Migration Status:');
    console.log('=================');

    for (const file of files) {
      const version = file.replace('.sql', '');
      const status = applied.includes(version) ? '✓' : '○';
      console.log(`  ${status} ${version}`);
    }

    const pending = files.filter(
      (f) => !applied.includes(f.replace('.sql', ''))
    );
    console.log('');
    console.log(
      `Applied: ${applied.length}, Pending: ${pending.length}`
    );
  } finally {
    await pool.end();
  }
}

// Main
const command = process.argv[2];

switch (command) {
  case 'up':
    migrateUp().catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
    break;
  case 'down':
    migrateDown().catch((err) => {
      console.error('Rollback failed:', err.message);
      process.exit(1);
    });
    break;
  case 'status':
    showStatus().catch((err) => {
      console.error('Status check failed:', err.message);
      process.exit(1);
    });
    break;
  default:
    console.log('Usage: node scripts/migrate.js [up|down|status]');
    console.log('');
    console.log('Commands:');
    console.log('  up     - Apply all pending migrations');
    console.log('  down   - Rollback the last applied migration');
    console.log('  status - Show migration status');
    console.log('');
    console.log('Environment:');
    console.log('  DATABASE_URL - PostgreSQL connection string (required)');
    process.exit(1);
}
