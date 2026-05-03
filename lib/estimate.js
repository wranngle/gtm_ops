/**
 * Estimation Engine
 * Calculates project cost and effort estimates
 *
 * MIGRATION: Now uses unified SQLite config via sql.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { executeLLMJson } from '../src/services/llm.ts';
import { ensureLoaded, getLegacyAgencyContext } from '../config/index.js';
import {
  NATIVE_NODE_MULTIPLIER,
  OAUTH2_BUFFER_HOURS,
  DEFAULT_COMPLEXITY_SCORE,
  ARCHITECTURE_BUFFER_PERCENT,
  DEFAULT_CLIENT_HOURLY_RATE,
  PROFIT_FLOOR_PERCENT,
  HARD_FLOOR_COVERAGE_PERCENT,
  MAX_PAYBACK_MONTHS,
  LABOR_SAVINGS_MULTIPLIER
} from './constants.js';
import {
  formatPaybackPeriod
} from './pricing_rules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache for agency context
let agencyContext = null;
let _initialized = false;

/**
 * Initialize estimate config (MUST call before using other functions)
 * @returns {Promise<void>}
 */
export async function initEstimate() {
  if (_initialized) return;

  await ensureLoaded();
  agencyContext = getLegacyAgencyContext();
  _initialized = true;
}

/**
 * Load agency context configuration (sync, requires prior init)
 * @returns {object} Agency context
 */
export function loadAgencyContext() {
  if (!_initialized) {
    throw new Error('Estimate not initialized. Call await initEstimate() first.');
  }

  return agencyContext;
}

/**
 * Load estimation prompt template
 * @returns {string} Prompt template
 */
function loadPromptTemplate() {
  const promptPath = join(__dirname, '..', 'prompts', 'estimate_effort.md');
  return readFileSync(promptPath, 'utf-8');
}

/**
 * Calculate deterministic baseline from research data
 * Provides "rhyme or reason" floor for LLM estimation
 * @param {object} research - Research data
 * @returns {object} Baseline calculation
 */
export function calculateResearchBaseline(research) {
  if (!research || !research.integrations || !Array.isArray(research.integrations)) {
    return {
      total_hours: 0,
      breakdown: [],
      rationale: 'No research data available'
    };
  }

  let totalHours = 0;
  const breakdown = [];

  for (const item of research.integrations) {
    const details = item.research || {};
    let hours = 0;
    let source = 'default';

    // Priority 1: Research-derived base hours (from n8n library)
    if (details.estimated_hours) {
      hours = details.estimated_hours;
      source = 'n8n_research';
    } 
    // Priority 2: Complexity-based fallback
    else if (details.complexity?.estimated_hours) {
      hours = details.complexity.estimated_hours;
      source = 'complexity_derived';
    }
    // Priority 3: Tier-based fallback (uses config values)
    else {
      const tier = details.complexity_tier || details.complexity?.tier || 'moderate';
      const tierHours = agencyContext?.integration_tier_hours || {
        simple: 4, standard: 8, moderate: 12, complex: 24, enterprise: 40, default: 8
      };
      hours = tierHours[tier] ?? tierHours.default;
      source = 'tier_heuristic';
    }

    // Adjustment: Native Node (reduces effort)
    if (details.has_native_n8n_node || details.has_native_node) {
      hours = Math.ceil(hours * NATIVE_NODE_MULTIPLIER);
      source += '_native_optimized';
    }

    // Adjustment: OAuth2 (adds testing buffer)
    if (details.auth_type === 'oauth2') {
      hours += OAUTH2_BUFFER_HOURS;
      source += '_oauth_buffer';
    }

    totalHours += hours;
    breakdown.push({
      system: item.system || item.name || 'Unknown',
      hours,
      source,
      complexity: details.complexity_score || DEFAULT_COMPLEXITY_SCORE
    });
  }

  // Add Project Management / Architecture buffer
  const architectureBuffer = Math.ceil(totalHours * ARCHITECTURE_BUFFER_PERCENT);
  
  return {
    integration_hours: totalHours,
    architecture_hours: architectureBuffer,
    total_baseline: totalHours + architectureBuffer,
    breakdown,
    rationale: `Derived from ${research.integrations.length} researched integrations + ${Math.round(ARCHITECTURE_BUFFER_PERCENT * 100)}% architecture buffer`
  };
}

/**
 * Validate LLM effort estimation output has required structure.
 * Returns validated effort or throws descriptive error.
 *
 * @param {object} effort - Raw effort object from LLM
 * @returns {object} Validated effort object
 * @throws {Error} If required fields are missing
 */
function validateEffortStructure(effort) {
  if (!effort || typeof effort !== 'object') {
    throw new Error('LLM returned invalid effort structure: expected object');
  }

  // Check for required top-level fields
  const requiredFields = ['hours'];
  const missingFields = requiredFields.filter(f => !(f in effort));
  if (missingFields.length > 0) {
    console.warn(`[ESTIMATE] Warning: LLM output missing fields: ${missingFields.join(', ')}`);
  }

  // Validate hours structure if present
  if (effort.hours && typeof effort.hours === 'object') {
    const roleFields = ['solutions_architect', 'automation_engineer', 'ai_developer', 'qa_documentation'];
    for (const role of roleFields) {
      if (effort.hours[role] !== undefined && typeof effort.hours[role] !== 'number') {
        console.warn(`[ESTIMATE] Warning: hours.${role} is not a number: ${typeof effort.hours[role]}`);
        effort.hours[role] = 0;
      }
    }
  }

  return effort;
}

/**
 * Get LLM-based effort estimation
 * @param {object} intake - Intake data
 * @param {object} research - Research data (optional)
 * @returns {Promise<object>} Effort estimation
 */
export async function estimateEffort(intake, research = null) {
  const context = loadAgencyContext();
  const template = loadPromptTemplate();

  // Calculate deterministic baseline
  const baseline = calculateResearchBaseline(research);
  console.log(`[ESTIMATE] Calculated research baseline: ${baseline.total_baseline} hours`);

  const prompt = template
    .replace('{{agency_context}}', JSON.stringify(context, null, 2))
    .replace('{{intake}}', JSON.stringify(intake, null, 2))
    .replace('{{research}}', JSON.stringify(research || {}, null, 2))
    .replace('{{research_baseline}}', JSON.stringify(baseline, null, 2));

  console.log('Estimating project effort...');

  let result;
  try {
    result = await executeLLMJson(prompt, { task: 'estimate' });
  } catch (error) {
    console.error(`[ESTIMATE] LLM call failed: ${error.message}`);
    // Return fallback effort based on baseline
    return {
      effort: {
        hours: {
          solutions_architect: Math.ceil(baseline.total_baseline * 0.2),
          automation_engineer: Math.ceil(baseline.total_baseline * 0.5),
          ai_developer: Math.ceil(baseline.total_baseline * 0.2),
          qa_documentation: Math.ceil(baseline.total_baseline * 0.1),
          total: baseline.total_baseline
        },
        confidence: 'low',
        rationale: 'Fallback estimate from research baseline due to LLM error'
      },
      model: 'fallback',
      baseline,
      error: error.message
    };
  }

  // Handle both old API (result.data) and new API (result is the data directly)
  const rawEffort = result?.data || result;

  // Validate and sanitize LLM output
  const effort = validateEffortStructure(rawEffort);

  return {
    effort,
    model: result?.model || 'gemini-3-flash-preview',
    baseline // Return baseline for reference/debugging
  };
}

/**
 * Normalize hours structure to ensure total = sum of role hours
 * This fixes inconsistencies from LLM output
 * @param {object} hours - Hours object with role breakdown
 * @returns {object} Normalized hours with correct total
 */
function normalizeHours(hours) {
  if (!hours || typeof hours !== 'object') {
    return { solutions_architect: 16, automation_engineer: 40, ai_developer: 16, qa_documentation: 8, total: 80 };
  }

  const sa = hours.solutions_architect || 0;
  const ae = hours.automation_engineer || 0;
  const ai = hours.ai_developer || 0;
  const qa = hours.qa_documentation || 0;
  const calculatedTotal = sa + ae + ai + qa;

  return {
    solutions_architect: sa,
    automation_engineer: ae,
    ai_developer: ai,
    qa_documentation: qa,
    total: calculatedTotal // Always recalculate - never trust LLM's total
  };
}

/**
 * Calculate cost from effort estimation
 * @param {object} effort - Effort estimation from LLM
 * @returns {object} Cost breakdown
 */
export function calculateCost(effort) {
  const context = loadAgencyContext();
  const rates = context?.rate_card?.roles;
  const contingencyRate = context?.contingency?.default || 0.15;

  // Defensive: Validate rates object exists - use fallback if missing
  const fallbackRates = {
    solutions_architect: { hourly_rate: 175 },
    automation_engineer: { hourly_rate: 125 },
    ai_developer: { hourly_rate: 150 },
    qa_documentation: { hourly_rate: 85 }
  };

  const effectiveRates = (rates && rates.solutions_architect) ? rates : fallbackRates;

  if (!rates || !rates.solutions_architect) {
    console.warn('Warning: Agency context missing rate_card.roles - using fallback rates');
  }

  // Defensive: Handle case where LLM returns unexpected structure
  // ALWAYS normalize hours to ensure total = sum of roles
  const rawHours = effort?.adjusted_hours || effort?.base_hours;
  const hours = normalizeHours(rawHours);
  
  // Check if hours has the expected role breakdown structure
  const hasValidRoleBreakdown = hours && 
    typeof hours === 'object' && 
    (hours.solutions_architect !== undefined || 
      hours.automation_engineer !== undefined ||
      hours.ai_developer !== undefined);
  
  if (!hasValidRoleBreakdown) {
    console.warn('Warning: Effort missing role hours breakdown, using defaults');
    console.warn('Hours structure:', JSON.stringify(hours, null, 2)?.slice(0, 300));
    // Default to tier-based fallback using total hours or 80
    const defaultTotal = hours?.total || effort?.total_hours || 80;
    const defaultHours = {
      solutions_architect: Math.round(defaultTotal * 0.2),
      automation_engineer: Math.round(defaultTotal * 0.5),
      ai_developer: Math.round(defaultTotal * 0.2),
      qa_documentation: Math.round(defaultTotal * 0.1),
      total: defaultTotal
    };
    return calculateCostWithHours(defaultHours, effectiveRates, contingencyRate);
  }

  const costBreakdown = {
    solutions_architect: (hours.solutions_architect || 0) * effectiveRates.solutions_architect.hourly_rate,
    automation_engineer: (hours.automation_engineer || 0) * effectiveRates.automation_engineer.hourly_rate,
    ai_developer: (hours.ai_developer || 0) * effectiveRates.ai_developer.hourly_rate,
    qa_documentation: (hours.qa_documentation || 0) * effectiveRates.qa_documentation.hourly_rate
  };

  const subtotal = Object.values(costBreakdown).reduce((a, b) => a + b, 0);
  const contingency = subtotal * contingencyRate;
  const total = subtotal + contingency;

  return {
    breakdown: costBreakdown,
    subtotal,
    contingency,
    contingency_percent: contingencyRate,
    total,
    hours: {
      breakdown: hours,
      total: hours.total,
      with_contingency: Math.ceil(hours.total * (1 + contingencyRate))
    }
  };
}

/**
 * Helper to calculate cost from hours object
 */
function calculateCostWithHours(hours, rates, contingencyRate) {
  const costBreakdown = {
    solutions_architect: (hours.solutions_architect || 0) * rates.solutions_architect.hourly_rate,
    automation_engineer: (hours.automation_engineer || 0) * rates.automation_engineer.hourly_rate,
    ai_developer: (hours.ai_developer || 0) * rates.ai_developer.hourly_rate,
    qa_documentation: (hours.qa_documentation || 0) * rates.qa_documentation.hourly_rate
  };
  const subtotal = Object.values(costBreakdown).reduce((a, b) => a + b, 0);
  const contingency = subtotal * contingencyRate;
  const total = subtotal + contingency;

  return {
    breakdown: costBreakdown,
    subtotal,
    contingency,
    contingency_percent: contingencyRate,
    total,
    hours: {
      breakdown: hours,
      total: hours.total,
      with_contingency: Math.ceil(hours.total * (1 + contingencyRate))
    }
  };
}

/**
 * Generate milestone breakdown
 * @param {object} cost - Cost calculation
 * @param {object} options - Options
 * @returns {object[]} Milestone breakdown
 */
export function generateMilestones(cost, _options = {}) {
  const context = loadAgencyContext();
  const allocations = context.milestone_allocation;

  const milestones = [
    {
      milestone_number: '2.1',
      name: 'Design & Planning',
      phase: 'design',
      description: allocations.design.description,
      allocation: allocations.design.allocation,
      hours: Math.ceil(cost.hours.total * allocations.design.allocation),
      cost: Math.round(cost.total * allocations.design.allocation),
      deliverables: [
        'Solution Architecture Document',
        'Integration Specification',
        'Project Plan'
      ]
    },
    {
      milestone_number: '2.2',
      name: 'Build & Integration',
      phase: 'build',
      description: allocations.build.description,
      allocation: allocations.build.allocation,
      hours: Math.ceil(cost.hours.total * allocations.build.allocation),
      cost: Math.round(cost.total * allocations.build.allocation),
      deliverables: [
        'Core Workflow Implementation',
        'API Integrations',
        'Internal Testing Complete'
      ]
    },
    {
      milestone_number: '2.3',
      name: 'Test & Validate',
      phase: 'test',
      description: allocations.test.description,
      allocation: allocations.test.allocation,
      hours: Math.ceil(cost.hours.total * allocations.test.allocation),
      cost: Math.round(cost.total * allocations.test.allocation),
      deliverables: [
        'Alpha Testing Complete',
        'Beta Testing with Stakeholders',
        'Validation Report'
      ]
    },
    {
      milestone_number: '2.4',
      name: 'Deploy & Train',
      phase: 'deploy',
      description: allocations.deploy.description,
      allocation: allocations.deploy.allocation,
      hours: Math.ceil(cost.hours.total * allocations.deploy.allocation),
      cost: 0, // Placeholder - will be calculated as remainder
      deliverables: [
        'Production Deployment',
        'User Training',
        'Documentation Package',
        'Go-Live Support'
      ]
    }
  ];

  // Fix rounding: last milestone gets remainder to ensure sum equals total
  const firstThreeCost = milestones[0].cost + milestones[1].cost + milestones[2].cost;
  milestones[3].cost = cost.total - firstThreeCost;

  // Estimate duration in days (6 productive hours/day with 2x multiplier for side-job capacity)
  const hoursPerDay = 6;
  const durationMultiplier = 2;
  for (const milestone of milestones) {
    milestone.duration_days = Math.ceil((milestone.hours / hoursPerDay) * durationMultiplier);
  }

  return milestones;
}

/**
 * Recommend retainer tier
 * @param {object} intake - Intake data
 * @param {object} cost - Cost calculation
 * @returns {object} Retainer recommendation
 */
export function recommendRetainer(intake, cost) {
  const context = loadAgencyContext();
  const retainers = context.retainer_options;

  // Determine recommended tier based on project complexity
  const projectTier = intake.classification?.estimated_tier || 'standard';
  const integrationCount = intake.project?.integrations?.length || 0;

  let recommendation;
  let rationale;

  let tierKey;
  if (projectTier === 'enterprise' || cost.total > 25_000) {
    recommendation = retainers.scale;
    tierKey = 'scale';
    rationale = 'Enterprise-level project requires dedicated capacity for ongoing optimization and rapid iteration.';
  } else if (projectTier === 'standard' || integrationCount > 3) {
    recommendation = retainers.growth;
    tierKey = 'growth';
    rationale = 'Multiple integrations benefit from ongoing optimization and priority support.';
  } else {
    recommendation = retainers.maintenance;
    tierKey = 'maintenance';
    rationale = 'Standard maintenance ensures monitoring, error handling, and minor adjustments.';
  }

  return {
    recommended: true,
    tier: tierKey,
    monthly_rate: recommendation.monthly_rate,
    hours_included: recommendation.hours_included,
    rationale
  };
}

/**
 * Get project tier from cost
 * @param {number} totalCost - Total project cost
 * @returns {object} Project tier
 */
export function getProjectTier(totalCost) {
  const context = loadAgencyContext();
  const tiers = context.project_tiers;

  for (const [key, tier] of Object.entries(tiers)) {
    if (totalCost >= tier.price_range.min && totalCost <= tier.price_range.max) {
      return { key, ...tier };
    }
  }

  // Default to enterprise if above all ranges
  if (totalCost > tiers.enterprise.price_range.max) {
    return { key: 'enterprise', ...tiers.enterprise, note: 'Above standard enterprise range' };
  }

  return { key: 'discovery', ...tiers.discovery };
}

/**
 * Generate complete estimate
 * @param {object} intake - Intake data
 * @param {object} research - Research data (optional)
 * @returns {Promise<object>} Complete estimate
 */
export async function generateEstimate(intake, research = null) {
  // Get LLM effort estimation
  const effortResult = await estimateEffort(intake, research);
  const {effort} = effortResult;

  // CRITICAL: Normalize hours to ensure total = sum of roles
  // This fixes NA-030 test failure where LLM total doesn't match role sum
  effort.base_hours &&= normalizeHours(effort.base_hours);
  effort.adjusted_hours &&= normalizeHours(effort.adjusted_hours);

  // CRITICAL: Enforce adjusted_hours = base_hours × risk_multiplier (CC-022/NA-031 fix)
  // This ensures the relationship is consistent regardless of LLM output
  const riskMultiplier = effort.risk_multiplier || research?.riskMultiplier || 1;
  if (effort.base_hours && effort.base_hours.total > 0) {
    const base = effort.base_hours;
    effort.adjusted_hours = {
      solutions_architect: Math.round(base.solutions_architect * riskMultiplier),
      automation_engineer: Math.round(base.automation_engineer * riskMultiplier),
      ai_developer: Math.round(base.ai_developer * riskMultiplier),
      qa_documentation: Math.round(base.qa_documentation * riskMultiplier),
      total: Math.round(base.total * riskMultiplier)
    };
    // Store the risk_multiplier so it's accessible in schema
    effort.risk_multiplier = riskMultiplier;
  }

  // Add integrations to effort from research or intake for risk calculation
  if (!effort.integrations || effort.integrations.length === 0) {
    // Try to get from research first
    if (research?.integrations?.length > 0) {
      effort.integrations = research.integrations;
    } 
    // Fall back to intake systems/handoffs
    else if (intake.section_c_systems_handoffs?.current_tech_stack?.length > 0) {
      effort.integrations = intake.section_c_systems_handoffs.current_tech_stack;
    }
    // Fall back to any detected systems in intake
    else if (intake.systems?.length > 0) {
      effort.integrations = intake.systems;
    }
  }

  // Calculate costs
  const cost = calculateCost(effort);

  // Generate milestones
  const milestones = generateMilestones(cost);

  // Get project tier
  const tier = getProjectTier(cost.total);

  // Recommend retainer
  const retainer = recommendRetainer(intake, cost);

  // Calculate cost range (±20%)
  const range = {
    low: Math.round(cost.total * 0.8),
    high: Math.round(cost.total * 1.2)
  };

  // Calculate EST DAYS
  const estDays = calculateEstDays(cost.hours.total);

  // Build FinOps section (internal) - pass intake for intelligent volume calculation
  const finops = buildFinOps(cost, effort, intake);

  // Build Commercial section
  const commercial = buildCommercial(cost);

  // Calculate Risk vs Reward analysis
  const risk_analysis = calculateRiskAnalysis(effort, finops, cost);

  return {
    effort,
    cost: {
      ...cost,
      range
    },
    // Explicit top-level hours for pricing calculator
    hours: cost.hours,
    milestones,
    tier,
    retainer,
    est_days: estDays,
    finops,
    commercial,
    risk_analysis,
    model: effortResult.model,
    baseline: effortResult.baseline // Return deterministic baseline for report transparency
  };
}

/**
 * Calculate internal production cost
 * Uses blended internal rate for margin calculation (NOT client-facing)
 * @param {number} totalHours - Total project hours
 * @returns {object} Internal cost breakdown
 */
export function calculateInternalCost(totalHours) {
  const context = loadAgencyContext();
  const internalRate = context.internal_rates?.blended_hourly || 50;

  const rawProductionCost = totalHours * internalRate;

  // Estimate compute/API costs (roughly 5-10% of production cost for AI projects)
  const computeEstimate = Math.round(rawProductionCost * 0.08);

  return {
    raw_production_cost: rawProductionCost,
    compute_estimate: computeEstimate,
    total_internal_cost: rawProductionCost + computeEstimate,
    internal_rate: internalRate
  };
}

/**
 * Calculate margin from target price and internal cost
 * @param {number} targetPrice - Client-facing price
 * @param {number} internalCost - Total internal cost
 * @returns {object} Margin calculation
 */
export function calculateMargin(targetPrice, internalCost) {
  const marginAmount = targetPrice - internalCost;
  const marginPercent = targetPrice > 0 ? marginAmount / targetPrice : 0;

  return {
    target_price: targetPrice,
    internal_cost: internalCost,
    margin_amount: marginAmount,
    margin_percent: Math.round(marginPercent * 100) / 100 // Round to 2 decimal places
  };
}

/**
 * Calculate estimated working days
 * Based on 6 productive hours per day with 2x duration multiplier
 * (accounts for side-job capacity constraints)
 * @param {number} totalHours - Total project hours
 * @returns {number} Estimated working days
 */
export function calculateEstDays(totalHours) {
  const PRODUCTIVE_HOURS_PER_DAY = 6;
  const DURATION_MULTIPLIER = 2; // Side-job capacity adjustment
  return Math.ceil((totalHours / PRODUCTIVE_HOURS_PER_DAY) * DURATION_MULTIPLIER);
}

/**
 * Determine payment structure based on total cost
 * <$10K = 100% upfront, >$10K = 50/50 split
 * @param {number} totalCost - Total project cost
 * @returns {object} Payment structure
 */
export function determinePaymentStructure(totalCost) {
  const context = loadAgencyContext();
  const thresholds = context.payment_thresholds;

  if (!thresholds) {
    // Fallback to simple 50/50 if not configured
    return {
      structure: '50/50',
      upfront_percent: 0.5,
      upfront_amount: Math.round(totalCost * 0.5),
      final_percent: 0.5,
      final_amount: Math.round(totalCost * 0.5),
      final_trigger: 'Production Activation (Go-Live)',
      description: '50% deposit / 50% before go-live'
    };
  }

  const upfrontMax = thresholds.upfront_max || 10_000;

  if (totalCost <= upfrontMax) {
    // Below threshold: 100% upfront
    const structure = thresholds.split_structure?.below_threshold || {
      upfront_percent: 100,
      final_percent: 0
    };
    return {
      structure: '100% upfront',
      upfront_percent: structure.upfront_percent / 100,
      upfront_amount: totalCost,
      final_percent: 0,
      final_amount: 0,
      final_trigger: thresholds.final_trigger || 'Production Activation (Go-Live)',
      description: structure.description || '100% upfront to secure build slot'
    };
  }
 
  // Above threshold: 50/50 split
  const structure = thresholds.split_structure?.above_threshold || {
    upfront_percent: 50,
    final_percent: 50
  };
  const upfrontAmount = Math.round(totalCost * (structure.upfront_percent / 100));
  const finalAmount = totalCost - upfrontAmount;
  return {
    structure: '50/50',
    upfront_percent: structure.upfront_percent / 100,
    upfront_amount: upfrontAmount,
    final_percent: structure.final_percent / 100,
    final_amount: finalAmount,
    final_trigger: thresholds.final_trigger || 'Production Activation (Go-Live)',
    description: structure.description || '50% deposit / 50% before go-live'
  };
  
}

/**
 * Calculate ROI metrics for client value proposition
 * Based on estimated time savings and automation value
 * @param {number} projectCost - Total project cost
 * @param {number} hoursAutomated - Estimated hours automated per month
 * @param {number} clientHourlyValue - Client's hourly labor cost (default $75/hr)
 * @returns {object} ROI calculations
 */
export function calculateROI(projectCost, hoursAutomated = 20, clientHourlyValue = 75) {
  // Estimate monthly value from automation
  const monthlyValue = hoursAutomated * clientHourlyValue;

  // Calculate payback period in months
  const paybackMonths = projectCost > 0 ? Math.ceil(projectCost / monthlyValue) : 0;

  // Calculate annual ROI percentage
  const annualValue = monthlyValue * 12;
  const annualROI = projectCost > 0 ? Math.round(((annualValue - projectCost) / projectCost) * 100) : 0;

  return {
    monthly_value: monthlyValue,
    payback_months: paybackMonths,
    annual_roi: annualROI,
    annual_value: annualValue,
    hours_automated: hoursAutomated,
    client_hourly_value: clientHourlyValue
  };
}

// =============================================================================
// ENTERPRISE PRICING VALIDATION FUNCTIONS
// Enterprise pricing with separated hard savings vs modeled opportunity
// =============================================================================

/**
 * Enforce profit floor (minimum margin)
 * If current margin is below floor, calculate required markup
 * @param {number} basePrice - Original client-facing price
 * @param {number} internalCost - Total internal production cost
 * @param {object} config - Pricing validation config
 * @returns {object} Price adjustment with markup if needed
 */
export function enforceProfitFloor(basePrice, internalCost, config = {}) {
  const targetMargin = (config.profit_floor_percent || PROFIT_FLOOR_PERCENT) / 100;
  const currentMargin = basePrice > 0 ? (basePrice - internalCost) / basePrice : 0;

  if (currentMargin >= targetMargin) {
    return {
      original_price: basePrice,
      adjusted_price: basePrice,
      markup: 1,
      adjusted: false,
      margin_percent: Math.round(currentMargin * 100),
      passes: true,
      message: `Profit floor met: ${Math.round(currentMargin * 100)}% margin (min ${Math.round(targetMargin * 100)}%)`
    };
  }

  // Calculate required price to hit target margin
  // margin = (price - cost) / price = targetMargin
  // price - cost = targetMargin * price
  // price * (1 - targetMargin) = cost
  // price = cost / (1 - targetMargin)
  const requiredPrice = internalCost / (1 - targetMargin);
  const markup = requiredPrice / basePrice;

  return {
    original_price: basePrice,
    adjusted_price: Math.round(requiredPrice),
    markup: Math.round(markup * 100) / 100,
    adjusted: true,
    margin_percent: Math.round(targetMargin * 100),
    passes: true, // Passes after adjustment
    message: `Profit floor enforced: ${Math.round(markup * 100) / 100}x markup applied to achieve ${Math.round(targetMargin * 100)}% margin`
  };
}

/**
 * Calculate Hard Labor Savings (Guaranteed/Bankable)
 * Conservative estimate based on project hours becoming recurring monthly savings
 * @param {number} projectHours - Total project hours
 * @param {object} config - Pricing validation config
 * @returns {object} Hard labor savings breakdown
 */
export function calculateHardLaborSavings(projectHours, config = {}) {
  const clientHourlyValue = config.client_hourly_value || DEFAULT_CLIENT_HOURLY_RATE;
  const laborSavingsMultiplier = config.labor_savings_multiplier || LABOR_SAVINGS_MULTIPLIER;

  // Conservative: project hours × multiplier = monthly recurring hours saved
  const monthlyHoursSaved = projectHours * laborSavingsMultiplier;
  const monthlyLaborSavings = monthlyHoursSaved * clientHourlyValue;
  const annualLaborSavings = monthlyLaborSavings * 12;

  return {
    monthly: Math.round(monthlyLaborSavings),
    annual: Math.round(annualLaborSavings),
    hours_saved_monthly: Math.round(monthlyHoursSaved * 10) / 10,
    client_hourly_value: clientHourlyValue,
    type: 'hard_savings',
    label: 'Labor Savings',
    formula: `(${Math.round(monthlyHoursSaved * 10) / 10} hrs/mo × $${clientHourlyValue}/hr) × 12`
  };
}

/**
 * Derive item type label from workflow name for display in formulas
 * @param {string} workflowName - The workflow name
 * @returns {string} Human-readable item type (e.g., "orders", "calls", "patients")
 */
function deriveItemType(workflowName) {
  if (!workflowName) return 'items';

  const name = workflowName.toLowerCase();

  // Check for common workflow item types
  if (name.includes('order')) return 'orders';
  if (name.includes('lead')) return 'leads';
  if (name.includes('call') || name.includes('phone')) return 'calls';
  if (name.includes('ticket') || name.includes('support')) return 'tickets';
  if (name.includes('patient') || name.includes('appointment')) return 'appointments';
  if (name.includes('invoice')) return 'invoices';
  if (name.includes('email')) return 'emails';
  if (name.includes('quote') || name.includes('proposal')) return 'quotes';
  if (name.includes('application') || name.includes('loan')) return 'applications';
  if (name.includes('document') || name.includes('doc')) return 'documents';
  if (name.includes('onboarding') || name.includes('customer')) return 'customers';
  if (name.includes('delivery') || name.includes('shipment')) return 'deliveries';
  if (name.includes('claim')) return 'claims';
  if (name.includes('reservation') || name.includes('booking')) return 'bookings';
  if (name.includes('candidate') || name.includes('recruit')) return 'candidates';
  if (name.includes('inquiry') || name.includes('request')) return 'inquiries';
  if (name.includes('transaction')) return 'transactions';

  return 'items'; // fallback
}

/**
 * Extract daily volume from intake data
 * Normalizes various period units to daily transactions
 * @param {object} intake - Intake data with section_b_volume_timing
 * @returns {object} Volume extraction result with source tracking
 */
export function extractVolumeFromIntake(intake) {
  // Priority 1: Explicit volume from intake section B
  if (intake?.section_b_volume_timing?.q06_runs_per_period) {
    const rawVolume = intake.section_b_volume_timing.q06_runs_per_period;
    const parsedVolume = Number.parseFloat(String(rawVolume).replaceAll(/[^\d.-]/g, ''));
    const periodUnit = (intake.section_b_volume_timing.q06_period_unit || 'day').toLowerCase();

    if (!isNaN(parsedVolume) && parsedVolume > 0) {
      let dailyVolume;
      let normalizationNote;

      switch (periodUnit) {
        case 'day': {
          dailyVolume = parsedVolume;
          normalizationNote = 'directly stated as daily';
          break;
        }

        case 'week': {
          dailyVolume = parsedVolume / 5; // 5 working days
          normalizationNote = `${parsedVolume}/week ÷ 5 working days`;
          break;
        }

        case 'month': {
          dailyVolume = parsedVolume / 22; // 22 working days
          normalizationNote = `${parsedVolume}/month ÷ 22 working days`;
          break;
        }

        case 'quarter': {
          dailyVolume = parsedVolume / 66; // 3 months × 22 days
          normalizationNote = `${parsedVolume}/quarter ÷ 66 working days`;
          break;
        }

        case 'year': {
          dailyVolume = parsedVolume / 260; // 52 weeks × 5 days
          normalizationNote = `${parsedVolume}/year ÷ 260 working days`;
          break;
        }

        default: {
          dailyVolume = parsedVolume; // assume daily
          normalizationNote = `assumed daily (unit: ${periodUnit})`;
        }
      }

      // Extract item type from workflow name for display
      const workflowName = intake?.section_a_workflow_definition?.q01_workflow_name || '';
      const itemType = deriveItemType(workflowName);

      return {
        daily_volume: Math.round(dailyVolume * 10) / 10,
        source: 'intake_section_b',
        raw_value: parsedVolume,
        period_unit: periodUnit,
        normalization_note: normalizationNote,
        confidence: 'high',
        item_type: itemType
      };
    }
  }

  // Priority 2: Try to extract from workflow name or process description
  const workflowName = intake?.section_a_workflow_definition?.q01_workflow_name || '';
  const processMatch = workflowName.toLowerCase();

  // Industry heuristics for volume when not explicitly stated
  const volumeHeuristics = {
    'lead': 25,          // Lead qualification typically 25-50/day
    'call': 40,          // Call center processes ~40/day per agent
    'appointment': 15,   // Appointment booking ~15/day
    'patient': 20,       // Healthcare patient intake ~20/day
    'order': 50,         // Order processing ~50/day for SMB
    'invoice': 30,       // Invoice processing ~30/day
    'ticket': 35,        // Support ticket handling ~35/day
    'application': 15,   // Application processing ~15/day
    'document': 40,      // Document processing ~40/day
    'email': 100,        // Email handling ~100/day
    'quote': 10,         // Quote generation ~10/day
    'onboarding': 5      // Customer onboarding ~5/day
  };

  for (const [keyword, estimatedVolume] of Object.entries(volumeHeuristics)) {
    if (processMatch.includes(keyword)) {
      // Pluralize the keyword for display (e.g., "lead" -> "leads")
      const itemType = keyword.endsWith('s') ? keyword : keyword + 's';
      return {
        daily_volume: estimatedVolume,
        source: 'industry_heuristic',
        keyword_matched: keyword,
        normalization_note: `Estimated from process type "${keyword}"`,
        confidence: 'medium',
        item_type: itemType
      };
    }
  }

  // Priority 3: Conservative default
  return {
    daily_volume: 15,  // Conservative default (was 20)
    source: 'default_conservative',
    normalization_note: 'No volume data found - using conservative estimate',
    confidence: 'low',
    item_type: 'items'
  };
}

/**
 * Calculate Modeled Opportunity (Revenue Impact)
 * INTELLIGENT: Derives volume from intake data instead of hardcoded defaults
 * Conservative 1% conversion lift estimate - NOT guaranteed
 * @param {object} config - Pricing validation config
 * @param {object} intake - Optional intake data for intelligent volume extraction
 * @returns {object} Modeled opportunity breakdown
 */
export function calculateModeledOpportunity(config = {}, intake = null) {
  // INTELLIGENT VOLUME: Extract from intake or use config override
  let volumeData;
  if (intake) {
    volumeData = extractVolumeFromIntake(intake);
  } else if (config.daily_volume) {
    // Allow explicit override via config
    volumeData = {
      daily_volume: config.daily_volume,
      source: 'config_override',
      confidence: 'high'
    };
  } else {
    // Last resort: use config default (should rarely happen with proper intake data)
    volumeData = {
      daily_volume: config.daily_leads_default || 15, // Reduced from 20 to be more conservative
      source: 'config_default_fallback',
      confidence: 'low'
    };
  }

  const dailyLeads = volumeData.daily_volume;
  const liftPercent = config.opportunity_lift_percent || 1;
  // Use industry-appropriate deal value - $5K is too high for service businesses
  // Default reduced from $5,000 to $500 for more conservative estimates
  const avgDealValue = config.average_deal_value || 500;

  // Formula: (Daily Leads × 30) × Lift% × Avg Deal Value
  const monthlyLeads = dailyLeads * 30;
  const liftRate = liftPercent / 100; // 0.01
  const convertedLeads = monthlyLeads * liftRate;
  let monthlyOpportunity = convertedLeads * avgDealValue;

  // GUARDRAILS: Cap modeled opportunity to prevent unrealistic projections
  // 1. Maximum monthly cap (default $50K/month = $600K/year)
  const maxMonthly = config.max_modeled_opportunity_monthly || 50_000;
  let wasCapped = false;
  let capReason = '';

  if (monthlyOpportunity > maxMonthly) {
    wasCapped = true;
    capReason = `capped at $${maxMonthly.toLocaleString()}/mo max`;
    monthlyOpportunity = maxMonthly;
  }

  // 2. Secondary cap: modeled opportunity shouldn't exceed 2x hard savings (if provided)
  if (config.hard_savings_monthly && monthlyOpportunity > config.hard_savings_monthly * 2) {
    const hardSavingsCap = config.hard_savings_monthly * 2;
    if (hardSavingsCap < monthlyOpportunity) {
      wasCapped = true;
      capReason = `capped at 2x hard savings ($${Math.round(hardSavingsCap).toLocaleString()}/mo)`;
      monthlyOpportunity = hardSavingsCap;
    }
  }

  const annualOpportunity = monthlyOpportunity * 12;
  const monthlyRounded = Math.round(monthlyOpportunity);
  const annualRounded = Math.round(annualOpportunity);

  // Get item type for display (e.g., "orders", "calls", "tickets")
  const itemType = volumeData.item_type || 'items';

  // Build formula string with proper item type labeling
  const volumeSource = volumeData.source === 'intake_section_b'
    ? 'from intake'
    : volumeData.source === 'industry_heuristic'
      ? `est. from ${volumeData.keyword_matched}`
      : 'default';

  // Add cap indicator to formula if applied
  const formulaBase = `${Math.round(dailyLeads)} ${itemType}/day × 30 × ${liftPercent}% × $${avgDealValue.toLocaleString()} (${volumeSource})`;
  const formula = wasCapped ? `${formulaBase} ${capReason}` : formulaBase;

  return {
    monthly: monthlyRounded,
    annual: annualRounded,
    monthly_display: `$${monthlyRounded.toLocaleString()}`,
    annual_display: `$${annualRounded.toLocaleString()}`,
    converted_leads_monthly: Math.round(convertedLeads * 10) / 10,
    daily_leads: dailyLeads,
    lift_percent: liftPercent,
    avg_deal_value: avgDealValue,
    was_capped: wasCapped,
    cap_reason: capReason,
    type: 'modeled_opportunity',
    label: `Modeled Opportunity (Est. ${liftPercent}% Lift)`,
    formula,
    // Volume provenance for transparency
    volume_source: volumeData.source,
    volume_confidence: volumeData.confidence,
    volume_note: volumeData.normalization_note
  };
}

/**
 * Validate Hard Floor Rule
 * Project price must be at least X% covered by Year 1 hard labor savings
 * @param {number} projectPrice - Total project price
 * @param {number} annualLaborSavings - Year 1 hard labor savings
 * @param {object} config - Pricing validation config
 * @returns {object} Hard floor validation result
 */
export function validateHardFloorRule(projectPrice, annualLaborSavings, config = {}) {
  const coveragePercent = config.hard_floor_coverage_percent || HARD_FLOOR_COVERAGE_PERCENT;
  const requiredCoverage = projectPrice * (coveragePercent / 100);
  const actualCoveragePercent = projectPrice > 0 ? (annualLaborSavings / projectPrice) * 100 : 0;
  const passes = annualLaborSavings >= requiredCoverage;

  return {
    passes,
    required_coverage: Math.round(requiredCoverage),
    actual_coverage: Math.round(annualLaborSavings),
    coverage_percent: Math.round(actualCoveragePercent),
    min_coverage_percent: coveragePercent,
    message: passes
      ? `Hard floor met: ${Math.round(actualCoveragePercent)}% coverage (min ${coveragePercent}%)`
      : `WARNING: Only ${Math.round(actualCoveragePercent)}% hard coverage (need ${coveragePercent}%)`
  };
}

/**
 * Validate Payback Period
 * Payback should be under max months using conservative assumptions
 * @param {number} projectPrice - Total project price
 * @param {number} totalMonthlyValue - Combined monthly value (hard + modeled)
 * @param {object} config - Pricing validation config
 * @returns {object} Payback validation result
 */
export function validatePayback(projectPrice, totalMonthlyValue, config = {}) {
  const maxPaybackMonths = config.max_payback_months || MAX_PAYBACK_MONTHS;
  const paybackMonths = totalMonthlyValue > 0 ? projectPrice / totalMonthlyValue : Infinity;
  const passes = paybackMonths <= maxPaybackMonths;
  const roundedMonths = Math.round(paybackMonths * 100) / 100; // 2 decimal places for precision

  return {
    passes,
    payback_months: roundedMonths,
    payback_display: formatPaybackPeriod(paybackMonths),
    max_payback_months: maxPaybackMonths,
    message: passes
      ? `Payback met: ${roundedMonths} months (max ${maxPaybackMonths})`
      : `WARNING: Payback ${roundedMonths} months exceeds ${maxPaybackMonths} month target`
  };
}

/**
 * Build complete Value Breakdown with hard/soft separation
 * Enterprise format: never merge hard savings with modeled opportunity
 * @param {number} projectHours - Total project hours
 * @param {number} projectPrice - Total project price (after profit floor)
 * @param {object} config - Pricing validation config
 * @param {object} intake - Optional intake data for intelligent volume extraction
 * @returns {object} Complete value breakdown
 */
export function buildValueBreakdown(projectHours, projectPrice, config = {}, intake = null) {
  const hardSavings = calculateHardLaborSavings(projectHours, config);
  const modeledOpportunity = calculateModeledOpportunity(config, intake);

  const totalMonthlyValue = hardSavings.monthly + modeledOpportunity.monthly;
  const totalAnnualValue = hardSavings.annual + modeledOpportunity.annual;

  return {
    hard_savings: hardSavings,
    modeled_opportunity: modeledOpportunity,
    total_monthly_value: totalMonthlyValue,
    total_annual_value: totalAnnualValue,
    total_monthly_display: `$${totalMonthlyValue.toLocaleString()}`,
    total_annual_display: `$${totalAnnualValue.toLocaleString()}`,
    display_note: 'Labor Savings + Revenue Impact = Total Value (never merged)'
  };
}

/**
 * Run all enterprise pricing validations
 * @param {number} basePrice - Original price before adjustments
 * @param {number} internalCost - Total internal cost
 * @param {number} projectHours - Total project hours
 * @param {object} config - Pricing validation config
 * @param {object} intake - Optional intake data for intelligent volume extraction
 * @returns {object} Complete validation results
 */
export function runPricingValidation(basePrice, internalCost, projectHours, config = {}, intake = null) {
  // 1. Enforce profit floor (may adjust price)
  const profitFloor = enforceProfitFloor(basePrice, internalCost, config);
  const finalPrice = profitFloor.adjusted_price;

  // 2. Calculate value breakdown (with intelligent volume from intake)
  const valueBreakdown = buildValueBreakdown(projectHours, finalPrice, config, intake);

  // 3. Validate hard floor
  const hardFloor = validateHardFloorRule(finalPrice, valueBreakdown.hard_savings.annual, config);

  // 4. Validate payback
  const payback = validatePayback(finalPrice, valueBreakdown.total_monthly_value, config);

  // Overall pass/fail
  const allPass = profitFloor.passes && hardFloor.passes && payback.passes;

  // Pre-format display values for derivation formulas in template
  const investmentDisplay = `$${finalPrice.toLocaleString()}`;
  const annualValueDisplay = valueBreakdown.total_annual_display;
  const monthlyValueDisplay = valueBreakdown.total_monthly_display;

  return {
    final_price: finalPrice,
    value_breakdown: valueBreakdown,
    validation: {
      profit_floor: profitFloor,
      hard_floor: {
        ...hardFloor,
        // Display values for derivation formula: = annual ÷ investment × 100
        annual_value_display: annualValueDisplay,
        investment_display: investmentDisplay
      },
      payback_check: {
        ...payback,
        // Display values for derivation formula: = investment ÷ monthly
        investment_display: investmentDisplay,
        monthly_value_display: monthlyValueDisplay
      },
      all_pass: allPass,
      summary: allPass
        ? 'All pricing validation checks passed'
        : 'WARNING: One or more pricing validation checks failed'
    }
  };
}

/**
 * Calculate Risk vs Reward Analysis
 * Objective scoring for implementation risk and reward potential
 * @param {object} effort - Effort estimation with risk factors
 * @param {object} finops - FinOps data with ROI and payback
 * @param {object} cost - Cost breakdown
 * @returns {object} Risk analysis scores and verdict
 */
export function calculateRiskAnalysis(effort, finops, cost) {
  // === RISK SCORE (1-10) ===
  // Based on: integration count, risk factors, complexity, hours
  let riskScore = 3; // Base risk for any automation project

  // Integration complexity
  const integrationCount = effort.integrations?.length || 0;
  if (integrationCount > 5) riskScore += 2;
  else if (integrationCount > 2) riskScore += 1;

  // Risk factor count
  const riskFactorCount = effort.risk_factors?.length || 0;
  if (riskFactorCount > 4) riskScore += 2;
  else if (riskFactorCount > 2) riskScore += 1;

  // Project size (hours)
  const totalHours = cost?.hours?.total || effort.base_hours?.total || 80;
  if (totalHours > 200) riskScore += 2;
  else if (totalHours > 100) riskScore += 1;

  // Risk multiplier from tier
  const riskMultiplier = effort.risk_multiplier || 1;
  if (riskMultiplier > 1.3) riskScore += 1;

  // Cap at 10
  riskScore = Math.min(10, Math.max(1, riskScore));

  // === REWARD SCORE (1-10) ===
  // Based on: ROI, payback period, annual savings magnitude
  let rewardScore = 4; // Base reward for automation projects

  // ROI percentage
  const roiPercent = finops?.roi?.percent || 0;
  if (roiPercent > 500) rewardScore += 3;
  else if (roiPercent > 200) rewardScore += 2;
  else if (roiPercent > 100) rewardScore += 1;

  // Payback period (shorter = better)
  const paybackMonths = finops?.validation?.payback_check?.payback_months || 12;
  if (paybackMonths < 1) rewardScore += 2;
  else if (paybackMonths < 3) rewardScore += 1;

  // Annual value magnitude
  const annualValue = finops?.value_breakdown?.total_annual_value || 0;
  if (annualValue > 500_000) rewardScore += 2;
  else if (annualValue > 100_000) rewardScore += 1;

  // Cap at 10
  rewardScore = Math.min(10, Math.max(1, rewardScore));

  // === RATIO ===
  const ratio = riskScore > 0 ? (rewardScore / riskScore) : rewardScore;
  const ratioRounded = Math.round(ratio * 10) / 10;
  const ratioDisplay = ratioRounded >= 1 
    ? `${ratioRounded}:1` 
    : `1:${Math.round(1/ratioRounded * 10) / 10}`;

  // === VERDICT ===
  let verdict;
  if (rewardScore >= 8 && riskScore <= 4) {
    verdict = 'Exceptional opportunity with manageable risk—strongly recommended.';
  } else if (rewardScore >= 6 && riskScore <= 5) {
    verdict = 'High reward potential with moderate risk—recommended with standard safeguards.';
  } else if (rewardScore >= riskScore) {
    verdict = 'Balanced risk-reward profile—proceed with contingency buffers.';
  } else if (riskScore - rewardScore <= 2) {
    verdict = 'Elevated risk relative to reward—consider phased approach.';
  } else {
    verdict = 'High-risk engagement—requires executive sponsor and enhanced oversight.';
  }

  return {
    risk_score: riskScore,
    reward_score: rewardScore,
    ratio: ratioRounded,
    ratio_display: ratioDisplay,
    verdict,
    factors: {
      integration_count: integrationCount,
      risk_factor_count: riskFactorCount,
      total_hours: totalHours,
      risk_multiplier: riskMultiplier,
      roi_percent: roiPercent,
      payback_months: paybackMonths,
      annual_value: annualValue
    }
  };
}

/**
 * Build FinOps section for internal analysis
 * NOT client-facing - for sales engineering use only
 * Includes enterprise pricing validation with separated hard/soft savings
 * @param {object} cost - Cost calculation
 * @param {object} effort - Effort estimation
 * @param {object} intake - Optional intake data for intelligent volume extraction
 * @returns {object} FinOps data
 */
export function buildFinOps(cost, effort, intake = null) {
  const context = loadAgencyContext();
  const pricingConfig = context.pricing_validation || {};

  const totalHours = cost.hours?.total || effort.base_hours?.total || 0;
  const internalCost = calculateInternalCost(totalHours);

  // Run enterprise pricing validation with intake for intelligent volume (includes profit floor, hard floor, payback)
  const pricingValidation = runPricingValidation(
    cost.total,
    internalCost.total_internal_cost,
    totalHours,
    pricingConfig,
    intake  // Pass intake for intelligent modeled opportunity
  );

  // Use adjusted price if profit floor was enforced
  const finalPrice = pricingValidation.final_price;
  const margin = calculateMargin(finalPrice, internalCost.total_internal_cost);

  // Legacy ROI calculation (kept for backward compatibility)
  const estimatedMonthlyHoursAutomated = Math.max(10, Math.round(totalHours * 0.3));
  const roi = calculateROI(finalPrice, estimatedMonthlyHoursAutomated, pricingConfig.client_hourly_value || DEFAULT_CLIENT_HOURLY_RATE);

  // Risk mitigation mapping - specific strategies with severity levels
  // { mitigation: string, is_high: boolean }
  const mitigationMap = {
    // Authentication & Security (HIGH severity)
    'oauth': { mitigation: 'Built-in retry logic + token refresh handling', is_high: true },
    'authentication': { mitigation: 'OAuth adapter with automatic token rotation', is_high: true },
    'security': { mitigation: 'Role-based access + encrypted credentials store', is_high: true },
    'hipaa': { mitigation: 'HIPAA-compliant encryption + audit logging + BAA verification', is_high: true },
    'phi': { mitigation: 'PHI isolation layer + access logging + encryption at rest/transit', is_high: true },
    'pii': { mitigation: 'PII filtering + data masking pipeline + access controls', is_high: true },
    'compliance': { mitigation: 'Audit logging + data encryption at rest + compliance monitoring', is_high: true },
    'data privacy': { mitigation: 'Privacy-by-design architecture + data minimization', is_high: true },
    
    // Integration Complexity (MEDIUM severity)
    'legacy': { mitigation: 'API adapter layer with fallback endpoints', is_high: false },
    'legacy system': { mitigation: 'Dedicated integration layer with version detection', is_high: false },
    'ehr': { mitigation: 'HL7/FHIR adapter + sandbox testing + vendor coordination', is_high: false },
    'athenahealth': { mitigation: 'Athenahealth certified connector + API versioning strategy', is_high: false },
    'fax': { mitigation: 'OCR pipeline + structured extraction + human-in-loop review', is_high: false },
    'ocr': { mitigation: 'Multi-engine OCR + confidence scoring + manual review queue', is_high: false },
    'integration': { mitigation: 'Circuit breaker pattern + health probes', is_high: false },
    'third-party': { mitigation: 'Vendor SLA monitoring + failover routing', is_high: false },
    
    // Performance & Reliability (MEDIUM severity)
    'rate_limit': { mitigation: 'Request queuing + exponential backoff strategy', is_high: false },
    'rate limiting': { mitigation: 'Request batching + adaptive throttling', is_high: false },
    'api limits': { mitigation: 'Built-in rate limiter with queue management', is_high: false },
    'scraping': { mitigation: 'Multiple selector strategies + health checks', is_high: false },
    'web scraping': { mitigation: 'Resilient selectors + screenshot fallback', is_high: false },
    'voice': { mitigation: 'Latency monitoring + graceful degradation', is_high: false },
    'real-time': { mitigation: 'WebSocket fallback + polling backup', is_high: false },
    'sms': { mitigation: 'Multi-carrier fallback + delivery tracking + opt-out handling', is_high: false },
    
    // AI & Workflow Complexity (MEDIUM severity)
    'complex workflow': { mitigation: 'Modular architecture + incremental testing', is_high: false },
    'llm': { mitigation: 'Prompt versioning + output validation guards', is_high: false },
    'ai model': { mitigation: 'Multi-model fallback chain + response caching', is_high: false },
    'custom': { mitigation: 'Detailed specification + iterative prototyping', is_high: false },
    'unknown api': { mitigation: 'API exploration phase + documentation sprint', is_high: false },
    
    // Default fallback
    'default': { mitigation: '15% contingency buffer + weekly risk review + escalation protocol', is_high: false }
  };

  // Find best matching mitigation for a risk factor
  const getMitigationEntry = (factor) => {
    const lowerFactor = factor.toLowerCase();
    for (const [key, entry] of Object.entries(mitigationMap)) {
      if (lowerFactor.includes(key)) {
        return entry;
      }
    }

    return mitigationMap.default;
  };

  // Build risk elaboration from effort data with specific mitigations and severity
  const riskElaboration = (effort.risk_factors || []).map(factor => {
    const entry = getMitigationEntry(factor);
    return {
      risk: factor,
      technical_dependency: 'TBD - requires technical review',
      mitigation: entry.mitigation,
      is_high: entry.is_high
    };
  });

  // Build sources array for zero hallucination tracking
  const sources = [
    { field: 'internal_rate', source: 'config/agency_context.json', confidence: 'high' },
    { field: 'hourly_rates', source: 'config/agency_context.json', confidence: 'high' },
    { field: 'pricing_validation', source: 'config/agency_context.json', confidence: 'high' },
    { field: 'risk_multiplier', source: 'LLM estimation', confidence: 'medium' },
    { field: 'hours_breakdown', source: 'LLM estimation', confidence: 'medium' },
    { field: 'hard_savings', source: 'Rule: 30% of project hours as monthly labor savings', confidence: 'medium' },
    { field: 'modeled_opportunity', source: 'Conservative 1% conversion lift assumption', confidence: 'low' }
  ];

  return {
    // Internal cost tracking
    raw_production_cost: internalCost.raw_production_cost,
    compute_estimate: internalCost.compute_estimate,
    total_internal_cost: internalCost.total_internal_cost,
    internal_rate: internalCost.internal_rate,

    // Pricing (may be adjusted by profit floor)
    original_price: cost.total,
    target_price: finalPrice,
    price_adjusted: pricingValidation.validation.profit_floor.adjusted,

    // Margin
    margin_amount: margin.margin_amount,
    margin_percent: margin.margin_percent,

    // Enterprise pricing validation
    value_breakdown: pricingValidation.value_breakdown,
    validation: pricingValidation.validation,

    // Legacy ROI (backward compatibility)
    roi,

    // Risk tracking
    risk_elaboration: riskElaboration,
    sources
  };
}

/**
 * Build Commercial section for sales strategy
 * @param {object} cost - Cost calculation
 * @returns {object} Commercial configuration
 */
export function buildCommercial(cost) {
  const context = loadAgencyContext();
  const subscription = context.subscription || {};
  const licensing = context.licensing_model || {};

  const paymentTerms = determinePaymentStructure(cost.total);

  return {
    pricing_model: 'managed_service',
    subscription_price: subscription.base_price || 497,
    processes_included: subscription.processes_included || 3,
    ad_hoc_rate: context.ad_hoc_rate || 250,
    payment_terms: {
      structure: paymentTerms.structure,
      upfront_percent: paymentTerms.upfront_percent,
      final_percent: paymentTerms.final_percent,
      final_trigger: paymentTerms.final_trigger
    },
    licensing: {
      infrastructure: licensing.infrastructure || 'wranngle_hosted',
      data_ownership: licensing.data_ownership || 'client',
      exportable: licensing.exportable !== false
    }
  };
}

/**
 * Quick estimate without LLM (rule-based)
 * @param {object} intake - Intake data
 * @returns {object} Quick estimate
 */
export function quickEstimate(intake) {
  const context = loadAgencyContext();

  // Determine tier from intake classification
  const tierKey = intake.classification?.estimated_tier || 'standard';
  const tier = context.project_tiers[tierKey];

  // Use midpoint of tier range
  const midHours = (tier.hours_range.min + tier.hours_range.max) / 2;
  const midPrice = (tier.price_range.min + tier.price_range.max) / 2;

  // Apply default risk multiplier if signals present
  let riskMultiplier = 1;
  const riskFlags = intake.signals?.risk_flags || [];

  if (riskFlags.length > 3) {
    riskMultiplier = 1.5;
  } else if (riskFlags.length > 1) {
    riskMultiplier = 1.25;
  }

  const estimatedHours = Math.round(midHours * riskMultiplier);

  return {
    tier: tierKey,
    tier_name: tier.name,
    estimated_hours: estimatedHours,
    estimated_cost: Math.round(midPrice * riskMultiplier),
    est_days: calculateEstDays(estimatedHours),
    risk_multiplier: riskMultiplier,
    range: {
      low: Math.round(tier.price_range.min * riskMultiplier),
      high: Math.round(tier.price_range.max * riskMultiplier)
    },
    note: 'Quick estimate - use generateEstimate() for detailed breakdown'
  };
}
