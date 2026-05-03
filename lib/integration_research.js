/**
 * Integration Research Module
 * Reads technical research from n8n_workflow_development research library
 *
 * The research library lives in:
 *   n8n_workflow_development/context/technical-research/
 *
 * Configure via environment variable:
 *   N8N_RESEARCH_LIBRARY_PATH=/path/to/n8n_workflow_development/context/technical-research
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ResearchDB } from './research_db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default path relative to this repo (sibling repos)
// From lib/ -> ai_sales_engineering/ -> Wranngle/ -> n8n/
const DEFAULT_LIBRARY_PATH = join(__dirname, '..', '..', 'n8n', 'context', 'technical-research');

/**
 * Get the research library path from env or default
 * @returns {string} Path to research library
 */
function getLibraryPath() {
  return process.env.N8N_RESEARCH_LIBRARY_PATH || DEFAULT_LIBRARY_PATH;
}

/**
 * Load the library index
 * @returns {object|null} Library index or null if not found
 */
export function loadLibraryIndex() {
  const libraryPath = getLibraryPath();
  const indexPath = join(libraryPath, 'library-index.json');

  if (!existsSync(indexPath)) {
    console.warn(`Research library index not found at: ${indexPath}`);
    return null;
  }

  try {
    return JSON.parse(readFileSync(indexPath, 'utf-8'));
  } catch (error) {
    console.error(`Error loading library index: ${error.message}`);
    return null;
  }
}

/**
 * Parse a markdown research file into structured data
 * @param {string} markdown - Raw markdown content
 * @returns {object} Parsed research data
 */
export function parseResearchMarkdown(markdown) {
  const research = {
    title: '',
    business_process: '',
    research_date: '',
    confidence: 0,
    executive_summary: '',
    integrations: [],
    integration_details: {}, // NEW: Rich details per integration
    complexity: {
      score: 5, // Default to moderate (1-10 scale, never 0)
      tier: 'moderate',
      factors: [],
      estimated_nodes: 0
    },
    labor_factors: [],
    risks: [],
    uncertainties: [],
    similar_workflows: [],
    effort_recommendation: {
      tier: 'unknown',
      rationale: '',
      caveats: []
    },
    citations: []
  };

  // Extract title
  const titleMatch = markdown.match(/^# (.+)$/m);
  if (titleMatch) research.title = titleMatch[1];

  // Extract business process
  const processMatch = markdown.match(/\*\*Business Process\*\*:\s*(.+)$/m);
  if (processMatch) research.business_process = processMatch[1];

  // Extract date
  const dateMatch = markdown.match(/\*\*Research Date\*\*:\s*(.+)$/m);
  if (dateMatch) research.research_date = dateMatch[1];

  // Extract confidence
  const confMatch = markdown.match(/\*\*Researcher Confidence\*\*:\s*\w+\s*\((\d+)%\)/);
  if (confMatch) research.confidence = Number.parseInt(confMatch[1], 10) / 100;

  // Extract executive summary (paragraph after ## Executive Summary)
  const summaryMatch = markdown.match(/## Executive Summary\s+\n+([\s\S]+?)(?=\n---|\n##)/);
  if (summaryMatch) research.executive_summary = summaryMatch[1].trim();

  // Extract integrations table
  const integrationsMatch = markdown.match(/#{2} Detected Integrations(?:[\s\S]+?\|){3}([\s\S]+?)(?=\n-{3}|\n#{2})/);
  if (integrationsMatch) {
    const rows = integrationsMatch[1].split('\n').filter(r => r.includes('|'));
    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      // Skip header row and separator rows (e.g., |----|----|)
      if (cols.length >= 4 && cols[0] !== 'Integration' && !/^-+$/.test(cols[0])) {
        research.integrations.push({
          name: cols[0],
          has_native_node: cols[1].toLowerCase() === 'yes',
          auth_type: cols[2],
          docs_available: cols[3].toLowerCase() === 'yes',
          confidence: cols[4] ? Number.parseInt(cols[4], 10) / 100 : null
        });
      }
    }
  }

  // NEW: Extract rich integration details from ## Integration Details section
  const detailsSectionMatch = markdown.match(/## Integration Details([\s\S]+?)(?=## Complexity Analysis|## Labor Factors|$)/);
  if (detailsSectionMatch) {
    const detailsSection = detailsSectionMatch[1];
    // Split by ### to get individual integration sections
    const integrationSections = detailsSection.split(/###\s+\d+\.\s+/).filter(s => s.trim());

    for (const section of integrationSections) {
      // Extract integration name (first line, before parenthetical)
      const nameMatch = section.match(/^([^\n(]+)/);
      if (!nameMatch) continue;
      const integrationName = nameMatch[1].trim();
      const normalizedKey = integrationName.toLowerCase().replaceAll(/\s+/g, '-');

      const detail = {
        name: integrationName,
        native_node: false,
        native_node_info: null,
        auth: null,
        gotchas: [],
        rate_limits: null,
        client_must_provide: [],
        complexity_score: 5, // Default to moderate (1-10 scale)
        complexity_tier: 'moderate',
        api_reference: null,
        integration_pattern: null,
        operations: null,
        citations: []
      };

      // Extract native node info
      const nativeMatch = section.match(/\*\*Native n8n Node\*\*:\s*(.*?)(?:\n|$)/);
      if (nativeMatch) {
        const nodeInfo = nativeMatch[1].trim();
        detail.native_node = nodeInfo.toLowerCase().includes('yes') || nodeInfo.startsWith('`nodes-base');
        detail.native_node_info = nodeInfo;
      }

      // Extract authentication
      const authMatch = section.match(/\*\*Authentication\*\*:\s*([\s\S]*?)(?=\n\*\*|\n---|\n###|$)/);
      if (authMatch) {
        detail.auth = authMatch[1].trim().split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean).join('. ');
      }

      // Extract key gotchas
      const gotchasMatch = section.match(/\*\*Key Gotchas\*\*[^:]*:\s*([\s\S]*?)(?=\n\*\*[A-Z]|\n---|\n###|$)/);
      if (gotchasMatch) {
        detail.gotchas = gotchasMatch[1]
          .split('\n')
          .filter(l => l.trim().startsWith('-'))
          .map(l => l.replace(/^-\s*/, '').trim())
          .filter(Boolean);
      }

      // Extract rate limits
      const rateLimitMatch = section.match(/\*\*Rate Limits\*\*:\s*(.*?)(?:\n|$)/);
      if (rateLimitMatch) {
        detail.rate_limits = rateLimitMatch[1].trim();
      }

      // Extract client must provide
      const clientMatch = section.match(/\*\*Client Must Provide\*\*:\s*([\s\S]*?)(?=\n\*\*[A-Z]|\n---|\n###|$)/);
      if (clientMatch) {
        detail.client_must_provide = clientMatch[1]
          .split('\n')
          .filter(l => l.trim().startsWith('-'))
          .map(l => l.replace(/^-\s*/, '').trim())
          .filter(Boolean);
      }

      // Extract complexity score (validated 1-10)
      const complexityMatch = section.match(/\*\*Complexity Score\*\*:\s*(\d+)\/10\s*→\s*(\w+)/);
      if (complexityMatch) {
        // CRITICAL: Validate complexity score is 1-10 (NA-033 fix)
        const rawScore = Number.parseInt(complexityMatch[1], 10);
        const clampedScore = Math.max(1, Math.min(10, rawScore || 5));
        detail.complexity_score = clampedScore;
        detail.complexity_tier = complexityMatch[2].toLowerCase();
        // Provenance tracking for clamped/default values
        detail._complexity_provenance = {
          source: 'research_extraction',
          raw_value: rawScore,
          was_clamped: rawScore !== clampedScore,
          was_default: isNaN(rawScore)
        };
      } else {
        detail.complexity_score = 5; // Default if not found
        detail.complexity_tier = 'moderate';
        detail._complexity_provenance = {
          source: 'default_fallback',
          raw_value: null,
          was_clamped: false,
          was_default: true,
          reason: 'complexity pattern not found in research'
        };
      }

      // Extract API reference
      const apiRefMatch = section.match(/\*\*API Reference\*\*:\s*(https?:\/\/\S+)/);
      if (apiRefMatch) {
        detail.api_reference = apiRefMatch[1];
      }

      // Extract integration pattern
      const patternMatch = section.match(/\*\*Integration Pattern\*\*:\s*([\s\S]*?)(?=\n\*\*[A-Z]|\n---|\n###|$)/);
      if (patternMatch) {
        detail.integration_pattern = patternMatch[1]
          .split('\n')
          .filter(l => l.trim())
          .map(l => l.replace(/^\d+\.\s*/, '').trim())
          .filter(Boolean)
          .join(' → ');
      }

      // Extract operations available
      const operationsMatch = section.match(/\*\*Operations(?:\s+Available)?\*\*:\s*([\s\S]*?)(?=\n\*\*[A-Z]|\n---|\n###|$)/);
      if (operationsMatch) {
        detail.operations = operationsMatch[1]
          .split('\n')
          .filter(l => l.trim().startsWith('-'))
          .map(l => l.replace(/^-\s*/, '').trim())
          .filter(Boolean);
      }

      // Extract section-specific citations
      const urlRegex = /https?:\/\/[^\s)]+/g;
      const urls = section.match(urlRegex) || [];
      detail.citations = [...new Set(urls)];

      research.integration_details[normalizedKey] = detail;
    }
  }

  // Extract complexity score
  const complexityMatch = markdown.match(/### Overall Score:\s*(\d+)\/10\s*→\s*(\w+)/);
  if (complexityMatch) {
    // CRITICAL: Validate complexity score is 1-10 (NA-033 fix)
    const rawScore = Number.parseInt(complexityMatch[1], 10);
    const clampedScore = Math.max(1, Math.min(10, rawScore || 5));
    research.complexity.score = clampedScore;
    research.complexity.tier = complexityMatch[2];
    // Provenance tracking
    research.complexity._provenance = {
      source: 'research_file',
      raw_value: rawScore,
      was_clamped: rawScore !== clampedScore,
      was_default: isNaN(rawScore)
    };
  } else {
    // Default complexity if not found
    research.complexity.score = 5;
    research.complexity.tier = 'moderate';
    research.complexity._provenance = {
      source: 'default_fallback',
      raw_value: null,
      was_clamped: false,
      was_default: true,
      reason: 'overall score pattern not found'
    };
  }

  // Extract estimated nodes (handle range like "25-35")
  const nodesMatch = markdown.match(/\*\*Estimated Nodes\*\*:\s*(\d+)(?:-(\d+))?/);
  if (nodesMatch) {
    const min = Number.parseInt(nodesMatch[1], 10);
    const max = nodesMatch[2] ? Number.parseInt(nodesMatch[2], 10) : min;
    research.complexity.estimated_nodes = Math.round((min + max) / 2);
  }

  // Extract labor factors table
  const laborMatch = markdown.match(/#{2} Labor Factors(?:[\s\S]+?\|){3}([\s\S]+?)(?=\n-{3}|\n#{2})/);
  if (laborMatch) {
    const rows = laborMatch[1].split('\n').filter(r => r.includes('|'));
    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      // Skip header row and separator rows (e.g., |----|----|)
      if (cols.length >= 3 && cols[0] !== 'Factor' && !/^-+$/.test(cols[0])) {
        research.labor_factors.push({
          factor: cols[0],
          impact: cols[1].toLowerCase(),
          notes: cols[2]
        });
      }
    }
  }

  // Extract risks table
  const risksMatch = markdown.match(/#{2} Risks & Mitigations(?:[\s\S]+?\|){3}([\s\S]+?)(?=\n-{3}|\n#{2})/);
  if (risksMatch) {
    const rows = risksMatch[1].split('\n').filter(r => r.includes('|'));
    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      // Skip header row and separator rows (e.g., |----|----|)
      if (cols.length >= 4 && cols[0] !== 'Risk' && !/^-+$/.test(cols[0])) {
        research.risks.push({
          risk: cols[0],
          likelihood: cols[1],
          impact: cols[2],
          mitigation: cols[3]
        });
      }
    }
  }

  // Extract effort recommendation
  const tierMatch = markdown.match(/## Effort Recommendation\s+\n+\*\*Tier\*\*:\s*(\w+)/);
  if (tierMatch) research.effort_recommendation.tier = tierMatch[1];

  const rationaleMatch = markdown.match(/\*\*Rationale\*\*:\s*\n?([\s\S]+?)(?=\*\*Caveats\*\*|\n##|$)/);
  if (rationaleMatch) research.effort_recommendation.rationale = rationaleMatch[1].trim();

  // Extract base hours
  const baseHoursMatch = markdown.match(/\*\*Base Hours\*\*:\s*(\d+)/);
  if (baseHoursMatch) {
    research.effort_recommendation.base_hours = Number.parseInt(baseHoursMatch[1], 10);
  }

  // Extract caveats
  const caveatsMatch = markdown.match(/\*\*Caveats\*\*:\s*([\s\S]+?)(?=\n---|\n##|$)/);
  if (caveatsMatch) {
    research.effort_recommendation.caveats = caveatsMatch[1]
      .split('\n')
      .filter(l => l.trim().startsWith('-'))
      .map(l => l.replace(/^-\s*/, '').trim())
      .filter(Boolean);
  }

  // Extract URLs as citations
  const urlRegex = /https?:\/\/[^\s)]+/g;
  const urls = markdown.match(urlRegex) || [];
  let citationId = 1;
  for (const url of new Set(urls)) {
    research.citations.push({
      id: citationId++,
      url,
      type: url.includes('developers') ? 'api_docs' :
        url.includes('github') ? 'repository' : 'other'
    });
  }

  return research;
}

/**
 * Calculate freshness score for research
 * @param {string} researchDate - Date string from research
 * @returns {object} Freshness info
 */
export function calculateFreshness(researchDate) {
  const date = new Date(researchDate);
  const now = new Date();
  const daysSince = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (daysSince > 90) {
    return { stale: true, days: daysSince, score: 0.2, reason: 'age > 90 days' };
  }

  if (daysSince > 30) {
    return { stale: true, days: daysSince, score: 0.5, reason: 'age > 30 days' };
  }

  return { stale: false, days: daysSince, score: 1 - (daysSince / 90) };
}

/**
 * Get cached research for an integration
 * @param {string} integrationName - Name of the integration (e.g., "ringcentral")
 * @returns {object|null} Research data or null if not found
 */
export async function getCachedResearch(integrationName) {
  const libraryPath = getLibraryPath();
  const slug = integrationName.toLowerCase().replaceAll(/\s+/g, '-');

  // STRATEGY 0: Check SQLite DB (Best Practice & Integrity)
  try {
    const db = new ResearchDB();
    const dbEntry = await db.getResearchByIntegration(integrationName);
    await db.close();

    if (dbEntry) {
      console.log(`✓ Found research in SQLite DB for ${integrationName}`);
      
      // If it's a JSON file, load the content
      if (dbEntry.file_format === 'json') {
        const contentPath = join(libraryPath, dbEntry.file_path);
        if (existsSync(contentPath)) {
          const content = JSON.parse(readFileSync(contentPath, 'utf-8'));
          return {
            ...content,
            source_file: dbEntry.file_path,
            freshness: calculateFreshness(dbEntry.created_at),
            from_cache: true,
            from_db: true
          };
        }
      } 
      // If it's Markdown, parse it
      else if (dbEntry.file_format === 'md') {
        const contentPath = join(libraryPath, dbEntry.file_path);
        if (existsSync(contentPath)) {
          const markdown = readFileSync(contentPath, 'utf-8');
          const research = parseResearchMarkdown(markdown);
          return {
            ...research,
            source_file: dbEntry.file_path,
            freshness: calculateFreshness(dbEntry.created_at),
            from_cache: true,
            from_db: true
          };
        }
      }
    }
  } catch (error) {
    console.warn(`[ResearchDB] Lookup failed for ${integrationName}:`, error.message);
    // Fallthrough to legacy methods
  }

  // STRATEGY 1: Check for direct .json file (Proactive Research output)
  // These are the most accurate as they don't require regex parsing
  const directJsonPath = join(libraryPath, `${slug}.json`);
  if (existsSync(directJsonPath)) {
    try {
      const research = JSON.parse(readFileSync(directJsonPath, 'utf-8'));
      const freshness = calculateFreshness(research.research_date || research.created_at || new Date().toISOString());
      
      console.log(`✓ Found direct JSON research for ${integrationName}`);
      return {
        ...research,
        source_file: `${slug}.json`,
        freshness,
        from_cache: true
      };
    } catch (error) {
      console.warn(`Error loading direct JSON research for ${slug}: ${error.message}`);
    }
  }

  // STRATEGY 2: Check library index for markdown reports
  const index = loadLibraryIndex();
  if (!index) return null;

  // Check integration lookup
  const reportSlugs = index.integration_lookup?.[slug] || [];
  if (reportSlugs.length === 0) {
    // Try direct match in research_files
    for (const [key, entry] of Object.entries(index.research_files)) {
      if (entry.integrations?.includes(slug)) {
        reportSlugs.push(key);
      }
    }
  }

  if (reportSlugs.length === 0) return null;

  // Load the first matching research file
  const reportKey = reportSlugs[0];
  const entry = index.research_files[reportKey];
  if (!entry) return null;

  const filePath = join(libraryPath, entry.file);

  if (!existsSync(filePath)) {
    console.warn(`Research file not found: ${filePath}`);
    return null;
  }

  try {
    const markdown = readFileSync(filePath, 'utf-8');
    const research = parseResearchMarkdown(markdown);
    const freshness = calculateFreshness(research.research_date || entry.created_at);

    return {
      ...research,
      source_file: entry.file,
      freshness,
      from_cache: true
    };
  } catch (error) {
    console.error(`Error loading research file: ${error.message}`);
    return null;
  }
}

/**
 * Research a single integration
 * @param {string} integrationName - Integration name
 * @param {object} options - Options
 * @param {object} [options.catalogBaseline] - Pre-seeded catalog entry to avoid re-discovery
 * @returns {Promise<object>} Research result
 */
export async function researchIntegration(integrationName, options = {}) {
  const { catalogBaseline } = options;

  // Try cache first
  const cached = await getCachedResearch(integrationName);

  if (cached && !cached.freshness.stale) {
    console.log(`✓ Found fresh research for ${integrationName} (${cached.freshness.days} days old)`);
    // Merge catalog baseline if provided (catalog data takes precedence for native_node info)
    if (catalogBaseline) {
      return seedWithCatalog(cached, catalogBaseline);
    }

    return cached;
  }

  if (cached && cached.freshness.stale) {
    console.log(`⚠ Found stale research for ${integrationName} (${cached.freshness.days} days old)`);
    // Return stale with warning - caller can decide to refresh
    const result = {
      ...cached,
      needs_refresh: true,
      refresh_reason: cached.freshness.reason
    };
    return catalogBaseline ? seedWithCatalog(result, catalogBaseline) : result;
  }

  // No cached research - return catalog baseline if available
  if (catalogBaseline) {
    console.log(`✗ No research for ${integrationName}, using catalog baseline`);
    return {
      integration: integrationName,
      found: false,
      from_cache: false,
      from_catalog: true,
      // Seed with catalog data
      category: catalogBaseline.category,
      common_in: catalogBaseline.common_in || [],
      integrations: [{
        name: catalogBaseline.name || integrationName,
        has_native_node: catalogBaseline.has_native_node || false,
        auth_type: 'unknown',
        docs_available: catalogBaseline.has_api || false,
        confidence: 0.5
      }],
      complexity: {
        score: catalogBaseline.has_native_node ? 3 : (catalogBaseline.has_api ? 5 : 7),
        tier: catalogBaseline.has_native_node ? 'simple' : (catalogBaseline.has_api ? 'moderate' : 'complex'),
        factors: [],
        estimated_nodes: catalogBaseline.has_native_node ? 5 : 10
      },
      suggestion: `Run /technical-research in n8n_workflow_development for "${integrationName}"`
    };
  }

  // No cached research and no catalog
  console.log(`✗ No research found for ${integrationName}`);
  return {
    integration: integrationName,
    found: false,
    from_cache: false,
    suggestion: `Run /technical-research in n8n_workflow_development for "${integrationName}"`
  };
}

/**
 * Seed research result with catalog baseline data
 * Catalog data takes precedence for native_node info (curated vs. parsed)
 * @param {object} research - Research result
 * @param {object} catalogBaseline - Catalog entry
 * @returns {object} Seeded research result
 */
function seedWithCatalog(research, catalogBaseline) {
  // If research has no category, use catalog
  const category = research.category || catalogBaseline.category;
  const common_in = research.common_in?.length ? research.common_in : (catalogBaseline.common_in || []);

  // Update integrations array with catalog native_node info
  const integrations = (research.integrations || []).map(i => {
    const isCatalogMatch = i.name?.toLowerCase() === catalogBaseline.name?.toLowerCase() ||
      i.name?.toLowerCase() === catalogBaseline.id?.toLowerCase();
    if (isCatalogMatch && catalogBaseline.has_native_node) {
      return {
        ...i,
        has_native_node: true,
        native_node_name: catalogBaseline.native_node_name
      };
    }

    return i;
  });

  return {
    ...research,
    category,
    common_in,
    integrations,
    seeded_from_catalog: true
  };
}

// Deduplication rules: Prefer specific systems over generic categories
const CATEGORY_TO_SPECIFIC_MAP = {
  'Phone/SMS': ['Twilio', 'Weave', 'RingCentral', 'Vonage', 'Dialpad', 'Plivo'],
  'Accounting': ['QuickBooks', 'Xero', 'FreshBooks', 'Sage', 'NetSuite'],
  'Payments': ['Stripe', 'Square', 'Rectangle Health', 'PayPal', 'Adyen'],
  'Scheduling': ['Calendly', 'Acuity', 'SimplyBook', 'Cal.com', 'Setmore'],
  'CRM': ['HubSpot', 'Salesforce', 'Pipedrive', 'Zoho', 'Copper', 'Monday.com'],
  'Email': ['Gmail', 'Outlook', 'SendGrid', 'Mailchimp', 'Constant Contact']
};

/**
 * Deduplicate integrations by removing generic categories when a specific system is present.
 *
 * Optimized from O(n² * m) to O(n * m) by pre-computing which generic categories
 * have specific systems present, then filtering in a single pass.
 *
 * @param {string[]} systems - Array of system names
 * @returns {string[]} Deduplicated system names
 */
function deduplicateIntegrations(systems) {
  // Build concatenated lowercase string for efficient substring matching
  const systemsLower = systems.map(s => s.toLowerCase());
  const allSystemsStr = '|' + systemsLower.join('|') + '|';

  // Pre-compute which generic categories should be removed (have specific systems present)
  const categoriesToRemove = new Set();
  for (const [category, specifics] of Object.entries(CATEGORY_TO_SPECIFIC_MAP)) {
    const hasSpecific = specifics.some(specific =>
      allSystemsStr.includes(specific.toLowerCase())
    );
    if (hasSpecific) {
      categoriesToRemove.add(category);
    }
  }

  // Single-pass filter
  return systems.filter(system => !categoriesToRemove.has(system));
}

/**
 * Extract integration names from various intake structures
 * @param {object} intake - Extracted intake data
 * @returns {string[]} Array of integration names
 */
function extractIntegrationNames(intake) {
  const integrations = new Set();

  // Check section_c_systems_handoffs.q10_systems_involved (primary location for extracted data)
  const systemsInvolved = intake.section_c_systems_handoffs?.q10_systems_involved || [];
  for (const system of systemsInvolved) {
    // Parse strings like "CRM (HubSpot)" or "Email (Outlook)"
    const name = typeof system === 'string' ? system : system.name;
    if (name) {
      // Extract tool name from parentheses if present
      const parenMatch = name.match(/\(([^)]+)\)/);
      if (parenMatch) {
        // ONLY add the specific tool name when available (e.g., "HubSpot", "Twilio")
        // This avoids duplicating generic + specific (e.g., "SMS" + "Twilio")
        integrations.add(parenMatch[1].trim());
      } else {
        // Only add the base system name if there's no specific tool in parentheses
        // This handles cases like "PostgreSQL" or "Custom Legacy System"
        const baseName = name.trim();
        if (baseName && baseName.length > 1) {
          integrations.add(baseName);
        }
      }
    }
  }

  // Check project.integrations (legacy format)
  const projectIntegrations = intake.project?.integrations || [];
  for (const integration of projectIntegrations) {
    const name = typeof integration === 'string' ? integration : integration.name;
    if (name) integrations.add(name);
  }

  return deduplicateIntegrations([...integrations]);
}

/**
 * Research all integrations from intake
 * @param {object} intake - Extracted intake data
 * @returns {Promise<object[]>} Array of research results
 */
export async function researchAllIntegrations(intake) {
  const integrationNames = extractIntegrationNames(intake);
  const results = [];

  console.log(`Found ${integrationNames.length} integrations to research: ${integrationNames.join(', ')}`);

  for (const name of integrationNames) {
    if (name) {
      const research = await researchIntegration(name);
      results.push({
        integration: name,
        system: name,
        research
      });
    }
  }

  return results;
}

/**
 * Get library status/statistics
 * @returns {object} Library status
 */
export function getLibraryStatus() {
  const index = loadLibraryIndex();
  if (!index) {
    return {
      available: false,
      path: getLibraryPath(),
      error: 'Library index not found'
    };
  }

  return {
    available: true,
    path: getLibraryPath(),
    version: index.version,
    last_updated: index.last_updated,
    stats: index.stats,
    integrations: Object.keys(index.integration_lookup || {}),
    fileCount: Object.keys(index.research_files || {}).length
  };
}

/**
 * Generate a research gap report for a set of integration research results
 * Identifies missing, stale, and fresh research with actionable suggestions
 * @param {object[]} integrationResearch - Results from researchAllIntegrations
 * @returns {object} Research gap report
 */
export function generateResearchGapReport(integrationResearch) {
  const report = {
    summary: {
      total: integrationResearch.length,
      found: 0,
      missing: 0,
      stale: 0,
      fresh: 0,
      needs_research: 0
    },
    missing: [],
    stale: [],
    fresh: [],
    actionable_commands: [],
    research_derived_hours: null,
    average_complexity: null
  };

  const complexityScores = [];
  let researchDerivedHours = 0;

  for (const item of integrationResearch) {
    const {research} = item;
    const name = item.system || item.integration;

    if (!research?.found && research?.found !== undefined) {
      // Missing research
      report.missing.push({
        name,
        suggestion: research?.suggestion || `Run /technical-research process="${name}"`
      });
      report.summary.missing++;
    } else if (research?.needs_refresh || research?.freshness?.stale) {
      // Stale research
      report.stale.push({
        name,
        days_old: research?.freshness?.days || 0,
        reason: research?.freshness?.reason || 'age > 30 days',
        suggestion: `Refresh: /technical-research process="${name}" --refresh`
      });
      report.summary.stale++;

      // Still use stale data for estimation
      if (research?.complexity?.score) {
        complexityScores.push(research.complexity.score);
      }

      if (research?.effort_recommendation?.base_hours) {
        researchDerivedHours = Math.max(researchDerivedHours, research.effort_recommendation.base_hours);
      }
    } else if (research?.from_cache) {
      // Fresh cached research
      report.fresh.push({
        name,
        complexity: research?.complexity?.score,
        tier: research?.complexity?.tier,
        nodes: research?.complexity?.estimated_nodes,
        base_hours: research?.effort_recommendation?.base_hours
      });
      report.summary.fresh++;
      report.summary.found++;

      // Use for estimation
      if (research?.complexity?.score) {
        complexityScores.push(research.complexity.score);
      }

      if (research?.effort_recommendation?.base_hours) {
        researchDerivedHours = Math.max(researchDerivedHours, research.effort_recommendation.base_hours);
      }
    } else {
      // No research at all
      report.missing.push({
        name,
        suggestion: `Run /technical-research process="${name}"`
      });
      report.summary.missing++;
    }
  }

  report.summary.needs_research = report.summary.missing + report.summary.stale;

  // Generate actionable commands
  if (report.missing.length > 0) {
    // Group missing into a single research command
    const processes = report.missing.map(m => m.name).join(', ');
    report.actionable_commands.push({
      priority: 'high',
      type: 'new_research',
      command: `/technical-research process="${processes}"`,
      reason: `${report.missing.length} integration(s) have no cached research`
    });
  }

  if (report.stale.length > 0) {
    report.actionable_commands.push({
      priority: 'medium',
      type: 'refresh_research',
      command: `/technical-research process="${report.stale.map(s => s.name).join(', ')}" --refresh`,
      reason: `${report.stale.length} integration(s) have stale research (>30 days old)`
    });
  }

  // Calculate averages
  if (complexityScores.length > 0) {
    report.average_complexity = Math.round(complexityScores.reduce((a, b) => a + b, 0) / complexityScores.length * 10) / 10;
  }

  if (researchDerivedHours > 0) {
    report.research_derived_hours = researchDerivedHours;
  }

  return report;
}

/**
 * Get the maximum complexity-driven hours from research results
 *
 * SEMANTIC NOTE: This returns the HIGHEST single integration's hours, not the sum.
 * Use this for complexity threshold detection (e.g., "if any integration is complex,
 * bump the baseline"). Use getTotalIntegrationHours() for actual hour totals.
 *
 * Falls back to tier-based estimation if no research available.
 *
 * @param {object[]} integrationResearch - Results from researchAllIntegrations
 * @param {object} tierAssessment - Tier assessment fallback
 * @returns {number} Maximum single-integration hours (for complexity detection)
 */
export function getResearchDerivedBaseHours(integrationResearch, tierAssessment = null) {
  let maxHours = 0;

  // Check each research result for base hours
  for (const item of integrationResearch) {
    const {research} = item;
    if (research?.effort_recommendation?.base_hours) {
      maxHours = Math.max(maxHours, research.effort_recommendation.base_hours);
    }
  }

  // Fallback to tier assessment if no research hours found
  if (maxHours === 0 && tierAssessment?.baseHours) {
    return tierAssessment.baseHours;
  }

  return maxHours || 40; // Default minimum
}

/**
 * Get total integration hours by summing all researched integrations
 *
 * SEMANTIC NOTE: This returns the SUM of all integration hours.
 * Use this for accurate project estimation. Use getResearchDerivedBaseHours()
 * for complexity threshold detection.
 *
 * @param {object[]} integrationResearch - Results from researchAllIntegrations
 * @returns {{ total: number, breakdown: Array<{name: string, hours: number}> }}
 */
export function getTotalIntegrationHours(integrationResearch) {
  const breakdown = [];
  let total = 0;

  for (const item of integrationResearch) {
    const {research} = item;
    const name = item.integration || item.system || 'unknown';
    const hours = research?.effort_recommendation?.base_hours ||
      research?.complexity?.estimated_hours ||
      8; // Default per-integration

    breakdown.push({ name, hours });
    total += hours;
  }

  return { total, breakdown };
}

export default {
  loadLibraryIndex,
  parseResearchMarkdown,
  calculateFreshness,
  getCachedResearch,
  researchIntegration,
  researchAllIntegrations,
  getLibraryStatus,
  generateResearchGapReport,
  getResearchDerivedBaseHours,
  getTotalIntegrationHours
};
