/**
 * Common ArkType schemas shared across modules
 * @module lib/schemas/common.schema
 */

import { type } from 'arktype';

// =============================================================================
// NumericWithDisplay Pattern (ADR-002)
// =============================================================================

/**
 * Base schema for synchronized numeric/display pairs.
 * Every monetary value must use this pattern to prevent display desync bugs.
 */
export const NumericWithDisplaySchema = type({
  value: 'number',
  display: 'string',
});

export type NumericWithDisplay = typeof NumericWithDisplaySchema.infer;

/**
 * Currency-specific display (e.g., "$1,234").
 * Note: ArkType doesn't have schema-level defaults like zod's `.default('USD')`;
 * callers should default `currency` themselves before validation if missing.
 */
export const CurrencySchema = type({
  value: 'number',
  display: 'string',
  'currency?': "'USD'",
});

export type Currency = typeof CurrencySchema.infer;

/**
 * Percentage display (e.g., "15%")
 */
export const PercentageSchema = NumericWithDisplaySchema;

export type Percentage = typeof PercentageSchema.infer;

// =============================================================================
// Period & Time Units
// =============================================================================

export const PeriodUnitSchema = type("'day' | 'week' | 'month' | 'quarter' | 'year'");
export type PeriodUnit = typeof PeriodUnitSchema.infer;

export const TimeUnitSchema = type("'minutes' | 'hours' | 'days'");
export type TimeUnit = typeof TimeUnitSchema.infer;

// =============================================================================
// Status Types
// =============================================================================

export const StatusSchema = type("'healthy' | 'warning' | 'critical'");
export type Status = typeof StatusSchema.infer;

export const MetricTypeSchema = type("'latency' | 'error_rate' | 'volume' | 'complexity' | 'cost' | 'quality'");
export type MetricType = typeof MetricTypeSchema.infer;

// =============================================================================
// Complexity Tiers
// =============================================================================

export const ComplexityTierSchema = type("'simple' | 'standard' | 'moderate' | 'complex' | 'enterprise'");
export type ComplexityTier = typeof ComplexityTierSchema.infer;

export const PricingTierSchema = type("'starter' | 'standard' | 'advanced' | 'premium'");
export type PricingTier = typeof PricingTierSchema.infer;

// =============================================================================
// Evidence & Citations
// =============================================================================

export const EvidenceSchema = type({
  type: 'string',
  summary: 'string',
});

export type Evidence = typeof EvidenceSchema.infer;

export const CitationSchema = type({
  id: 'number',
  url: 'string.url',
  type: "'api_docs' | 'repository' | 'other'",
});

export type Citation = typeof CitationSchema.infer;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validates that a display field matches its numeric value format.
 * Used in refinements to ensure sync.
 */
export function validateDisplaySync(
  value: number,
  display: string,
  format: 'currency' | 'percent' | 'number'
): boolean {
  const cleanDisplay = display.replaceAll(/[$,%]/g, '').trim();
  const parsedValue = Number.parseFloat(cleanDisplay);

  return Math.abs(parsedValue - value) < 0.01 ||
    Math.abs(parsedValue - Math.round(value)) < 1;
}
