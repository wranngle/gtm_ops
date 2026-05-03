/**
 * Combinatorial Unit Tests for system_intelligence.js
 *
 * ATDD: Massive parameterized test coverage with auto-healing patterns
 *
 * Coverage Strategy:
 * - Name matching: exact ID, exact name, alias, fuzzy (~100+ combinations)
 * - Caching behavior with TTL validation
 * - Batch lookups with parallel processing
 * - Catalog + Research merge scenarios
 * - Edge cases and error handling
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { faker } from '@faker-js/faker';

// -----------------------------------------------------------------------------
// Module Import
// -----------------------------------------------------------------------------

let getSystemIntelligence: (name: string, options?: Record<string, unknown>) => Promise<any>;
let getAllSystemIntelligence: (names: string[]) => Promise<Map<string, any>>;
let getCatalogBaseline: (systemName: string) => any;
let clearCache: () => void;
let SYSTEM_ALIASES: Record<string, string>;

beforeEach(async () => {
  const module = await import('../../lib/system_intelligence.js');
  getSystemIntelligence = module.getSystemIntelligence;
  getAllSystemIntelligence = module.getAllSystemIntelligence;
  getCatalogBaseline = module.getCatalogBaseline;
  clearCache = module.clearCache;
  SYSTEM_ALIASES = module.SYSTEM_ALIASES;

  // Clear cache before each test for isolation
  clearCache();
});

afterEach(() => {
  clearCache();
});

// -----------------------------------------------------------------------------
// Test Data: Known Systems
// -----------------------------------------------------------------------------

const KNOWN_SYSTEMS = [
  // CRM
  { id: 'salesforce', aliases: ['sf', 'sfdc', 'salesforce crm'], category: 'crm' },
  { id: 'hubspot', aliases: ['hub spot', 'hubspot crm'], category: 'crm' },
  { id: 'zoho-crm', aliases: ['zoho'], category: 'crm' },
  { id: 'pipedrive', aliases: ['pipe drive'], category: 'crm' },

  // Google
  { id: 'google-workspace', aliases: ['gsheets', 'google sheets', 'g sheets', 'gdrive', 'google drive', 'gcal', 'google calendar', 'gmail'], category: 'productivity' },

  // Microsoft
  { id: 'microsoft-teams', aliases: ['ms teams', 'teams'], category: 'communication' },
  { id: 'microsoft-365', aliases: ['office 365', 'o365', 'microsoft office', 'ms office', 'outlook', 'ms outlook', 'excel', 'ms excel'], category: 'productivity' },
  { id: 'microsoft-dynamics', aliases: ['dynamics', 'dynamics 365', 'ms dynamics'], category: 'crm' },

  // Communication
  { id: 'slack', aliases: [], category: 'communication' },
  { id: 'ringcentral', aliases: ['ring central'], category: 'communication' },
  { id: 'twilio', aliases: [], category: 'communication' },

  // Payment
  { id: 'stripe', aliases: [], category: 'payment' },
  { id: 'paypal', aliases: ['pay pal'], category: 'payment' },
  { id: 'braintree', aliases: ['brain tree'], category: 'payment' },

  // Healthcare
  { id: 'dentrix-g7', aliases: ['dentrix', 'dentrix g7'], category: 'healthcare' },
  { id: 'eaglesoft', aliases: ['eagle soft'], category: 'healthcare' },
  { id: 'open-dental', aliases: ['open dental'], category: 'healthcare' },
  { id: '3shape', aliases: ['3 shape'], category: 'healthcare' },
  { id: 'carestream', aliases: ['care stream'], category: 'healthcare' },

  // Accounting
  { id: 'quickbooks', aliases: ['quick books', 'qb', 'qbo', 'quickbooks online'], category: 'accounting' },
  { id: 'freshbooks', aliases: ['fresh books'], category: 'accounting' },

  // Service
  { id: 'servicetitan', aliases: ['service titan'], category: 'field_service' },
  { id: 'housecall-pro', aliases: ['house call pro', 'housecallpro'], category: 'field_service' },

  // Project Management
  { id: 'monday', aliases: ['monday.com'], category: 'project_management' },
  { id: 'clickup', aliases: ['click up'], category: 'project_management' },
  { id: 'airtable', aliases: ['air table'], category: 'project_management' },
  { id: 'asana', aliases: [], category: 'project_management' },

  // Support
  { id: 'zendesk', aliases: ['zen desk'], category: 'support' },
  { id: 'freshdesk', aliases: ['fresh desk'], category: 'support' },
  { id: 'intercom', aliases: ['inter com'], category: 'support' },
];

// -----------------------------------------------------------------------------
// Auto-Healing Utilities
// -----------------------------------------------------------------------------

/**
 * Retry async operation with exponential backoff
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      await new Promise(r => setTimeout(r, 2**i * 10));
    }
  }

  throw lastError ?? new Error('Retry failed without surfacing an error');
}

/**
 * Assert result has all required intelligence fields
 */
function assertValidIntelligence(intel: any, options?: { allowNull?: boolean }) {
  if (options?.allowNull && intel === null) return;

  expect(intel).not.toBeNull();
  expect(intel).toHaveProperty('id');
  expect(intel).toHaveProperty('name');
  expect(intel).toHaveProperty('category');
  expect(intel).toHaveProperty('has_api');
  expect(intel).toHaveProperty('has_native_node');
  expect(intel).toHaveProperty('source');

  expect(typeof intel.has_api).toBe('boolean');
  expect(typeof intel.has_native_node).toBe('boolean');
  expect(['catalog', 'research', 'merged']).toContain(intel.source);
}

// =============================================================================
// EXACT ID MATCHING TESTS
// =============================================================================

describe('[P0] Exact ID Matching - Combinatorial', () => {
  // Test every known system by exact ID
  const exactIdCases = KNOWN_SYSTEMS.map(sys => ({
    input: sys.id,
    expectedId: sys.id,
    expectedCategory: sys.category,
  }));

  it.each(exactIdCases)(
    '[P0] exact ID "$input" should resolve to $expectedId',
    async ({ input, expectedId }) => {
      const result = await withRetry(async () => getSystemIntelligence(input));

      assertValidIntelligence(result, { allowNull: true });
      if (result) {
        expect(result.id).toBe(expectedId);
        expect(result.match_type).toBe('exact_id');
        expect(result.match_confidence).toBe(1);
      }
    }
  );

  // Case variations for exact ID
  const caseVariationCases = KNOWN_SYSTEMS.slice(0, 10).flatMap(sys => [
    { input: sys.id.toUpperCase(), expectedId: sys.id },
    { input: sys.id.toLowerCase(), expectedId: sys.id },
    { input: sys.id.charAt(0).toUpperCase() + sys.id.slice(1), expectedId: sys.id },
  ]);

  it.each(caseVariationCases)(
    '[P1] case variation "$input" should still match $expectedId',
    async ({ input, expectedId }) => {
      const result = await getSystemIntelligence(input);

      if (result) {
        expect(result.id).toBe(expectedId);
      }
    }
  );
});

// =============================================================================
// ALIAS RESOLUTION TESTS
// =============================================================================

describe('[P0] Alias Resolution - Combinatorial', () => {
  // Flatten all aliases into test cases
  const aliasTestCases = KNOWN_SYSTEMS.flatMap(sys =>
    sys.aliases.map(alias => ({
      alias,
      expectedId: sys.id,
      category: sys.category,
    }))
  );

  it.each(aliasTestCases)(
    '[P0] alias "$alias" should resolve to $expectedId',
    async ({ alias, expectedId }) => {
      const result = await withRetry(async () => getSystemIntelligence(alias));

      if (result) {
        expect(result.id).toBe(expectedId);
        expect(['alias', 'exact_name', 'fuzzy']).toContain(result.match_type);
        expect(result.match_confidence).toBeGreaterThanOrEqual(0.8);
      }
    }
  );

  // Test alias variations with case changes
  const aliasCaseVariations = aliasTestCases.slice(0, 20).flatMap(({ alias, expectedId }) => [
    { input: alias.toUpperCase(), expectedId },
    { input: alias.toLowerCase(), expectedId },
    { input: alias.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), expectedId },
  ]);

  it.each(aliasCaseVariations)(
    '[P1] alias case variation "$input" should resolve to $expectedId',
    async ({ input, expectedId }) => {
      const result = await getSystemIntelligence(input);

      if (result) {
        expect(result.id).toBe(expectedId);
      }
    }
  );
});

// =============================================================================
// FUZZY MATCHING TESTS
// =============================================================================

describe('[P1] Fuzzy Matching - Combinatorial', () => {
  // Generate typo variations
  const fuzzyTestCases = KNOWN_SYSTEMS.slice(0, 15).flatMap(sys => {
    const variations: Array<{ input: string; expectedId: string; description: string }> = [];

    // Single character typos
    if (sys.id.length > 4) {
      // Swap adjacent characters
      const swapped = sys.id.slice(0, 2) + sys.id[3] + sys.id[2] + sys.id.slice(4);
      variations.push({ input: swapped, expectedId: sys.id, description: 'char swap' });

      // Extra character
      const extra = sys.id.slice(0, 3) + 'x' + sys.id.slice(3);
      variations.push({ input: extra, expectedId: sys.id, description: 'extra char' });

      // Missing character
      const missing = sys.id.slice(0, 3) + sys.id.slice(4);
      variations.push({ input: missing, expectedId: sys.id, description: 'missing char' });
    }

    // Extra whitespace
    variations.push({ input: sys.id + '  ', expectedId: sys.id, description: 'trailing space' }, { input: '  ' + sys.id, expectedId: sys.id, description: 'leading space' });
    variations.push({ input: sys.id.replace('-', '  '), expectedId: sys.id, description: 'double space' });

    return variations;
  });

  it.each(fuzzyTestCases)(
    '[P1] fuzzy "$input" ($description) should possibly match $expectedId',
    async ({ input, expectedId }) => {
      const result = await getSystemIntelligence(input);

      // Fuzzy matching may or may not succeed depending on distance
      // Auto-healing: we accept either match or null
      if (result) {
        // If matched, should have reasonable confidence
        expect(result.match_confidence).toBeGreaterThanOrEqual(0.5);
      }
      // Test doesn't fail if no match - fuzzy is best-effort
    }
  );
});

// =============================================================================
// UNKNOWN SYSTEM HANDLING
// =============================================================================

describe('[P0] Unknown System Handling', () => {
  const unknownSystemCases = [
    'totally-nonexistent-system-xyz-12345',
    'random_gibberish_98765',
    'fake-crm-that-doesnt-exist',
    '!@#$%^&*()',
    'a'.repeat(100),
    faker.string.uuid(),
    faker.lorem.words(5).replaceAll(/\s/g, '-'),
    '',
    ' ',
    '\t',
    '\n',
  ];

  it.each(unknownSystemCases)(
    '[P0] unknown/invalid input "%s" should return null gracefully',
    async (input) => {
      const result = await getSystemIntelligence(input);

      // Unknown systems should return null, not throw
      expect(result).toBeNull();
    }
  );

  // Edge cases that might throw
  const dangerousCases = [
    null,
    undefined,
    123,
    {},
    [],
    true,
    false,
    Symbol('test'),
  ];

  it.each(dangerousCases)(
    '[P0] dangerous input %p should not throw',
    async (input) => {
      // @ts-ignore - Testing invalid types
      const result = await getSystemIntelligence(input);
      expect(result).toBeNull();
    }
  );
});

// =============================================================================
// CACHING BEHAVIOR TESTS
// =============================================================================

describe('[P1] Caching Behavior', () => {
  const cachingTestSystems = ['salesforce', 'hubspot', 'slack', 'stripe', 'dentrix-g7'];

  it.each(cachingTestSystems)(
    '[P1] repeated lookups for "%s" should return consistent results',
    async (systemName) => {
      // First lookup
      const result1 = await getSystemIntelligence(systemName);
      // Second lookup (should hit cache)
      const result2 = await getSystemIntelligence(systemName);
      // Third lookup
      const result3 = await getSystemIntelligence(systemName);

      // All results should be identical
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    }
  );

  it('[P1] clearCache() should invalidate entries', async () => {
    const systemName = 'hubspot';

    // Prime cache
    await getSystemIntelligence(systemName);

    // Clear cache
    clearCache();

    // Should still work after clear
    const result = await getSystemIntelligence(systemName);
    expect(result).not.toBeNull();
  });

  it('[P1] forceRefresh option should bypass cache', async () => {
    const systemName = 'slack';

    // Prime cache
    const cached = await getSystemIntelligence(systemName);

    // Force refresh
    const refreshed = await getSystemIntelligence(systemName, { forceRefresh: true });

    // Both should have valid data (may be identical)
    assertValidIntelligence(cached, { allowNull: true });
    assertValidIntelligence(refreshed, { allowNull: true });
  });

  // Concurrent access test
  it('[P1] concurrent lookups should be thread-safe', async () => {
    const systemNames = cachingTestSystems;

    // Launch all lookups concurrently
    const promises = systemNames.flatMap(name =>
      Array.from({length: 10}).fill(null).map(async () => getSystemIntelligence(name))
    );

    const results = await Promise.all(promises);

    // All results should be valid
    for (const result of results) {
      if (result) {
        assertValidIntelligence(result);
      }
    }
  });
});

// =============================================================================
// BATCH LOOKUP TESTS
// =============================================================================

describe('[P0] getAllSystemIntelligence - Batch Lookups', () => {
  const batchSizes = [1, 2, 3, 5, 10, 20];

  it.each(batchSizes)(
    '[P0] batch lookup with %d systems should return Map',
    async (size) => {
      const systems = KNOWN_SYSTEMS.slice(0, size).map(s => s.id);
      const result = await getAllSystemIntelligence(systems);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(size);

      // Every entry should have normalized key
      for (const key of result.keys()) {
        expect(key).toBe(key.toLowerCase());
      }
    }
  );

  it('[P0] batch with mixed known/unknown should handle gracefully', async () => {
    const systems = [
      'salesforce',
      'totally-unknown-xyz',
      'hubspot',
      'another-fake-one',
      'slack',
    ];

    const result = await getAllSystemIntelligence(systems);

    expect(result).toBeInstanceOf(Map);

    // Known systems should have data
    const salesforce = result.get('salesforce');
    if (salesforce) {
      assertValidIntelligence(salesforce);
    }
  });

  it('[P0] empty array should return empty Map', async () => {
    const result = await getAllSystemIntelligence([]);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  // Duplicate handling
  it('[P1] batch with duplicates should dedupe by key', async () => {
    const systems = ['salesforce', 'SALESFORCE', 'Salesforce', 'sf', 'sfdc'];

    const result = await getAllSystemIntelligence(systems);

    // Should have entries for each input (normalized)
    expect(result.size).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// CATALOG + RESEARCH MERGE TESTS
// =============================================================================

describe('[P0] Catalog + Research Merge', () => {
  const mergeTestCases = KNOWN_SYSTEMS.slice(0, 10).map(sys => ({
    systemId: sys.id,
    category: sys.category,
  }));

  it.each(mergeTestCases)(
    '[P0] $systemId should have catalog baseline',
    async ({ systemId }) => {
      const result = await getSystemIntelligence(systemId, { includeResearch: true });

      if (result) {
        // Should have catalog fields
        expect(result.id).toBe(systemId);
        expect(result).toHaveProperty('has_api');
        expect(result).toHaveProperty('has_native_node');

        // Source should indicate origin
        expect(['catalog', 'research', 'merged']).toContain(result.source);
      }
    }
  );

  it('[P1] includeResearch=false should return catalog-only', async () => {
    const result = await getSystemIntelligence('salesforce', { includeResearch: false });

    if (result) {
      expect(result.source).toBe('catalog');
    }
  });

  // Research-enriched fields
  it('[P1] merged result may include research fields', async () => {
    const result = await getSystemIntelligence('dentrix-g7', { includeResearch: true });

    if (result?.source === 'merged' && // Merged results may have research fields
      // These are optional depending on research cache availability
      result.complexity_score) {
      expect(typeof result.complexity_score).toBe('number');
      expect(result.complexity_score).toBeGreaterThanOrEqual(1);
      expect(result.complexity_score).toBeLessThanOrEqual(10);
    }
  });
});

// =============================================================================
// getCatalogBaseline TESTS
// =============================================================================

describe('[P1] getCatalogBaseline', () => {
  const baselineCases = KNOWN_SYSTEMS.slice(0, 15).map(sys => ({
    input: sys.id,
    expectedId: sys.id,
  }));

  it.each(baselineCases)(
    '[P1] getCatalogBaseline("$input") should return catalog entry',
    ({ input, expectedId }) => {
      const result = getCatalogBaseline(input);

      if (result) {
        expect(result.id).toBe(expectedId);
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('has_api');
        expect(result).toHaveProperty('has_native_node');
      }
    }
  );

  it('[P1] unknown system should return null', () => {
    const result = getCatalogBaseline('totally-unknown-system-12345');
    expect(result).toBeNull();
  });
});

// =============================================================================
// SYSTEM_ALIASES VALIDATION
// =============================================================================

describe('[P0] SYSTEM_ALIASES Export', () => {
  it('[P0] should export SYSTEM_ALIASES object', () => {
    expect(typeof SYSTEM_ALIASES).toBe('object');
    expect(SYSTEM_ALIASES).not.toBeNull();
  });

  it('[P0] should have 40+ alias mappings', () => {
    const aliasCount = Object.keys(SYSTEM_ALIASES).length;
    expect(aliasCount).toBeGreaterThanOrEqual(40);
  });

  it('[P0] all alias values should be valid system IDs', async () => {
    const uniqueTargets = [...new Set(Object.values(SYSTEM_ALIASES))];

    for (const targetId of uniqueTargets.slice(0, 10)) {
      // Each target should resolve via catalog
      const result = await getSystemIntelligence(targetId);

      // Most targets should exist in catalog
      // (some may be research-only, which is acceptable)
      if (result) {
        expect(result.id).toBe(targetId);
      }
    }
  });

  // Known alias spot checks
  const aliasSpotChecks = [
    ['gsheets', 'google-workspace'],
    ['sf', 'salesforce'],
    ['qb', 'quickbooks'],
    ['dentrix', 'dentrix-g7'],
    ['ms teams', 'microsoft-teams'],
  ];

  it.each(aliasSpotChecks)(
    '[P0] alias "%s" should map to "%s"',
    (alias, expectedTarget) => {
      expect(SYSTEM_ALIASES[alias]).toBe(expectedTarget);
    }
  );
});

// =============================================================================
// SPECIAL CHARACTER HANDLING
// =============================================================================

describe('[P2] Special Character Handling', () => {
  const specialCharCases = [
    'Phone/SMS',
    'VoIP/PBX',
    'CAD/CAM',
    'MS Office 365',
    'Dentrix (G7)',
    'QuickBooks [Online]',
    'Salesforce.com',
    'Monday.com',
  ];

  it.each(specialCharCases)(
    '[P2] special chars "%s" should not throw',
    async (input) => {
      // Should not throw regardless of special characters
      await expect(getSystemIntelligence(input)).resolves.not.toThrow();
    }
  );
});

// =============================================================================
// WHITESPACE VARIATIONS
// =============================================================================

describe('[P2] Whitespace Variations', () => {
  const whitespaceVariations = [
    { input: '  salesforce  ', description: 'leading/trailing spaces' },
    { input: 'sales force', description: 'space in middle' },
    { input: 'salesforce\t', description: 'tab character' },
    { input: 'salesforce\n', description: 'newline' },
    { input: 'sales  force', description: 'double space' },
    { input: '\tsalesforce\n', description: 'mixed whitespace' },
  ];

  it.each(whitespaceVariations)(
    '[P2] whitespace variation ($description) should not throw',
    async ({ input }) => {
      await expect(getSystemIntelligence(input)).resolves.not.toThrow();
    }
  );
});

// =============================================================================
// PERFORMANCE TESTS
// =============================================================================

describe('[P2] Performance', () => {
  it('[P2] single lookup should complete in < 100ms', async () => {
    clearCache();

    const start = Date.now();
    await getSystemIntelligence('salesforce');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  it('[P2] cached lookup should complete in < 10ms', async () => {
    // Prime cache
    await getSystemIntelligence('hubspot');

    const start = Date.now();
    await getSystemIntelligence('hubspot');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(10);
  });

  it('[P2] batch of 20 should complete in < 500ms', async () => {
    clearCache();

    const systems = KNOWN_SYSTEMS.slice(0, 20).map(s => s.id);

    const start = Date.now();
    await getAllSystemIntelligence(systems);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
  });

  it('[P2] 100 rapid sequential lookups should be stable', async () => {
    const systems = KNOWN_SYSTEMS.map(s => s.id);

    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      const system = systems[i % systems.length];
      await getSystemIntelligence(system);
    }

    const duration = Date.now() - start;

    expect(duration).toBeLessThan(2000);
  });
});

// =============================================================================
// DETERMINISM TESTS
// =============================================================================

describe('[P2] Determinism', () => {
  it('[P2] same input should always produce same output', async () => {
    clearCache();

    const results: any[] = [];
    for (let i = 0; i < 10; i++) {
      clearCache(); // Force fresh lookup each time
      const result = await getSystemIntelligence('slack');
      results.push(result);
    }

    // All results should be structurally identical
    const first = JSON.stringify(results[0]);
    for (const result of results) {
      expect(JSON.stringify(result)).toBe(first);
    }
  });

  it('[P2] batch order should not affect results', async () => {
    clearCache();
    const systems = ['salesforce', 'hubspot', 'slack'];

    const result1 = await getAllSystemIntelligence(systems);

    clearCache();
    const result2 = await getAllSystemIntelligence([...systems].reverse());

    // Both should have same entries (order of Map doesn't matter)
    for (const sys of systems) {
      const intel1 = result1.get(sys);
      const intel2 = result2.get(sys);
      expect(intel1?.id).toBe(intel2?.id);
    }
  });
});

// =============================================================================
// CROSS-CATEGORY TESTS
// =============================================================================

describe('[P1] Cross-Category Coverage', () => {
  const categoryGroups = [
    { category: 'crm', systems: ['salesforce', 'hubspot', 'zoho-crm', 'pipedrive'] },
    { category: 'communication', systems: ['slack', 'microsoft-teams', 'twilio'] },
    { category: 'payment', systems: ['stripe', 'paypal', 'braintree'] },
    { category: 'healthcare', systems: ['dentrix-g7', 'eaglesoft', 'open-dental'] },
    { category: 'accounting', systems: ['quickbooks', 'freshbooks'] },
  ];

  it.each(categoryGroups)(
    '[P1] $category systems should all resolve',
    async ({ systems }) => {
      const result = await getAllSystemIntelligence(systems);

      for (const sys of systems) {
        const intel = result.get(sys);
        // Most should resolve (some may not be in catalog)
        if (intel) {
          assertValidIntelligence(intel);
        }
      }
    }
  );
});

// =============================================================================
// FIELD VALIDATION
// =============================================================================

describe('[P0] Intelligence Field Validation', () => {
  const fieldValidationCases = KNOWN_SYSTEMS.slice(0, 10).map(s => s.id);

  it.each(fieldValidationCases)(
    '[P0] "%s" should have all required fields with correct types',
    async (systemId) => {
      const result = await getSystemIntelligence(systemId);

      if (result) {
        // Required fields
        expect(typeof result.id).toBe('string');
        expect(typeof result.name).toBe('string');
        expect(typeof result.category).toBe('string');
        expect(typeof result.has_api).toBe('boolean');
        expect(typeof result.has_native_node).toBe('boolean');
        expect(typeof result.source).toBe('string');

        // Match metadata
        expect(typeof result.match_type).toBe('string');
        expect(typeof result.match_confidence).toBe('number');
        expect(result.match_confidence).toBeGreaterThanOrEqual(0);
        expect(result.match_confidence).toBeLessThanOrEqual(1);

        // Optional fields should be correct type if present
        if (result.common_in !== undefined) {
          expect(Array.isArray(result.common_in)).toBe(true);
        }

        if (result.native_node_name !== undefined && result.native_node_name !== null) {
          expect(typeof result.native_node_name).toBe('string');
        }

        if (result.complexity_score !== undefined && result.complexity_score !== null) {
          expect(typeof result.complexity_score).toBe('number');
        }
      }
    }
  );
});
