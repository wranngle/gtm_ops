/**
 * Estimation Schemas
 *
 * ArkType schemas for bleed calculations and financial estimates.
 * These schemas include the sanity bounds that would have prevented the $10.7M bug.
 *
 * @module src/schemas/estimate
 */

import { type } from 'arktype';
import {
  MonetaryValueSchema,
  DurationValueSchema,
  DecimalRatioSchema,
  IntegerPercentSchema,
} from './monetary.js';

// =============================================================================
// BLEED CALCULATION
// =============================================================================

export const BleedInputsSchema = type({
  volume_per_day: '1 <= number <= 10000',
  days_per_month: '1 <= number <= 31',
  // Sanity bound: max 480 minutes (8 hours) per task. The $10.7M bug
  // had 5196 minutes (~86 hours) per task.
  minutes_per_item: '0.5 <= number <= 480',
  hourly_rate: '10 <= number <= 500',
});

export type BleedInputs = typeof BleedInputsSchema.infer;

export const BleedBreakdownItemSchema = type({
  label: 'string >= 1',
  amount: MonetaryValueSchema,
  status: "'critical' | 'warning' | 'healthy'",
  'details?': 'string',
});

export type BleedBreakdownItem = typeof BleedBreakdownItemSchema.infer;

const BleedTotalSchema = MonetaryValueSchema.narrow((v: any, ctx: any) =>
  v.amount < 500_000 || ctx.reject('monthly bleed < $500K (verify calculation)'),
);

export const BleedCalculationSchema = type({
  total: BleedTotalSchema,
  formula: 'string',
  'formula_display?': 'string',
  inputs: BleedInputsSchema,
  'breakdown?': BleedBreakdownItemSchema.array(),
  'assumptions?': 'string[]',
});

export type BleedCalculation = typeof BleedCalculationSchema.infer;

// =============================================================================
// TIER ASSESSMENT
// =============================================================================

export const TierKeySchema = type("'starter' | 'standard' | 'advanced' | 'premium'");
export type TierKey = typeof TierKeySchema.infer;

export const TierAssessmentSchema = type({
  key: TierKeySchema,
  label: 'string',
  base_hours: '20 <= number <= 500',
  risk_multiplier: '1 <= number <= 2',
  'adjusted_hours?': 'number',
  'rationale?': 'string',
});

export type TierAssessment = typeof TierAssessmentSchema.infer;

// =============================================================================
// VALUE BREAKDOWN
// =============================================================================

export const SavingsBreakdownSchema = type({
  monthly: MonetaryValueSchema,
  annual: MonetaryValueSchema,
  type: "'hard_savings' | 'modeled_opportunity'",
  label: 'string',
  'formula?': 'string',
});

export type SavingsBreakdown = typeof SavingsBreakdownSchema.infer;

export const ValueBreakdownSchema = type({
  hard_savings: type({
    monthly: MonetaryValueSchema,
    annual: MonetaryValueSchema,
  }),
  modeled_opportunity: type({
    monthly: MonetaryValueSchema,
    annual: MonetaryValueSchema,
  }),
  total_monthly_value: 'number >= 0',
  total_annual_value: 'number >= 0',
});

export type ValueBreakdown = typeof ValueBreakdownSchema.infer;

// =============================================================================
// ROI CALCULATION
// =============================================================================

export const ROICalculationSchema = type({
  payback_period: DurationValueSchema,
  payback_months: 'number >= 0',
  annual_multiplier: '0 <= number <= 100',
  'percent?': 'number',
  'tier?': "'excellent' | 'good' | 'moderate' | 'low'",
});

export type ROICalculation = typeof ROICalculationSchema.infer;

// =============================================================================
// FINOPS
// =============================================================================

export const FinOpsValidationSchema = type({
  profit_floor: type({
    passes: 'boolean',
    required_margin: DecimalRatioSchema,
    actual_margin: DecimalRatioSchema,
    message: 'string',
  }),
  hard_floor: type({
    passes: 'boolean',
    required_coverage: 'number',
    actual_coverage: 'number',
    coverage_percent: IntegerPercentSchema,
    message: 'string',
  }),
  payback_check: type({
    passes: 'boolean',
    payback_months: 'number',
    max_payback_months: 'number',
    payback_display: 'string',
    message: 'string',
  }),
});

export type FinOpsValidation = typeof FinOpsValidationSchema.infer;

export const FinOpsSchema = type({
  target_price: 'number >= 0',
  margin_percent: DecimalRatioSchema,
  margin_amount: 'number >= 0',
  value_breakdown: ValueBreakdownSchema,
  roi: ROICalculationSchema,
  'validation?': FinOpsValidationSchema,
});

export type FinOps = typeof FinOpsSchema.infer;

// =============================================================================
// FULL ESTIMATE
// =============================================================================

export const EstimateSchema = type({
  tier: TierAssessmentSchema,
  bleed: BleedCalculationSchema,
  finops: FinOpsSchema,
  'cost?': type({
    subtotal: 'number >= 0',
    contingency: 'number >= 0',
    contingency_percent: DecimalRatioSchema,
    total: 'number >= 0',
  }),
  'hours?': type({
    total: 'number >= 0',
    with_contingency: 'number >= 0',
    'breakdown?': 'Record<string, number>',
  }),
});

export type Estimate = typeof EstimateSchema.infer;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export function validateBleedInputs(inputs: unknown): BleedInputs {
  const result = BleedInputsSchema(inputs);
  if (result instanceof type.errors) {
    throw new Error(`Bleed input validation failed:\n${result.summary}`);
  }
  return result;
}

export function validateEstimate(estimate: unknown): {
  valid: boolean;
  data?: Estimate;
  errors?: string[];
} {
  const result = EstimateSchema(estimate);
  if (!(result instanceof type.errors)) {
    return { valid: true, data: result };
  }
  return {
    valid: false,
    errors: [...result].map((issue: any) =>
      `${Array.isArray(issue.path) ? issue.path.join('.') : issue.path ?? ''}: ${issue.message ?? String(issue)}`),
  };
}
