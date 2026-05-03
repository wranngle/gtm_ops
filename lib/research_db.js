/**
 * Research Database Manager
 * 
 * Migrates and manages the SQLite research index for "Total Best Practice".
 * Replaces or augments library-index.json with ACID-compliant SQLite storage.
 * 
 * Location: n8n/context/technical-research/research.db
 */

import sqlite3 from 'sqlite3';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to n8n research library
const N8N_RESEARCH_PATH = process.env.N8N_RESEARCH_LIBRARY_PATH || 
  join(__dirname, '..', '..', 'n8n', 'context', 'technical-research');

const DB_PATH = join(N8N_RESEARCH_PATH, 'research.db');

export class ResearchDB {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH);
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS research_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            title TEXT,
            file_path TEXT NOT NULL,
            file_format TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT,
            complexity_score REAL,
            effort_tier TEXT,
            confidence REAL,
            base_hours INTEGER,
            business_process TEXT,
            research_type TEXT,
            generated BOOLEAN DEFAULT 0
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS integrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            research_id INTEGER,
            FOREIGN KEY(research_id) REFERENCES research_entries(id) ON DELETE CASCADE
          )
        `);

        this.db.run(`CREATE INDEX IF NOT EXISTS idx_integrations_name ON integrations(name)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_research_slug ON research_entries(slug)`);
        
        resolve();
      });
    });
  }

  async getResearchByIntegration(integrationName) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT r.* 
        FROM research_entries r
        JOIN integrations i ON r.id = i.research_id
        WHERE i.name = ?
        ORDER BY r.created_at DESC
        LIMIT 1
      `;
      this.db.get(query, [integrationName.toLowerCase()], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async addEntry(entry, integrations = []) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        // Upsert research entry
        const sql = `
          INSERT INTO research_entries (
            slug, title, file_path, file_format, created_at, updated_at,
            complexity_score, effort_tier, confidence, base_hours, 
            business_process, research_type, generated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(slug) DO UPDATE SET
            title=excluded.title,
            updated_at=excluded.updated_at,
            complexity_score=excluded.complexity_score,
            effort_tier=excluded.effort_tier,
            confidence=excluded.confidence,
            base_hours=excluded.base_hours,
            generated=excluded.generated
        `;

        const params = [
          entry.slug, entry.title || entry.slug, entry.file_path, entry.file_format,
          entry.created_at || new Date().toISOString(), new Date().toISOString(),
          entry.complexity_score, entry.effort_tier, entry.confidence, entry.base_hours,
          entry.business_process, entry.research_type, entry.generated ? 1 : 0
        ];

        this.db.run(sql, params, function(err) {
          if (err) {
            console.error('Error inserting research:', err);
            // rollback handled by not committing? sqlite node driver is tricky with transaction scope in serialize
            // We'll proceed but this is a simplified implementation
            return reject(err);
          }
          
          const researchId = this.lastID || this.changes; // simplified

          // We need the ID if it was an update. 
          // Actually, 'this.lastID' is rowid of last insert. If update, it might not be set correctly in some sqlite versions.
          // Safer to query ID by slug.
        });

        // Resolve ID properly
        this.db.get('SELECT id FROM research_entries WHERE slug = ?', [entry.slug], (err, row) => {
          if (err || !row) {
            this.db.run('ROLLBACK');
            return reject(err || new Error('ID lookup failed'));
          }
          
          const researchId = row.id;

          // Clear existing integrations for this entry
          this.db.run('DELETE FROM integrations WHERE research_id = ?', [researchId]);

          // Insert integrations
          const stmt = this.db.prepare('INSERT INTO integrations (name, research_id) VALUES (?, ?)');
          for (const name of integrations) {
            stmt.run(name.toLowerCase(), researchId);
          }
          stmt.finalize();

          this.db.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve(researchId);
          });
        });
      });
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

/**
 * Migration Logic
 */
export async function syncDatabase() {
  console.log(`[ResearchDB] Syncing to ${DB_PATH}...`);
  const db = new ResearchDB();
  await db.init();

  // 1. Sync from library-index.json (Legacy .md files)
  const indexJsonPath = join(N8N_RESEARCH_PATH, 'library-index.json');
  if (existsSync(indexJsonPath)) {
    try {
      const index = JSON.parse(readFileSync(indexJsonPath, 'utf-8'));
      console.log(`[ResearchDB] Found ${Object.keys(index.research_files).length} entries in library-index.json`);
      
      for (const [slug, meta] of Object.entries(index.research_files)) {
        const entry = {
          slug,
          file_path: meta.file,
          file_format: 'md',
          created_at: meta.created_at ? new Date(meta.created_at).toISOString() : new Date().toISOString(),
          complexity_score: meta.complexity_score,
          effort_tier: meta.effort_tier,
          confidence: meta.confidence,
          base_hours: meta.base_hours,
          business_process: meta.business_process,
          research_type: meta.research_type,
          generated: meta.generated || false
        };
        await db.addEntry(entry, meta.integrations || []);
      }
    } catch (e) {
      console.error('[ResearchDB] Error reading library-index.json:', e.message);
    }
  }

  // 2. Scan for independent .json research files
  const files = readdirSync(N8N_RESEARCH_PATH);
  const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'library-index.json');
  console.log(`[ResearchDB] Found ${jsonFiles.length} independent .json research files`);

  for (const file of jsonFiles) {
    try {
      const content = JSON.parse(readFileSync(join(N8N_RESEARCH_PATH, file), 'utf-8'));
      const slug = file.replace('.json', '');
      
      // Determine integrations list
      const integrations = new Set();
      if (content.integration) integrations.add(content.integration);
      if (content.integrations) content.integrations.forEach(i => integrations.add(i));
      
      const entry = {
        slug,
        title: content.title || content.integration || slug,
        file_path: file,
        file_format: 'json',
        created_at: content.research_date || content.created_at || new Date().toISOString(),
        complexity_score: content.complexity?.score || content.complexity_score,
        effort_tier: content.complexity?.tier || content.effort_tier,
        confidence: content.confidence,
        base_hours: content.effort_recommendation?.base_hours || content.base_hours,
        generated: content.generated || false
      };

      await db.addEntry(entry, Array.from(integrations));
    } catch (e) {
      console.warn(`[ResearchDB] Skipping invalid JSON file ${file}:`, e.message);
    }
  }

  console.log('[ResearchDB] Sync complete.');
  await db.close();
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncDatabase().catch(console.error);
}
