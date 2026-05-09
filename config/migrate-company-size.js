import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'presales.db');

const companySizeRows = [
  { category: 'company_size', factor_key: 'smb', factor_label: 'Small Business (<100)', multiplier: 1, criteria: '["1-99 employees"]' },
  { category: 'company_size', factor_key: 'mid_market', factor_label: 'Mid-Market (100-500)', multiplier: 1.15, criteria: '["100-500 employees"]' },
  { category: 'company_size', factor_key: 'enterprise', factor_label: 'Enterprise (501-2000)', multiplier: 1.3, criteria: '["501-2000 employees"]' },
  { category: 'company_size', factor_key: 'large_enterprise', factor_label: 'Large Enterprise (2000+)', multiplier: 1.5, criteria: '["2000+ employees"]' },
];

async function run() {
  console.log('Migrating company_size adjustment factors into presales.db...\n');

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO adjustment_factors (category, factor_key, factor_label, multiplier, criteria)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const r of companySizeRows) {
    stmt.run([r.category, r.factor_key, r.factor_label, r.multiplier, r.criteria]);
    console.log(`  ✓ ${r.factor_key} → ${r.multiplier}×`);
  }

  stmt.free();

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log('\nDone. 4 company_size rows inserted.');
}

run().catch(console.error);
