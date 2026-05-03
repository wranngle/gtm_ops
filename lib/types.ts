/**
 * Schema v2 Type Definitions and Constructors
 *
 * Provides typed value objects to eliminate unit ambiguity.
 * All monetary values MUST use these constructors.
 *
 * @module lib/types
 */

import {type} from 'arktype';

// ===== Type Definitions =====

/** Valid time periods for monetary values */
export type MonetaryPeriod = 'once' | 'monthly' | 'annual' | 'per_item';

/** Valid time units for duration values */
export type DurationUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

/** Typed monetary value with explicit period and currency */
export type MonetaryValue = {
  amount: number;
  currency: string;
  period: MonetaryPeriod;
};

/** Typed duration value with explicit unit */
export type DurationValue = {
  value: number;
  unit: DurationUnit;
};

/** Typed percentage value with optional basis */
export type PercentageValue = {
  value: number;
  basis: string;
};

// ===== ArkType Runtime Validators =====

const monetaryPeriodValidator = type("'once'|'monthly'|'annual'|'per_item'");
const durationUnitValidator = type("'minutes'|'hours'|'days'|'weeks'|'months'");

export const MonetaryValueValidator = type({
  amount: 'number',
  currency: 'string',
  period: monetaryPeriodValidator
});

export const DurationValueValidator = type({
  value: 'number',
  unit: durationUnitValidator
});

export const PercentageValueValidator = type({
  value: 'number',
  basis: 'string'
});

// ===== Constructor Functions =====

/**
 * Create a typed monetary value
 * @param amount - Raw numeric amount
 * @param period - Time scope
 * @param currency - ISO currency code (default: "USD")
 * @returns MonetaryValue object
 *
 * @example
 * createMonetaryValue(74375, "monthly")
 * // => { amount: 74375, currency: "USD", period: "monthly" }
 */
export function createMonetaryValue(
  amount: number,
  period: MonetaryPeriod,
  currency: string = 'USD'
): MonetaryValue {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error(`Invalid amount: ${amount}. Must be a number.`);
  }

  const validPeriods: MonetaryPeriod[] = ['once', 'monthly', 'annual', 'per_item'];
  if (!validPeriods.includes(period)) {
    throw new Error(`Invalid period: ${period}. Must be one of: ${validPeriods.join(', ')}`);
  }

  return {
    amount,
    currency,
    period
  };
}

/**
 * Create a typed duration value
 * @param value - Numeric duration
 * @param unit - Time unit
 * @returns DurationValue object
 *
 * @example
 * createDurationValue(48, "hours")
 * // => { value: 48, unit: "hours" }
 */
export function createDurationValue(value: number, unit: DurationUnit): DurationValue {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`Invalid value: ${value}. Must be a number.`);
  }

  const validUnits: DurationUnit[] = ['minutes', 'hours', 'days', 'weeks', 'months'];
  if (!validUnits.includes(unit)) {
    throw new Error(`Invalid unit: ${unit}. Must be one of: ${validUnits.join(', ')}`);
  }

  return {
    value,
    unit
  };
}

/**
 * Create a typed percentage value
 * @param value - Decimal value (0.15 for 15%)
 * @param basis - What the percentage is based on (default: "")
 * @returns PercentageValue object
 *
 * @example
 * createPercentageValue(0.15, "total_cost")
 * // => { value: 0.15, basis: "total_cost" }
 */
export function createPercentageValue(value: number, basis: string = ''): PercentageValue {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`Invalid value: ${value}. Must be a number.`);
  }

  return {
    value,
    basis
  };
}

// ===== Type Guards =====

/**
 * Check if a value is a typed MonetaryValue
 * @param value - Value to check
 * @returns True if value is a valid MonetaryValue
 */
export function isMonetaryValue(value: unknown): value is MonetaryValue {
  return (
    value !== null &&
    typeof value === 'object' &&
    'amount' in value &&
    'currency' in value &&
    'period' in value &&
    typeof (value as any).amount === 'number' &&
    typeof (value as any).currency === 'string' &&
    typeof (value as any).period === 'string' &&
    ['once', 'monthly', 'annual', 'per_item'].includes((value as any).period)
  );
}

/**
 * Check if a value is a typed DurationValue
 * @param value - Value to check
 * @returns True if value is a valid DurationValue
 */
export function isDurationValue(value: unknown): value is DurationValue {
  return (
    value !== null &&
    typeof value === 'object' &&
    'value' in value &&
    'unit' in value &&
    typeof (value as any).value === 'number' &&
    typeof (value as any).unit === 'string' &&
    ['minutes', 'hours', 'days', 'weeks', 'months'].includes((value as any).unit)
  );
}

// ===== Conversion Functions =====

/**
 * Convert a MonetaryValue to monthly equivalent
 * @param mv - MonetaryValue object
 * @returns MonetaryValue with period="monthly"
 *
 * @example
 * getMonthlyAmount({ amount: 892500, currency: "USD", period: "annual" })
 * // => { amount: 74375, currency: "USD", period: "monthly" }
 */
export function getMonthlyAmount(mv: MonetaryValue): MonetaryValue {
  if (!isMonetaryValue(mv)) {
    throw new Error('Invalid MonetaryValue');
  }

  switch (mv.period) {
    case 'monthly':
      return mv;
    case 'annual':
      return createMonetaryValue(Math.round(mv.amount / 12), 'monthly', mv.currency);
    case 'once':
      // One-time costs don't convert to monthly
      return mv;
    case 'per_item':
      // Per-item costs need volume context
      return mv;
    default:
      return mv;
  }
}

/**
 * Convert a MonetaryValue to annual equivalent
 * @param mv - MonetaryValue object
 * @returns MonetaryValue with period="annual"
 *
 * @example
 * getAnnualAmount({ amount: 74375, currency: "USD", period: "monthly" })
 * // => { amount: 892500, currency: "USD", period: "annual" }
 */
export function getAnnualAmount(mv: MonetaryValue): MonetaryValue {
  if (!isMonetaryValue(mv)) {
    throw new Error('Invalid MonetaryValue');
  }

  switch (mv.period) {
    case 'annual':
      return mv;
    case 'monthly':
      return createMonetaryValue(mv.amount * 12, 'annual', mv.currency);
    case 'once':
      // One-time costs don't convert to annual
      return mv;
    case 'per_item':
      // Per-item costs need volume context
      return mv;
    default:
      return mv;
  }
}

/**
 * Sum multiple MonetaryValues (must have same period)
 * @param values - Array of MonetaryValue objects
 * @returns Summed MonetaryValue
 *
 * @example
 * sumMonetaryValues([
 *   { amount: 74375, currency: "USD", period: "monthly" },
 *   { amount: 30000, currency: "USD", period: "monthly" }
 * ])
 * // => { amount: 104375, currency: "USD", period: "monthly" }
 */
export function sumMonetaryValues(values: MonetaryValue[]): MonetaryValue {
  if (!Array.isArray(values) || values.length === 0) {
    return createMonetaryValue(0, 'once');
  }

  // Verify all have same period and currency
  const firstPeriod = values[0].period;
  const firstCurrency = values[0].currency;

  for (const v of values) {
    if (!isMonetaryValue(v)) {
      throw new Error('All values must be valid MonetaryValues');
    }
    if (v.period !== firstPeriod) {
      throw new Error(`Cannot sum values with different periods: ${v.period} vs ${firstPeriod}`);
    }
    if (v.currency !== firstCurrency) {
      throw new Error(`Cannot sum values with different currencies: ${v.currency} vs ${firstCurrency}`);
    }
  }

  const total = values.reduce((sum, v) => sum + v.amount, 0);
  return createMonetaryValue(total, firstPeriod, firstCurrency);
}

// ===== Migration Helpers =====

/**
 * Migrate a legacy untyped value to MonetaryValue
 * Used during schema v1 to v2 migration
 * @param legacyValue - Old-style value
 * @param assumedPeriod - Period to assume if not specified (default: "monthly")
 * @returns MonetaryValue
 */
export function migrateToMonetaryValue(
  legacyValue: number | Record<string, any>,
  assumedPeriod: MonetaryPeriod = 'monthly'
): MonetaryValue {
  // Already a MonetaryValue
  if (isMonetaryValue(legacyValue)) {
    return legacyValue;
  }

  // Raw number
  if (typeof legacyValue === 'number') {
    return createMonetaryValue(legacyValue, assumedPeriod);
  }

  // Object with value property (old bleed_total style)
  if (typeof legacyValue === 'object' && legacyValue !== null) {
    const amount = legacyValue.amount ?? legacyValue.value ?? 0;
    const period = legacyValue.period ?? assumedPeriod;
    const currency = legacyValue.currency ?? 'USD';

    // Map old period values
    const periodMap: Record<string, MonetaryPeriod> = {
      'month': 'monthly',
      'year': 'annual',
      'quarter': 'monthly' // Convert quarters to monthly
    };

    const mappedPeriod = periodMap[period] ?? period;

    // Validate period before creating
    const validPeriods: MonetaryPeriod[] = ['once', 'monthly', 'annual', 'per_item'];
    const finalPeriod = validPeriods.includes(mappedPeriod as MonetaryPeriod)
      ? (mappedPeriod as MonetaryPeriod)
      : assumedPeriod;

    return createMonetaryValue(
      typeof amount === 'number' ? amount : 0,
      finalPeriod,
      currency
    );
  }

  // Fallback
  return createMonetaryValue(0, assumedPeriod);
}

// ===== Default Export =====

export default {
  createMonetaryValue,
  createDurationValue,
  createPercentageValue,
  isMonetaryValue,
  isDurationValue,
  getMonthlyAmount,
  getAnnualAmount,
  sumMonetaryValues,
  migrateToMonetaryValue
};
