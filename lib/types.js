/**
 * Schema v2 Type Definitions and Constructors
 *
 * Provides typed value objects to eliminate unit ambiguity.
 * All monetary values MUST use these constructors.
 *
 * @module lib/types
 */

/**
 * Create a typed monetary value
 * @param {number} amount - Raw numeric amount
 * @param {"once"|"monthly"|"annual"|"per_item"} period - Time scope
 * @param {string} [currency="USD"] - ISO currency code
 * @returns {Object} MonetaryValue object
 *
 * @example
 * createMonetaryValue(74375, "monthly")
 * // => { amount: 74375, currency: "USD", period: "monthly" }
 */
export function createMonetaryValue(amount, period, currency = 'USD') {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error(`Invalid amount: ${amount}. Must be a number.`);
  }

  const validPeriods = ['once', 'monthly', 'annual', 'per_item'];
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
 * @param {number} value - Numeric duration
 * @param {"minutes"|"hours"|"days"|"weeks"|"months"} unit - Time unit
 * @returns {Object} DurationValue object
 *
 * @example
 * createDurationValue(48, "hours")
 * // => { value: 48, unit: "hours" }
 */
export function createDurationValue(value, unit) {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`Invalid value: ${value}. Must be a number.`);
  }

  const validUnits = ['minutes', 'hours', 'days', 'weeks', 'months'];
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
 * @param {number} value - Decimal value (0.15 for 15%)
 * @param {string} [basis=""] - What the percentage is based on
 * @returns {Object} PercentageValue object
 *
 * @example
 * createPercentageValue(0.15, "total_cost")
 * // => { value: 0.15, basis: "total_cost" }
 */
export function createPercentageValue(value, basis = '') {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`Invalid value: ${value}. Must be a number.`);
  }

  return {
    value,
    basis
  };
}

/**
 * Check if a value is a typed MonetaryValue
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export function isMonetaryValue(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.amount === 'number' &&
    typeof value.currency === 'string' &&
    typeof value.period === 'string' &&
    ['once', 'monthly', 'annual', 'per_item'].includes(value.period)
  );
}

/**
 * Check if a value is a typed DurationValue
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export function isDurationValue(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.value === 'number' &&
    typeof value.unit === 'string' &&
    ['minutes', 'hours', 'days', 'weeks', 'months'].includes(value.unit)
  );
}

/**
 * Convert a MonetaryValue to monthly equivalent
 * @param {Object} mv - MonetaryValue object
 * @returns {Object} MonetaryValue with period="monthly"
 *
 * @example
 * getMonthlyAmount({ amount: 892500, currency: "USD", period: "annual" })
 * // => { amount: 74375, currency: "USD", period: "monthly" }
 */
export function getMonthlyAmount(mv) {
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
 * @param {Object} mv - MonetaryValue object
 * @returns {Object} MonetaryValue with period="annual"
 *
 * @example
 * getAnnualAmount({ amount: 74375, currency: "USD", period: "monthly" })
 * // => { amount: 892500, currency: "USD", period: "annual" }
 */
export function getAnnualAmount(mv) {
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
 * @param {Object[]} values - Array of MonetaryValue objects
 * @returns {Object} Summed MonetaryValue
 *
 * @example
 * sumMonetaryValues([
 *   { amount: 74375, currency: "USD", period: "monthly" },
 *   { amount: 30000, currency: "USD", period: "monthly" }
 * ])
 * // => { amount: 104375, currency: "USD", period: "monthly" }
 */
export function sumMonetaryValues(values) {
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

/**
 * Migrate a legacy untyped value to MonetaryValue
 * Used during schema v1 to v2 migration
 * @param {number|Object} legacyValue - Old-style value
 * @param {"once"|"monthly"|"annual"} assumedPeriod - Period to assume if not specified
 * @returns {Object} MonetaryValue
 */
export function migrateToMonetaryValue(legacyValue, assumedPeriod = 'monthly') {
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
    const periodMap = {
      'month': 'monthly',
      'year': 'annual',
      'quarter': 'monthly' // Convert quarters to monthly
    };

    return createMonetaryValue(
      typeof amount === 'number' ? amount : 0,
      periodMap[period] ?? period,
      currency
    );
  }

  // Fallback
  return createMonetaryValue(0, assumedPeriod);
}

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
