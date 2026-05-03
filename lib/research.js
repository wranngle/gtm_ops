/**
 * Prospect Research Module
 * Generates research queries and performs quick tier assessments
 */

import { executeLLMJson } from '../src/services/llm.ts';

/**
 * Build research queries for a prospect
 * These queries should be run via Exa MCP
 * @param {object} intake - Intake data from extraction
 * @returns {string[]} Array of search queries
 */
export function buildResearchQueries(intake) {
  const prospectName = intake.client?.name || 'Unknown Company';
  const targetIntegrations = intake.project?.integrations || [];

  const searchQueries = [
    // Company research
    `${prospectName} company funding valuation`,
    `${prospectName} employee count linkedin`,
    `${prospectName} technology stack`,
    `${prospectName} reviews glassdoor`
  ];

  // API documentation research for each integration
  for (const integration of targetIntegrations) {
    searchQueries.push(`${integration.name} API documentation`, `${integration.name} API authentication`);
  }

  return searchQueries;
}

/**
 * Generate research queries and instructions
 * @param {object} intake - Intake data from extraction
 * @returns {object} Research plan
 */
export function generateResearchPlan(intake) {
  const searchQueries = buildResearchQueries(intake);

  return {
    company: intake.client?.name || 'Unknown',
    queries: searchQueries,
    instructions: `
Run these queries via Exa AI (MCP configured):

${searchQueries.map((query, index) => `${index + 1}. "${query}"`).join('\n')}

Consolidate findings for tier assessment.
`,
    depth: intake.classification?.estimated_tier === 'enterprise' ? 'deep' : 'standard'
  };
}

/**
 * Quick tier assessment without full research
 * @param {object} intake - Intake data
 * @returns {Promise<object>} Quick tier assessment
 */
export async function quickTierAssessment(intake) {
  // Extract client info from various possible locations in intake structure
  const accountName = intake.prepared_for?.account_name ||
    intake.client?.name ||
    'Unknown';

  // Extract workflow/project info
  const processName = intake.section_a_workflow_definition?.q01_workflow_name ||
    intake.project?.workflow_name ||
    'Unknown';

  // Extract systems/integrations from section_c
  const declaredSystems = intake.section_c_systems_handoffs?.q10_systems_involved || [];
  const legacySystems = intake.project?.integrations || [];

  // Combine and dedupe
  const consolidatedSystems = [...new Set([...declaredSystems, ...legacySystems])];

  // Estimate complexity from system count
  const integrationCount = consolidatedSystems.length;
  const estimatedComplexity = integrationCount > 5 ? 'enterprise' 
    : integrationCount > 2 ? 'mid-market' 
      : 'startup';

  const tierAssessmentPrompt = `
Based on this project intake, provide a quick client tier assessment:

Client: ${accountName}
Workflow: ${processName}
Systems Involved: ${consolidatedSystems.join(', ') || 'None specified'}
System Count: ${integrationCount}

Return JSON:
{
  "key": "standard",
  "label": "Standard Integration",
  "tier": "${estimatedComplexity}",
  "baseHours": ${integrationCount <= 2 ? 40 : integrationCount <= 5 ? 80 : 120},
  "riskMultiplier": ${integrationCount > 5 ? 1.3 : integrationCount > 2 ? 1.15 : 1},
  "pricing_strategy": "standard",
  "confidence": 0.7,
  "rationale": "Based on ${integrationCount} systems requiring integration",
  "factors": [${consolidatedSystems.slice(0, 5).map(sys => `"${sys}"`).join(', ')}],
  "needs_deep_research": ${integrationCount > 5}
}

Return ONLY the JSON object.
`;

  try {
    const llmResponse = await executeLLMJson(tierAssessmentPrompt, { task: 'research' });
    // Handle both old API (result.data) and new API (result is the data directly)
    return llmResponse?.data || llmResponse;
  } catch (error) {
    // Fallback to deterministic tier assessment when LLM is unavailable
    console.warn(`[Tier Assessment] LLM unavailable (${error.message}), using deterministic fallback`);
    return {
      key: integrationCount <= 2 ? 'simple' : integrationCount <= 5 ? 'standard' : 'complex',
      label: integrationCount <= 2 ? 'Simple Integration' : integrationCount <= 5 ? 'Standard Integration' : 'Complex Integration',
      tier: estimatedComplexity,
      baseHours: integrationCount <= 2 ? 40 : integrationCount <= 5 ? 80 : 120,
      riskMultiplier: integrationCount > 5 ? 1.3 : integrationCount > 2 ? 1.15 : 1,
      pricing_strategy: 'standard',
      confidence: 0.6,
      rationale: `Deterministic assessment based on ${integrationCount} systems (LLM unavailable)`,
      factors: consolidatedSystems.slice(0, 5),
      needs_deep_research: integrationCount > 5
    };
  }
}
