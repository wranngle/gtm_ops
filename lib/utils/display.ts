/**
 * NumericWithDisplay Factory - Prevents display field desync bugs (ADR-002)
 * @module lib/utils/display
 */

export interface NumericWithDisplay {
  value: number;
  display: string;
}

/**
 * Creates a currency value with synchronized display field.
 * Format: "$1,234" or "$1,234.56"
 */
export function createCurrency(value: number, decimals = 0): NumericWithDisplay {
  return {
    value,
    display: `$${value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`,
  };
}

/**
 * Creates a percentage value with synchronized display field.
 * Format: "15%" or "15.5%"
 */
export function createPercent(value: number, decimals = 0): NumericWithDisplay {
  return {
    value,
    display: `${value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}%`,
  };
}

/**
 * Creates a duration value with synchronized display field.
 * Format: "5 days", "2 weeks", "3 months"
 */
export function createDuration(
  value: number,
  unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months'
): NumericWithDisplay {
  const label = value === 1 ? unit.slice(0, -1) : unit;
  return {
    value,
    display: `${value} ${label}`,
  };
}

/**
 * Creates a hours value with synchronized display field.
 * Format: "40h" or "40 hours"
 */
export function createHours(value: number, short = true): NumericWithDisplay {
  return {
    value,
    display: short ? `${value}h` : `${value} hour${value === 1 ? '' : 's'}`,
  };
}

/**
 * Creates a multiplier value with synchronized display field.
 * Format: "1.25x"
 */
export function createMultiplier(value: number): NumericWithDisplay {
  return {
    value,
    display: `${value.toFixed(2)}x`,
  };
}

/**
 * Creates a ratio display.
 * Format: "3:1"
 */
export function createRatio(numerator: number, denominator: number): NumericWithDisplay {
  const value = denominator !== 0 ? numerator / denominator : 0;
  return {
    value,
    display: `${numerator}:${denominator}`,
  };
}

/**
 * Batch creates currency fields from an object of numeric values.
 * Useful for converting estimate outputs.
 */
export function batchCreateCurrency<T extends Record<string, number>>(
  obj: T
): Record<keyof T, NumericWithDisplay> {
  const result = {} as Record<keyof T, NumericWithDisplay>;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    result[key] = createCurrency(obj[key]);
  }
  return result;
}
