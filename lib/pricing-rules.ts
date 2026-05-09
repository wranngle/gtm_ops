// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * Pricing Rules Module
 *
 * Unified interface for enterprise pricing validation functions.
 * Re-exports core functions from pricing-calculator.js to provide
 * a cleaner import path and prevent code duplication.
 *
 * Usage:
 *   import {
 *     enforceProfitFloor,
 *     validateHardFloorRule,
 *     validatePayback,
 *     calculateHardLaborSavings,
 *     calculateModeledOpportunity,
 *     formatPaybackPeriod,
 *     roundToIncrement,
 *     DEFAULT_PRICING_CONFIG
 *   } from './pricing-rules.js';
 *
 * @module lib/pricing_rules
 */

// Re-export all enterprise pricing validation functions from pricing_calculator
// Import constants for the default config object
import {
  PROFIT_FLOOR_PERCENT,
  HARD_FLOOR_COVERAGE_PERCENT,
  MAX_PAYBACK_MONTHS,
  OPPORTUNITY_LIFT_PERCENT,
  LABOR_SAVINGS_MULTIPLIER,
  INTERNAL_HOURLY_RATE,
  DEFAULT_CLIENT_HOURLY_RATE,
  DEFAULT_DAILY_LEADS,
  DEFAULT_DEAL_VALUE,
  MAX_MODELED_OPPORTUNITY_MONTHLY,
  PRICE_ROUNDING_INCREMENT,
  MILESTONE_ALLOCATION
} from './constants.js';

export {
  enforceProfitFloor,
  calculateHardLaborSavings,
  calculateModeledOpportunity,
  validateHardFloorRule,
  validatePayback,
  calculateROI,
  formatPaybackPeriod
} from './pricing-calculator.js';

// Re-export formatting utilities from project_identity
export { formatCurrency } from './project-identity.js';

/**
 * Default pricing validation configuration.
 * Centralized config object that can be passed to validation functions.
 */
export const DEFAULT_PRICING_CONFIG = {
  profit_floor_percent: PROFIT_FLOOR_PERCENT,
  hard_floor_coverage_percent: HARD_FLOOR_COVERAGE_PERCENT,
  max_payback_months: MAX_PAYBACK_MONTHS,
  opportunity_lift_percent: OPPORTUNITY_LIFT_PERCENT,
  labor_savings_multiplier: LABOR_SAVINGS_MULTIPLIER,
  internal_hourly_rate: INTERNAL_HOURLY_RATE,
  client_hourly_value: DEFAULT_CLIENT_HOURLY_RATE,
  daily_leads_default: DEFAULT_DAILY_LEADS,
  average_deal_value: DEFAULT_DEAL_VALUE,
  max_modeled_opportunity_monthly: MAX_MODELED_OPPORTUNITY_MONTHLY
};

/**
 * Default milestone allocation percentages.
 */
export const MILESTONE_PERCENTAGES = {
  design: MILESTONE_ALLOCATION.DESIGN,
  build: MILESTONE_ALLOCATION.BUILD,
  test: MILESTONE_ALLOCATION.TEST,
  deploy: MILESTONE_ALLOCATION.DEPLOY
};

/**
 * Round price to nearest increment (default $100)
 * @param {number} price - Raw price
 * @param {number} increment - Rounding increment (default from constants)
 * @returns {number} Rounded price
 */
export function roundToIncrement(price, increment = PRICE_ROUNDING_INCREMENT) {
  return Math.round(price / increment) * increment;
}

/**
 * Calculate margin percentage
 * @param {number} price - Client-facing price
 * @param {number} cost - Internal cost
 * @returns {number} Margin as decimal (0.5 = 50%)
 */
export function calculateMargin(price, cost) {
  if (price <= 0) return 0;
  return (price - cost) / price;
}

/**
 * Calculate internal production cost
 * @param {number} hours - Total project hours
 * @param {number} hourlyRate - Internal hourly rate (default from constants)
 * @param {number} computeEstimate - Additional compute/infrastructure cost
 * @returns {number} Total internal cost
 */
export function calculateInternalCost(hours, hourlyRate = INTERNAL_HOURLY_RATE, computeEstimate = 0) {
  return (hours * hourlyRate) + computeEstimate;
}

/**
 * Allocate price across milestones with remainder adjustment
 * Ensures sum of milestone amounts equals total price
 * @param {number} totalPrice - Total project price
 * @returns {object} Milestone amounts keyed by phase name
 */
export function allocateMilestones(totalPrice) {
  const designAmount = roundToIncrement(totalPrice * (MILESTONE_PERCENTAGES.design / 100));
  const buildAmount = roundToIncrement(totalPrice * (MILESTONE_PERCENTAGES.build / 100));
  const testAmount = roundToIncrement(totalPrice * (MILESTONE_PERCENTAGES.test / 100));
  // Deploy gets remainder to ensure sum equals total
  const deployAmount = totalPrice - designAmount - buildAmount - testAmount;

  return {
    design: {
      percentage: MILESTONE_PERCENTAGES.design,
      amount: designAmount
    },
    build: {
      percentage: MILESTONE_PERCENTAGES.build,
      amount: buildAmount
    },
    test: {
      percentage: MILESTONE_PERCENTAGES.test,
      amount: testAmount
    },
    deploy: {
      percentage: MILESTONE_PERCENTAGES.deploy,
      amount: deployAmount
    }
  };
}

/**
 * Run full pricing validation suite using bleed-based calculations
 * (Uses calculateHardLaborSavings from pricing_calculator which takes monthlyBleed)
 * @param {object} params - Validation parameters
 * @param {number} params.price - Client-facing price
 * @param {number} params.internalCost - Internal production cost
 * @param {number} params.monthlyBleed - Monthly bleed from audit
 * @param {object} config - Optional config override
 * @returns {object} Complete validation results
 */
export async function validatePricingFromBleed({ price, internalCost, monthlyBleed }, config = {}) {
  const mergedConfig = { ...DEFAULT_PRICING_CONFIG, ...config };

  // Dynamic import to avoid circular dependency
  const pricingCalc = await import('./pricing-calculator.js');

  // 1. Profit floor check
  const profitFloor = pricingCalc.enforceProfitFloor(price, internalCost, mergedConfig);
  const adjustedPrice = profitFloor.adjusted_price;

  // 2. Hard savings calculation (from audit bleed)
  const hardSavings = pricingCalc.calculateHardLaborSavings(monthlyBleed);

  // 3. Modeled opportunity
  const modeledOpportunity = pricingCalc.calculateModeledOpportunity(
    { ...mergedConfig, hard_savings_monthly: hardSavings.monthly },
    monthlyBleed
  );

  // 4. Hard floor validation
  const hardFloor = pricingCalc.validateHardFloorRule(adjustedPrice, hardSavings.annual, mergedConfig);

  // 5. Payback validation
  const totalMonthlyValue = hardSavings.monthly + modeledOpportunity.monthly;
  const payback = pricingCalc.validatePayback(adjustedPrice, totalMonthlyValue, mergedConfig);

  return {
    price: {
      original: price,
      adjusted: adjustedPrice,
      was_adjusted: profitFloor.adjusted
    },
    validation: {
      profit_floor: profitFloor,
      hard_floor: hardFloor,
      payback_check: payback,
      all_pass: profitFloor.passes && hardFloor.passes && payback.passes
    },
    value_breakdown: {
      hard_savings: hardSavings,
      modeled_opportunity: modeledOpportunity,
      total_monthly: totalMonthlyValue,
      total_annual: hardSavings.annual + modeledOpportunity.annual
    }
  };
}

/**
 * NOTE ON calculateHardLaborSavings VARIANTS:
 *
 * There are TWO different hard savings calculation strategies:
 *
 * 1. pricing_calculator.calculateHardLaborSavings(monthlyBleed)
 *    - Takes monthly bleed from audit data
 *    - Directly annualizes: monthlyBleed × 12
 *    - Used when we have actual audit/bleed data
 *
 * 2. estimate.calculateHardLaborSavings(projectHours, config)
 *    - Takes project hours and applies a multiplier (30%)
 *    - Formula: projectHours × 0.30 × clientHourlyRate × 12
 *    - Used when estimating from project scope without audit data
 *
 * Both are valid for different contexts. Import from the appropriate
 * module based on whether you have bleed data or project hours.
 */

export default {
  DEFAULT_PRICING_CONFIG,
  MILESTONE_PERCENTAGES,
  roundToIncrement,
  calculateMargin,
  calculateInternalCost,
  allocateMilestones,
  validatePricingFromBleed
};
