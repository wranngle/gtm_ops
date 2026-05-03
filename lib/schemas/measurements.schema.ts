/**
 * Measurements & Bleed Schema - KPIs and cost calculations
 * @module lib/schemas/measurements.schema
 */

import { z } from 'zod';
import {
  NumericWithDisplaySchema,
  StatusSchema,
  MetricTypeSchema,
  EvidenceSchema,
} from './common.schema.js';

// =============================================================================
// Threshold Configuration
// =============================================================================

export const ThresholdSchema = z.object({
  target: z.number().nullable(),
  target_display: z.string().optional(),
  healthy_max: z.number().optional(),
  warning_max: z.number().optional(),
  direction: z.enum(['lower_is_better', 'higher_is_better']).optional(),
});

export type Threshold = z.infer<typeof ThresholdSchema>;

// =============================================================================
// Measurement (Individual KPI)
// =============================================================================

export const MeasurementSchema = z.object({
  id: z.string(),
  name: z.string(),
  metric_type: MetricTypeSchema,
  value: z.number(),
  unit: z.enum(['hours', 'minutes', 'days', 'percent', 'count', 'dollars']),
  value_display: z.string(),
  source: z.string().optional(),
  evidence: z.array(EvidenceSchema).optional(),
  threshold: ThresholdSchema.optional(),
  status: StatusSchema.optional(),
  status_reason: z.string().optional(),
});

export type Measurement = z.infer<typeof MeasurementSchema>;

// =============================================================================
// Bleed Assumption
// =============================================================================

export const BleedAssumptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
  value_display: z.string(),
  currency: z.literal('USD').optional().default('USD'),
  period: z.string().optional().default('monthly'),
  source: z.string().optional(),
});

export type BleedAssumption = z.infer<typeof BleedAssumptionSchema>;

// =============================================================================
// Bleed Calculation
// =============================================================================

export const BleedCalculationSchema = z.object({
  id: z.string(),
  label: z.string(),
  formula: z.string(),
  formula_display: z.string().optional(),
  inputs: z.array(z.string()).optional(),
  result: z.number(),
  result_display: z.string(),
  calculation_method: z.literal('deterministic_js').optional(),
  time_source: z.string().optional(),
});

export type BleedCalculation = z.infer<typeof BleedCalculationSchema>;

// =============================================================================
// Bleed Total (The Critical Number)
// =============================================================================

export const BleedTotalSchema = z.object({
  value: z.number().nonnegative(),
  currency: z.literal('USD').default('USD'),
  period: z.enum(['day', 'week', 'month', 'year']).default('month'),
  display: z.string(),
  calculation_method: z.literal('deterministic_js').optional(),
});

export type BleedTotal = z.infer<typeof BleedTotalSchema>;

// =============================================================================
// Bleed Input Validation (for sanity checks)
// =============================================================================

export const BleedInputsSchema = z.object({
  volume_per_day: z.number().min(0).max(100000),
  days_per_month: z.number().min(1).max(31).default(22),
  minutes_per_item: z.number().min(0).max(480), // Max 8 hours per item
  hourly_rate: z.number().min(0).max(1000).default(75),
}).refine(
  (data) => {
    // Sanity check: monthly bleed should be < $10M
    const monthlyBleed = (data.volume_per_day * data.days_per_month * data.minutes_per_item / 60) * data.hourly_rate;
    return monthlyBleed < 10_000_000;
  },
  {
    message: 'Calculated bleed exceeds $10M/month - please verify inputs (likely units confusion)',
  }
);

export type BleedInputs = z.infer<typeof BleedInputsSchema>;

// =============================================================================
// Complete Measurements Data
// =============================================================================

export const MeasurementsDataSchema = z.object({
  // Schema v2: Keyed collection for O(1) lookup
  metrics: z.object({
    count: z.number().default(0),
    byId: z.record(z.string(), MeasurementSchema).default({}),
  }).optional(),

  // Legacy array format (backward compatibility)
  measurements: z.array(MeasurementSchema).optional(),

  // Bleed cost data
  bleed_assumptions: z.array(BleedAssumptionSchema).optional(),
  bleed_calculations: z.array(BleedCalculationSchema).optional(),
  bleed_total: BleedTotalSchema.optional(),
});

export type MeasurementsData = z.infer<typeof MeasurementsDataSchema>;

// =============================================================================
// Bleed Validation Gate Result
// =============================================================================

export const BleedValidationResultSchema = z.object({
  valid: z.boolean(),
  inputs: BleedInputsSchema.optional(),
  calculated_monthly_bleed: z.number().optional(),
  warnings: z.array(z.string()).optional(),
  errors: z.array(z.string()).optional(),
});

export type BleedValidationResult = z.infer<typeof BleedValidationResultSchema>;
