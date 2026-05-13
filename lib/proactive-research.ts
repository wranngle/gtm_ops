// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * Proactive Research Module
 * Auto-generates integration research when cache is empty
 *
 * Features:
 * - Embedded n8n native node database (60+ integrations)
 * - Category mappings for generic terms (CRM, VoIP, Calendar, etc.)
 * - LLM enhancement with database as baseline
 * - Caches to n8n_workflow_development/context/technical-research/
 * - Updates library-index.json automatically
 *
 * Works completely standalone - no external dependencies required.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { executeLLMJson } from '../src/services/llm.js';
import { ResearchDB } from './research-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Correct path: n8n research library (not local)
const N8N_RESEARCH_LIBRARY_PATH = process.env.N8N_RESEARCH_LIBRARY_PATH ||
  join(__dirname, '..', '..', 'n8n', 'context', 'technical-research');

// Fallback to local if n8n library doesn't exist
const LOCAL_RESEARCH_PATH = join(__dirname, '..', 'context', 'generated-research');

/**
 * Get the research library path (prefer n8n library, fallback to local)
 */
function getResearchLibraryPath() {
  if (existsSync(N8N_RESEARCH_LIBRARY_PATH)) {
    return { path: N8N_RESEARCH_LIBRARY_PATH, isLocal: false };
  }

  return { path: LOCAL_RESEARCH_PATH, isLocal: true };
}

/**
 * Sanitize integration name for use as filename
 * @param {string} name - Integration name
 * @returns {string} Safe filename slug
 */
function sanitizeSlug(name) {
  return name
    .toLowerCase()
    .replaceAll('/', '-')
    .replaceAll('\\', '-')
    .replaceAll(/[<>:"|?*]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

function getResearchConfidence(research) {
  return Number.isFinite(research?.confidence) ? research.confidence : 0;
}

/**
 * Comprehensive n8n native node database
 * Updated December 2025 based on n8n documentation
 */
const N8N_NATIVE_NODES = {
  // CRM Systems
  hubspot: { node: 'n8n-nodes-base.hubspot', auth: 'oauth2', quality: 'excellent', complexity: 3 },
  salesforce: { node: 'n8n-nodes-base.salesforce', auth: 'oauth2', quality: 'excellent', complexity: 4 },
  pipedrive: { node: 'n8n-nodes-base.pipedrive', auth: 'api_key', quality: 'good', complexity: 2 },
  zoho: { node: 'n8n-nodes-base.zohoCrm', auth: 'oauth2', quality: 'good', complexity: 3 },
  freshsales: { node: 'n8n-nodes-base.freshsales', auth: 'api_key', quality: 'good', complexity: 2 },
  copper: { node: 'n8n-nodes-base.copper', auth: 'api_key', quality: 'good', complexity: 2 },

  // Communication - Phone/VoIP
  twilio: { node: 'n8n-nodes-base.twilio', auth: 'api_key', quality: 'excellent', complexity: 3 },
  vonage: { node: 'n8n-nodes-base.vonage', auth: 'api_key', quality: 'good', complexity: 3 },
  ringcentral: { node: 'n8n-nodes-base.ringcentral', auth: 'oauth2', quality: 'good', complexity: 4 },
  plivo: { node: 'n8n-nodes-base.plivo', auth: 'api_key', quality: 'good', complexity: 3 },

  // Communication - Messaging
  slack: { node: 'n8n-nodes-base.slack', auth: 'oauth2', quality: 'excellent', complexity: 2 },
  discord: { node: 'n8n-nodes-base.discord', auth: 'oauth2', quality: 'good', complexity: 2 },
  teams: { node: 'n8n-nodes-base.microsoftTeams', auth: 'oauth2', quality: 'good', complexity: 3 },
  telegram: { node: 'n8n-nodes-base.telegram', auth: 'api_key', quality: 'excellent', complexity: 2 },
  whatsapp: { node: 'n8n-nodes-base.whatsApp', auth: 'api_key', quality: 'good', complexity: 3 },

  // Communication - Email
  gmail: { node: 'n8n-nodes-base.gmail', auth: 'oauth2', quality: 'excellent', complexity: 2 },
  outlook: { node: 'n8n-nodes-base.microsoftOutlook', auth: 'oauth2', quality: 'good', complexity: 3 },
  mailchimp: { node: 'n8n-nodes-base.mailchimp', auth: 'api_key', quality: 'excellent', complexity: 2 },
  sendgrid: { node: 'n8n-nodes-base.sendGrid', auth: 'api_key', quality: 'excellent', complexity: 2 },

  // Calendar
  'google calendar': { node: 'n8n-nodes-base.googleCalendar', auth: 'oauth2', quality: 'excellent', complexity: 2 },
  'microsoft outlook calendar': { node: 'n8n-nodes-base.microsoftOutlook', auth: 'oauth2', quality: 'good', complexity: 3 },

  // Databases
  postgres: { node: 'n8n-nodes-base.postgres', auth: 'basic', quality: 'excellent', complexity: 2 },
  postgresql: { node: 'n8n-nodes-base.postgres', auth: 'basic', quality: 'excellent', complexity: 2 },
  mysql: { node: 'n8n-nodes-base.mySql', auth: 'basic', quality: 'excellent', complexity: 2 },
  mongodb: { node: 'n8n-nodes-base.mongoDb', auth: 'basic', quality: 'excellent', complexity: 2 },
  redis: { node: 'n8n-nodes-base.redis', auth: 'basic', quality: 'excellent', complexity: 2 },
  supabase: { node: 'n8n-nodes-base.supabase', auth: 'api_key', quality: 'excellent', complexity: 2 },
  airtable: { node: 'n8n-nodes-base.airtable', auth: 'api_key', quality: 'excellent', complexity: 2 },

  // Productivity
  notion: { node: 'n8n-nodes-base.notion', auth: 'oauth2', quality: 'excellent', complexity: 2 },
  asana: { node: 'n8n-nodes-base.asana', auth: 'oauth2', quality: 'good', complexity: 2 },
  trello: { node: 'n8n-nodes-base.trello', auth: 'api_key', quality: 'good', complexity: 2 },
  monday: { node: 'n8n-nodes-base.mondayCom', auth: 'api_key', quality: 'good', complexity: 2 },
  clickup: { node: 'n8n-nodes-base.clickUp', auth: 'api_key', quality: 'good', complexity: 2 },
  jira: { node: 'n8n-nodes-base.jira', auth: 'basic', quality: 'good', complexity: 3 },

  // Cloud Storage
  'google drive': { node: 'n8n-nodes-base.googleDrive', auth: 'oauth2', quality: 'excellent', complexity: 2 },
  dropbox: { node: 'n8n-nodes-base.dropbox', auth: 'oauth2', quality: 'good', complexity: 2 },
  onedrive: { node: 'n8n-nodes-base.microsoftOneDrive', auth: 'oauth2', quality: 'good', complexity: 3 },
  box: { node: 'n8n-nodes-base.box', auth: 'oauth2', quality: 'good', complexity: 2 },

  // E-commerce & Payments
  stripe: { node: 'n8n-nodes-base.stripe', auth: 'api_key', quality: 'excellent', complexity: 3 },
  shopify: { node: 'n8n-nodes-base.shopify', auth: 'api_key', quality: 'excellent', complexity: 3 },
  woocommerce: { node: 'n8n-nodes-base.wooCommerce', auth: 'api_key', quality: 'good', complexity: 3 },
  paypal: { node: 'n8n-nodes-base.payPal', auth: 'oauth2', quality: 'good', complexity: 3 },
  square: { node: 'n8n-nodes-base.square', auth: 'oauth2', quality: 'good', complexity: 3 },

  // Marketing & Analytics
  'google analytics': { node: 'n8n-nodes-base.googleAnalytics', auth: 'oauth2', quality: 'good', complexity: 3 },
  'facebook ads': { node: 'n8n-nodes-base.facebookAds', auth: 'oauth2', quality: 'fair', complexity: 4 },
  'google ads': { node: 'n8n-nodes-base.googleAds', auth: 'oauth2', quality: 'fair', complexity: 4 },

  // Spreadsheets
  'google sheets': { node: 'n8n-nodes-base.googleSheets', auth: 'oauth2', quality: 'excellent', complexity: 2 },
  excel: { node: 'n8n-nodes-base.microsoftExcel', auth: 'oauth2', quality: 'good', complexity: 3 },

  // Support & Helpdesk
  zendesk: { node: 'n8n-nodes-base.zendesk', auth: 'api_key', quality: 'good', complexity: 3 },
  freshdesk: { node: 'n8n-nodes-base.freshdesk', auth: 'api_key', quality: 'good', complexity: 2 },
  intercom: { node: 'n8n-nodes-base.intercom', auth: 'api_key', quality: 'good', complexity: 3 },

  // Forms & Surveys
  typeform: { node: 'n8n-nodes-base.typeform', auth: 'api_key', quality: 'excellent', complexity: 2 },
  'google forms': { node: 'n8n-nodes-base.googleForms', auth: 'oauth2', quality: 'good', complexity: 2 },
  jotform: { node: 'n8n-nodes-base.jotForm', auth: 'api_key', quality: 'good', complexity: 2 },

  // Scheduling
  calendly: { node: 'n8n-nodes-base.calendly', auth: 'api_key', quality: 'good', complexity: 2 },
  'cal.com': { node: 'n8n-nodes-base.cal', auth: 'api_key', quality: 'good', complexity: 2 },

  // AI & LLM
  openai: { node: '@n8n/n8n-nodes-langchain.openAi', auth: 'api_key', quality: 'excellent', complexity: 2 },
  anthropic: { node: '@n8n/n8n-nodes-langchain.anthropic', auth: 'api_key', quality: 'excellent', complexity: 2 },

  // Version Control
  github: { node: 'n8n-nodes-base.github', auth: 'oauth2', quality: 'excellent', complexity: 2 },
  gitlab: { node: 'n8n-nodes-base.gitlab', auth: 'api_key', quality: 'good', complexity: 2 },

  // Automation Platforms
  zapier: { node: 'n8n-nodes-base.webhook', auth: 'none', quality: 'fair', complexity: 2, note: 'Use webhooks' },
  make: { node: 'n8n-nodes-base.webhook', auth: 'none', quality: 'fair', complexity: 2, note: 'Use webhooks' },
};

/**
 * Category mappings for generic integration names
 */
const CATEGORY_MAPPINGS = {
  crm: ['hubspot', 'salesforce', 'pipedrive', 'zoho'],
  'phone system': ['twilio', 'vonage', 'ringcentral'],
  voip: ['twilio', 'vonage', 'ringcentral'],
  pbx: ['twilio', 'vonage', 'ringcentral'],
  calendar: ['google calendar', 'microsoft outlook calendar'],
  email: ['gmail', 'outlook', 'sendgrid'],
  messaging: ['slack', 'teams', 'discord'],
  chat: ['slack', 'teams', 'discord'],
  database: ['postgres', 'mysql', 'mongodb'],
  storage: ['google drive', 'dropbox', 'onedrive'],
  payments: ['stripe', 'paypal', 'square'],
  ecommerce: ['shopify', 'woocommerce', 'stripe'],
  helpdesk: ['zendesk', 'freshdesk', 'intercom'],
  forms: ['typeform', 'google forms', 'jotform'],
  scheduling: ['calendly', 'cal.com'],
  spreadsheet: ['google sheets', 'airtable', 'excel'],
};

/**
 * Look up integration in native node database
 */
function lookupNativeNode(integrationName) {
  const normalized = integrationName.toLowerCase().trim();

  // Direct match
  if (N8N_NATIVE_NODES[normalized]) {
    return { ...N8N_NATIVE_NODES[normalized], matched: normalized };
  }

  // Partial match (e.g., "HubSpot CRM" -> "hubspot")
  for (const [key, value] of Object.entries(N8N_NATIVE_NODES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return { ...value, matched: key };
    }
  }

  // Category match
  for (const [category, providers] of Object.entries(CATEGORY_MAPPINGS)) {
    if (normalized.includes(category) || category.includes(normalized)) {
      const firstProvider = providers[0];
      return {
        ...N8N_NATIVE_NODES[firstProvider],
        matched: firstProvider,
        is_category: true,
        alternatives: providers.slice(1)
      };
    }
  }

  return null;
}

// Helper functions at module level
const getComplexityTier = (score) => {
  if (score <= 2) return 'standard';
  if (score <= 4) return 'moderate';
  if (score <= 7) return 'complex';
  return 'enterprise';
};

const getEstimatedHours = (score, hasNative) => {
  const baseHours = score <= 2 ? 4 : score <= 4 ? 8 : score <= 7 ? 16 : 24;
  return hasNative ? baseHours : baseHours * 1.5;
};

/**
 * Validate research quality programmatically
 * Ensures "real rhyme or reason" by checking for actual URLs and specific data
 * @param {object} research - The research object to validate
 * @returns {object} { valid: boolean, violations: string[] }
 */
function validateResearch(research) {
  const violations = [];
  
  // 1. Check for real API documentation URL
  if (!research.api_documentation_url || 
    research.api_documentation_url.includes('example.com') || 
    research.api_documentation_url.includes('placeholder')) {
    violations.push('Invalid or missing api_documentation_url');
  }

  // 2. Check for specific rate limits (not just "unknown")
  if (!research.rate_limits || research.rate_limits.toLowerCase() === 'unknown') {
    violations.push('Rate limits marked as unknown');
  }

  // 3. Check for specific authentication details
  if (!research.auth_notes || research.auth_notes.length < 20) {
    violations.push('Auth notes too vague');
  }

  // 4. Check for hallucinations in known fields
  if (research.has_native_n8n_node && !research.native_node_name) {
    violations.push('Claimed native node but provided no node name');
  }

  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Research a single integration - uses database first, LLM only for unknowns
 * @param {string} integrationName - Name of the integration
 * @param {boolean} forceLLM - Force LLM enhancement even for database matches
 * @returns {Promise<object>} Research result
 */
export async function researchIntegrationWithLLM(integrationName, forceLLM = false) {
  // First, check our native node database
  const nativeNodeInfo = lookupNativeNode(integrationName);

  // If we have a direct database match (not category), skip LLM entirely
  if (nativeNodeInfo && !nativeNodeInfo.is_category && !forceLLM) {
    const complexity = nativeNodeInfo.complexity || 3;
    console.log(`📦 Database hit: ${integrationName} → ${nativeNodeInfo.node}`);
    return {
      integration: integrationName,
      found: true,
      from_cache: false,
      from_database: true,
      generated: false,
      research_date: new Date().toISOString(),
      has_native_n8n_node: true,
      has_native_node: true,
      native_node_name: nativeNodeInfo.node,
      auth_type: nativeNodeInfo.auth,
      api_quality: nativeNodeInfo.quality,
      complexity: {
        score: complexity,
        tier: getComplexityTier(complexity),
        estimated_hours: getEstimatedHours(complexity, true)
      },
      effort_recommendation: {
        tier: getComplexityTier(complexity),
        base_hours: getEstimatedHours(complexity, true),
        rationale: `Native n8n node: ${nativeNodeInfo.node}`
      },
      freshness: { stale: false, days: 0, score: 0.9, reason: 'database' },
      _database_match: nativeNodeInfo.matched,
      _is_category: false
    };
  }

  // Category match or unknown - need LLM with Deep Research
  console.log(`🔍 Deep Research (Web Grounding): ${integrationName}${nativeNodeInfo?.is_category ? ' (category)' : ' (unknown)'}`);

  // Construct prompt with Deep Research instructions simulating the full n8n research suite
  const prompt = `You are a technical researcher analyzing API integrations for n8n workflow development.

TASK: Perform DEEP WEB RESEARCH on "${integrationName}" to find accurate, up-to-date technical details.
USE GOOGLE SEARCH to simulate a multi-source investigation across the following 10+ key sources:

1. **Official API Documentation** (Ref/Context7 proxy): Find the developer portal, auth methods, and rate limits.
2. **n8n Community Forum** (Discord proxy): Search for common issues, "gotchas", or workarounds discussed by users.
3. **YouTube Tutorials** (YouTube Knowledge proxy): Look for video walkthroughs of "${integrationName} n8n integration".
4. **n8n Templates** (n8n-mcp proxy): Check if official or community templates exist.
5. **GitHub Repositories**: Look for SDKs or existing integration code.
6. **Exa/Tavily Style Search**: Find broad technical overviews and competitor comparisons.
7. **Official Pricing Pages**: Verify if API access requires a specific plan tier.
8. **Developer Blogs/Articles**: Look for "How to connect ${integrationName} to n8n" guides.
9. **Status Pages**: Check for historical uptime/reliability issues.
10. **Reddit/Social**: Look for unfiltered developer sentiment and complaints.

Integration Name: ${integrationName}

${nativeNodeInfo ? `KNOWN n8n CONTEXT (verify this):
- Native Node: ${nativeNodeInfo.node}
- Auth Type: ${nativeNodeInfo.auth}
` : 'No native n8n node found in internal database. Search for community nodes or HTTP Request patterns.'}

Provide your analysis as JSON with these EXACT fields:
{
  "integration_name": "${integrationName}",
  "has_native_n8n_node": boolean,
  "native_node_name": "n8n node name or null",
  "auth_type": "specific auth type (e.g. OAuth2, API Key)",
  "auth_complexity": "simple" | "moderate" | "complex",
  "auth_notes": "Specific details on how to authenticate (e.g. 'Requires App creation in dev portal')",
  "api_quality": "excellent" | "good" | "fair" | "poor",
  "api_documentation_url": "THE REAL URL to the official API docs",
  "rate_limits": "Specific limits found (e.g. '100 req/min')",
  "complexity_score": 1-10 integer,
  "complexity_tier": "simple" | "standard" | "moderate" | "complex" | "enterprise",
  "estimated_hours": integer (4-40),
  "webhook_support": true | false,
  "gotchas": ["Specific known issue 1 (e.g. from forums)", "Specific known issue 2"],
  "client_must_provide": ["Credential 1", "Access to X"],
  "operations_available": ["op1", "op2"],
  "confidence": 0.0-1.0,
  "research_notes": "Summary of findings including insights from forums/videos",
  "sources_consulted": ["List the types of sources you successfully found (e.g. 'Official Docs', 'YouTube', 'Community Forum')"]
}

CRITICAL:
- "api_documentation_url" MUST be a real, functioning URL found via search.
- "rate_limits" MUST be specific, not "unknown".
- Do not hallucinate. If search fails, state "Research failed" in notes.
`;

  try {
    // Enable Grounding for Deep Research
    const result = await executeLLMJson(prompt, { 
      task: 'research',
      useGrounding: true // TRIGGER THE RESEARCH TOOLS
    });
    
    let research = result?.data || result;

    // Programmatic Validation Loop
    const validation = validateResearch(research);
    if (!validation.valid) {
      console.warn(`⚠ Research validation failed for ${integrationName}: ${validation.violations.join(', ')}`);
      console.log(`↺ Retrying research with strict validation prompt...`);
      
      // Retry with specific feedback
      const retryPrompt = `Previous research for ${integrationName} was rejected for these reasons:
${validation.violations.map(v => `- ${v}`).join('\n')}

Please re-research ${integrationName} using Google Search and provide specific, accurate details.
ENSURE "api_documentation_url" is a real link and "rate_limits" contains actual numbers.`;

      const retryResult = await executeLLMJson(retryPrompt, {
        task: 'research_retry',
        useGrounding: true
      });
      research = retryResult?.data || retryResult;
    }

    // Use native node info as defaults if LLM fails to populate
    const hasNative = nativeNodeInfo ? true : (research.has_native_n8n_node ?? false);
    const complexityScore = research.complexity_score || (nativeNodeInfo?.complexity || 5);
    const tier = research.complexity_tier || getComplexityTier(complexityScore);
    const hours = research.estimated_hours || getEstimatedHours(complexityScore, hasNative);

    // Normalize the response
    return {
      integration: integrationName,
      found: true,
      from_cache: false,
      generated: true,
      research_date: new Date().toISOString(),
      model_used: result?.model || 'gemini-3-flash-preview',
      ...research,
      // Override with authoritative data from our database
      has_native_n8n_node: hasNative,
      has_native_node: hasNative,
      native_node_name: research.native_node_name || nativeNodeInfo?.node || null,
      auth_type: research.auth_type || nativeNodeInfo?.auth || 'unknown',
      api_quality: research.api_quality || nativeNodeInfo?.quality || 'unknown',
      complexity: {
        score: complexityScore,
        tier,
        estimated_hours: hours
      },
      effort_recommendation: {
        tier,
        base_hours: hours,
        rationale: research.research_notes || (hasNative
          ? `Native n8n node available (${nativeNodeInfo?.node})`
          : 'No native node - requires HTTP Request configuration')
      },
      freshness: {
        stale: false,
        days: 0,
        score: hasNative ? 0.85 : 0.65,
        reason: 'auto-generated with web grounding'
      },
      // Track database match
      _database_match: nativeNodeInfo?.matched || null,
      _is_category: nativeNodeInfo?.is_category || false
    };
  } catch (error) {
    console.error(`❌ Failed to research ${integrationName}:`, error.message);

    // Even on LLM failure, we can return native node info if available
    if (nativeNodeInfo) {
      const complexity = nativeNodeInfo.complexity || 3;
      return {
        integration: integrationName,
        found: true,
        generated: true,
        from_database: true,
        research_date: new Date().toISOString(),
        has_native_n8n_node: true,
        has_native_node: true,
        native_node_name: nativeNodeInfo.node,
        auth_type: nativeNodeInfo.auth,
        api_quality: nativeNodeInfo.quality,
        complexity: {
          score: complexity,
          tier: getComplexityTier(complexity),
          estimated_hours: getEstimatedHours(complexity, true)
        },
        effort_recommendation: {
          tier: getComplexityTier(complexity),
          base_hours: getEstimatedHours(complexity, true),
          rationale: `Native n8n node available (${nativeNodeInfo.node}). LLM enhancement failed.`
        },
        research_notes: `Database match only. LLM error: ${error.message}`,
        _database_match: nativeNodeInfo.matched
      };
    }

    return {
      integration: integrationName,
      found: false,
      generated: true,
      error: error.message,
      has_native_node: false,
      auth_type: 'unknown',
      complexity: { score: 5, tier: 'moderate', estimated_hours: 12 },
      effort_recommendation: { tier: 'moderate', base_hours: 12, rationale: 'Default estimate - research failed' }
    };
  }
}

/**
 * Research multiple integrations proactively
 * @param {string[]} integrationNames - Names of integrations to research
 * @param {object} options - Options
 * @param {boolean} options.saveToCache - Whether to save results to cache
 * @param {string} options.clientName - Client name for reports
 * @param {string} options.workflowName - Workflow name for reports
 * @returns {Promise<object[]>} Array of research results
 */
export async function performProactiveResearch(integrationNames, options = {}) {
  const { saveToCache = true, clientName = 'Unknown', workflowName = 'Unknown' } = options;
  const results = [];

  console.log(`\n🔬 Proactive Research: Analyzing ${integrationNames.length} integration(s)`);
  console.log(`   Integrations: ${integrationNames.join(', ')}`);

  for (const name of integrationNames) {
    const research = await researchIntegrationWithLLM(name);
    results.push({
      integration: name,
      system: name,
      research
    });

    // Log result
    if (research.found) {
      console.log(`   ✓ ${name}: complexity ${research.complexity.score}/10, ~${research.complexity.estimated_hours}hrs`);
    } else {
      console.log(`   ✗ ${name}: research failed, using defaults`);
    }
  }

  // Save to cache
  if (saveToCache && results.length > 0) {
    try {
      await saveResearchToLibrary(results, { clientName, workflowName });
    } catch (error) {
      console.warn(`   ⚠ Failed to cache research: ${error.message}`);
    }
  }

  console.log(`\n   Research complete: ${results.filter(r => r.research.found).length}/${results.length} successful\n`);

  return results;
}

/**
 * Save research to the n8n-methodology library
 * @param {object[]} results - Research results to save
 * @param {object} options - Options
 */
async function saveResearchToLibrary(results, options = {}) {
  const { clientName = 'Unknown', workflowName = 'Unknown' } = options;
  const { path: libraryPath, isLocal } = getResearchLibraryPath();

  if (!existsSync(libraryPath)) {
    mkdirSync(libraryPath, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];

  // Generate combined report slug
  const reportSlug = `proactive-${sanitizeSlug(workflowName)}-${date}`;

  // Load or create library index
  const indexPath = join(libraryPath, 'library-index.json');
  let index = {
    version: '1.1.0',
    last_updated: new Date().toISOString(),
    description: 'Index of technical research reports for integration estimation',
    research_files: {},
    integration_lookup: {},
    stats: { total_reports: 0, integrations_covered: 0, average_confidence: 0 }
  };

  if (existsSync(indexPath)) {
    try {
      index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    } catch {
      console.warn('   ⚠ Could not parse existing index, creating new');
    }
  }

  // Generate combined markdown report for all integrations
  let combinedMarkdown = `# Integration Research: ${workflowName}

**Client**: ${clientName}
**Business Process**: ${workflowName}
**Research Date**: ${date}
**Researcher Confidence**: Medium (70%)
**Generated By**: Proactive LLM Research (fallback)

---

## Executive Summary

This research report was auto-generated during pipeline execution because no cached research was available for the detected integrations. For production use, invoke the technical-research skill manually for more thorough research using MCP tools (n8n-mcp, Context7, Exa).

---

## Detected Integrations

| Integration | Native Node | Auth Type | Docs Available | Confidence |
|-------------|-------------|-----------|----------------|------------|
`;

  const integrationSlugs = [];
  let totalConfidence = 0;
  let totalComplexity = 0;

  // Init DB connection
  let db;
  try {
    db = new ResearchDB();
    await db.init();
  } catch(error) {
    console.warn('[ResearchDB] Warning: Could not initialize DB connection', error.message);
  }

  for (const result of results) {
    const {research} = result;
    const name = result.integration;
    const slug = sanitizeSlug(name);
    integrationSlugs.push(slug);

    // Add to table
    const confidence = getResearchConfidence(research);
    combinedMarkdown += `| ${name} | ${research.has_native_node || research.has_native_n8n_node ? 'Yes' : 'No'} | ${research.auth_type || 'unknown'} | ${research.api_documentation_url ? 'Yes' : 'No'} | ${Math.round(confidence * 100)}% |\n`;

    totalConfidence += confidence;
    totalComplexity += (research.complexity?.score || 5);

    // Add to integration lookup
    if (!index.integration_lookup[slug]) {
      index.integration_lookup[slug] = [];
    }

    if (!index.integration_lookup[slug].includes(reportSlug)) {
      index.integration_lookup[slug].push(reportSlug);
    }

    // Save individual JSON for quick lookup
    const jsonPath = join(libraryPath, `${slug}.json`);
    const jsonContent = JSON.stringify(research, null, 2);
    writeFileSync(jsonPath, jsonContent);

    // PERSIST TO SQLITE
    if (db) {
      try {
        const entry = {
          slug,
          title: research.title || research.integration_name || name,
          file_path: `${slug}.json`,
          file_format: 'json',
          created_at: research.research_date || date,
          complexity_score: research.complexity?.score || 5,
          effort_tier: research.complexity?.tier || 'moderate',
          confidence,
          base_hours: research.effort_recommendation?.base_hours || research.estimated_hours || 8,
          generated: true
        };
        await db.addEntry(entry, [name, slug]);
        console.log(`   ✓ Indexed ${name} in SQLite`);
      } catch (error) {
        console.warn(`   ⚠ Failed to index ${name} in SQLite:`, error.message);
      }
    }
  }

  if (db) await db.close();

  // Add integration details sections
  combinedMarkdown += '\n---\n\n## Integration Details\n\n';

  let sectionNum = 1;
  for (const result of results) {
    const {research} = result;
    combinedMarkdown += `### ${sectionNum}. ${result.integration}

**Native n8n Node**: ${research.has_native_n8n_node ? `Yes - \`${research.native_node_name || 'varies'}\`` : 'No (HTTP Request required)'}

**Authentication**: ${research.auth_notes || research.auth_type || 'Unknown'}

**Key Gotchas**:
${(research.gotchas || ['No known issues']).map(g => `- ${g}`).join('\n')}

**Complexity Score**: ${research.complexity_score || research.complexity?.score || 5}/10 → ${research.complexity_tier || research.complexity?.tier || 'moderate'}

**Estimated Hours**: ${research.estimated_hours || research.complexity?.estimated_hours || 8}

---

`;
    sectionNum++;
  }

  // Add complexity analysis
  const avgComplexity = Math.round(totalComplexity / results.length * 10) / 10;
  const avgConfidence = Math.round(totalConfidence / results.length * 100);
  const overallTier = avgComplexity > 7 ? 'complex' : avgComplexity > 4 ? 'moderate' : 'standard';
  const totalHours = results.reduce((sum, r) => sum + (r.research.estimated_hours || r.research.complexity?.estimated_hours || 8), 0);

  combinedMarkdown += `## Complexity Analysis

### Overall Score: ${avgComplexity}/10 → ${overallTier}

**Total Estimated Hours**: ${totalHours}

---

## Effort Recommendation

**Tier**: ${overallTier}
**Base Hours**: ${totalHours}

**Caveats**:
- This research was auto-generated; verify findings before final estimation
- For production estimates, use the technical-research skill with MCP tools
`;

  // Save combined markdown report
  const mdPath = join(libraryPath, `${reportSlug}.md`);
  writeFileSync(mdPath, combinedMarkdown);

  // Update index
  index.research_files[reportSlug] = {
    file: `${reportSlug}.md`,
    integrations: integrationSlugs,
    created_at: date,
    complexity_score: avgComplexity,
    effort_tier: overallTier,
    confidence: avgConfidence / 100,
    business_process: workflowName,
    base_hours: totalHours,
    generated: true
  };

  index.last_updated = new Date().toISOString();
  index.stats.total_reports = Object.keys(index.research_files).length;
  index.stats.integrations_covered = Object.keys(index.integration_lookup).length;

  // Calculate average confidence
  const confidences = Object.values(index.research_files).map(r => Number.isFinite(r.confidence) ? r.confidence : 0);
  index.stats.average_confidence = Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length * 100) / 100;

  writeFileSync(indexPath, JSON.stringify(index, null, 2));

  console.log(`   📁 Cached to: ${libraryPath}/${reportSlug}.md`);
  if (!isLocal) {
    console.log(`   ✓ Updated n8n-methodology library index`);
  }
}

/**
 * Load generated research from local cache
 * @param {string} integrationName - Name of integration
 * @returns {object|null} Cached research or null
 */
export function loadGeneratedResearch(integrationName) {
  const slug = sanitizeSlug(integrationName);

  // Try n8n library first, then local
  for (const basePath of [N8N_RESEARCH_LIBRARY_PATH, LOCAL_RESEARCH_PATH]) {
    const filePath = join(basePath, `${slug}.json`);
    if (existsSync(filePath)) {
      try {
        const research = JSON.parse(readFileSync(filePath, 'utf-8'));
        const researchDate = new Date(research.research_date);
        const daysSince = Math.floor((Date.now() - researchDate.getTime()) / (1000 * 60 * 60 * 24));

        // Generated research expires after 7 days
        if (daysSince > 7) {
          console.log(`   ⚠ Generated research for ${integrationName} is stale (${daysSince} days old)`);
          return null;
        }

        return { ...research, from_generated_cache: true, cache_age_days: daysSince };
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Generate a combined research summary for all integrations
 * @param {object[]} researchResults - Results from performProactiveResearch
 * @returns {object} Summary statistics
 */
export function generateResearchSummary(researchResults) {
  const summary = {
    total_integrations: researchResults.length,
    successful_research: 0,
    failed_research: 0,
    total_estimated_hours: 0,
    average_complexity: 0,
    native_node_count: 0,
    auth_types: {},
    complexity_distribution: { simple: 0, moderate: 0, complex: 0, enterprise: 0 }
  };

  const complexityScores = [];

  for (const result of researchResults) {
    const {research} = result;

    if (research.found) {
      summary.successful_research++;

      if (research.complexity?.score) complexityScores.push(research.complexity.score);
      if (research.complexity?.estimated_hours) summary.total_estimated_hours += research.complexity.estimated_hours;
      if (research.has_native_node || research.has_native_n8n_node) summary.native_node_count++;

      const authType = research.auth_type || 'unknown';
      summary.auth_types[authType] = (summary.auth_types[authType] || 0) + 1;

      const tier = research.complexity?.tier || 'moderate';
      if (summary.complexity_distribution[tier] !== undefined) {
        summary.complexity_distribution[tier]++;
      }
    } else {
      summary.failed_research++;
    }
  }

  if (complexityScores.length > 0) {
    summary.average_complexity = Math.round(complexityScores.reduce((a, b) => a + b, 0) / complexityScores.length * 10) / 10;
  }

  return summary;
}

/**
 * Merge proactive research with existing integration research results
 * @param {object[]} existingResearch - Results from researchAllIntegrations
 * @param {object[]} proactiveResearch - Results from performProactiveResearch
 * @returns {object[]} Merged results
 */
export function mergeResearchResults(existingResearch, proactiveResearch) {
  const merged = [...existingResearch];

  for (const proactive of proactiveResearch) {
    const name = (proactive.integration || proactive.system || '').toLowerCase();
    const existingIndex = merged.findIndex(r =>
      (r.integration || r.system || '').toLowerCase() === name
    );

    if (existingIndex === -1) {
      merged.push(proactive);
    } else if (!merged[existingIndex].research?.found) {
      merged[existingIndex] = proactive;
    }
  }

  return merged;
}

export default {
  researchIntegrationWithLLM,
  performProactiveResearch,
  loadGeneratedResearch,
  generateResearchSummary,
  mergeResearchResults
};
