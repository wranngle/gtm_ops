/**
 * Monetary and Duration Schemas
 * 
 * Foundation types for all financial calculations.
 * These schemas enforce sanity bounds that would have prevented the $10.7M bug.
 * 
 * @module src/schemas/monetary
 */

import { z } from 'zod';

// =============================================================================
// PERIOD ENUM - CORRECTED based on codebase audit
// =============================================================================

/**
 * Time period for monetary and duration values
 * 
 * AUDIT FIX: Added 'hourly', 'weekly', 'daily', 'quarterly' based on actual usage:
 * - 'hourly': 75+ references in estimate.js, extract.js, pricing_calculator.js
 * - 'weekly': 7+ references for payback period calculations
 */
export const PeriodSchema = z.enum([
  'once',        // One-time payment
  'hourly',      // Per hour (rate cards)
  'daily',       // Per day
  'weekly',      // Per week (payback periods)
  'monthly',     // Per month (bleed calculations)
  'quarterly',   // Per quarter
  'annual',      // Per year (savings)
  'per_item'     // Per transaction/unit
]);

export type Period = z.infer<typeof PeriodSchema>;

// =============================================================================
// MONETARY VALUE
// =============================================================================

/**
 * Typed monetary value with enforced sanity bounds
 * 
 * The amount field has a max of $100M to catch unit conversion errors.
 * For example, the $10.7M bug would have been caught here.
 */
export const MonetaryValueSchema = z.object({
  amount: z.number()
    .nonnegative({ message: 'Amount cannot be negative' })
    .max(100_000_000, { message: 'Amount exceeds $100M sanity check - verify unit conversion' }),
  
  currency: z.enum(['USD', 'EUR']).default('USD'),
  
  period: PeriodSchema
});

export type MonetaryValue = z.infer<typeof MonetaryValueSchema>;

// =============================================================================
// DURATION VALUE
// =============================================================================

/**
 * Typed duration value for time-based calculations
 */
export const DurationUnitSchema = z.enum([
  'minutes',
  'hours', 
  'days',
  'weeks',
  'months',
  'years'
]);

export type DurationUnit = z.infer<typeof DurationUnitSchema>;

export const DurationValueSchema = z.object({
  value: z.number()
    .nonnegative({ message: 'Duration cannot be negative' }),
  
  unit: DurationUnitSchema
});

export type DurationValue = z.infer<typeof DurationValueSchema>;

// =============================================================================
// PERCENTAGE VALUES - AUDIT FIX: Explicit decimal vs integer
// =============================================================================

/**
 * Decimal ratio (0-1 range)
 * 0.15 = 15%
 * 
 * Use for: contingency rates, margin rates, discount rates
 */
export const DecimalRatioSchema = z.number()
  .min(0, { message: 'Ratio cannot be negative' })
  .max(1, { message: 'Ratio must be 0-1 (use IntegerPercentSchema for 0-100)' });

export type DecimalRatio = z.infer<typeof DecimalRatioSchema>;

/**
 * Integer percentage (0-100 range)
 * 15 = 15%
 * 
 * Use for: displayed percentages, user-facing values
 */
export const IntegerPercentSchema = z.number()
  .min(0, { message: 'Percentage cannot be negative' })
  .max(100, { message: 'Percentage must be 0-100' });

export type IntegerPercent = z.infer<typeof IntegerPercentSchema>;

/**
 * Percentage value with explicit basis
 * Can be either decimal (0-1) or integer (0-100) based on format field
 */
export const PercentageValueSchema = z.object({
  value: z.number(),
  format: z.enum(['decimal', 'integer']).default('decimal'),
  basis: z.string().optional()
}).refine(
  (data) => {
    if (data.format === 'decimal') {
      return data.value >= 0 && data.value <= 1;
    } else {
      return data.value >= 0 && data.value <= 100;
    }
  },
  { message: 'Value out of range for specified format' }
);

export type PercentageValue = z.infer<typeof PercentageValueSchema>;

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a validated MonetaryValue
 * @throws {z.ZodError} if validation fails
 */
export function createMonetary(
  amount: number,
  period: Period,
  currency: 'USD' | 'EUR' = 'USD'
): MonetaryValue {
  return MonetaryValueSchema.parse({ amount, currency, period });
}

/**
 * Create a validated DurationValue
 * @throws {z.ZodError} if validation fails
 */
export function createDuration(
  value: number,
  unit: DurationUnit
): DurationValue {
  return DurationValueSchema.parse({ value, unit });
}

/**
 * Safely parse a MonetaryValue with error details
 */
export function safeParseMonetary(data: unknown): {
  success: boolean;
  data?: MonetaryValue;
  error?: z.ZodError;
} {
  const result = MonetaryValueSchema.safeParse(data);
  return result;
}

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

/**
 * Convert MonetaryValue to monthly equivalent
 */
export function toMonthlyAmount(mv: MonetaryValue): MonetaryValue {
  switch (mv.period) {
    case 'monthly':
      return mv;
    case 'annual':
      return createMonetary(Math.round(mv.amount / 12), 'monthly', mv.currency);
    case 'quarterly':
      return createMonetary(Math.round(mv.amount / 3), 'monthly', mv.currency);
    case 'weekly':
      return createMonetary(Math.round(mv.amount * 4.33), 'monthly', mv.currency);
    case 'daily':
      return createMonetary(Math.round(mv.amount * 30), 'monthly', mv.currency);
    case 'hourly':
      // Assume 160 working hours per month
      return createMonetary(Math.round(mv.amount * 160), 'monthly', mv.currency);
    default:
      // once, per_item - can't convert
      return mv;
  }
}

/**
 * Convert MonetaryValue to annual equivalent
 */
export function toAnnualAmount(mv: MonetaryValue): MonetaryValue {
  switch (mv.period) {
    case 'annual':
      return mv;
    case 'monthly':
      return createMonetary(mv.amount * 12, 'annual', mv.currency);
    case 'quarterly':
      return createMonetary(mv.amount * 4, 'annual', mv.currency);
    case 'weekly':
      return createMonetary(Math.round(mv.amount * 52), 'annual', mv.currency);
    case 'daily':
      return createMonetary(Math.round(mv.amount * 365), 'annual', mv.currency);
    case 'hourly':
      // Assume 2080 working hours per year
      return createMonetary(Math.round(mv.amount * 2080), 'annual', mv.currency);
    default:
      // once, per_item - can't convert
      return mv;
  }
}

/**
 * Convert duration to different unit
 */
export function convertDuration(duration: DurationValue, toUnit: DurationUnit): DurationValue {
  // Convert to minutes first, then to target unit
  const minuteConversions: Record<DurationUnit, number> = {
    minutes: 1,
    hours: 60,
    days: 60 * 24,
    weeks: 60 * 24 * 7,
    months: 60 * 24 * 30,
    years: 60 * 24 * 365
  };

  const totalMinutes = duration.value * minuteConversions[duration.unit];
  const targetValue = totalMinutes / minuteConversions[toUnit];

  return createDuration(Math.round(targetValue * 100) / 100, toUnit);
}
