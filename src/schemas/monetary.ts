/**
 * Monetary and Duration Schemas
 *
 * Foundation types for all financial calculations.
 * These schemas enforce sanity bounds that would have prevented the $10.7M bug.
 *
 * @module src/schemas/monetary
 */

import { type } from 'arktype';

// =============================================================================
// PERIOD ENUM
// =============================================================================

export const PeriodSchema = type(
  "'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'per_item'",
);

export type Period = typeof PeriodSchema.infer;

// =============================================================================
// MONETARY VALUE
// =============================================================================

export const MonetaryValueSchema = type({
  amount: '0 <= number <= 100000000',
  currency: type("'USD' | 'EUR'").default('USD'),
  period: PeriodSchema,
});

export type MonetaryValue = typeof MonetaryValueSchema.infer;

// =============================================================================
// DURATION VALUE
// =============================================================================

export const DurationUnitSchema = type(
  "'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'",
);

export type DurationUnit = typeof DurationUnitSchema.infer;

export const DurationValueSchema = type({
  value: 'number >= 0',
  unit: DurationUnitSchema,
});

export type DurationValue = typeof DurationValueSchema.infer;

// =============================================================================
// PERCENTAGE VALUES
// =============================================================================

export const DecimalRatioSchema = type('0 <= number <= 1');
export type DecimalRatio = typeof DecimalRatioSchema.infer;

export const IntegerPercentSchema = type('0 <= number <= 100');
export type IntegerPercent = typeof IntegerPercentSchema.infer;

export const PercentageValueSchema = type({
  value: 'number',
  format: type("'decimal' | 'integer'").default('decimal'),
  'basis?': 'string',
}).narrow((data, ctx) => {
  const ok = data.format === 'decimal'
    ? data.value >= 0 && data.value <= 1
    : data.value >= 0 && data.value <= 100;
  return ok || ctx.reject(`value within 0-${data.format === 'decimal' ? '1' : '100'} for format ${data.format}`);
});

export type PercentageValue = typeof PercentageValueSchema.infer;

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export function createMonetary(
  amount: number,
  period: Period,
  currency: 'USD' | 'EUR' = 'USD',
): MonetaryValue {
  const result = MonetaryValueSchema({ amount, currency, period });
  if (result instanceof type.errors) {
    throw new Error(`Invalid monetary value: ${result.summary}`);
  }
  return result;
}

export function createDuration(
  value: number,
  unit: DurationUnit,
): DurationValue {
  const result = DurationValueSchema({ value, unit });
  if (result instanceof type.errors) {
    throw new Error(`Invalid duration value: ${result.summary}`);
  }
  return result;
}

export function safeParseMonetary(data: unknown): {
  success: boolean;
  data?: MonetaryValue;
  error?: type.errors;
} {
  const result = MonetaryValueSchema(data);
  if (result instanceof type.errors) {
    return { success: false, error: result };
  }
  return { success: true, data: result };
}

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

export function toMonthlyAmount(mv: MonetaryValue): MonetaryValue {
  switch (mv.period) {
    case 'monthly': {
      return mv;
    }
    case 'annual': {
      return createMonetary(Math.round(mv.amount / 12), 'monthly', mv.currency);
    }
    case 'quarterly': {
      return createMonetary(Math.round(mv.amount / 3), 'monthly', mv.currency);
    }
    case 'weekly': {
      return createMonetary(Math.round(mv.amount * 4.33), 'monthly', mv.currency);
    }
    case 'daily': {
      return createMonetary(Math.round(mv.amount * 30), 'monthly', mv.currency);
    }
    case 'hourly': {
      return createMonetary(Math.round(mv.amount * 160), 'monthly', mv.currency);
    }
    default: {
      return mv;
    }
  }
}

export function toAnnualAmount(mv: MonetaryValue): MonetaryValue {
  switch (mv.period) {
    case 'annual': {
      return mv;
    }
    case 'monthly': {
      return createMonetary(mv.amount * 12, 'annual', mv.currency);
    }
    case 'quarterly': {
      return createMonetary(mv.amount * 4, 'annual', mv.currency);
    }
    case 'weekly': {
      return createMonetary(Math.round(mv.amount * 52), 'annual', mv.currency);
    }
    case 'daily': {
      return createMonetary(Math.round(mv.amount * 365), 'annual', mv.currency);
    }
    case 'hourly': {
      return createMonetary(Math.round(mv.amount * 2080), 'annual', mv.currency);
    }
    default: {
      return mv;
    }
  }
}

export function convertDuration(duration: DurationValue, toUnit: DurationUnit): DurationValue {
  const minuteConversions: Record<DurationUnit, number> = {
    minutes: 1,
    hours: 60,
    days: 60 * 24,
    weeks: 60 * 24 * 7,
    months: 60 * 24 * 30,
    years: 60 * 24 * 365,
  };

  const totalMinutes = duration.value * minuteConversions[duration.unit];
  const targetValue = totalMinutes / minuteConversions[toUnit];

  return createDuration(Math.round(targetValue * 100) / 100, toUnit);
}
