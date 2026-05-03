/**
 * Pricing Rules Module
 *
 * Unified interface for enterprise pricing validation functions.
 * Re-exports core functions from pricing_calculator.ts to provide
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
 *   } from './pricing_rules.js';
 *
 * @module lib/pricing_rules
 */

// =============================================================================
// RE-EXPORTS FROM OTHER MODULES
// =============================================================================

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
} from './pricing_calculator.js';

// Re-export formatting utilities from project_identity
export { formatCurrency } from './project_identity.js';

// =============================================================================
// TYPES
// =============================================================================

export type PricingConfig = {
  profit_floor_percent: number;
  hard_floor_coverage_percent: number;
  max_payback_months: number;
  opportunity_lift_percent: number;
  labor_savings_multiplier: number;
  internal_hourly_rate: number;
  client_hourly_value: number;
  daily_leads_default: number;
  average_deal_value: number;
  max_modeled_opportunity_monthly: number;
};

export type MilestonePercentages = {
  design: number;
  build: number;
  test: number;
  deploy: number;
};

type MilestoneAmount = {
  percentage: number;
  amount: number;
};

export type MilestoneAllocations = {
  design: MilestoneAmount;
  build: MilestoneAmount;
  test: MilestoneAmount;
  deploy: MilestoneAmount;
};

type ValidationParams = {
  price: number;
  internalCost: number;
  monthlyBleed: number;
};

export type PricingValidationResult = {
  price: {
    original: number;
    adjusted: number;
    was_adjusted: boolean;
  };
  validation: {
    profit_floor: any;
    hard_floor: any;
    payback_check: any;
    all_pass: boolean;
  };
  value_breakdown: {
    hard_savings: any;
    modeled_opportunity: any;
    total_monthly: number;
    total_annual: number;
  };
};

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default pricing validation configuration.
 * Centralized config object that can be passed to validation functions.
 */
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
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
export const MILESTONE_PERCENTAGES: MilestonePercentages = {
  design: MILESTONE_ALLOCATION.DESIGN,
  build: MILESTONE_ALLOCATION.BUILD,
  test: MILESTONE_ALLOCATION.TEST,
  deploy: MILESTONE_ALLOCATION.DEPLOY
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Round price to nearest increment (default $100)
 */
export function roundToIncrement(price: number, increment: number = PRICE_ROUNDING_INCREMENT): number {
  return Math.round(price / increment) * increment;
}

/**
 * Calculate margin percentage
 */
export function calculateMargin(price: number, cost: number): number {
  if (price <= 0) return 0;
  return (price - cost) / price;
}

/**
 * Calculate internal production cost
 */
export function calculateInternalCost(
  hours: number,
  hourlyRate: number = INTERNAL_HOURLY_RATE,
  computeEstimate = 0
): number {
  return (hours * hourlyRate) + computeEstimate;
}

/**
 * Allocate price across milestones with remainder adjustment
 * Ensures sum of milestone amounts equals total price
 */
export function allocateMilestones(totalPrice: number): MilestoneAllocations {
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

// =============================================================================
// COMPREHENSIVE VALIDATION
// =============================================================================

/**
 * Run full pricing validation suite using bleed-based calculations
 * (Uses calculateHardLaborSavings from pricing_calculator which takes monthlyBleed)
 */
export async function validatePricingFromBleed(
  params: ValidationParams,
  config: Partial<PricingConfig> = {}
): Promise<PricingValidationResult> {
  const { price, internalCost, monthlyBleed } = params;
  const mergedConfig = { ...DEFAULT_PRICING_CONFIG, ...config };

  // Dynamic import to avoid circular dependency
  const pricingCalc = await import('./pricing_calculator.js');

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

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  DEFAULT_PRICING_CONFIG,
  MILESTONE_PERCENTAGES,
  roundToIncrement,
  calculateMargin,
  calculateInternalCost,
  allocateMilestones,
  validatePricingFromBleed
};
