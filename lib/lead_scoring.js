/**
 * Lead Scoring - Calculate lead qualification scores
 * @module lib/lead_scoring
 *
 * Provides:
 * - calculateLeadScore: Calculate weighted lead score (0-100)
 * - getLeadStatus: Determine hot/warm/cold status
 * - getComponentScores: Get breakdown by qualification component
 */

// -----------------------------------------------------------------------------
// Default Configuration
// -----------------------------------------------------------------------------

const DEFAULT_THRESHOLDS = {
  hot: 75,
  warm: 50,
};

const DEFAULT_WEIGHTS = {
  budget_alignment: 20,
  integration_complexity: 15,
  volume_potential: 15,
  timeline_urgency: 10,
  decision_maker_access: 15,
  pain_severity: 15,
  api_readiness: 10,
};

// -----------------------------------------------------------------------------
// Scoring Rules
// -----------------------------------------------------------------------------

/**
 * Calculate budget alignment score (0-100)
 * Based on budget range and whether it aligns with typical project costs
 */
function scoreBudgetAlignment(formData) {
  const budget = formData.q28_budget_range;
  const budgetScores = {
    'under_5k': 20,
    '5k_15k': 50,
    '15k_30k': 80,
    '30k_50k': 100,
    'over_50k': 100,
    'not_sure': 40,
  };
  return budgetScores[budget] ?? 30;
}

/**
 * Calculate integration complexity score (0-100)
 * Lower complexity = higher score (easier to implement)
 */
function scoreIntegrationComplexity(formData) {
  const systems = formData.q10_systems_involved || [];
  const systemCount = Array.isArray(systems) ? systems.length : 0;

  // Fewer systems = higher score (simpler project, more likely to succeed)
  if (systemCount === 0) return 40; // No systems might mean unclear scope
  if (systemCount <= 2) return 100;
  if (systemCount <= 4) return 80;
  if (systemCount <= 6) return 60;
  if (systemCount <= 8) return 40;
  return 20; // 9+ systems is very complex
}

/**
 * Calculate volume potential score (0-100)
 * Higher volume = more value from automation
 */
function scoreVolumePotential(formData) {
  const runsPerPeriod = Number(formData.q06_runs_per_period) || 0;
  const periodUnit = formData.q06_period_unit || 'day';

  // Normalize to monthly runs
  let monthlyRuns = runsPerPeriod;
  switch (periodUnit) {
    case 'hour': { monthlyRuns = runsPerPeriod * 24 * 30; break;
    }

    case 'day': { monthlyRuns = runsPerPeriod * 30; break;
    }

    case 'week': { monthlyRuns = runsPerPeriod * 4; break;
    }

    case 'month': { monthlyRuns = runsPerPeriod; break;
    }
  }

  if (monthlyRuns >= 1000) return 100;
  if (monthlyRuns >= 500) return 90;
  if (monthlyRuns >= 200) return 80;
  if (monthlyRuns >= 100) return 70;
  if (monthlyRuns >= 50) return 60;
  if (monthlyRuns >= 20) return 50;
  if (monthlyRuns >= 10) return 40;
  return 30;
}

/**
 * Calculate timeline urgency score (0-100)
 * Urgent timeline = higher score (ready to buy)
 */
function scoreTimelineUrgency(formData) {
  const timeline = formData.q27_timeline;
  const timelineScores = {
    'immediate': 100,
    '1_3_months': 80,
    '3_6_months': 60,
    '6_12_months': 40,
    'exploring': 30,
  };
  return timelineScores[timeline] ?? 50;
}

/**
 * Calculate decision maker access score (0-100)
 * Direct access to decision maker = higher score
 */
function scoreDecisionMakerAccess(formData) {
  const decisionMaker = formData.q26_decision_maker;
  const decisionScores = {
    'self': 100,
    'partner': 90,
    'manager': 70,
    'committee': 50,
    'unknown': 30,
  };
  return decisionScores[decisionMaker] ?? 50;
}

/**
 * Calculate pain severity score (0-100)
 * More severe pain = higher score (more motivated to buy)
 *
 * Aligned with Voice Agent hot/warm signals:
 * - personal_cell: HOT signal (getting woken up for non-emergencies)
 * - voicemail: HOT signal (missing emergency calls to competitors)
 * - answering_service: WARM signal (paying ~$2K/month)
 */
function scorePainSeverity(formData) {
  let score = 50; // Base score

  // Check current_solution (aligned with Voice Agent discovery)
  const currentSolution = formData.current_solution;
  const solutionScores = {
    'personal_cell': 25, // HOT: Getting woken up for non-emergencies
    'voicemail': 20,     // HOT: Missing emergency calls to competitors
    'answering_service': 10, // WARM: Paying ~$2K/month for limited service
    'staff_rotation': 5,
    'not_applicable': 0,
  };
  score += solutionScores[currentSolution] ?? 0;

  // Check for explicit pain indicators
  const costIfFailed = formData.q14_cost_if_slow_or_failed;
  if (costIfFailed && costIfFailed.length > 50) {
    score += 15;
  }

  const commonFailures = formData.q13_common_failures;
  if (commonFailures && commonFailures.length > 30) {
    score += 10;
  }

  const oneThingToFix = formData.q15_one_thing_to_fix;
  if (oneThingToFix && oneThingToFix.length > 20) {
    score += 10;
  }

  return Math.min(score, 100);
}

/**
 * Calculate API readiness score (0-100)
 * Uses research complexity when available, falls back to catalog flags
 *
 * Scoring strategy:
 * - If research complexity available: (10 - complexity) * 10 (lower complexity = higher score)
 * - Else if native node: 100
 * - Else if API: 60
 * - Else: 30 (unknown)
 *
 * @param {Record<string, unknown>} formData - Form responses
 * @param {Object} systemsCatalog - Systems catalog (legacy)
 * @param {Map<string, Object>} [systemIntelligence] - Unified intelligence map (preferred)
 * @returns {number} Score 0-100
 */
function scoreApiReadiness(formData, systemsCatalog, systemIntelligence = null) {
  const systems = formData.q10_systems_involved || [];
  if (!Array.isArray(systems) || systems.length === 0) {
    return 50; // Neutral if no systems specified
  }

  const catalogSystems = systemsCatalog?.systems || [];
  let totalScore = 0;
  let scoredSystems = 0;

  for (const systemId of systems) {
    const normalizedId = String(systemId).toLowerCase().trim();

    // Priority 1: Check unified intelligence (research-enriched)
    if (systemIntelligence) {
      const intel = systemIntelligence.get(normalizedId);
      if (intel && intel.complexity_score) {
        // Invert: lower complexity = higher readiness score
        // complexity_score is 1-10, so (10 - score) * 10 gives 0-90 range
        totalScore += (10 - intel.complexity_score) * 10;
        scoredSystems++;
        continue;
      }

      // Intelligence exists but no complexity - use catalog flags from intel
      if (intel) {
        if (intel.has_native_node) {
          totalScore += 100;
        } else if (intel.has_api) {
          totalScore += 60;
        } else {
          totalScore += 30;
        }

        scoredSystems++;
        continue;
      }
    }

    // Priority 2: Fall back to catalog lookup (backward compatibility)
    const systemInfo = catalogSystems.find((s) => s.id === normalizedId || s.name.toLowerCase() === normalizedId);
    if (systemInfo) {
      if (systemInfo.has_native_node) {
        totalScore += 100;
      } else if (systemInfo.has_api) {
        totalScore += 60;
      } else {
        totalScore += 30;
      }

      scoredSystems++;
      continue;
    }

    // Unknown system - low score
    totalScore += 30;
    scoredSystems++;
  }

  // Average score across all systems
  return scoredSystems > 0 ? Math.round(totalScore / scoredSystems) : 50;
}

// -----------------------------------------------------------------------------
// Main Functions
// -----------------------------------------------------------------------------

/**
 * Calculate the lead qualification score
 * @param {Record<string, unknown>} formData - Form responses
 * @param {Object} config - Qualification configuration
 * @param {Object} [systemsCatalog] - Optional systems catalog for API scoring
 * @param {Map<string, Object>} [systemIntelligence] - Optional unified intelligence map (preferred)
 * @returns {{ score: number, components: Object[] }}
 */
export function calculateLeadScore(formData, config, systemsCatalog = null, systemIntelligence = null) {
  const weights = { ...DEFAULT_WEIGHTS, ...config?.weights };
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

  // Calculate raw scores for each component
  const rawScores = {
    budget_alignment: scoreBudgetAlignment(formData),
    integration_complexity: scoreIntegrationComplexity(formData),
    volume_potential: scoreVolumePotential(formData),
    timeline_urgency: scoreTimelineUrgency(formData),
    decision_maker_access: scoreDecisionMakerAccess(formData),
    pain_severity: scorePainSeverity(formData),
    api_readiness: scoreApiReadiness(formData, systemsCatalog, systemIntelligence),
  };

  // Calculate weighted scores
  const components = [];
  let totalScore = 0;

  for (const [name, rawScore] of Object.entries(rawScores)) {
    const weight = weights[name] || 0;
    const weightedScore = (rawScore * weight) / totalWeight;
    totalScore += weightedScore;

    components.push({
      name,
      weight,
      raw_score: rawScore,
      weighted_score: Math.round(weightedScore * 10) / 10,
      status: rawScore >= 70 ? 'healthy' : rawScore >= 40 ? 'warning' : 'critical',
      label: formatComponentLabel(name),
    });
  }

  return {
    score: Math.round(totalScore),
    components,
  };
}

/**
 * Determine lead status based on score
 * @param {number} score - Lead score (0-100)
 * @param {Object} [thresholds] - Custom thresholds
 * @returns {{ status: 'hot' | 'warm' | 'cold', label: string }}
 */
export function getLeadStatus(score, thresholds = DEFAULT_THRESHOLDS) {
  const { hot, warm } = { ...DEFAULT_THRESHOLDS, ...thresholds };

  if (score >= hot) {
    return { status: 'hot', label: 'HOT LEAD' };
  }

  if (score >= warm) {
    return { status: 'warm', label: 'WARM LEAD' };
  }

  return { status: 'cold', label: 'NEEDS DISCOVERY' };
}

/**
 * Get the complete lead qualification result
 * @param {Record<string, unknown>} formData - Form responses
 * @param {Object} config - Qualification configuration
 * @param {Object} [systemsCatalog] - Optional systems catalog
 * @param {Map<string, Object>} [systemIntelligence] - Optional unified intelligence map
 * @returns {Object} Complete qualification result
 */
export function getLeadQualification(formData, config, systemsCatalog = null, systemIntelligence = null) {
  const { score, components } = calculateLeadScore(formData, config, systemsCatalog, systemIntelligence);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...config?.thresholds };
  const { status, label } = getLeadStatus(score, thresholds);

  return {
    score,
    score_display: `${score}/100`,
    status,
    status_label: label,
    components,
    captured_at: new Date().toISOString(),
  };
}

/**
 * Get component scores breakdown for display
 * @param {Record<string, unknown>} formData - Form responses
 * @param {Object} config - Qualification configuration
 * @param {Object} [systemsCatalog] - Optional systems catalog
 * @param {Map<string, Object>} [systemIntelligence] - Optional unified intelligence map
 * @returns {Object[]} Array of component score objects
 */
export function getComponentScores(formData, config, systemsCatalog = null, systemIntelligence = null) {
  const { components } = calculateLeadScore(formData, config, systemsCatalog, systemIntelligence);
  return components;
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

/**
 * Format component name to human-readable label
 * @param {string} name - Component name (snake_case)
 * @returns {string} Human-readable label
 */
function formatComponentLabel(name) {
  const labels = {
    budget_alignment: 'Budget Alignment',
    integration_complexity: 'Integration Simplicity',
    volume_potential: 'Volume Potential',
    timeline_urgency: 'Timeline Urgency',
    decision_maker_access: 'Decision Maker Access',
    pain_severity: 'Pain Severity',
    api_readiness: 'API Readiness',
  };
  return labels[name] || name.replaceAll('_', ' ').replaceAll(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Generate key metrics summary from form data
 * @param {Record<string, unknown>} formData - Form responses
 * @param {Object} qualification - Lead qualification result
 * @returns {Object} Key metrics for display
 */
export function getKeyMetrics(formData, qualification) {
  const systems = formData.q10_systems_involved || [];
  const systemsCount = Array.isArray(systems) ? systems.length : 0;

  // Calculate complexity score (0-10)
  const complexityScore = Math.round((100 - qualification.components.find(c => c.name === 'integration_complexity')?.raw_score || 50) / 10);

  // Determine risk level
  let riskLevel = 'low';
  if (complexityScore >= 7 || systemsCount >= 6) {
    riskLevel = 'high';
  } else if (complexityScore >= 4 || systemsCount >= 4) {
    riskLevel = 'medium';
  }

  // Determine ROI potential
  const volumeScore = qualification.components.find(c => c.name === 'volume_potential')?.raw_score || 50;
  let roiPotential = 'medium';
  if (volumeScore >= 80) {
    roiPotential = 'high';
  } else if (volumeScore < 50) {
    roiPotential = 'low';
  }

  return {
    systems_count: systemsCount,
    systems_count_display: `${systemsCount} system${systemsCount === 1 ? '' : 's'}`,
    complexity_score: complexityScore,
    complexity_display: `${complexityScore}/10`,
    risk_level: riskLevel,
    risk_display: riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1),
    roi_potential: roiPotential,
    roi_display: roiPotential.charAt(0).toUpperCase() + roiPotential.slice(1),
  };
}

/**
 * Generate company profile from form data
 * @param {Record<string, unknown>} formData - Form responses
 * @returns {Object} Company profile for display
 */
export function getCompanyProfile(formData) {
  return {
    account_name: formData.q01_account_name || 'Unknown Company',
    contact_name: formData.q02_contact_name || null,
    contact_title: formData.q03_contact_title || null,
    contact_email: formData.q04_contact_email || null,
    contact_phone: formData.q05_contact_phone || null,
    industry: formData.q25_industry || null,
    company_size: null, // Not currently captured
    workflow_name: formData.q06_workflow_name || 'Workflow',
    volume_display: formData.q06_runs_per_period
      ? `${formData.q06_runs_per_period} per ${formData.q06_period_unit || 'day'}`
      : null,
    time_per_item_display: formData.q07_avg_trigger_to_end
      ? `${formData.q07_avg_trigger_to_end} ${formData.q07_time_unit || 'minutes'}`
      : null,
    monthly_bleed_display: null, // Calculated separately in measurements
    systems_involved: formData.q10_systems_involved || [],
  };
}

// -----------------------------------------------------------------------------
// Template Preparation (Mustache helpers)
// -----------------------------------------------------------------------------

/**
 * Prepare lead qualification data for Mustache template
 * Adds boolean helpers for conditional rendering
 * @param {Object} qualification - Lead qualification result
 * @returns {Object} Template-ready qualification object
 */
export function prepareLeadQualificationForTemplate(qualification) {
  if (!qualification) return null;

  // Handle components as object (direct intake) or array (questionnaire)
  let componentsArray = qualification.components || [];
  if (!Array.isArray(componentsArray)) {
    // Convert object to array format
    componentsArray = Object.entries(componentsArray).map(([key, value]) => ({
      id: key,
      ...value,
    }));
  }

  return {
    ...qualification,
    // Status boolean helpers
    _is_hot: qualification.status === 'hot',
    _is_warm: qualification.status === 'warm',
    _is_cold: qualification.status === 'cold',
    // Enhanced components with status booleans
    components: componentsArray.map((c) => ({
      ...c,
      _status_healthy: c.status === 'healthy',
      _status_warning: c.status === 'warning',
      _status_critical: c.status === 'critical',
    })),
  };
}

/**
 * Prepare key metrics for Mustache template
 * @param {Object} metrics - Key metrics object
 * @returns {Object} Template-ready metrics object
 */
export function prepareKeyMetricsForTemplate(metrics) {
  if (!metrics) return null;

  return {
    ...metrics,
    // Risk level booleans
    _risk_high: metrics.risk_level === 'high',
    _risk_medium: metrics.risk_level === 'medium',
    _risk_low: metrics.risk_level === 'low',
    // ROI potential booleans
    _roi_high: metrics.roi_potential === 'high',
    _roi_medium: metrics.roi_potential === 'medium',
    _roi_low: metrics.roi_potential === 'low',
  };
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export default {
  calculateLeadScore,
  getLeadStatus,
  getLeadQualification,
  getComponentScores,
  getKeyMetrics,
  getCompanyProfile,
  prepareLeadQualificationForTemplate,
  prepareKeyMetricsForTemplate,
};
