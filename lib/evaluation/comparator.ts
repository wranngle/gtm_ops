// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * Comparator - Score pipeline output against ground truth
 * @module lib/evaluation/comparator
 *
 * Implements multi-dimensional scoring to measure how well the pipeline's
 * proposal matches the actual solution from case studies.
 *
 * Scoring dimensions (from design.md):
 * - Tier Match (20%) - Did we propose the right complexity tier?
 * - Integration Coverage (25%) - Did we identify the same systems?
 * - Agent Type Alignment (15%) - Did we propose the right agent type?
 * - Pricing Reasonableness (20%) - Is our price within range?
 * - Timeline Realism (10%) - Is our timeline reasonable?
 * - Feature Coverage (10%) - Did we include the right capabilities?
 */

import { DEFAULT_SCORING_CONFIG } from '../schemas/evaluation.schema.js';

// =============================================================================
// Tier Mapping & Scoring
// =============================================================================

/**
 * Map tier names to ordinal values for comparison
 */
const TIER_ORDINALS = {
  lite: 0,
  starter: 0,
  simple: 0,
  standard: 1,
  moderate: 1,
  enterprise: 2,
  complex: 2,
  advanced: 2,
  flagship: 3,
  premium: 3,
};

/**
 * Normalize tier name to standard form
 */
function normalizeTier(tier) {
  if (!tier) return null;
  const lower = String(tier).toLowerCase().trim();

  // Map variations to standard tiers
  if (['lite', 'starter', 'simple', 'basic'].includes(lower)) return 'lite';
  if (['standard', 'moderate', 'regular'].includes(lower)) return 'standard';
  if (['enterprise', 'complex', 'advanced'].includes(lower)) return 'enterprise';
  if (['flagship', 'premium', 'custom'].includes(lower)) return 'flagship';

  return lower;
}

/**
 * Calculate tier match score
 * Exact match = 1.0, Adjacent tier = 0.5, Wrong tier = 0.0
 */
export function scoreTierMatch(pipelineTier, groundTruthTier) {
  const normalizedPipeline = normalizeTier(pipelineTier);
  const normalizedTruth = normalizeTier(groundTruthTier);

  // If either is missing, return partial score with note
  if (!normalizedPipeline || !normalizedTruth) {
    return {
      score: 0.25, // Partial credit for attempt
      rationale: `Missing data: pipeline=${pipelineTier}, truth=${groundTruthTier}`,
      details: { pipeline: pipelineTier, truth: groundTruthTier },
    };
  }

  const pipelineOrdinal = TIER_ORDINALS[normalizedPipeline] ?? -1;
  const truthOrdinal = TIER_ORDINALS[normalizedTruth] ?? -1;

  if (pipelineOrdinal === -1 || truthOrdinal === -1) {
    return {
      score: 0.25,
      rationale: `Unknown tier: pipeline=${normalizedPipeline}, truth=${normalizedTruth}`,
      details: { pipeline: normalizedPipeline, truth: normalizedTruth },
    };
  }

  const diff = Math.abs(pipelineOrdinal - truthOrdinal);

  if (diff === 0) {
    return {
      score: 1,
      rationale: `Exact tier match: ${normalizedTruth}`,
      details: { pipeline: normalizedPipeline, truth: normalizedTruth, diff: 0 },
    };
  }

  if (diff === 1) {
    return {
      score: 0.5,
      rationale: `Adjacent tier: proposed ${normalizedPipeline}, actual ${normalizedTruth}`,
      details: { pipeline: normalizedPipeline, truth: normalizedTruth, diff: 1 },
    };
  }

  return {
    score: 0,
    rationale: `Wrong tier: proposed ${normalizedPipeline}, actual ${normalizedTruth} (${diff} levels off)`,
    details: { pipeline: normalizedPipeline, truth: normalizedTruth, diff },
  };
}

// =============================================================================
// Integration Coverage Scoring
// =============================================================================

/**
 * Common system aliases for fuzzy matching
 * Maps variations to canonical names
 */
const SYSTEM_ALIASES = {
  // Dental systems
  'dentrix': 'dentrix',
  'dentrixg7': 'dentrix',
  'dentrix g7': 'dentrix',
  'eaglesoft': 'eaglesoft',
  'opendental': 'opendental',
  'open dental': 'opendental',
  'curvedental': 'curvedental',
  'curve dental': 'curvedental',

  // CRMs
  'salesforce': 'salesforce',
  'salesforcecrm': 'salesforce',
  'salesforce crm': 'salesforce',
  'hubspot': 'hubspot',
  'hubspotcrm': 'hubspot',
  'hubspot crm': 'hubspot',
  'pipedrive': 'pipedrive',
  'zoho': 'zoho',
  'zohocrm': 'zoho',
  'zoho crm': 'zoho',

  // Calendar
  'googlecalendar': 'googlecalendar',
  'google calendar': 'googlecalendar',
  'gcal': 'googlecalendar',
  'outlookcalendar': 'outlookcalendar',
  'outlook calendar': 'outlookcalendar',
  'calendly': 'calendly',

  // Communication
  'twilio': 'twilio',
  'twiliosms': 'twilio',
  'twilio sms': 'twilio',
  'twiliovoice': 'twilio',
  'twilio voice': 'twilio',
  'ringcentral': 'ringcentral',
  'weave': 'weave',
  'podium': 'podium',

  // Payment
  'stripe': 'stripe',
  'square': 'square',
  'rectanglehealth': 'rectanglehealth',
  'rectangle health': 'rectanglehealth',

  // Accounting
  'quickbooks': 'quickbooks',
  'qb': 'quickbooks',
  'quickbooksonline': 'quickbooks',
  'quickbooks online': 'quickbooks',
  'xero': 'xero',

  // Field service
  'servicetitan': 'servicetitan',
  'service titan': 'servicetitan',
  'jobber': 'jobber',
  'housecallpro': 'housecallpro',
  'housecall pro': 'housecallpro',

  // E-signature
  'docusign': 'docusign',
  'hellosign': 'hellosign',

  // Insurance
  'dentalxchange': 'dentalxchange',
  'dental xchange': 'dentalxchange',
  'availity': 'availity',
  'changehealthcare': 'changehealthcare',
  'change healthcare': 'changehealthcare',

  // Storage/Docs
  'googledrive': 'googledrive',
  'google drive': 'googledrive',
  'dropbox': 'dropbox',
  'onedrive': 'onedrive',

  // Slack/Teams
  'slack': 'slack',
  'microsoftteams': 'microsoftteams',
  'microsoft teams': 'microsoftteams',
  'teams': 'microsoftteams',
};

/**
 * Normalize system name for comparison
 */
function normalizeSystemName(name) {
  if (!name) return '';
  const lower = String(name).toLowerCase().trim();

  // First check alias table with raw lowercase
  if (SYSTEM_ALIASES[lower]) {
    return SYSTEM_ALIASES[lower];
  }

  // Strip parenthetical/bracket suffixes: "Salesforce (CRM)" → "salesforce"
  // "HubSpot [Legacy]" → "hubspot"
  const stripped = lower.replaceAll(/\s*[([][^)\]]*[)\]]\s*/g, '').trim();
  if (stripped && SYSTEM_ALIASES[stripped]) {
    return SYSTEM_ALIASES[stripped];
  }

  // Normalize: remove special chars, spaces
  const normalized = stripped.replaceAll(/[^a-z\d]/g, '');

  // Check alias table again with normalized form
  if (SYSTEM_ALIASES[normalized]) {
    return SYSTEM_ALIASES[normalized];
  }

  return normalized;
}

/**
 * Check if two system names match (fuzzy)
 */
function systemNamesMatch(name1, name2) {
  const norm1 = normalizeSystemName(name1);
  const norm2 = normalizeSystemName(name2);

  // Exact match after normalization
  if (norm1 === norm2) return true;

  // One contains the other (for partial matches like "dentrix" vs "dentrixg7")
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  // Check if first part matches (for versioned systems like "Dentrix G7")
  const words1 = norm1.replaceAll(/\d/g, '').trim();
  const words2 = norm2.replaceAll(/\d/g, '').trim();
  if (words1 && words2 && (words1 === words2 || words1.includes(words2) || words2.includes(words1))) {
    return true;
  }

  return false;
}

/**
 * Calculate Jaccard similarity between two sets with fuzzy matching
 */
function jaccardSimilarity(setA, setB) {
  const a = setA.map(normalizeSystemName).filter(Boolean);
  const b = setB.map(normalizeSystemName).filter(Boolean);

  if (a.length === 0 && b.length === 0) return 1; // Both empty = match
  if (a.length === 0 || b.length === 0) return 0; // One empty = no match

  // Count matches using fuzzy matching
  const matchedA = new Set();
  const matchedB = new Set();

  for (const nameA of a) {
    for (const nameB of b) {
      if (systemNamesMatch(nameA, nameB)) {
        matchedA.add(nameA);
        matchedB.add(nameB);
      }
    }
  }

  // Union size = total unique items that had at least one match
  const unionSize = new Set([...a, ...b]).size - matchedB.size + matchedA.size;

  // Intersection is the matched set size
  const intersectionSize = matchedA.size;

  return intersectionSize / Math.max(1, unionSize);
}

/**
 * Calculate integration coverage score using Jaccard similarity with fuzzy matching
 */
export function scoreIntegrationCoverage(pipelineIntegrations, groundTruthIntegrations) {
  // Extract system names from various formats
  const extractNames = (list) => {
    if (!list) return [];
    return list
      .filter((item) => item != null) // Filter out null/undefined
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item.system_name) return item.system_name;
        if (item.name) return item.name;
        return String(item);
      });
  };

  const pipelineNames = extractNames(pipelineIntegrations);
  const truthNames = extractNames(groundTruthIntegrations);

  const similarity = jaccardSimilarity(pipelineNames, truthNames);

  // Find what's missing and what's extra using fuzzy matching
  const pipelineNorm = pipelineNames.map(normalizeSystemName);
  const truthNorm = truthNames.map(normalizeSystemName);

  // A truth item is missing if no pipeline item fuzzy-matches it
  const missing = truthNorm.filter((truthName) =>
    !pipelineNorm.some((pipeName) => systemNamesMatch(pipeName, truthName))
  );

  // A pipeline item is extra if no truth item fuzzy-matches it
  const extra = pipelineNorm.filter((pipeName) =>
    !truthNorm.some((truthName) => systemNamesMatch(pipeName, truthName))
  );

  return {
    score: similarity,
    rationale: `Jaccard similarity: ${(similarity * 100).toFixed(0)}% (${pipelineNames.length} proposed, ${truthNames.length} actual)`,
    details: {
      pipeline: pipelineNames,
      truth: truthNames,
      missing,
      extra,
      similarity,
    },
  };
}

// =============================================================================
// Agent Type Scoring
// =============================================================================

/**
 * Agent type compatibility matrix
 */
const AGENT_COMPATIBILITY = {
  inbound: { inbound: 1, hybrid: 0.5, outbound: 0 },
  outbound: { outbound: 1, hybrid: 0.5, inbound: 0 },
  hybrid: { hybrid: 1, inbound: 0.5, outbound: 0.5 },
};

/**
 * Calculate agent type alignment score
 */
export function scoreAgentTypeAlignment(pipelineAgentType, groundTruthAgentType) {
  const normalizeType = (type) => {
    if (!type) return null;
    const lower = String(type).toLowerCase().trim();
    if (lower.includes('inbound')) return 'inbound';
    if (lower.includes('outbound')) return 'outbound';
    if (lower.includes('hybrid') || lower.includes('both')) return 'hybrid';
    return lower;
  };

  const pipelineType = normalizeType(pipelineAgentType);
  const truthType = normalizeType(groundTruthAgentType);

  if (!pipelineType || !truthType) {
    return {
      score: 0.25,
      rationale: `Missing agent type: pipeline=${pipelineAgentType}, truth=${groundTruthAgentType}`,
      details: { pipeline: pipelineAgentType, truth: groundTruthAgentType },
    };
  }

  const compatibility = AGENT_COMPATIBILITY[truthType]?.[pipelineType] ?? 0;

  return {
    score: compatibility,
    rationale: compatibility === 1
      ? `Exact agent type match: ${truthType}`
      : compatibility === 0.5
        ? `Compatible agent type: proposed ${pipelineType}, actual ${truthType}`
        : `Wrong agent type: proposed ${pipelineType}, actual ${truthType}`,
    details: { pipeline: pipelineType, truth: truthType },
  };
}

// =============================================================================
// Pricing Reasonableness Scoring
// =============================================================================

/**
 * Calculate pricing reasonableness score
 * Within 30% = 1.0, Within 50% = 0.5, Outside = 0.0
 */
export function scorePricingReasonableness(pipelinePrice, groundTruthPrice, config = {}) {
  const {
    exactThreshold = DEFAULT_SCORING_CONFIG.thresholds.pricing_exact_threshold,
    acceptableThreshold = DEFAULT_SCORING_CONFIG.thresholds.pricing_acceptable_threshold,
  } = config;

  // Handle missing data
  if (pipelinePrice == null || groundTruthPrice == null) {
    return {
      score: 0.5, // Neutral if no comparison possible
      rationale: `Missing price data: pipeline=${pipelinePrice}, truth=${groundTruthPrice}`,
      details: { pipeline: pipelinePrice, truth: groundTruthPrice },
    };
  }

  // Convert to numbers
  const pipeline = Number.parseFloat(pipelinePrice);
  const truth = Number.parseFloat(groundTruthPrice);

  if (isNaN(pipeline) || isNaN(truth) || truth === 0) {
    return {
      score: 0.5,
      rationale: `Invalid price values: pipeline=${pipeline}, truth=${truth}`,
      details: { pipeline, truth },
    };
  }

  // Calculate deviation
  const deviation = Math.abs(pipeline - truth) / truth;

  if (deviation <= exactThreshold) {
    return {
      score: 1,
      rationale: `Price within ${(exactThreshold * 100).toFixed(0)}%: $${pipeline.toLocaleString()} vs $${truth.toLocaleString()} (${(deviation * 100).toFixed(1)}% deviation)`,
      details: { pipeline, truth, deviation, threshold: 'exact' },
    };
  }

  if (deviation <= acceptableThreshold) {
    return {
      score: 0.5,
      rationale: `Price within ${(acceptableThreshold * 100).toFixed(0)}%: $${pipeline.toLocaleString()} vs $${truth.toLocaleString()} (${(deviation * 100).toFixed(1)}% deviation)`,
      details: { pipeline, truth, deviation, threshold: 'acceptable' },
    };
  }

  const direction = pipeline > truth ? 'high' : 'low';
  return {
    score: 0,
    rationale: `Price too ${direction}: $${pipeline.toLocaleString()} vs $${truth.toLocaleString()} (${(deviation * 100).toFixed(1)}% deviation)`,
    details: { pipeline, truth, deviation, threshold: 'outside', direction },
  };
}

// =============================================================================
// Timeline Realism Scoring
// =============================================================================

/**
 * Calculate timeline realism score
 * Within 2 weeks = 1.0, Within 4 weeks = 0.5, Outside = 0.0
 */
export function scoreTimelineRealism(pipelineWeeks, groundTruthWeeks, config = {}) {
  const {
    exactWeeks = DEFAULT_SCORING_CONFIG.thresholds.timeline_exact_weeks,
    acceptableWeeks = DEFAULT_SCORING_CONFIG.thresholds.timeline_acceptable_weeks,
  } = config;

  // Handle missing data
  if (pipelineWeeks == null || groundTruthWeeks == null) {
    return {
      score: 0.5,
      rationale: `Missing timeline data: pipeline=${pipelineWeeks}, truth=${groundTruthWeeks}`,
      details: { pipeline: pipelineWeeks, truth: groundTruthWeeks },
    };
  }

  const pipeline = Number.parseFloat(pipelineWeeks);
  const truth = Number.parseFloat(groundTruthWeeks);

  if (isNaN(pipeline) || isNaN(truth)) {
    return {
      score: 0.5,
      rationale: `Invalid timeline values: pipeline=${pipeline}, truth=${truth}`,
      details: { pipeline, truth },
    };
  }

  const diff = Math.abs(pipeline - truth);

  if (diff <= exactWeeks) {
    return {
      score: 1,
      rationale: `Timeline within ${exactWeeks} weeks: ${pipeline} vs ${truth} weeks (${diff} week difference)`,
      details: { pipeline, truth, diff, threshold: 'exact' },
    };
  }

  if (diff <= acceptableWeeks) {
    return {
      score: 0.5,
      rationale: `Timeline within ${acceptableWeeks} weeks: ${pipeline} vs ${truth} weeks (${diff} week difference)`,
      details: { pipeline, truth, diff, threshold: 'acceptable' },
    };
  }

  const direction = pipeline < truth ? 'optimistic' : 'pessimistic';
  return {
    score: 0,
    rationale: `Timeline too ${direction}: ${pipeline} vs ${truth} weeks (${diff} week difference)`,
    details: { pipeline, truth, diff, threshold: 'outside', direction },
  };
}

// =============================================================================
// Feature Coverage Scoring
// =============================================================================

/**
 * Normalize feature name for comparison
 */
function normalizeFeature(feature) {
  if (!feature) return '';
  return String(feature)
    .toLowerCase()
    .replaceAll(/[^a-z\d\s]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate feature coverage using fuzzy matching
 */
export function scoreFeatureCoverage(pipelineFeatures, groundTruthFeatures) {
  const pipeline = (pipelineFeatures || []).map(normalizeFeature).filter(Boolean);
  const truth = (groundTruthFeatures || []).map(normalizeFeature).filter(Boolean);

  if (truth.length === 0) {
    return {
      score: 1, // No features to match = full score
      rationale: 'No ground truth features to compare',
      details: { pipeline, truth, covered: [], missing: [] },
    };
  }

  if (pipeline.length === 0) {
    return {
      score: 0,
      rationale: 'No pipeline features proposed',
      details: { pipeline, truth, covered: [], missing: truth },
    };
  }

  // Find covered features (fuzzy match)
  const covered = [];
  const missing = [];

  for (const truthFeature of truth) {
    const matched = pipeline.some((pf) => {
      // Exact match
      if (pf === truthFeature) return true;
      // Partial match (one contains the other)
      if (pf.includes(truthFeature) || truthFeature.includes(pf)) return true;
      // Word overlap
      const pWords = new Set(pf.split(' '));
      const tWords = new Set(truthFeature.split(' '));
      const overlap = [...pWords].filter((w) => tWords.has(w)).length;
      return overlap >= Math.min(pWords.size, tWords.size) * 0.5;
    });

    if (matched) {
      covered.push(truthFeature);
    } else {
      missing.push(truthFeature);
    }
  }

  const coverage = covered.length / truth.length;

  return {
    score: coverage,
    rationale: `${covered.length}/${truth.length} features covered (${(coverage * 100).toFixed(0)}%)`,
    details: { pipeline, truth, covered, missing, coverage },
  };
}

// =============================================================================
// Aggregate Scoring
// =============================================================================

/**
 * Calculate weighted aggregate score from all dimensions
 */
export function calculateAggregateScore(dimensionScores, weights = DEFAULT_SCORING_CONFIG.weights) {
  let totalWeightedScore = 0;
  let totalWeight = 0;

  const results = [];

  for (const [dimension, weight] of Object.entries(weights)) {
    const scoreObj = dimensionScores[dimension];
    if (!scoreObj) continue;

    const weightedScore = scoreObj.score * weight;
    totalWeightedScore += weightedScore;
    totalWeight += weight;

    results.push({
      dimension,
      score: scoreObj.score,
      weight,
      weighted_score: weightedScore,
      rationale: scoreObj.rationale,
      details: scoreObj.details,
    });
  }

  // Normalize to 0-100
  const aggregate = totalWeight > 0
    ? (totalWeightedScore / totalWeight) * 100
    : 0;

  return {
    dimensions: results,
    aggregate_score: Number.parseFloat(aggregate.toFixed(2)),
    summary: generateSummary(results),
    comparison_data: extractComparisonData(dimensionScores),
  };
}

/**
 * Generate human-readable summary
 */
function generateSummary(dimensionScores) {
  const strong = dimensionScores.filter((d) => d.score >= 0.7).map((d) => d.dimension);
  const weak = dimensionScores.filter((d) => d.score < 0.4).map((d) => d.dimension);

  const parts = [];
  if (strong.length > 0) {
    parts.push(`Strong: ${strong.join(', ')}`);
  }

  if (weak.length > 0) {
    parts.push(`Weak: ${weak.join(', ')}`);
  }

  return parts.join('. ') || 'Average performance across dimensions';
}

/**
 * Extract key comparison data points
 */
function extractComparisonData(dimensionScores) {
  const data = {};

  if (dimensionScores.tier_match?.details) {
    data.pipeline_tier = dimensionScores.tier_match.details.pipeline;
    data.ground_truth_tier = dimensionScores.tier_match.details.truth;
  }

  if (dimensionScores.integration_coverage?.details) {
    data.pipeline_integrations = dimensionScores.integration_coverage.details.pipeline;
    data.ground_truth_integrations = dimensionScores.integration_coverage.details.truth;
  }

  if (dimensionScores.pricing_reasonableness?.details) {
    data.pipeline_price = dimensionScores.pricing_reasonableness.details.pipeline;
    data.ground_truth_price = dimensionScores.pricing_reasonableness.details.truth;
  }

  if (dimensionScores.timeline_realism?.details) {
    data.pipeline_timeline_weeks = dimensionScores.timeline_realism.details.pipeline;
    data.ground_truth_timeline_weeks = dimensionScores.timeline_realism.details.truth;
  }

  return data;
}

// =============================================================================
// Full Comparison
// =============================================================================

/**
 * Compare pipeline output to ground truth solution
 *
 * @param {object} pipelineOutput - Full pipeline output (estimate, tier, etc.)
 * @param {object} groundTruthSolution - Case study solution section
 * @param {object} config - Scoring configuration
 * @returns {object} Complete evaluation scores
 */
export function compare(pipelineOutput, groundTruthSolution, config = DEFAULT_SCORING_CONFIG) {
  // Extract relevant fields from pipeline output
  const extractFromPipeline = () => {
    // Tier: check multiple paths in the pipeline output
    const tier = pipelineOutput.research?.tier_assessment?.key
      || pipelineOutput.estimate?.tier?.key
      || pipelineOutput.tier?.key
      || pipelineOutput.tier_assessment?.tier_key
      || pipelineOutput.research?.tier?.key;

    // Integrations: check research output and intake systems
    let integrations = pipelineOutput.research?.integrations || [];
    if (Array.isArray(integrations) && integrations.length > 0) {
      // Extract system names if objects - check multiple possible field names
      integrations = integrations.map((i) => {
        if (typeof i === 'string') return i;
        // Pipeline uses .integration or .system, ground truth uses .name or .system_name
        return i.integration || i.system || i.name || i.system_name || '';
      }).filter(Boolean); // Remove empty strings
    }

    // Fallback to intake systems if no research integrations
    if (integrations.every((i) => !i)) {
      integrations = pipelineOutput.intake?.section_c_systems_handoffs?.q10_systems_involved || [];
    }

    // Price: check estimate and pricing structures
    const price = pipelineOutput.pricing?.final_price
      || pipelineOutput.estimate?.total_cost?.value
      || pipelineOutput.estimate?.total_cost
      || pipelineOutput.pricing?.grand_total
      || pipelineOutput.pricing?.total;

    // Timeline: multiple paths
    const totalHours = pipelineOutput.estimate?.hours?.total
      || pipelineOutput.estimate?.effort?.total_hours
      || 160; // default to 4 weeks
    const timelineWeeks = pipelineOutput.estimate?.timeline_weeks
      || pipelineOutput.milestones?.total_weeks
      || Math.ceil(totalHours / 40);

    // Features: aggregate from all sources (don't short-circuit — milestone
    // deliverables are generic; business capabilities live in multiple places)
    const features = [
      ...(pipelineOutput.proposal?.key_features || []),
      ...(pipelineOutput.technical_approach?.features || []),
      ...(pipelineOutput.audit_report?.recommendations?.map((r) => r.title || r.recommendation || r) || []),
      ...(pipelineOutput.audit_report?.scorecard?.rows?.map((r) => r.process_name || r.name || r) || []),
      ...(pipelineOutput.proposal?.scope?.in_scope || []),
      ...(pipelineOutput.features || []),
    ].filter(Boolean);

    // Infer agent type from classification or workflow.
    // (intake.classification.project_type like "voice_agent" needs an
    // inbound/outbound/hybrid mapping pass that is not yet wired here.)
    let agentType = pipelineOutput.agent_type;

    if (!agentType) {
      // Check workflow name and content for direction hints
      const allText = JSON.stringify(pipelineOutput).toLowerCase();
      const workflowName = (pipelineOutput.intake?.section_a_workflow_definition?.q01_workflow_name || '').toLowerCase();

      if (allText.includes('outbound') || workflowName.includes('outbound')
        || workflowName.includes('reminder') || workflowName.includes('outreach')
        || workflowName.includes('follow-up')) {
        agentType = 'outbound';
      } else if (allText.includes('inbound') || workflowName.includes('inbound')
        || workflowName.includes('intake') || workflowName.includes('support')
        || workflowName.includes('scheduling') || workflowName.includes('after-hours')) {
        agentType = 'inbound';
      } else {
        // Default to hybrid for voice agents with unclear direction
        agentType = 'hybrid';
      }
    }

    return { tier, integrations, price, timelineWeeks, features, agentType };
  };

  const pipeline = extractFromPipeline();

  // Extract ground truth values - supports both legacy and factory formats
  const truthTier = groundTruthSolution.inferred_tier || groundTruthSolution.tier;

  // Integrations: handle both array of objects and array of strings
  let truthIntegrations = groundTruthSolution.integrations || [];
  if (truthIntegrations.length > 0 && typeof truthIntegrations[0] === 'object') {
    truthIntegrations = truthIntegrations.map((i) => i.system_name || i.name);
  }

  // Price: support both pricing_model and price_min/price_max
  const truthPrice = groundTruthSolution.pricing_model?.total_cost
    || groundTruthSolution.pricing_model?.monthly_cost
    || (groundTruthSolution.price_min && groundTruthSolution.price_max
      ? (groundTruthSolution.price_min + groundTruthSolution.price_max) / 2
      : null);

  // Features: support both key_features and features
  const truthFeatures = groundTruthSolution.key_features || groundTruthSolution.features || [];

  // Score each dimension
  const dimensionScores = {
    tier_match: scoreTierMatch(
      pipeline.tier,
      truthTier
    ),
    integration_coverage: scoreIntegrationCoverage(
      pipeline.integrations,
      truthIntegrations
    ),
    agent_type_alignment: scoreAgentTypeAlignment(
      pipeline.agentType,
      groundTruthSolution.agent_type
    ),
    pricing_reasonableness: scorePricingReasonableness(
      pipeline.price,
      truthPrice,
      config.thresholds
    ),
    timeline_realism: scoreTimelineRealism(
      pipeline.timelineWeeks,
      groundTruthSolution.timeline_weeks,
      config.thresholds
    ),
    feature_coverage: scoreFeatureCoverage(
      pipeline.features,
      truthFeatures
    ),
  };

  // Calculate aggregate
  const aggregateResult = calculateAggregateScore(dimensionScores, config.weights);

  // Detect flaws
  const flaws = detectFlaws(aggregateResult);

  return {
    ...aggregateResult,
    flaws,
  };
}

// =============================================================================
// Flaw Detection
// =============================================================================

/**
 * Detect flaws from scoring results
 */
export function detectFlaws(scores) {
  const flaws = [];

  for (const dim of scores.dimensions) {
    const { dimension, details } = dim;

    // Tier flaws
    if (dimension === 'tier_match' && details?.diff && details.pipeline && details.truth) {
      const pOrd = TIER_ORDINALS[details.pipeline] ?? 0;
      const tOrd = TIER_ORDINALS[details.truth] ?? 0;
      if (pOrd < tOrd) flaws.push('TIER_UNDERESTIMATE');
      if (pOrd > tOrd) flaws.push('TIER_OVERESTIMATE');
    }

    // Integration flaws
    if (dimension === 'integration_coverage') {
      if (details?.missing?.length > 0) flaws.push('MISSING_INTEGRATION');
      if (details?.extra?.length > 2) flaws.push('EXTRA_INTEGRATION');
    }

    // Pricing flaws
    if (dimension === 'pricing_reasonableness' && details?.direction) {
      if (details.direction === 'high') flaws.push('PRICE_TOO_HIGH');
      if (details.direction === 'low') flaws.push('PRICE_TOO_LOW');
    }

    // Timeline flaws
    if (dimension === 'timeline_realism' && details?.direction) {
      if (details.direction === 'optimistic') flaws.push('TIMELINE_OPTIMISTIC');
      if (details.direction === 'pessimistic') flaws.push('TIMELINE_PESSIMISTIC');
    }

    // Agent type flaw
    if (dimension === 'agent_type_alignment' && dim.score === 0) {
      flaws.push('AGENT_TYPE_MISMATCH');
    }

    // Feature gap
    if (dimension === 'feature_coverage' && details?.missing?.length > 2) {
      flaws.push('FEATURE_GAP');
    }
  }

  return [...new Set(flaws)]; // Dedupe
}

// =============================================================================
// Exports
// =============================================================================

export default {
  // Individual scoring functions
  scoreTierMatch,
  scoreIntegrationCoverage,
  scoreAgentTypeAlignment,
  scorePricingReasonableness,
  scoreTimelineRealism,
  scoreFeatureCoverage,

  // Aggregate
  calculateAggregateScore,

  // Full comparison
  compare,

  // Flaw detection
  detectFlaws,

  // Utilities
  jaccardSimilarity,
};
