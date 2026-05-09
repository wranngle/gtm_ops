/**
 * Measurements & Bleed Schema - KPIs and cost calculations
 * @module lib/schemas/measurements.schema
 */

import { type } from 'arktype';
import {
  StatusSchema,
  MetricTypeSchema,
  EvidenceSchema,
} from './common.schema.js';

// =============================================================================
// Threshold Configuration
// =============================================================================

export const ThresholdSchema = type({
  target: 'number | null',
  'target_display?': 'string',
  'healthy_max?': 'number',
  'warning_max?': 'number',
  'direction?': "'lower_is_better' | 'higher_is_better'",
});

export type Threshold = typeof ThresholdSchema.infer;

// =============================================================================
// Measurement (Individual KPI)
// =============================================================================

export const MeasurementSchema = type({
  id: 'string',
  name: 'string',
  metric_type: MetricTypeSchema,
  value: 'number',
  unit: "'hours' | 'minutes' | 'days' | 'percent' | 'count' | 'dollars'",
  value_display: 'string',
  'source?': 'string',
  'evidence?': EvidenceSchema.array(),
  'threshold?': ThresholdSchema,
  'status?': StatusSchema,
  'status_reason?': 'string',
});

export type Measurement = typeof MeasurementSchema.infer;

// =============================================================================
// Bleed Assumption
// =============================================================================

export const BleedAssumptionSchema = type({
  id: 'string',
  label: 'string',
  value: 'number',
  value_display: 'string',
  currency: type("'USD'").default('USD'),
  period: type('string').default('monthly'),
  'source?': 'string',
});

export type BleedAssumption = typeof BleedAssumptionSchema.infer;

// =============================================================================
// Bleed Calculation
// =============================================================================

export const BleedCalculationSchema = type({
  id: 'string',
  label: 'string',
  formula: 'string',
  'formula_display?': 'string',
  'inputs?': 'string[]',
  result: 'number',
  result_display: 'string',
  'calculation_method?': "'deterministic_js'",
  'time_source?': 'string',
});

export type BleedCalculation = typeof BleedCalculationSchema.infer;

// =============================================================================
// Bleed Total (The Critical Number)
// =============================================================================

export const BleedTotalSchema = type({
  value: 'number >= 0',
  currency: type("'USD'").default('USD'),
  period: type("'day' | 'week' | 'month' | 'year'").default('month'),
  display: 'string',
  'calculation_method?': "'deterministic_js'",
});

export type BleedTotal = typeof BleedTotalSchema.infer;

// =============================================================================
// Bleed Input Validation (for sanity checks)
// =============================================================================

export const BleedInputsSchema = type({
  volume_per_day: '0 <= number <= 100000',
  days_per_month: type('1 <= number <= 31').default(22),
  minutes_per_item: '0 <= number <= 480',
  hourly_rate: type('0 <= number <= 1000').default(75),
}).narrow((data, ctx) => {
  const monthlyBleed = (data.volume_per_day * data.days_per_month * data.minutes_per_item / 60) * data.hourly_rate;
  if (monthlyBleed >= 10_000_000) {
    return ctx.reject({
      expected: 'monthly bleed < $10M',
      actual: `${monthlyBleed} (likely units confusion)`,
    });
  }
  return true;
});

export type BleedInputs = typeof BleedInputsSchema.infer;

// =============================================================================
// Complete Measurements Data
// =============================================================================

export const MeasurementsDataSchema = type({
  'metrics?': type({
    count: type('number').default(0),
    byId: type('Record<string, unknown>').default(() => ({})),
  }),
  'measurements?': MeasurementSchema.array(),
  'bleed_assumptions?': BleedAssumptionSchema.array(),
  'bleed_calculations?': BleedCalculationSchema.array(),
  'bleed_total?': BleedTotalSchema,
});

export type MeasurementsData = typeof MeasurementsDataSchema.infer;

// =============================================================================
// Bleed Validation Gate Result
// =============================================================================

export const BleedValidationResultSchema = type({
  valid: 'boolean',
  'inputs?': BleedInputsSchema,
  'calculated_monthly_bleed?': 'number',
  'warnings?': 'string[]',
  'errors?': 'string[]',
});

export type BleedValidationResult = typeof BleedValidationResultSchema.infer;
