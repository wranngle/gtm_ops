/**
 * Document Versioning Module
 *
 * Provides version management, rollback, and diff functionality for artifacts.
 * Builds on top of HistoryManager to provide higher-level versioning operations.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { HistoryManager } from './history.js';

const MAX_VERSIONS = 10;

export class VersionManager {
  constructor(historyManager = null) {
    this.history = historyManager || new HistoryManager();
  }

  /**
   * Generate content hash for a file
   */
  static generateContentHash(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Create a new version of an artifact
   */
  async createVersion(executionId, type, filePath) {
    const contentHash = VersionManager.generateContentHash(filePath);

    // Create the new artifact with version tracking
    const artifact = await this.history.addArtifact(executionId, type, filePath, contentHash);

    // Cleanup old versions beyond the limit
    await this.history.cleanupOldVersions(executionId, type, MAX_VERSIONS);

    return artifact;
  }

  /**
   * List all versions for an artifact
   */
  async listVersions(executionId, type, options = {}) {
    const { limit = MAX_VERSIONS, includeDeleted = false } = options;
    const versions = await this.history.getArtifactVersions(executionId, type, { limit, includeDeleted });

    return {
      total: versions.length,
      versions: versions.map(v => ({
        id: v.id,
        version: v.version,
        path: v.path,
        content_hash: v.content_hash,
        created_at: v.created_at,
        is_deleted: v.is_deleted === 1
      }))
    };
  }

  /**
   * Get a specific version
   */
  async getVersion(executionId, type, version) {
    return this.history.getArtifactByVersion(executionId, type, version);
  }

  /**
   * Get the latest version
   */
  async getLatestVersion(executionId, type) {
    return this.history.getLatestArtifact(executionId, type);
  }

  /**
   * Rollback to a specific version
   * Creates a new version based on the target version (preserves history)
   */
  async rollback(executionId, type, targetVersion, newFilePath = null) {
    // Get the target version
    const target = await this.history.getArtifactByVersion(executionId, type, targetVersion);

    if (!target) {
      throw new Error(`Version ${targetVersion} not found for execution ${executionId} type ${type}`);
    }

    if (target.is_deleted) {
      throw new Error(`Cannot rollback to deleted version ${targetVersion}`);
    }

    // If no new file path provided, copy from target
    let filePath = newFilePath;
    if (!filePath) {
      // Check if the source file exists
      if (!fs.existsSync(target.path)) {
        throw new Error(`Source file for version ${targetVersion} no longer exists: ${target.path}`);
      }

      // Create new file path with version suffix
      const dir = path.dirname(target.path);
      const ext = path.extname(target.path);
      const base = path.basename(target.path, ext);
      const timestamp = Date.now();
      filePath = path.join(dir, `${base}_rollback_${timestamp}${ext}`);

      // Copy the file
      fs.copyFileSync(target.path, filePath);
    }

    // Create a new version (rollback creates new version, preserving history)
    const newArtifact = await this.createVersion(executionId, type, filePath);

    return {
      ...newArtifact,
      rollback_from: targetVersion,
      path: filePath
    };
  }

  /**
   * Compare two versions and return a diff
   * Supports JSON artifacts with structured diff
   */
  async compareVersions(executionId, type, version1, version2) {
    const v1 = await this.history.getArtifactByVersion(executionId, type, version1);
    const v2 = await this.history.getArtifactByVersion(executionId, type, version2);

    if (!v1) {
      throw new Error(`Version ${version1} not found`);
    }
    if (!v2) {
      throw new Error(`Version ${version2} not found`);
    }

    // Check if files exist
    const v1Exists = fs.existsSync(v1.path);
    const v2Exists = fs.existsSync(v2.path);

    const result = {
      version1: {
        version: v1.version,
        path: v1.path,
        exists: v1Exists,
        content_hash: v1.content_hash,
        created_at: v1.created_at
      },
      version2: {
        version: v2.version,
        path: v2.path,
        exists: v2Exists,
        content_hash: v2.content_hash,
        created_at: v2.created_at
      },
      same_content: v1.content_hash === v2.content_hash,
      diff: null
    };

    // If same hash, no need to compute diff
    if (result.same_content) {
      result.diff = { summary: 'No changes' };
      return result;
    }

    // For JSON files, provide structured diff
    if (type === 'json' && v1Exists && v2Exists) {
      try {
        const content1 = JSON.parse(fs.readFileSync(v1.path, 'utf8'));
        const content2 = JSON.parse(fs.readFileSync(v2.path, 'utf8'));
        result.diff = this._computeJsonDiff(content1, content2);
      } catch (e) {
        result.diff = { error: 'Could not parse JSON for diff', message: e.message };
      }
    } else if (v1Exists && v2Exists) {
      // For other file types, just note that they're different
      result.diff = {
        summary: 'Files differ',
        hash_change: `${v1.content_hash?.slice(0, 8)} → ${v2.content_hash?.slice(0, 8)}`
      };
    } else {
      result.diff = {
        summary: 'Cannot compute diff - one or both files missing',
        v1_exists: v1Exists,
        v2_exists: v2Exists
      };
    }

    return result;
  }

  /**
   * Compute a structured diff between two JSON objects
   * Focuses on key business fields for presales documents
   */
  _computeJsonDiff(obj1, obj2, path = '') {
    const diff = {
      added: [],
      removed: [],
      changed: [],
      summary: {}
    };

    // Key fields to highlight in summary
    const summaryFields = [
      'intake.client_name',
      'intake.project_name',
      'estimate.tier_key',
      'estimate.total_price',
      'estimate.total_hours',
      'estimate.pricing.total',
      'audit.overall_score',
      'research.tier_key'
    ];

    const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

    for (const key of allKeys) {
      const fullPath = path ? `${path}.${key}` : key;
      const val1 = obj1?.[key];
      const val2 = obj2?.[key];

      if (val1 === undefined) {
        diff.added.push({ path: fullPath, value: val2 });
      } else if (val2 === undefined) {
        diff.removed.push({ path: fullPath, value: val1 });
      } else if (typeof val1 === 'object' && typeof val2 === 'object' && val1 !== null && val2 !== null) {
        // Recurse for nested objects (but not arrays for simplicity)
        if (!Array.isArray(val1) && !Array.isArray(val2)) {
          const nestedDiff = this._computeJsonDiff(val1, val2, fullPath);
          diff.added.push(...nestedDiff.added);
          diff.removed.push(...nestedDiff.removed);
          diff.changed.push(...nestedDiff.changed);
          Object.assign(diff.summary, nestedDiff.summary);
        } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
          diff.changed.push({
            path: fullPath,
            from: Array.isArray(val1) ? `[${val1.length} items]` : val1,
            to: Array.isArray(val2) ? `[${val2.length} items]` : val2
          });
        }
      } else if (val1 !== val2) {
        const change = { path: fullPath, from: val1, to: val2 };
        diff.changed.push(change);

        // Add to summary if it's a key field
        if (summaryFields.some(sf => fullPath.startsWith(sf) || fullPath === sf)) {
          diff.summary[fullPath] = change;
        }
      }
    }

    return diff;
  }

  /**
   * Get version history with file status
   */
  async getVersionHistory(executionId, type) {
    const versions = await this.history.getArtifactVersions(executionId, type, {
      limit: MAX_VERSIONS,
      includeDeleted: true
    });

    return versions.map(v => ({
      ...v,
      file_exists: fs.existsSync(v.path),
      is_deleted: v.is_deleted === 1
    }));
  }

  /**
   * Close the underlying database connection
   */
  async close() {
    if (this.history && typeof this.history.close === 'function') {
      await this.history.close();
    }
  }
}

export { MAX_VERSIONS };
