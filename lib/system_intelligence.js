/**
 * System Intelligence Module
 * Unified lookup service that merges Systems Catalog with Technical Research
 *
 * @module lib/system_intelligence
 *
 * Provides:
 * - getSystemIntelligence: Unified lookup for single system
 * - getAllSystemIntelligence: Batch lookup for multiple systems
 * - SYSTEM_ALIASES: Common name variations mapping
 * - clearCache: Force cache invalidation
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getCachedResearch } from './integration_research.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FUZZY_MATCH_THRESHOLD = 0.8;

// -----------------------------------------------------------------------------
// System Aliases
// Common name variations mapped to canonical catalog IDs
// -----------------------------------------------------------------------------

export const SYSTEM_ALIASES = {
  // CRM variations
  'hub spot': 'hubspot',
  'hubspot crm': 'hubspot',
  'salesforce crm': 'salesforce',
  'sf': 'salesforce',
  'sfdc': 'salesforce',
  'zoho': 'zoho-crm',
  'pipe drive': 'pipedrive',

  // Google variations
  'google sheets': 'google-workspace',
  'gsheets': 'google-workspace',
  'g sheets': 'google-workspace',
  'google drive': 'google-workspace',
  'gdrive': 'google-workspace',
  'google calendar': 'google-workspace',
  'gcal': 'google-workspace',
  'gmail': 'google-workspace',

  // Microsoft variations
  'ms teams': 'microsoft-teams',
  'teams': 'microsoft-teams',
  'office 365': 'microsoft-365',
  'o365': 'microsoft-365',
  'microsoft office': 'microsoft-365',
  'ms office': 'microsoft-365',
  'outlook': 'microsoft-365',
  'ms outlook': 'microsoft-365',
  'excel': 'microsoft-365',
  'ms excel': 'microsoft-365',
  'dynamics': 'microsoft-dynamics',
  'dynamics 365': 'microsoft-dynamics',
  'ms dynamics': 'microsoft-dynamics',

  // Accounting variations
  'quick books': 'quickbooks',
  'qb': 'quickbooks',
  'qbo': 'quickbooks',
  'quickbooks online': 'quickbooks',
  'fresh books': 'freshbooks',

  // Communication variations
  'ring central': 'ringcentral',
  'send grid': 'sendgrid',
  'mail chimp': 'mailchimp',
  'inter com': 'intercom',
  'zen desk': 'zendesk',
  'fresh desk': 'freshdesk',

  // Payment variations
  'paypal': 'paypal',
  'pay pal': 'paypal',
  'authorize.net': 'authorize-net',
  'authorize net': 'authorize-net',
  'brain tree': 'braintree',
  'rectangle': 'rectangle-health',

  // Healthcare variations
  'dentrix': 'dentrix-g7',
  'dentrix g7': 'dentrix-g7',
  'eagle soft': 'eaglesoft',
  'curve': 'curve-dental',
  'open dental': 'open-dental',
  'care stream': 'carestream',
  '3 shape': '3shape',
  'athena': 'athenahealth',
  'athena health': 'athenahealth',
  'dr chrono': 'drchrono',
  'next gen': 'nextgen',

  // Project management variations
  'monday': 'monday',
  'monday.com': 'monday',
  'click up': 'clickup',
  'air table': 'airtable',

  // ERP variations
  'net suite': 'oracle-netsuite',
  'netsuite': 'oracle-netsuite',
  'oracle netsuite': 'oracle-netsuite',

  // Service industry
  'service titan': 'servicetitan',
  'house call pro': 'housecall-pro',
  'housecallpro': 'housecall-pro',
};

// -----------------------------------------------------------------------------
// Cache Implementation
// -----------------------------------------------------------------------------

const cache = new Map();

/**
 * Get cached entry if valid
 * @param {string} key - Cache key
 * @returns {object|null} Cached value or null
 */
function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Set cache entry
 * @param {string} key - Cache key
 * @param {object} value - Value to cache
 */
function setCache(key, value) {
  cache.set(key, {
    value,
    timestamp: Date.now(),
  });
}

/**
 * Clear entire cache or specific key
 * @param {string} [key] - Optional specific key to clear
 */
export function clearCache(key) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

// -----------------------------------------------------------------------------
// Catalog Loading
// -----------------------------------------------------------------------------

let catalogCache = null;

/**
 * Load systems catalog (cached)
 * @returns {object} Systems catalog object
 */
function loadCatalog() {
  if (catalogCache) return catalogCache;

  const catalogPath = join(__dirname, '..', 'config', 'systems_catalog.json');
  if (!existsSync(catalogPath)) {
    console.warn(`[SystemIntelligence] Catalog not found at: ${catalogPath}`);
    return { systems: [] };
  }

  try {
    catalogCache = JSON.parse(readFileSync(catalogPath, 'utf-8'));
    return catalogCache;
  } catch (error) {
    console.error(`[SystemIntelligence] Error loading catalog: ${error.message}`);
    return { systems: [] };
  }
}

// -----------------------------------------------------------------------------
// Name Matching
// -----------------------------------------------------------------------------

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate fuzzy match confidence score
 * @param {string} input - Input string
 * @param {string} target - Target string
 * @returns {number} Confidence score (0-1)
 */
function fuzzyMatchConfidence(input, target) {
  const distance = levenshteinDistance(input.toLowerCase(), target.toLowerCase());
  const maxLen = Math.max(input.length, target.length);
  return 1 - distance / maxLen;
}

/**
 * Find matching catalog entry using multiple strategies
 * @param {string} name - System name to find
 * @param {object[]} systems - Array of catalog system entries
 * @returns {{ entry: object|null, matchType: string, confidence: number }}
 */
function findCatalogMatch(name, systems) {
  const normalizedName = name.toLowerCase().trim();

  // Strategy 1: Exact ID match
  const idMatch = systems.find((s) => s.id === normalizedName);
  if (idMatch) {
    return { entry: idMatch, matchType: 'exact_id', confidence: 1 };
  }

  // Strategy 2: Exact name match (case-insensitive)
  const nameMatch = systems.find((s) => s.name.toLowerCase() === normalizedName);
  if (nameMatch) {
    return { entry: nameMatch, matchType: 'exact_name', confidence: 1 };
  }

  // Strategy 3: Alias resolution
  const aliasedId = SYSTEM_ALIASES[normalizedName];
  if (aliasedId) {
    const aliasMatch = systems.find((s) => s.id === aliasedId);
    if (aliasMatch) {
      return { entry: aliasMatch, matchType: 'alias', confidence: 0.95 };
    }
  }

  // Strategy 4: Fuzzy match on ID
  let bestFuzzyMatch = null;
  let bestConfidence = 0;

  for (const system of systems) {
    const idConfidence = fuzzyMatchConfidence(normalizedName, system.id);
    if (idConfidence > bestConfidence && idConfidence >= FUZZY_MATCH_THRESHOLD) {
      bestConfidence = idConfidence;
      bestFuzzyMatch = system;
    }

    const nameConfidence = fuzzyMatchConfidence(normalizedName, system.name);
    if (nameConfidence > bestConfidence && nameConfidence >= FUZZY_MATCH_THRESHOLD) {
      bestConfidence = nameConfidence;
      bestFuzzyMatch = system;
    }
  }

  if (bestFuzzyMatch) {
    return { entry: bestFuzzyMatch, matchType: 'fuzzy', confidence: bestConfidence };
  }

  return { entry: null, matchType: 'none', confidence: 0 };
}

// -----------------------------------------------------------------------------
// Core Functions
// -----------------------------------------------------------------------------

/**
 * Get unified system intelligence by merging catalog and research data
 *
 * @param {string} systemName - System name to lookup
 * @param {object} [options] - Options
 * @param {boolean} [options.forceRefresh=false] - Bypass cache
 * @param {boolean} [options.includeResearch=true] - Include research data
 * @returns {Promise<object|null>} System intelligence or null if not found
 */
export async function getSystemIntelligence(systemName, options = {}) {
  const { forceRefresh = false, includeResearch = true } = options;

  if (!systemName || typeof systemName !== 'string') {
    return null;
  }

  const cacheKey = systemName.toLowerCase().trim();

  // Check cache unless forcing refresh
  if (!forceRefresh) {
    const cached = getCached(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Load catalog
  const catalog = loadCatalog();
  const { entry: catalogEntry, matchType, confidence } = findCatalogMatch(
    systemName,
    catalog.systems || []
  );

  // Prepare base intelligence from catalog
  let intelligence = null;

  if (catalogEntry) {
    intelligence = {
      // Catalog fields
      id: catalogEntry.id,
      name: catalogEntry.name,
      category: catalogEntry.category,
      has_api: catalogEntry.has_api,
      has_native_node: catalogEntry.has_native_node,
      native_node_name: catalogEntry.native_node_name || null,
      common_in: catalogEntry.common_in || [],

      // Match metadata
      match_type: matchType,
      match_confidence: confidence,

      // Source tracking
      source: 'catalog',
    };
  }

  // Enrich with research data if requested
  if (includeResearch) {
    const researchName = catalogEntry?.id || systemName;
    const research = await getCachedResearch(researchName);

    if (research && research.from_cache) {
      const enrichment = {
        // Research fields
        complexity_score: research.complexity?.score || null,
        complexity_tier: research.complexity?.tier || null,
        auth_type: extractAuthType(research),
        gotchas: extractGotchas(research),
        rate_limits: extractRateLimits(research),
        base_hours: research.effort_recommendation?.base_hours || null,
        labor_factors: research.labor_factors || [],
        citations: research.citations || [],

        // Research metadata
        research_freshness: research.freshness || null,
        last_researched: research.research_date || null,
      };

      if (intelligence) {
        // Merge research into catalog baseline
        intelligence = {
          ...intelligence,
          ...enrichment,
          source: 'merged',
        };
      } else {
        // Research-only (no catalog entry)
        intelligence = {
          id: cacheKey,
          name: systemName,
          category: 'unknown',
          has_api: true, // Assume API if research exists
          has_native_node: research.integrations?.[0]?.has_native_node || false,
          native_node_name: null,
          common_in: [],
          match_type: 'research_only',
          match_confidence: research.confidence || 0.5,
          ...enrichment,
          source: 'research',
        };
      }
    }
  }

  // Cache result
  if (intelligence) {
    setCache(cacheKey, intelligence);
  }

  return intelligence;
}

/**
 * Get intelligence for multiple systems (batch lookup)
 *
 * @param {string[]} systemNames - Array of system names
 * @param {object} [options] - Options passed to getSystemIntelligence
 * @returns {Promise<Map<string, object|null>>} Map of system name to intelligence
 */
export async function getAllSystemIntelligence(systemNames, options = {}) {
  const results = new Map();

  // Process in parallel for efficiency
  const promises = systemNames.map(async (name) => {
    const intelligence = await getSystemIntelligence(name, options);
    return { name, intelligence };
  });

  const resolved = await Promise.all(promises);

  for (const { name, intelligence } of resolved) {
    results.set(name.toLowerCase().trim(), intelligence);
  }

  return results;
}

/**
 * Get catalog baseline for seeding research
 *
 * @param {string} systemName - System name
 * @returns {object|null} Catalog entry or null
 */
export function getCatalogBaseline(systemName) {
  const catalog = loadCatalog();
  const { entry } = findCatalogMatch(systemName, catalog.systems || []);
  return entry;
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Extract auth type from research data
 * @param {object} research - Research object
 * @returns {string|null} Auth type
 */
function extractAuthType(research) {
  // Check integration_details first
  const details = Object.values(research.integration_details || {});
  for (const detail of details) {
    if (detail.auth) return detail.auth;
  }

  // Check integrations array
  const integration = research.integrations?.[0];
  if (integration?.auth_type) return integration.auth_type;

  return null;
}

/**
 * Extract gotchas from research data
 * @param {object} research - Research object
 * @returns {string[]} Array of gotchas
 */
function extractGotchas(research) {
  const gotchas = [];

  // Collect from integration_details
  const details = Object.values(research.integration_details || {});
  for (const detail of details) {
    if (detail.gotchas?.length) {
      gotchas.push(...detail.gotchas);
    }
  }

  return [...new Set(gotchas)]; // Dedupe
}

/**
 * Extract rate limits from research data
 * @param {object} research - Research object
 * @returns {string|null} Rate limits info
 */
function extractRateLimits(research) {
  const details = Object.values(research.integration_details || {});
  for (const detail of details) {
    if (detail.rate_limits) return detail.rate_limits;
  }

  return null;
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export default {
  getSystemIntelligence,
  getAllSystemIntelligence,
  getCatalogBaseline,
  clearCache,
  SYSTEM_ALIASES,
};
