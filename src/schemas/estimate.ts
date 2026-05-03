/**
 * Estimation Schemas
 * 
 * Zod schemas for bleed calculations and financial estimates.
 * These schemas include the sanity bounds that would have prevented the $10.7M bug.
 * 
 * @module src/schemas/estimate
 */

import { z } from 'zod';
import { 
  MonetaryValueSchema, 
  DurationValueSchema,
  DecimalRatioSchema,
  IntegerPercentSchema,
  type MonetaryValue
} from './monetary.js';

// =============================================================================
// BLEED CALCULATION - THE CRITICAL SCHEMA
// =============================================================================

/**
 * Bleed calculation inputs with SANITY BOUNDS
 * 
 * THE KEY PROTECTION: minutes_per_item is capped at 480 (8 hours).
 * The $10.7M bug had minutes_per_item = 5196 which is ~86 hours per task.
 * This schema would have caught that immediately.
 */
export const BleedInputsSchema = z.object({
  volume_per_day: z.number()
    .min(1, { message: 'Volume must be at least 1' })
    .max(10_000, { message: 'Volume exceeds 10K/day - verify this is correct' }),
  
  days_per_month: z.number()
    .min(1, { message: 'Days must be at least 1' })
    .max(31, { message: 'Days per month cannot exceed 31' }),
  
  /**
   * Minutes per item - THE KEY CHECK
   * 
   * SANITY BOUND: Max 480 minutes (8 hours) per single task.
   * If a task takes longer than 8 hours, use hours_per_item instead.
   * 
   * The $10.7M bug had 5196 minutes here (86+ hours per task).
   */
  minutes_per_item: z.number()
    .min(0.5, { message: 'Task must take at least 30 seconds' })
    .max(480, { 
      message: 'Task exceeds 8 hours (480 minutes) - this seems unrealistic. ' +
               'If accurate, break into subtasks or use hours_per_item.'
    }),
  
  hourly_rate: z.number()
    .min(10, { message: 'Hourly rate below $10 - verify this is intentional' })
    .max(500, { message: 'Hourly rate above $500 - verify this is correct' })
});

export type BleedInputs = z.infer<typeof BleedInputsSchema>;

/**
 * Individual bleed item breakdown
 */
export const BleedBreakdownItemSchema = z.object({
  label: z.string().min(1),
  amount: MonetaryValueSchema,
  status: z.enum(['critical', 'warning', 'healthy']),
  details: z.string().optional()
});

export type BleedBreakdownItem = z.infer<typeof BleedBreakdownItemSchema>;

/**
 * Complete bleed calculation output
 * 
 * Includes output sanity check: monthly bleed capped at $500K.
 * Higher values likely indicate a calculation error.
 */
export const BleedCalculationSchema = z.object({
  total: MonetaryValueSchema.refine(
    (val) => val.amount < 500_000,
    { message: 'Monthly bleed exceeds $500K - verify calculation' }
  ),
  
  formula: z.string(),
  formula_display: z.string().optional(),
  
  inputs: BleedInputsSchema,
  
  breakdown: z.array(BleedBreakdownItemSchema).optional(),
  
  assumptions: z.array(z.string()).optional()
});

export type BleedCalculation = z.infer<typeof BleedCalculationSchema>;

// =============================================================================
// TIER ASSESSMENT
// =============================================================================

export const TierKeySchema = z.enum(['starter', 'standard', 'advanced', 'premium']);
export type TierKey = z.infer<typeof TierKeySchema>;

export const TierAssessmentSchema = z.object({
  key: TierKeySchema,
  label: z.string(),
  base_hours: z.number()
    .min(20, { message: 'Base hours below 20 - very small project' })
    .max(500, { message: 'Base hours above 500 - consider breaking into phases' }),
  risk_multiplier: z.number()
    .min(1.0, { message: 'Risk multiplier cannot be below 1.0' })
    .max(2.0, { message: 'Risk multiplier above 2.0 is excessive' }),
  adjusted_hours: z.number().optional(),
  rationale: z.string().optional()
});

export type TierAssessment = z.infer<typeof TierAssessmentSchema>;

// =============================================================================
// VALUE BREAKDOWN
// =============================================================================

export const SavingsBreakdownSchema = z.object({
  monthly: MonetaryValueSchema,
  annual: MonetaryValueSchema,
  type: z.enum(['hard_savings', 'modeled_opportunity']),
  label: z.string(),
  formula: z.string().optional()
});

export type SavingsBreakdown = z.infer<typeof SavingsBreakdownSchema>;

export const ValueBreakdownSchema = z.object({
  hard_savings: z.object({
    monthly: MonetaryValueSchema,
    annual: MonetaryValueSchema
  }),
  
  modeled_opportunity: z.object({
    monthly: MonetaryValueSchema,
    annual: MonetaryValueSchema
  }),
  
  total_monthly_value: z.number().nonnegative(),
  total_annual_value: z.number().nonnegative()
});

export type ValueBreakdown = z.infer<typeof ValueBreakdownSchema>;

// =============================================================================
// ROI CALCULATION
// =============================================================================

export const ROICalculationSchema = z.object({
  payback_period: DurationValueSchema,
  payback_months: z.number().nonnegative(),
  annual_multiplier: z.number()
    .min(0, { message: 'ROI cannot be negative' })
    .max(100, { message: 'ROI above 100x is unrealistic - verify calculation' }),
  percent: z.number().optional(),
  tier: z.enum(['excellent', 'good', 'moderate', 'low']).optional()
});

export type ROICalculation = z.infer<typeof ROICalculationSchema>;

// =============================================================================
// FINOPS (FINANCIAL OPERATIONS)
// =============================================================================

export const FinOpsValidationSchema = z.object({
  profit_floor: z.object({
    passes: z.boolean(),
    required_margin: DecimalRatioSchema,
    actual_margin: DecimalRatioSchema,
    message: z.string()
  }),
  
  hard_floor: z.object({
    passes: z.boolean(),
    required_coverage: z.number(),
    actual_coverage: z.number(),
    coverage_percent: IntegerPercentSchema,
    message: z.string()
  }),
  
  payback_check: z.object({
    passes: z.boolean(),
    payback_months: z.number(),
    max_payback_months: z.number(),
    payback_display: z.string(),
    message: z.string()
  })
});

export type FinOpsValidation = z.infer<typeof FinOpsValidationSchema>;

export const FinOpsSchema = z.object({
  target_price: z.number().nonnegative(),
  margin_percent: DecimalRatioSchema,
  margin_amount: z.number().nonnegative(),
  
  value_breakdown: ValueBreakdownSchema,
  roi: ROICalculationSchema,
  validation: FinOpsValidationSchema.optional()
});

export type FinOps = z.infer<typeof FinOpsSchema>;

// =============================================================================
// FULL ESTIMATE
// =============================================================================

export const EstimateSchema = z.object({
  tier: TierAssessmentSchema,
  bleed: BleedCalculationSchema,
  finops: FinOpsSchema,
  
  // Cost breakdown
  cost: z.object({
    subtotal: z.number().nonnegative(),
    contingency: z.number().nonnegative(),
    contingency_percent: DecimalRatioSchema,
    total: z.number().nonnegative()
  }).optional(),
  
  // Effort hours
  hours: z.object({
    total: z.number().nonnegative(),
    with_contingency: z.number().nonnegative(),
    breakdown: z.record(z.string(), z.number()).optional()
  }).optional()
});

export type Estimate = z.infer<typeof EstimateSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate bleed inputs and throw descriptive error if invalid
 */
export function validateBleedInputs(inputs: unknown): BleedInputs {
  const result = BleedInputsSchema.safeParse(inputs);
  
  if (!result.success) {
    const errors = result.error.issues.map(e => 
      `${e.path.join('.')}: ${e.message}`
    ).join('\n');
    
    throw new Error(`Bleed input validation failed:\n${errors}`);
  }
  
  return result.data;
}

/**
 * Validate complete estimate and return with errors
 */
export function validateEstimate(estimate: unknown): {
  valid: boolean;
  data?: Estimate;
  errors?: string[];
} {
  const result = EstimateSchema.safeParse(estimate);
  
  if (result.success) {
    return { valid: true, data: result.data };
  }
  
  return {
    valid: false,
    errors: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
  };
}
