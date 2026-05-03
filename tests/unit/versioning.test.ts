/**
 * Unit Tests for lib/versioning.js
 *
 * Tests document versioning functionality:
 * - Version creation and tracking
 * - Version listing and retrieval
 * - Rollback to previous versions
 * - Version comparison/diff
 * - Cleanup of old versions
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_FILES_DIR = path.join(__dirname, '..', '..', 'config', 'test_artifacts');

let VersionManager: any;
let HistoryManager: any;
let MAX_VERSIONS: any;
let testDbPath: string;

beforeEach(async () => {
  // Create unique database path for each test
  testDbPath = path.join(__dirname, '..', '..', 'config', `versioning_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);

  // Clean up test files
  if (fs.existsSync(TEST_FILES_DIR)) {
    fs.rmSync(TEST_FILES_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_FILES_DIR, { recursive: true });

  const historyModule = await import('../../lib/history.js');
  HistoryManager = historyModule.HistoryManager;

  const versionModule = await import('../../lib/versioning.js');
  VersionManager = versionModule.VersionManager;
  MAX_VERSIONS = versionModule.MAX_VERSIONS;
});

afterEach(async () => {
  // Clean up test files
  if (fs.existsSync(TEST_FILES_DIR)) {
    try {
      fs.rmSync(TEST_FILES_DIR, { recursive: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
  if (testDbPath && fs.existsSync(testDbPath)) {
    try {
      fs.unlinkSync(testDbPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
});

// Helper to create a test file with content
function createTestFile(name: string, content: any): string {
  const filePath = path.join(TEST_FILES_DIR, name);
  const contentStr = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
  fs.writeFileSync(filePath, contentStr);
  return filePath;
}

describe('[P0] VersionManager - Content Hashing', () => {
  it('[P0] should generate consistent content hash', () => {
    // GIVEN: A file with content
    const filePath = createTestFile('test.json', { foo: 'bar' });

    // WHEN: Generating hash twice
    const hash1 = VersionManager.generateContentHash(filePath);
    const hash2 = VersionManager.generateContentHash(filePath);

    // THEN: Hashes should be identical
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA256 hex
  });

  it('[P0] should return null for non-existent file', () => {
    const hash = VersionManager.generateContentHash('/nonexistent/file.txt');
    expect(hash).toBeNull();
  });

  it('[P0] should generate different hashes for different content', () => {
    // GIVEN: Two files with different content
    const file1 = createTestFile('file1.json', { a: 1 });
    const file2 = createTestFile('file2.json', { a: 2 });

    // WHEN: Generating hashes
    const hash1 = VersionManager.generateContentHash(file1);
    const hash2 = VersionManager.generateContentHash(file2);

    // THEN: Hashes should differ
    expect(hash1).not.toBe(hash2);
  });
});

describe('[P0] VersionManager - Version Creation', () => {
  it('[P0] should create first version with version=1', async () => {
    // GIVEN: A version manager and test file
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);
    const filePath = createTestFile('artifact.json', { test: true });

    // WHEN: Creating first version
    const artifact = await manager.createVersion(1, 'json', filePath);

    // THEN: Version should be 1
    expect(artifact.version).toBe(1);
    expect(artifact.previousVersionId).toBeNull();

    await manager.close();
  });

  it('[P0] should increment version for subsequent artifacts', async () => {
    // GIVEN: A version manager with existing version
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);
    const file1 = createTestFile('v1.json', { version: 1 });
    const file2 = createTestFile('v2.json', { version: 2 });

    // Create first version
    const v1 = await manager.createVersion(1, 'json', file1);

    // WHEN: Creating second version
    const v2 = await manager.createVersion(1, 'json', file2);

    // THEN: Version should be incremented and linked
    expect(v2.version).toBe(2);
    expect(v2.previousVersionId).toBe(v1.id);

    await manager.close();
  });
});

describe('[P0] VersionManager - Version Listing', () => {
  it('[P0] should list versions in descending order', async () => {
    // GIVEN: Multiple versions
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    for (let i = 1; i <= 5; i++) {
      const filePath = createTestFile(`v${i}.json`, { version: i });
      await manager.createVersion(1, 'json', filePath);
    }

    // WHEN: Listing versions
    const result = await manager.listVersions(1, 'json');

    // THEN: Should be in descending order
    expect(result.total).toBe(5);
    expect(result.versions[0].version).toBe(5);
    expect(result.versions[4].version).toBe(1);

    await manager.close();
  });

  it('[P0] should respect limit parameter', async () => {
    // GIVEN: Multiple versions
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    for (let i = 1; i <= 5; i++) {
      const filePath = createTestFile(`v${i}.json`, { version: i });
      await manager.createVersion(1, 'json', filePath);
    }

    // WHEN: Listing with limit
    const result = await manager.listVersions(1, 'json', { limit: 3 });

    // THEN: Should return limited results
    expect(result.versions).toHaveLength(3);
    expect(result.versions[0].version).toBe(5);

    await manager.close();
  });
});

describe('[P0] VersionManager - Version Retrieval', () => {
  it('[P0] should get specific version', async () => {
    // GIVEN: Multiple versions
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    for (let i = 1; i <= 3; i++) {
      const filePath = createTestFile(`v${i}.json`, { version: i });
      await manager.createVersion(1, 'json', filePath);
    }

    // WHEN: Getting version 2
    const artifact = await manager.getVersion(1, 'json', 2);

    // THEN: Should return correct version
    expect(artifact).not.toBeNull();
    expect(artifact.version).toBe(2);

    await manager.close();
  });

  it('[P0] should return null for non-existent version', async () => {
    // GIVEN: A version manager
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    // WHEN: Getting non-existent version
    const artifact = await manager.getVersion(999, 'json', 1);

    // THEN: Should return null
    expect(artifact).toBeNull();

    await manager.close();
  });

  it('[P0] should get latest version', async () => {
    // GIVEN: Multiple versions
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    for (let i = 1; i <= 3; i++) {
      const filePath = createTestFile(`v${i}.json`, { version: i });
      await manager.createVersion(1, 'json', filePath);
    }

    // WHEN: Getting latest
    const artifact = await manager.getLatestVersion(1, 'json');

    // THEN: Should return version 3
    expect(artifact.version).toBe(3);

    await manager.close();
  });
});

describe('[P1] VersionManager - Rollback', () => {
  it('[P1] should rollback to previous version', async () => {
    // GIVEN: Multiple versions
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    const file1 = createTestFile('v1.json', { data: 'original' });
    const file2 = createTestFile('v2.json', { data: 'modified' });

    await manager.createVersion(1, 'json', file1);
    await manager.createVersion(1, 'json', file2);

    // WHEN: Rolling back to version 1
    const result = await manager.rollback(1, 'json', 1);

    // THEN: Should create new version 3 based on version 1
    expect(result.version).toBe(3);
    expect(result.rollback_from).toBe(1);

    await manager.close();
  });

  it('[P1] should throw error for non-existent version', async () => {
    // GIVEN: A version manager
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    // WHEN/THEN: Rolling back to non-existent version should throw
    await expect(manager.rollback(1, 'json', 99))
      .rejects.toThrow('not found');

    await manager.close();
  });
});

describe('[P1] VersionManager - Version Comparison', () => {
  it('[P1] should detect same content via hash', async () => {
    // GIVEN: Two versions with same content
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    const content = { data: 'same' };
    const file1 = createTestFile('v1.json', content);
    await manager.createVersion(1, 'json', file1);

    const file2 = createTestFile('v2.json', content);
    await manager.createVersion(1, 'json', file2);

    // WHEN: Comparing versions
    const diff = await manager.compareVersions(1, 'json', 1, 2);

    // THEN: Should detect same content
    expect(diff.same_content).toBe(true);
    expect(diff.diff.summary).toBe('No changes');

    await manager.close();
  });

  it('[P1] should compute JSON diff for different content', async () => {
    // GIVEN: Two versions with different content
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    const file1 = createTestFile('v1.json', {
      intake: { client_name: 'Acme' },
      estimate: { total_price: 5000 }
    });
    await manager.createVersion(1, 'json', file1);

    const file2 = createTestFile('v2.json', {
      intake: { client_name: 'Acme Corp' },
      estimate: { total_price: 7500 }
    });
    await manager.createVersion(1, 'json', file2);

    // WHEN: Comparing versions
    const diff = await manager.compareVersions(1, 'json', 1, 2);

    // THEN: Should have detailed diff
    expect(diff.same_content).toBe(false);
    expect(diff.diff.changed.length).toBeGreaterThan(0);

    await manager.close();
  });

  it('[P1] should throw error comparing non-existent versions', async () => {
    // GIVEN: A version manager
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    // WHEN/THEN: Comparing non-existent versions should throw
    await expect(manager.compareVersions(1, 'json', 1, 2))
      .rejects.toThrow('not found');

    await manager.close();
  });
});

describe('[P1] VersionManager - Version Cleanup', () => {
  it('[P1] should cleanup old versions beyond limit', async () => {
    // GIVEN: More versions than MAX_VERSIONS
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    // Create MAX_VERSIONS + 3 versions
    for (let i = 1; i <= MAX_VERSIONS + 3; i++) {
      const filePath = createTestFile(`v${i}.json`, { version: i });
      await manager.createVersion(1, 'json', filePath);
    }

    // WHEN: Listing versions (cleanup happens during creation)
    const result = await manager.listVersions(1, 'json', { includeDeleted: false });

    // THEN: Should only have MAX_VERSIONS
    expect(result.total).toBe(MAX_VERSIONS);

    await manager.close();
  });

  it('[P1] should soft-delete old versions (keep metadata)', async () => {
    // GIVEN: More versions than limit
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    for (let i = 1; i <= 12; i++) {
      const filePath = createTestFile(`v${i}.json`, { version: i });
      await manager.createVersion(1, 'json', filePath);
    }

    // WHEN: Listing with includeDeleted
    const withDeleted = await manager.listVersions(1, 'json', {
      limit: 20,
      includeDeleted: true
    });
    const withoutDeleted = await manager.listVersions(1, 'json', {
      limit: 20,
      includeDeleted: false
    });

    // THEN: Should have deleted versions available but not active
    expect(withDeleted.total).toBeGreaterThan(withoutDeleted.total);

    await manager.close();
  });
});

describe('[P1] VersionManager - Version History', () => {
  it('[P1] should get version history with file status', async () => {
    // GIVEN: Versions where some files may exist
    const history = new HistoryManager(testDbPath);
    const manager = new VersionManager(history);

    const file1 = createTestFile('v1.json', { v: 1 });
    await manager.createVersion(1, 'json', file1);

    const file2 = createTestFile('v2.json', { v: 2 });
    await manager.createVersion(1, 'json', file2);

    // Delete the second file
    fs.unlinkSync(file2);

    // WHEN: Getting version history
    const historyResult = await manager.getVersionHistory(1, 'json');

    // THEN: Should show file existence status
    expect(historyResult).toHaveLength(2);
    const v1 = historyResult.find((h: any) => h.version === 1);
    const v2 = historyResult.find((h: any) => h.version === 2);

    expect(v1?.file_exists).toBe(true);
    expect(v2?.file_exists).toBe(false);

    await manager.close();
  });
});
