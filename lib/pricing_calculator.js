/**
 * Pricing Calculator for AI Proposals
 * Calculates dynamic pricing from audit findings and complexity factors
 *
 * MIGRATION: Now uses unified SQLite config via sql.js
 */

import { fileURLToPath } from 'url';
import path from 'path';
import {
  ensureLoaded,
  getLegacyBaseRates,
  getLegacyComplexityMultipliers,
  getLegacyDiscountRules
} from '../config/index.js';
import { formatCurrency } from './project_identity.js';
import {
  WORKING_DAYS,
  DEFAULT_CLIENT_HOURLY_RATE,
  DEFAULT_MINUTES_PER_ITEM,
  DEFAULT_DAILY_LEADS,
  DEFAULT_DEAL_VALUE,
  MAX_MODELED_OPPORTUNITY_MONTHLY,
  MODELED_TO_HARD_SAVINGS_CAP_RATIO
} from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config references (populated by initPricing)
let BASE_RATES = null;
let COMPLEXITY_MULTIPLIERS = null;
let DISCOUNT_RULES = null;
let _initialized = false;

/**
 * Initialize pricing config (MUST call before using other functions)
 * @returns {Promise<void>}
 */
export async function initPricing() {
  if (_initialized) return;

  await ensureLoaded();
  BASE_RATES = getLegacyBaseRates();
  COMPLEXITY_MULTIPLIERS = getLegacyComplexityMultipliers();
  DISCOUNT_RULES = getLegacyDiscountRules();
  _initialized = true;
}

/**
 * Ensure config is loaded (throws if not initialized)
 */
function requireInit() {
  if (!_initialized) {
    throw new Error('Pricing not initialized. Call await initPricing() first.');
  }
}

/**
 * Calculate total project price from audit findings
 * @param {Object} auditData - Parsed audit report data
 * @param {Object} options - Additional pricing options
 * @returns {Object} Pricing breakdown
 */
export function calculatePricing(auditData, options = {}) {
  requireInit();

  const findings = auditData.findings || auditData.scorecard?.categories || [];
  const complexity = assessComplexity(auditData, options);

  // Calculate base price from effort estimation
  const basePrice = calculateBasePrice(findings, auditData);

  // Apply complexity multipliers
  const multiplier = calculateTotalMultiplier(complexity);
  const adjustedPrice = basePrice * multiplier;

  // Apply discounts if any
  const discount = calculateDiscount(adjustedPrice, options);
  let finalPrice = adjustedPrice - discount.amount;

  // Round the pre-discount price to get subtotal
  const subtotal = roundToIncrement(finalPrice, BASE_RATES.rounding_increment);

  // Calculate milestone allocations from SUBTOTAL (before credits/discounts)
  const milestones = allocateMilestones(subtotal);

  // Calculate audit credit (default $100 for Phase 1 audit)
  const auditCreditAmount = options.audit_credit_amount || 100;
  const auditCredit = {
    amount: auditCreditAmount,
    display: formatCurrency(auditCreditAmount),
    description: 'AI Process Audit credit applied'
  };

  // Calculate early adopter discount (10% if enabled)
  let earlyAdopterDiscount = null;
  const afterCredit = subtotal - auditCreditAmount;

  if (options.early_adopter === false) {
    finalPrice = roundToIncrement(afterCredit, BASE_RATES.rounding_increment);
    finalPrice = Math.max(finalPrice, BASE_RATES.minimum_project_value);
  } else {
    const earlyAdopterPercent = options.early_adopter_percent || 10;
    // Calculate the target final price first (after all discounts and rounding)
    const rawFinal = afterCredit * (1 - earlyAdopterPercent / 100);
    finalPrice = roundToIncrement(rawFinal, BASE_RATES.rounding_increment);
    finalPrice = Math.max(finalPrice, BASE_RATES.minimum_project_value);

    // Back-calculate the discount amount so the math adds up exactly
    const earlyAdopterAmount = afterCredit - finalPrice;
    earlyAdopterDiscount = {
      percentage: earlyAdopterPercent,
      amount: earlyAdopterAmount,
      display: formatCurrency(earlyAdopterAmount),
      note: 'Thank you for being an early adopter as we grow'
    };
  }

  return {
    base_price: basePrice,
    complexity_multiplier: multiplier,
    complexity_factors: complexity,
    adjusted_price: adjustedPrice,
    discount,
    subtotal,
    audit_credit: auditCredit,
    early_adopter_discount: earlyAdopterDiscount,
    final_price: finalPrice,
    milestones,
    currency: 'USD',
    pricing_model: 'fixed_price'
  };
}

function calculateBasePrice(findings, auditData) {
  let totalHours = 0;
  const hourlyRates = BASE_RATES.hourly_rates;
  const effortTiers = BASE_RATES.effort_tiers;

  // EXTRA DEFENSIVE: Check multiple paths for calculated total hours
  const paths = [
    auditData.estimate?.effort?.adjusted_hours?.total,
    auditData.estimate?.effort?.base_hours?.total,
    auditData.estimate?.effort?.total,
    auditData.estimate?.cost?.hours?.total,
    auditData.estimate?.hours?.total,
    auditData.estimate?.hours?.with_contingency,
    auditData.estimate?.tier?.base_hours,
    auditData.project_plan?.effort?.total_hours,
    auditData.project_plan?.total_hours
  ];

  for (const h of paths) {
    if (typeof h === 'number' && h > 0) {
      totalHours = h;
      break;
    }
  }

  // FALLBACK: Process each finding/fix
  if (totalHours === 0) {
    const fixes = auditData.recommended_fixes || auditData.fixes?.items || [];
    for (const fix of fixes) {
      const tier = mapToEffortTier(fix.effort_tier || fix.complexity || 'moderate');
      const hours = effortTiers[tier]?.default_hours || 16;
      totalHours += hours;
    }

    // If no fixes found, estimate from category count
    if (totalHours === 0) {
      const categoryCount = (Array.isArray(findings) ? findings.length : 0) || 3;
      totalHours = categoryCount * effortTiers.moderate.default_hours;
    }
  }

  // Calculate weighted hourly rate
  const weightedRate = calculateWeightedRate(hourlyRates);

  return totalHours * weightedRate;
}

/**
 * Map various effort descriptions to standard tiers
 */
function mapToEffortTier(effort) {
  const normalized = String(effort).toLowerCase();
  if (normalized.includes('trivial') || normalized.includes('simple') || normalized.includes('quick')) {
    return 'trivial';
  }

  if (normalized.includes('critical') || normalized.includes('major')) {
    return 'critical';
  }

  if (normalized.includes('complex') || normalized.includes('significant')) {
    return 'complex';
  }

  return 'moderate';
}

/**
 * Calculate weighted average hourly rate
 */
function calculateWeightedRate(rates) {
  // Weight by typical project composition
  const weights = {
    ai_engineering: 0.25,
    integration_development: 0.35,
    system_design: 0.15,
    testing_qa: 0.1,
    project_management: 0.1,
    training_documentation: 0.05
  };

  let weightedSum = 0;
  for (const [type, weight] of Object.entries(weights)) {
    weightedSum += (rates[type]?.rate || 150) * weight;
  }

  return weightedSum;
}

/**
 * Assess project complexity from audit data
 */
export function assessComplexity(auditData, options) {
  requireInit();

  const complexity = {};

  // Systems count - try various paths including intake section C
  const systemsCount = 
    auditData.systems?.length ||
    auditData.intake?.section_c_systems_handoffs?.q10_systems_involved?.length ||
    auditData.intake?.project?.integrations?.length ||
    auditData.workflow?.systems_involved?.length || 
    2;
  
  complexity.systems_count = getSystemsMultiplier(systemsCount);

  // Integration difficulty
  const integrationTypes = 
    auditData.integration_types || 
    auditData.intake?.project?.integrations?.map(i => i.type) ||
    ['api_available'];
  
  complexity.integration_difficulty = getIntegrationMultiplier(integrationTypes);

  // Data sensitivity
  const industry = 
    auditData.client?.industry || 
    auditData.intake?.prepared_for?.industry || 
    auditData.intake?.client?.industry ||
    'technology';
  
  complexity.data_sensitivity = getDataSensitivityMultiplier(industry, options);

  // Timeline pressure
  const timelinePressure = options.timeline_pressure || 'standard';
  complexity.timeline_pressure = COMPLEXITY_MULTIPLIERS.timeline_pressure.speeds[timelinePressure]?.multiplier || 1;

  // Client readiness
  const clientReadiness = options.client_readiness || 'standard';
  complexity.client_readiness = COMPLEXITY_MULTIPLIERS.client_technical_readiness.levels[clientReadiness]?.multiplier || 1;

  // Industry complexity
  const industryKey = normalizeIndustry(industry);
  complexity.industry = COMPLEXITY_MULTIPLIERS.industry_complexity.industries[industryKey]?.multiplier || 1;

  // Company size (from business_profile)
  const companySizeSegment = options.company_size_segment || null;
  if (companySizeSegment && COMPLEXITY_MULTIPLIERS.company_size?.segments) {
    complexity.company_size = COMPLEXITY_MULTIPLIERS.company_size.segments[companySizeSegment]?.multiplier || 1;
  }

  return complexity;
}

/**
 * Get systems count multiplier
 */
function getSystemsMultiplier(count) {
  const {ranges} = COMPLEXITY_MULTIPLIERS.systems_count;
  if (count <= 2) return ranges['1-2'].multiplier;
  if (count <= 4) return ranges['3-4'].multiplier;
  if (count <= 6) return ranges['5-6'].multiplier;
  return ranges['7+'].multiplier;
}

/**
 * Get integration difficulty multiplier (use highest)
 */
function getIntegrationMultiplier(types) {
  const integrationTypes = COMPLEXITY_MULTIPLIERS.integration_difficulty.types;
  let maxMultiplier = 1;

  for (const type of types) {
    const normalized = type.toLowerCase().replaceAll(/\s+/g, '_');
    const mult = integrationTypes[normalized]?.multiplier || 1;
    maxMultiplier = Math.max(maxMultiplier, mult);
  }

  return maxMultiplier;
}

/**
 * Get data sensitivity multiplier based on industry
 */
function getDataSensitivityMultiplier(industry, options) {
  // Check explicit override
  if (options.data_sensitivity) {
    return COMPLEXITY_MULTIPLIERS.data_sensitivity.levels[options.data_sensitivity]?.multiplier || 1;
  }

  // Infer from industry
  const normalized = normalizeIndustry(industry);
  const industryToSensitivity = {
    healthcare: 'hipaa_phi',
    financial_services: 'financial_regulated',
    legal: 'pii_present',
    government: 'government_classified'
  };

  const sensitivity = industryToSensitivity[normalized] || 'standard';
  return COMPLEXITY_MULTIPLIERS.data_sensitivity.levels[sensitivity]?.multiplier || 1;
}

/**
 * Normalize industry string to config key
 */
function normalizeIndustry(industry) {
  const normalized = String(industry).toLowerCase()
    .replaceAll(/[^a-z]/g, '_')
    .replaceAll(/_+/g, '_');

  const mappings = {
    'tech': 'technology',
    'software': 'technology',
    'saas': 'technology',
    'professional': 'professional_services',
    'consulting': 'professional_services',
    'retail': 'retail_ecommerce',
    'ecommerce': 'retail_ecommerce',
    'e_commerce': 'retail_ecommerce',
    'health': 'healthcare',
    'medical': 'healthcare',
    'finance': 'financial_services',
    'banking': 'financial_services',
    'insurance': 'financial_services',
    'law': 'legal',
    'legal_services': 'legal',
    'gov': 'government',
    'public_sector': 'government',
    'edu': 'education',
    'school': 'education',
    'university': 'education'
  };

  return mappings[normalized] || normalized;
}

/**
 * Calculate total multiplier from all complexity factors
 */
function calculateTotalMultiplier(complexity) {
  // Multiply all factors together
  let total = 1;
  for (const factor of Object.values(complexity)) {
    total *= factor;
  }

  return total;
}

/**
 * Calculate applicable discounts
 * Safe fallbacks added for missing DISCOUNT_RULES config
 */
function calculateDiscount(price, options) {
  // Safe fallback if DISCOUNT_RULES not initialized
  if (!DISCOUNT_RULES) {
    return {
      discounts_applied: [],
      total_percentage: 0,
      amount: 0,
      requires_approval: false
    };
  }

  const discounts = [];

  // Volume discount (safe access)
  const volumeTiers = DISCOUNT_RULES.volume_discounts?.tiers || [];
  const volumeTier = volumeTiers.find(
    t => price >= t.min_value && (t.max_value === null || price <= t.max_value)
  );
  if (volumeTier && volumeTier.discount_percentage > 0) {
    discounts.push({
      type: 'volume',
      percentage: volumeTier.discount_percentage,
      description: volumeTier.description
    });
  }

  // Commitment discount
  if (options.commitment_type && options.commitment_type !== 'single_project') {
    const commitment = DISCOUNT_RULES.commitment_discounts.options[options.commitment_type];
    if (commitment) {
      discounts.push({
        type: 'commitment',
        percentage: commitment.discount_percentage,
        description: commitment.description
      });
    }
  }

  // Early payment discount
  if (options.payment_terms && options.payment_terms !== 'net_15') {
    const earlyPay = DISCOUNT_RULES.early_payment_discounts.options[options.payment_terms];
    if (earlyPay) {
      discounts.push({
        type: 'early_payment',
        percentage: earlyPay.discount_percentage,
        description: earlyPay.description
      });
    }
  }

  // Referral discount
  if (options.is_referral) {
    discounts.push({
      type: 'referral',
      percentage: DISCOUNT_RULES.referral_discounts.first_project_discount,
      description: DISCOUNT_RULES.referral_discounts.description_text
    });
  }

  // Apply stacking rule
  let totalPercentage = 0;
  if (DISCOUNT_RULES.discount_stacking === 'highest_only' && discounts.length > 0) {
    const highest = discounts.reduce((a, b) => a.percentage > b.percentage ? a : b);
    totalPercentage = highest.percentage;
  } else {
    totalPercentage = discounts.reduce((sum, d) => sum + d.percentage, 0);
  }

  // Cap at maximum (safe access with fallback)
  const maxDiscount = DISCOUNT_RULES?.maximum_combined_discount ?? 25;
  totalPercentage = Math.min(totalPercentage, maxDiscount);

  const amount = price * (totalPercentage / 100);

  // Default to 15% approval threshold if not configured
  const approvalThreshold = (DISCOUNT_RULES && DISCOUNT_RULES.notes && DISCOUNT_RULES.notes.approval_required_above) || 15;

  return {
    discounts_applied: discounts,
    total_percentage: totalPercentage,
    amount,
    requires_approval: totalPercentage > approvalThreshold
  };
}

/**
 * Round price to nearest increment
 */
function roundToIncrement(price, increment) {
  return Math.round(price / increment) * increment;
}

/**
 * Allocate price across milestones
 * Uses "remainder adjustment" on last milestone to ensure sum equals total
 */
function allocateMilestones(totalPrice) {
  const allocation = BASE_RATES.milestone_allocation;

  // Calculate first three milestones with rounding
  const designAmount = roundToIncrement(totalPrice * (allocation.design.percentage / 100), 100);
  const buildAmount = roundToIncrement(totalPrice * (allocation.build.percentage / 100), 100);
  const testAmount = roundToIncrement(totalPrice * (allocation.test.percentage / 100), 100);

  // Last milestone gets the remainder to ensure sum = total
  const deployAmount = totalPrice - designAmount - buildAmount - testAmount;

  return {
    design: {
      milestone_number: '2.1',
      milestone_name: 'Design',
      percentage: allocation.design.percentage,
      amount: designAmount,
      description: allocation.design.description
    },
    build: {
      milestone_number: '2.2',
      milestone_name: 'Build',
      percentage: allocation.build.percentage,
      amount: buildAmount,
      description: allocation.build.description
    },
    test: {
      milestone_number: '2.3',
      milestone_name: 'Test',
      percentage: allocation.test.percentage,
      amount: testAmount,
      description: allocation.test.description
    },
    deploy: {
      milestone_number: '2.4',
      milestone_name: 'Deploy',
      percentage: allocation.deploy.percentage,
      amount: deployAmount,
      description: allocation.deploy.description
    }
  };
}

// =============================================================================
// ENTERPRISE PRICING VALIDATION FUNCTIONS
// CFO-credible pricing with separated hard savings vs modeled opportunity
// =============================================================================

// Default pricing validation config (can be overridden via options)
// NOTE: daily_leads_default is now a FALLBACK only - prefer intake-derived volume
const DEFAULT_PRICING_VALIDATION = {
  profit_floor_percent: 50,
  hard_floor_coverage_percent: 50,
  max_payback_months: 3,
  opportunity_lift_percent: 1,
  client_hourly_value: 75,
  average_deal_value: 500,  // Conservative default for service businesses (was 5000)
  daily_leads_default: 15,  // Reduced from 20 - conservative fallback only
  labor_savings_multiplier: 0.3,
  internal_hourly_rate: 50,
  max_modeled_opportunity_monthly: 50_000  // Cap at $50K/month to prevent unrealistic projections
};

/**
 * Enforce profit floor (minimum margin)
 * @param {number} basePrice - Original client-facing price
 * @param {number} internalCost - Total internal production cost
 * @param {Object} config - Pricing validation config
 * @returns {Object} Price adjustment with markup if needed
 */
export function enforceProfitFloor(basePrice, internalCost, config = {}) {
  const targetMargin = (config.profit_floor_percent || 50) / 100;
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

  const requiredPrice = internalCost / (1 - targetMargin);
  const markup = requiredPrice / basePrice;

  return {
    original_price: basePrice,
    adjusted_price: Math.round(requiredPrice),
    markup: Math.round(markup * 100) / 100,
    adjusted: true,
    margin_percent: Math.round(targetMargin * 100),
    passes: true,
    message: `Profit floor enforced: ${Math.round(markup * 100) / 100}x markup applied`
  };
}

/**
 * Calculate Hard Labor Savings from audit bleed data (Guaranteed/Bankable)
 * Uses audit-identified monthly bleed as the hard savings
 * @param {number} monthlyBleed - Monthly revenue bleed from audit
 * @returns {Object} Hard labor savings breakdown
 */
export function calculateHardLaborSavings(monthlyBleed) {
  const annualLaborSavings = monthlyBleed * 12;
  const monthlyRounded = Math.round(monthlyBleed);
  const annualRounded = Math.round(annualLaborSavings);

  return {
    monthly: monthlyRounded,
    annual: annualRounded,
    monthly_display: formatCurrency(monthlyRounded),
    annual_display: formatCurrency(annualRounded),
    type: 'hard_savings',
    label: 'Labor/Process Savings (from Audit)',
    formula: `Audit bleed × 12 months`
  };
}

/**
 * Calculate Modeled Opportunity (Revenue Impact)
 * INTELLIGENT: Derives volume from intake data or monthly bleed when available
 * Conservative 1% conversion lift estimate - NOT guaranteed
 * @param {Object} config - Pricing validation config
 * @param {number} monthlyBleed - Optional monthly bleed for intelligent volume inference
 * @returns {Object} Modeled opportunity breakdown
 */
export function calculateModeledOpportunity(config = {}, monthlyBleed = null) {
  let dailyLeads;
  let volumeSource = 'default';

  // INTELLIGENT VOLUME: Infer from monthly bleed if available
  // Assumption: bleed represents manual effort, which correlates with volume
  if (monthlyBleed && monthlyBleed > 0) {
    // Estimate: if bleed = $X/mo at hourly rate, that's X/rate hours/mo
    // If each transaction takes ~N min, volume = hours * 60 / minutes
    // Then daily = monthly / working days
    const hourlyRate = config.client_hourly_value || DEFAULT_CLIENT_HOURLY_RATE;
    const hoursPerMonth = monthlyBleed / hourlyRate;
    const minutesPerItem = DEFAULT_MINUTES_PER_ITEM;
    const itemsPerMonth = (hoursPerMonth * 60) / minutesPerItem;
    dailyLeads = Math.round((itemsPerMonth / WORKING_DAYS.MONTH) * 10) / 10;
    volumeSource = 'inferred_from_bleed';
  } else if (config.daily_volume) {
    // Explicit override
    dailyLeads = config.daily_volume;
    volumeSource = 'config_override';
  } else {
    // Conservative fallback
    dailyLeads = config.daily_leads_default || DEFAULT_DAILY_LEADS;
    volumeSource = 'default_fallback';
  }

  const liftPercent = config.opportunity_lift_percent || 1;
  // Use conservative deal value suitable for service businesses
  const avgDealValue = config.average_deal_value || DEFAULT_DEAL_VALUE;

  const monthlyLeads = dailyLeads * 30;
  const liftRate = liftPercent / 100;
  const convertedLeads = monthlyLeads * liftRate;
  let monthlyOpportunity = convertedLeads * avgDealValue;

  // GUARDRAILS: Cap modeled opportunity to prevent unrealistic projections
  const maxMonthly = config.max_modeled_opportunity_monthly || MAX_MODELED_OPPORTUNITY_MONTHLY;
  let wasCapped = false;
  let capReason = '';

  if (monthlyOpportunity > maxMonthly) {
    wasCapped = true;
    capReason = `capped at $${maxMonthly.toLocaleString()}/mo max`;
    monthlyOpportunity = maxMonthly;
  }

  // Secondary cap: modeled opportunity shouldn't exceed Nx hard savings (if provided)
  if (config.hard_savings_monthly && monthlyOpportunity > config.hard_savings_monthly * MODELED_TO_HARD_SAVINGS_CAP_RATIO) {
    const hardSavingsCap = config.hard_savings_monthly * MODELED_TO_HARD_SAVINGS_CAP_RATIO;
    if (hardSavingsCap < monthlyOpportunity) {
      wasCapped = true;
      capReason = `capped at ${MODELED_TO_HARD_SAVINGS_CAP_RATIO}x hard savings ($${Math.round(hardSavingsCap).toLocaleString()}/mo)`;
      monthlyOpportunity = hardSavingsCap;
    }
  }

  // Tertiary cap: revenue-based ceiling (annual modeled ≤ 5% of estimated revenue)
  if (config.revenue_midpoint && config.revenue_midpoint > 0) {
    const revenueCap = (config.revenue_midpoint * 0.05) / 12;
    if (monthlyOpportunity > revenueCap) {
      wasCapped = true;
      capReason = `capped at 5% of est. revenue ($${Math.round(revenueCap).toLocaleString()}/mo)`;
      monthlyOpportunity = revenueCap;
    }
  }

  const annualOpportunity = monthlyOpportunity * 12;
  const monthlyRounded = Math.round(monthlyOpportunity);
  const annualRounded = Math.round(annualOpportunity);

  // Build formula string with source attribution
  const volumeNote = volumeSource === 'inferred_from_bleed'
    ? '(from bleed)'
    : volumeSource === 'config_override'
      ? '(specified)'
      : '(default)';

  const formulaBase = `${Math.round(dailyLeads)} ${volumeNote}/day × 30 × ${liftPercent}% × $${avgDealValue.toLocaleString()}`;
  const formula = wasCapped ? `${formulaBase} (${capReason})` : formulaBase;

  return {
    monthly: monthlyRounded,
    annual: annualRounded,
    monthly_display: formatCurrency(monthlyRounded),
    annual_display: formatCurrency(annualRounded),
    converted_leads_monthly: Math.round(convertedLeads * 10) / 10,
    daily_leads: dailyLeads,
    lift_percent: liftPercent,
    avg_deal_value: avgDealValue,
    was_capped: wasCapped,
    cap_reason: capReason,
    type: 'modeled_opportunity',
    label: `Modeled Opportunity (Est. ${liftPercent}% Lift)`,
    formula,
    volume_source: volumeSource
  };
}

/**
 * Validate Hard Floor Rule
 * @param {number} projectPrice - Total project price
 * @param {number} annualLaborSavings - Year 1 hard labor savings
 * @param {Object} config - Pricing validation config
 * @returns {Object} Hard floor validation result
 */
export function validateHardFloorRule(projectPrice, annualLaborSavings, config = {}) {
  const coveragePercent = config.hard_floor_coverage_percent || 50;
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
 * @param {number} projectPrice - Total project price
 * @param {number} totalMonthlyValue - Combined monthly value (hard + modeled)
 * @param {Object} config - Pricing validation config
 * @returns {Object} Payback validation result
 */
export function validatePayback(projectPrice, totalMonthlyValue, config = {}) {
  const maxPaybackMonths = config.max_payback_months || 3;
  const paybackMonths = totalMonthlyValue > 0 ? projectPrice / totalMonthlyValue : Infinity;
  const passes = paybackMonths <= maxPaybackMonths;
  const roundedMonths = Math.round(paybackMonths * 10) / 10;

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
 * Calculate ROI metrics with enterprise validation
 * Includes separated hard savings vs modeled opportunity (CFO-credible)
 * @param {number} monthlyBleed - Monthly revenue bleed from audit
 * @param {number} investmentTotal - Total project investment
 * @param {Object} options - Validation options
 * @returns {Object} Complete ROI with value breakdown and validation
 */
export function calculateROI(monthlyBleed, investmentTotal, options = {}) {
  const config = { ...DEFAULT_PRICING_VALIDATION, ...options };

  // Hard Savings (from audit bleed data - guaranteed)
  const hardSavings = calculateHardLaborSavings(monthlyBleed);

  // Modeled Opportunity - INTELLIGENT: uses monthly bleed to infer volume
  const modeledOpportunity = calculateModeledOpportunity(config, monthlyBleed);

  // Total Value (never merged in display, but needed for payback calc)
  const totalMonthlyValue = hardSavings.monthly + modeledOpportunity.monthly;
  const totalAnnualValue = hardSavings.annual + modeledOpportunity.annual;

  // Calculate payback using total value
  const paybackMonths = totalMonthlyValue > 0 ? investmentTotal / totalMonthlyValue : Infinity;

  // Validate hard floor (Year 1 labor savings must cover X% of project)
  const hardFloor = validateHardFloorRule(investmentTotal, hardSavings.annual, config);

  // Validate payback (must be under max months)
  const paybackCheck = validatePayback(investmentTotal, totalMonthlyValue, config);

  // Calculate ROI percentages
  const annualROIPercent = investmentTotal > 0
    ? Math.round(((totalAnnualValue - investmentTotal) / investmentTotal) * 100)
    : 0;

  // Legacy fields for backward compatibility
  const annualRecovery = monthlyBleed * 12;

  return {
    // Legacy format (backward compatible)
    monthly_recovery: {
      amount: monthlyBleed,
      currency: 'USD',
      period: 'monthly',
      display: formatCurrency(monthlyBleed)
    },
    annual_recovery: {
      amount: annualRecovery,
      currency: 'USD',
      period: 'annual',
      display: formatCurrency(annualRecovery)
    },
    payback_period_months: Math.ceil(paybackMonths * 10) / 10,
    payback_display: formatPaybackPeriod(paybackMonths),

    // Enterprise pricing (CFO-credible, separated values)
    value_breakdown: {
      hard_savings: hardSavings,
      modeled_opportunity: modeledOpportunity,
      total_monthly_value: totalMonthlyValue,
      total_annual_value: totalAnnualValue,
      total_monthly_display: formatCurrency(totalMonthlyValue),
      total_annual_display: formatCurrency(totalAnnualValue),
      display_note: 'Labor Savings + Revenue Impact = Total Value (never merged)'
    },
    validation: {
      hard_floor: hardFloor,
      payback_check: paybackCheck,
      all_pass: hardFloor.passes && paybackCheck.passes,
      summary: (hardFloor.passes && paybackCheck.passes)
        ? 'All pricing validation checks passed'
        : 'WARNING: One or more pricing validation checks failed'
    },
    annual_roi_percent: annualROIPercent
  };
}

/**
 * Format payback period for display
 */
export function formatPaybackPeriod(months) {
  if (months < 1) {
    const weeks = Math.ceil(months * 4.33);
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }

  const roundedMonths = Math.ceil(months * 10) / 10;
  if (roundedMonths === 1) return '1 month';
  return `${roundedMonths} months`;
}

/**
 * Get fixed package recommendation based on scope
 */
export function getPackageRecommendation(auditData) {
  requireInit();

  const fixes = auditData.recommended_fixes || [];
  const systemsCount = auditData.systems?.length || 2;

  // Score based on complexity indicators
  let complexityScore = fixes.length;
  complexityScore += systemsCount * 0.5;

  const criticalCount = fixes.filter(f =>
    (f.effort_tier || '').toLowerCase().includes('critical')
  ).length;
  complexityScore += criticalCount * 2;

  const packages = BASE_RATES.fixed_packages;
  if (complexityScore <= 3) return { ...packages.simple_automation, key: 'simple_automation' };
  if (complexityScore <= 6) return { ...packages.standard_implementation, key: 'standard_implementation' };
  if (complexityScore <= 10) return { ...packages.complex_system, key: 'complex_system' };
  return { ...packages.enterprise_solution, key: 'enterprise_solution' };
}

// =============================================================================
// PRODUCT PRICING (AI Voice Agent Hybrid Model)
// Fixed monthly recurring + variable setup fee based on complexity
// =============================================================================

/**
 * Product pricing tiers from sales_strategy.json
 */
const PRODUCT_TIERS = {
  core_protection: {
    key: 'core_protection',
    name: 'Core Protection',
    monthly: 250,
    includes: 'AI Voice Agent only',
    badge: 'Most Popular',
    badge_class: 'healthy'
  },
  growth_bundle: {
    key: 'growth_bundle',
    name: 'Growth Bundle',
    monthly: 500,
    includes: 'AI Voice Agent + Website Chat Widget',
    badge: 'Full Virtual Office',
    badge_class: 'info'
  }
};

/**
 * Setup fee configuration
 */
const SETUP_CONFIG = {
  base_hours: 8,                    // Base hours for simple voice agent
  hours_per_integration: 4,         // Additional hours per integration beyond first
  custom_workflow_hours: 8,         // Additional hours if custom workflows needed
  max_hours: 40,                    // Cap on setup hours
  min_fee: 500,                     // Minimum setup fee
  hourly_rate: 125                  // Setup/configuration rate
};

/**
 * Calculate hybrid product pricing for AI Voice Agent
 * @param {Object} intake - Extracted intake data with classification
 * @param {Object} options - Additional pricing options
 * @returns {Object} Product pricing breakdown
 */
export function calculateProductPricing(intake, options = {}) {
  const classification = intake.classification || {};

  // Determine product tier
  const tierKey = options.tier || 'core_protection';
  const tier = PRODUCT_TIERS[tierKey] || PRODUCT_TIERS.core_protection;

  // Calculate setup fee based on complexity
  const setupFee = calculateSetupFee(intake, options);

  // Monthly recurring
  const monthlyRecurring = tier.monthly;
  const annualRecurring = monthlyRecurring * 12;

  // First year total
  const firstYearTotal = setupFee.amount + annualRecurring;

  // Calculate ROI (if bleed data available)
  // Use monthlyBleed from options if provided (from measurements.bleed_total.value)
  // Otherwise fall back to extractMonthlyBleed for backwards compatibility
  const monthlyBleed = options.monthlyBleed ?? extractMonthlyBleed(intake);
  const netMonthlySavings = monthlyBleed > 0 ? monthlyBleed - monthlyRecurring : 0;
  const netAnnualSavings = netMonthlySavings * 12;

  // Payback calculation (setup fee / net monthly savings)
  const paybackMonths = netMonthlySavings > 0 ? setupFee.amount / netMonthlySavings : Infinity;

  return {
    pricing_model: 'hybrid_product',
    is_product: true,
    product_key: 'ai_voice_agent',

    // Product tier details
    tier: {
      key: tier.key,
      name: tier.name,
      badge: tier.badge,
      badge_class: tier.badge_class,
      includes: tier.includes
    },

    // Setup fee (one-time)
    setup_fee: {
      amount: setupFee.amount,
      display: formatCurrency(setupFee.amount),
      hours: setupFee.hours,
      hourly_rate: SETUP_CONFIG.hourly_rate,
      breakdown: setupFee.breakdown,
      formula: `${setupFee.hours} hrs × $${SETUP_CONFIG.hourly_rate}/hr`
    },

    // Monthly recurring
    monthly: {
      amount: monthlyRecurring,
      display: formatCurrency(monthlyRecurring),
      period: 'mo'
    },

    // Annual recurring
    annual: {
      amount: annualRecurring,
      display: formatCurrency(annualRecurring),
      period: 'yr'
    },

    // First year total
    first_year: {
      amount: firstYearTotal,
      display: formatCurrency(firstYearTotal),
      formula: `$${setupFee.amount.toLocaleString()} setup + $${monthlyRecurring}/mo × 12`
    },

    // ROI (product-specific)
    roi: {
      monthly_bleed: monthlyBleed,
      monthly_bleed_display: formatCurrency(monthlyBleed),
      net_monthly_savings: netMonthlySavings,
      net_monthly_display: formatCurrency(netMonthlySavings),
      net_annual_savings: netAnnualSavings,
      net_annual_display: formatCurrency(netAnnualSavings),
      payback_months: Math.round(paybackMonths * 10) / 10,
      payback_display: formatPaybackPeriod(paybackMonths),
      formula: `$${monthlyBleed.toLocaleString()} bleed - $${monthlyRecurring}/mo = $${netMonthlySavings.toLocaleString()}/mo savings`
    },

    // Upgrade path
    upgrade_option: tier.key === 'core_protection' ? {
      tier: PRODUCT_TIERS.growth_bundle,
      monthly_delta: PRODUCT_TIERS.growth_bundle.monthly - monthlyRecurring,
      monthly_delta_display: formatCurrency(PRODUCT_TIERS.growth_bundle.monthly - monthlyRecurring),
      pitch: `Add Website Chat Widget for just $${PRODUCT_TIERS.growth_bundle.monthly - monthlyRecurring}/mo more`
    } : null,

    // Detection confidence (from classification)
    detection: {
      confidence: classification.confidence || 0,
      confidence_display: classification.confidence_display || '0%',
      matched_keywords: (classification.matched_keywords || []).slice(0, 5).map(k => k.keyword)
    }
  };
}

/**
 * Calculate one-time setup fee based on intake complexity.
 *
 * Factors considered:
 * - Base configuration hours (standard setup)
 * - Number of integrations (each adds incremental hours)
 * - Custom workflow requirements (additional complexity)
 *
 * Applies business rules:
 * - Maximum hours cap (prevents runaway estimates)
 * - Minimum fee floor (ensures profitability)
 *
 * @param {Object} intake - Extracted intake data from client
 * @param {Object} intake.section_c_systems_handoffs - Systems and integrations
 * @param {Object} [options={}] - Configuration overrides (rarely used)
 * @returns {Object} Setup fee calculation result
 * @returns {number} returns.hours - Billable hours after cap
 * @returns {number} returns.amount - Dollar amount (hours * rate, min applied)
 * @returns {Array<Object>} returns.breakdown - Line-item breakdown for transparency
 */
function calculateSetupFee(intake, _options = {}) {
  const breakdown = [];
  let totalHours = SETUP_CONFIG.base_hours;
  breakdown.push({ item: 'Base configuration', hours: SETUP_CONFIG.base_hours });

  // Count integrations from intake
  const integrations = extractIntegrations(intake);
  const integrationCount = integrations.length;

  if (integrationCount > 1) {
    const additionalHours = (integrationCount - 1) * SETUP_CONFIG.hours_per_integration;
    totalHours += additionalHours;
    breakdown.push({
      item: `Additional integrations (${integrationCount - 1})`,
      hours: additionalHours
    });
  }

  // Check for custom workflows
  const hasCustomWorkflows = detectCustomWorkflows(intake);
  if (hasCustomWorkflows) {
    totalHours += SETUP_CONFIG.custom_workflow_hours;
    breakdown.push({ item: 'Custom workflow configuration', hours: SETUP_CONFIG.custom_workflow_hours });
  }

  // Apply cap
  const cappedHours = Math.min(totalHours, SETUP_CONFIG.max_hours);
  if (cappedHours < totalHours) {
    breakdown.push({ item: `Cap applied (max ${SETUP_CONFIG.max_hours} hrs)`, hours: -(totalHours - cappedHours) });
  }

  // Calculate amount
  let amount = cappedHours * SETUP_CONFIG.hourly_rate;

  // Apply minimum
  if (amount < SETUP_CONFIG.min_fee) {
    amount = SETUP_CONFIG.min_fee;
    breakdown.push({ item: `Minimum fee applied`, hours: 0, note: `Floor: $${SETUP_CONFIG.min_fee}` });
  }

  return {
    hours: cappedHours,
    amount,
    breakdown
  };
}

/**
 * Extract integrations from intake for setup fee calculation.
 *
 * Searches multiple paths in intake structure for integration lists:
 * - section_c_systems_handoffs.q09_current_systems (structured input)
 * - systems.current (legacy path)
 * - integrations array (direct path)
 *
 * @param {Object} intake - Extracted intake data
 * @returns {Array<string>} List of system/integration names
 */
function extractIntegrations(intake) {
  // Check various paths for integrations
  const paths = [
    intake.section_c_systems_handoffs?.q10_systems_involved,
    intake.integrations,
    intake.systems,
    intake.project?.integrations
  ];

  for (const path of paths) {
    if (Array.isArray(path) && path.length > 0) {
      return path;
    }
  }

  return [];
}

/**
 * Detect if custom workflows are needed
 */
function detectCustomWorkflows(intake) {
  const text = JSON.stringify(intake).toLowerCase();

  const customIndicators = [
    'custom', 'complex', 'multi-step', 'conditional',
    'branching', 'escalation', 'routing', 'dispatch',
    'priority', 'emergency', 'triage'
  ];

  return customIndicators.some(kw => text.includes(kw));
}

/**
 * Extract monthly bleed from intake for ROI calculation
 */
function extractMonthlyBleed(intake) {
  // Check various paths for bleed data
  const paths = [
    intake.section_d_pain_cost?.q15_estimated_monthly_bleed?.amount,
    intake.section_d_pain_cost?.q15_estimated_monthly_bleed,
    intake.bleed?.monthly?.amount,
    intake.bleed?.monthly,
    intake.monthly_bleed,
    intake.pain?.monthly_cost
  ];

  for (const path of paths) {
    const value = typeof path === 'object' ? path?.amount : path;
    if (typeof value === 'number' && value > 0) {
      return value;
    }
  }

  return 0;
}

/**
 * Get product tier by key
 */
export function getProductTier(tierKey) {
  return PRODUCT_TIERS[tierKey] || PRODUCT_TIERS.core_protection;
}

/**
 * Get all product tiers
 */
export function getAllProductTiers() {
  return { ...PRODUCT_TIERS };
}

export default {
  initPricing,
  calculatePricing,
  calculateProductPricing,
  calculateROI,
  formatPaybackPeriod,
  getPackageRecommendation,
  getProductTier,
  getAllProductTiers,
  assessComplexity,
  // Enterprise pricing validation
  enforceProfitFloor,
  calculateHardLaborSavings,
  calculateModeledOpportunity,
  validateHardFloorRule,
  validatePayback
};
