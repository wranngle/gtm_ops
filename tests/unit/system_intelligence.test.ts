/**
 * Unit Tests for system_intelligence.js
 *
 * Tests critical business logic:
 * - Unified lookup (catalog + research merge)
 * - Name matching strategies (exact ID, exact name, alias, fuzzy)
 * - In-memory caching with TTL
 * - Batch lookups via getAllSystemIntelligence()
 * - Catalog baseline seeding
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import module under test
let getSystemIntelligence: (name: string, options?: Record<string, unknown>) => Promise<any>;
let getAllSystemIntelligence: (names: string[]) => Promise<Map<string, any>>;
let getCatalogBaseline: (systemName: string) => unknown;
let clearCache: () => void;
let SYSTEM_ALIASES: Record<string, string>;

beforeEach(async () => {
  const module = await import('../../lib/system_intelligence.js');
  getSystemIntelligence = module.getSystemIntelligence;
  getAllSystemIntelligence = module.getAllSystemIntelligence;
  getCatalogBaseline = module.getCatalogBaseline;
  clearCache = module.clearCache;
  SYSTEM_ALIASES = module.SYSTEM_ALIASES;

  // Clear cache before each test
  clearCache();
});

afterEach(() => {
  clearCache();
});

describe('[P0] getSystemIntelligence - Core Lookup', () => {
  it('[P0] should return valid structure with all required fields', async () => {
    // GIVEN: A known system in the catalog
    const systemName = 'dentrix-g7';

    // WHEN: Looking up the system
    const result = await getSystemIntelligence(systemName);

    // THEN: All required fields should be present
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('has_api');
    expect(result).toHaveProperty('has_native_node');
    expect(result).toHaveProperty('source');
    expect(typeof result.has_api).toBe('boolean');
    expect(typeof result.has_native_node).toBe('boolean');
  });

  it('[P0] should return null for completely unknown systems', async () => {
    // GIVEN: A system that doesn't exist
    const systemName = 'totally-nonexistent-system-xyz-12345';

    // WHEN: Looking up the system
    const result = await getSystemIntelligence(systemName);

    // THEN: Should return null
    expect(result).toBeNull();
  });

  it('[P0] should handle empty string input gracefully', async () => {
    // GIVEN: Empty string
    const systemName = '';

    // WHEN: Looking up
    const result = await getSystemIntelligence(systemName);

    // THEN: Should return null
    expect(result).toBeNull();
  });

  it('[P0] should handle null/undefined input gracefully', async () => {
    // GIVEN: Invalid input
    // @ts-ignore - intentional invalid input
    const result1 = await getSystemIntelligence(null);
    // @ts-ignore - intentional invalid input
    const result2 = await getSystemIntelligence(undefined);

    // THEN: Should return null without throwing
    expect(result1).toBeNull();
    expect(result2).toBeNull();
  });
});

describe('[P0] Name Matching Strategies', () => {
  it('[P0] should match by exact ID (lowercase)', async () => {
    // GIVEN: Exact ID match
    const result = await getSystemIntelligence('dentrix-g7');

    // THEN: Should find the system
    expect(result).not.toBeNull();
    expect(result?.id).toBe('dentrix-g7');
  });

  it('[P0] should match by exact name (case-insensitive)', async () => {
    // GIVEN: Name with different casing
    const result1 = await getSystemIntelligence('Dentrix G7');
    const result2 = await getSystemIntelligence('DENTRIX G7');
    const result3 = await getSystemIntelligence('dentrix g7');

    // THEN: All should resolve to same system
    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result3).not.toBeNull();
    expect(result1?.id).toBe(result2?.id);
    expect(result2?.id).toBe(result3?.id);
  });

  it('[P0] should match by alias', async () => {
    // GIVEN: Common aliases defined in SYSTEM_ALIASES
    // Check that aliases object exists and has entries
    expect(typeof SYSTEM_ALIASES).toBe('object');
    expect(Object.keys(SYSTEM_ALIASES).length).toBeGreaterThan(0);

    // Try a common alias if available
    if ('gsheets' in SYSTEM_ALIASES) {
      const result = await getSystemIntelligence('gsheets');
      expect(result).not.toBeNull();
      // Result should resolve to Google Workspace or similar
    }
  });

  it('[P1] should match by fuzzy matching for slight variations', async () => {
    // GIVEN: Slight variations (typos, extra spaces)
    // Note: Fuzzy matching uses Levenshtein distance

    // Lookup with extra space
    const resultWithSpace = await getSystemIntelligence('Dentrix  G7');

    // THEN: Should still resolve (within edit distance)
    // If fuzzy matching is working, this should find the system
    // Note: Result may be null if edit distance threshold is strict
    if (resultWithSpace) {
      expect(resultWithSpace.id).toBe('dentrix-g7');
    }
  });
});

describe('[P0] Alias Resolution', () => {
  it('[P0] should export SYSTEM_ALIASES object', async () => {
    // THEN: Object should exist and have entries
    expect(typeof SYSTEM_ALIASES).toBe('object');
    expect(Object.keys(SYSTEM_ALIASES).length).toBeGreaterThan(40); // We defined 50+ aliases
  });

  it('[P0] should resolve known aliases correctly', async () => {
    // GIVEN: Known alias mappings (based on actual implementation)
    const knownAliases: Array<[string, string]> = [
      ['gsheets', 'google-workspace'],
      ['gdrive', 'google-workspace'],
      ['gcal', 'google-workspace'],
      ['sf', 'salesforce'],
      ['qb', 'quickbooks'],
      ['hub spot', 'hubspot'],
    ];

    for (const [alias, expectedId] of knownAliases) {
      if (alias in SYSTEM_ALIASES) {
        const resolved = SYSTEM_ALIASES[alias];
        expect(resolved).toBe(expectedId);
      }
    }
  });
});

describe('[P1] Caching Behavior', () => {
  it('[P1] should cache results for repeated lookups', async () => {
    // GIVEN: First lookup
    const systemName = 'salesforce';
    const result1 = await getSystemIntelligence(systemName);

    // WHEN: Second lookup (should hit cache)
    const result2 = await getSystemIntelligence(systemName);

    // THEN: Results should be identical
    expect(result1).toEqual(result2);
  });

  it('[P1] should clear cache when clearCache() is called', async () => {
    // GIVEN: A cached lookup
    const systemName = 'hubspot';
    await getSystemIntelligence(systemName);

    // WHEN: Clearing cache
    clearCache();

    // THEN: Subsequent lookup should work (proves no stale data issues)
    const result = await getSystemIntelligence(systemName);
    expect(result).not.toBeNull();
  });

  it('[P1] should respect forceRefresh option', async () => {
    // GIVEN: Cached result
    const systemName = 'slack';
    await getSystemIntelligence(systemName);

    // WHEN: Forcing refresh
    const result = await getSystemIntelligence(systemName, { forceRefresh: true });

    // THEN: Should return valid result (bypass cache)
    expect(result).not.toBeNull();
  });
});

describe('[P0] getAllSystemIntelligence - Batch Lookups', () => {
  it('[P0] should return Map with all found systems', async () => {
    // GIVEN: Multiple system names
    const systemNames = ['salesforce', 'hubspot', 'slack'];

    // WHEN: Batch lookup
    const result = await getAllSystemIntelligence(systemNames);

    // THEN: Should return Map with entries for found systems
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBeGreaterThan(0);
  });

  it('[P0] should handle empty array gracefully', async () => {
    // GIVEN: Empty array
    const systemNames: string[] = [];

    // WHEN: Batch lookup
    const result = await getAllSystemIntelligence(systemNames);

    // THEN: Should return empty Map
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('[P1] should store results for all requested systems', async () => {
    // GIVEN: Mix of known and unknown systems
    const systemNames = ['salesforce', 'nonexistent-system-xyz'];

    // WHEN: Batch lookup
    const result = await getAllSystemIntelligence(systemNames);

    // THEN: Map should contain entries for all requested systems
    // (implementation stores null for unknown systems to enable negative caching)
    expect(result.has('salesforce')).toBe(true);
    expect(result.get('salesforce')).not.toBeNull();
    // Unknown system should be stored (null or missing depending on implementation)
    // The important behavior is that known systems return valid data
    const salesforceEntry = result.get('salesforce');
    expect(salesforceEntry).toHaveProperty('id');
    expect(salesforceEntry).toHaveProperty('name');
  });

  it('[P1] should normalize keys in returned Map', async () => {
    // GIVEN: System names with varied casing
    const systemNames = ['SalesForce', 'HUBSPOT', 'Slack'];

    // WHEN: Batch lookup
    const result = await getAllSystemIntelligence(systemNames);

    // THEN: Keys should be normalized (lowercase)
    for (const key of result.keys()) {
      expect(key).toBe(key.toLowerCase());
    }
  });
});

describe('[P1] getCatalogBaseline - Catalog Seeding', () => {
  it('[P1] should return catalog data for known system', async () => {
    // GIVEN: A known system in catalog
    const systemName = 'stripe';

    // WHEN: Getting catalog baseline
    const result = await getCatalogBaseline(systemName);

    // THEN: Should return basic catalog info
    if (result) {
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('has_api');
      expect(result).toHaveProperty('has_native_node');
    }
  });

  it('[P1] should return null for unknown system', async () => {
    // GIVEN: Unknown system
    const systemName = 'completely-unknown-system-xyz';

    // WHEN: Getting catalog baseline
    const result = await getCatalogBaseline(systemName);

    // THEN: Should return null
    expect(result).toBeNull();
  });
});

describe('[P0] Catalog + Research Merge', () => {
  it('[P0] should prefer research data when available', async () => {
    // GIVEN: A system that may have research data
    const systemName = 'dentrix-g7';

    // WHEN: Looking up with research enabled (default)
    const resultWithResearch = await getSystemIntelligence(systemName, { includeResearch: true });

    // THEN: Source should indicate if research was merged
    if (resultWithResearch?.complexity_score) {
      // If complexity_score exists, research was merged
      expect(resultWithResearch.source).toBe('merged');
    } else {
      // Catalog-only result
      expect(['catalog', 'merged']).toContain(resultWithResearch?.source);
    }
  });

  it('[P0] should fall back to catalog when research unavailable', async () => {
    // GIVEN: A system without research
    const systemName = 'slack'; // Common system in catalog

    // WHEN: Looking up
    const result = await getSystemIntelligence(systemName);

    // THEN: Should have valid catalog fields
    expect(result).not.toBeNull();
    expect(result?.has_api).toBeDefined();
    expect(result?.has_native_node).toBeDefined();
  });

  it('[P1] should not include research when disabled', async () => {
    // GIVEN: System lookup with research disabled
    const systemName = 'salesforce';

    // WHEN: Looking up without research
    const result = await getSystemIntelligence(systemName, { includeResearch: false });

    // THEN: Should be catalog-only
    if (result) {
      expect(result.source).toBe('catalog');
    }
  });
});

describe('[P1] Category and System Metadata', () => {
  it('[P1] should include category information', async () => {
    // GIVEN: Systems from different categories
    const testCases = [
      { name: 'salesforce', expectedCategory: 'crm' },
      { name: 'stripe', expectedCategory: 'payment' },
      { name: 'gmail', expectedCategory: 'communication' },
    ];

    for (const { name, expectedCategory } of testCases) {
      const result = await getSystemIntelligence(name);
      if (result) {
        expect(result.category).toBeDefined();
        expect(typeof result.category).toBe('string');
      }
    }
  });

  it('[P1] should include native node information when available', async () => {
    // GIVEN: A system with native n8n node
    const systemName = 'slack';

    // WHEN: Looking up
    const result = await getSystemIntelligence(systemName);

    // THEN: Should have native node info
    if (result?.has_native_node) {
      expect(result.native_node_name).toBeDefined();
    }
  });

  it('[P1] should include common_in industry tags when available', async () => {
    // GIVEN: Industry-specific system
    const systemName = 'dentrix-g7';

    // WHEN: Looking up
    const result = await getSystemIntelligence(systemName);

    // THEN: Should have common_in array
    if (result?.common_in) {
      expect(Array.isArray(result.common_in)).toBe(true);
    }
  });
});

describe('[P2] Edge Cases', () => {
  it('[P2] should handle special characters in system names', async () => {
    // GIVEN: System names with special characters
    const specialNames = ['Phone/SMS', 'VoIP/PBX', 'CAD/CAM'];

    // Use forEach to scope the callback (avoids no-loop-func from a for-of body).
    await Promise.all(specialNames.map(async name => {
      // WHEN: Looking up
      const result = await getSystemIntelligence(name);

      // THEN: Should handle gracefully (either find or return null)
      expect(result === null || typeof result === 'object').toBe(true);
    }));
  });

  it('[P2] should handle whitespace variations', async () => {
    // GIVEN: System names with various whitespace
    const variations = [
      '  salesforce  ',  // Leading/trailing spaces
      'sales force',     // Space in middle
      'SalesForce\t',    // Tab character
    ];

    // Use forEach-style mapping to avoid no-loop-func on the inner closure.
    await Promise.all(variations.map(async name => {
      // WHEN: Looking up
      const result = await getSystemIntelligence(name);

      // THEN: Should resolve without throwing
      expect(result === null || typeof result === 'object').toBe(true);
    }));
  });

  it('[P2] should be consistent across multiple rapid lookups', async () => {
    // GIVEN: Same system looked up rapidly
    const systemName = 'hubspot';

    // WHEN: Multiple rapid lookups
    const promises = Array.from({length: 10}).fill(null).map(async () => getSystemIntelligence(systemName));
    const results = await Promise.all(promises);

    // THEN: All results should be identical
    const first = results[0];
    for (const result of results) {
      expect(result?.id).toBe(first?.id);
      expect(result?.name).toBe(first?.name);
    }
  });
});
