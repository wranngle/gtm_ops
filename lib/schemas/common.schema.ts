/**
 * Common Zod schemas shared across modules
 * @module lib/schemas/common.schema
 */

import { z } from 'zod';

// =============================================================================
// NumericWithDisplay Pattern (ADR-002)
// =============================================================================

/**
 * Base schema for synchronized numeric/display pairs.
 * Every monetary value must use this pattern to prevent display desync bugs.
 */
export const NumericWithDisplaySchema = z.object({
  value: z.number(),
  display: z.string(),
});

export type NumericWithDisplay = z.infer<typeof NumericWithDisplaySchema>;

/**
 * Currency-specific display (e.g., "$1,234")
 */
export const CurrencySchema = NumericWithDisplaySchema.extend({
  currency: z.literal('USD').default('USD'),
});

export type Currency = z.infer<typeof CurrencySchema>;

/**
 * Percentage display (e.g., "15%")
 */
export const PercentageSchema = NumericWithDisplaySchema;

export type Percentage = z.infer<typeof PercentageSchema>;

// =============================================================================
// Period & Time Units
// =============================================================================

export const PeriodUnitSchema = z.enum([
  'day',
  'week',
  'month',
  'quarter',
  'year',
]);

export type PeriodUnit = z.infer<typeof PeriodUnitSchema>;

export const TimeUnitSchema = z.enum(['minutes', 'hours', 'days']);

export type TimeUnit = z.infer<typeof TimeUnitSchema>;

// =============================================================================
// Status Types
// =============================================================================

export const StatusSchema = z.enum(['healthy', 'warning', 'critical']);

export type Status = z.infer<typeof StatusSchema>;

export const MetricTypeSchema = z.enum([
  'latency',
  'error_rate',
  'volume',
  'complexity',
  'cost',
  'quality',
]);

export type MetricType = z.infer<typeof MetricTypeSchema>;

// =============================================================================
// Complexity Tiers
// =============================================================================

export const ComplexityTierSchema = z.enum([
  'simple',
  'standard',
  'moderate',
  'complex',
  'enterprise',
]);

export type ComplexityTier = z.infer<typeof ComplexityTierSchema>;

export const PricingTierSchema = z.enum([
  'starter',
  'standard',
  'advanced',
  'premium',
]);

export type PricingTier = z.infer<typeof PricingTierSchema>;

// =============================================================================
// Evidence & Citations
// =============================================================================

export const EvidenceSchema = z.object({
  type: z.string(),
  summary: z.string(),
});

export type Evidence = z.infer<typeof EvidenceSchema>;

export const CitationSchema = z.object({
  id: z.number(),
  url: z.string().url(),
  type: z.enum(['api_docs', 'repository', 'other']),
});

export type Citation = z.infer<typeof CitationSchema>;

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

  // Allow for formatting differences (commas, rounding)
  return Math.abs(parsedValue - value) < 0.01 ||
    Math.abs(parsedValue - Math.round(value)) < 1;
}
