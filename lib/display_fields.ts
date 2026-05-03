/**
 * Display Field Utilities
 *
 * Ensures numeric values and their display counterparts stay in sync.
 * This addresses the display field desync bug identified in the analysis.
 *
 * CRITICAL: Any module that recalculates numeric values MUST use these
 * utilities to regenerate display fields, or the template will show stale values.
 *
 * @module lib/display_fields
 */

// =============================================================================
// TYPES
// =============================================================================

type NumericDisplayOptions = {
  currency?: boolean;
  decimals?: number;
  suffix?: string;
};

export type NumericDisplay = {
  value: number;
  display: string;
};

type HardSavings = {
  monthly?: number;
  monthly_display?: string;
  annual?: number;
  annual_display?: string;
  [key: string]: any;
};

type ModeledOpportunity = {
  monthly?: number;
  monthly_display?: string;
  annual?: number;
  annual_display?: string;
  [key: string]: any;
};

export type ValueBreakdown = {
  hard_savings?: HardSavings;
  modeled_opportunity?: ModeledOpportunity;
  total_monthly_value?: number;
  total_monthly_display?: string;
  total_annual_value?: number;
  total_annual_display?: string;
  [key: string]: any;
};

type HardFloorValidation = {
  annual_value_display?: string;
  investment_display?: string;
  coverage_percent?: number;
  [key: string]: any;
};

type PaybackCheckValidation = {
  investment_display?: string;
  monthly_value_display?: string;
  payback_months?: number;
  payback_display?: string;
  [key: string]: any;
};

export type Validation = {
  hard_floor?: HardFloorValidation;
  payback_check?: PaybackCheckValidation;
  [key: string]: any;
};

export type Finops = {
  value_breakdown?: ValueBreakdown;
  validation?: Validation;
  [key: string]: any;
};

type ValidationValues = {
  totalCost?: number;
  totalAnnualValue?: number;
  totalMonthlyValue?: number;
};

// =============================================================================
// CORE DISPLAY FIELD GENERATORS
// =============================================================================

/**
 * Create a numeric value with its display representation
 */
export function createNumericDisplay(
  value: number,
  options: NumericDisplayOptions = {}
): NumericDisplay {
  const { currency = false, decimals = 0, suffix = '' } = options;

  if (typeof value !== 'number' || isNaN(value)) {
    return { value: 0, display: currency ? '$0' : '0' };
  }

  const formatted = decimals > 0
    ? value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : Math.round(value).toLocaleString('en-US');

  const display = currency ? `$${formatted}${suffix}` : `${formatted}${suffix}`;

  return { value, display };
}

/**
 * Create a currency display (convenience wrapper)
 */
export function createCurrencyDisplay(amount: number, suffix: string = ''): NumericDisplay {
  return createNumericDisplay(amount, { currency: true, suffix });
}

/**
 * Create a percentage display
 */
export function createPercentDisplay(ratio: number, showSymbol: boolean = true): NumericDisplay {
  const percent = Math.round(ratio * 100);
  return {
    value: ratio,
    display: showSymbol ? `${percent}%` : `${percent}`
  };
}

// =============================================================================
// BULK DISPLAY FIELD GENERATION
// =============================================================================

/**
 * Regenerate all display fields in a finops value_breakdown object
 *
 * Call this after ANY modification to finops values to ensure display fields
 * stay in sync.
 */
export function regenerateValueBreakdownDisplayFields(
  valueBreakdown: ValueBreakdown | null | undefined
): ValueBreakdown | null | undefined {
  if (!valueBreakdown) return valueBreakdown;

  const result = { ...valueBreakdown };

  // Hard savings
  if (result.hard_savings) {
    const hs = result.hard_savings;
    if (typeof hs.monthly === 'number') {
      hs.monthly_display = `$${Math.round(hs.monthly).toLocaleString()}`;
    }
    if (typeof hs.annual === 'number') {
      hs.annual_display = `$${Math.round(hs.annual).toLocaleString()}`;
    }
  }

  // Modeled opportunity
  if (result.modeled_opportunity) {
    const mo = result.modeled_opportunity;
    if (typeof mo.monthly === 'number') {
      mo.monthly_display = `$${Math.round(mo.monthly).toLocaleString()}`;
    }
    if (typeof mo.annual === 'number') {
      mo.annual_display = `$${Math.round(mo.annual).toLocaleString()}`;
    }
  }

  // Totals
  if (typeof result.total_monthly_value === 'number') {
    result.total_monthly_display = `$${Math.round(result.total_monthly_value).toLocaleString()}`;
  }
  if (typeof result.total_annual_value === 'number') {
    result.total_annual_display = `$${Math.round(result.total_annual_value).toLocaleString()}`;
  }

  return result;
}

/**
 * Regenerate display fields in a finops validation object
 */
export function regenerateValidationDisplayFields(
  validation: Validation | null | undefined,
  values: ValidationValues
): Validation | null | undefined {
  if (!validation) return validation;

  const result = { ...validation };
  const { totalCost = 0, totalAnnualValue = 0, totalMonthlyValue = 0 } = values;

  // Hard floor validation
  if (result.hard_floor) {
    result.hard_floor.annual_value_display = `$${Math.round(totalAnnualValue).toLocaleString()}`;
    result.hard_floor.investment_display = `$${Math.round(totalCost).toLocaleString()}`;
    result.hard_floor.coverage_percent = totalCost > 0
      ? Math.round((totalAnnualValue / totalCost) * 100)
      : 0;
  }

  // Payback check validation
  if (result.payback_check) {
    result.payback_check.investment_display = `$${Math.round(totalCost).toLocaleString()}`;
    result.payback_check.monthly_value_display = `$${Math.round(totalMonthlyValue).toLocaleString()}`;

    const paybackMonths = totalMonthlyValue > 0 ? totalCost / totalMonthlyValue : 999;
    result.payback_check.payback_months = Math.round(paybackMonths * 10) / 10;

    if (paybackMonths < 1) {
      const weeks = Math.ceil(paybackMonths * 4.33);
      result.payback_check.payback_display = `${weeks} week${weeks !== 1 ? 's' : ''}`;
    } else {
      result.payback_check.payback_display = `${Math.round(paybackMonths * 10) / 10} months`;
    }
  }

  return result;
}

/**
 * Regenerate all display fields after a bleed sync operation
 *
 * This is the main function to call after synchronizing bleed data from audit.
 */
export function regenerateFinopsDisplayFields(
  finops: Finops | null | undefined,
  totalCost: number
): Finops | null | undefined {
  if (!finops) return finops;

  // Validate totalCost parameter - guard against NaN/undefined
  if (typeof totalCost !== 'number' || isNaN(totalCost)) {
    totalCost = 0;
  }

  const result = { ...finops };

  // Regenerate value breakdown displays
  if (result.value_breakdown) {
    const regenerated = regenerateValueBreakdownDisplayFields(result.value_breakdown);
    if (regenerated) {
      result.value_breakdown = regenerated;
    }
  }

  // Regenerate validation displays
  if (result.validation) {
    const totalAnnualValue = result.value_breakdown?.total_annual_value || 0;
    const totalMonthlyValue = result.value_breakdown?.total_monthly_value || 0;

    const regenerated = regenerateValidationDisplayFields(result.validation, {
      totalCost,
      totalAnnualValue,
      totalMonthlyValue
    });
    if (regenerated) {
      result.validation = regenerated;
    }
  }

  return result;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createNumericDisplay,
  createCurrencyDisplay,
  createPercentDisplay,
  regenerateValueBreakdownDisplayFields,
  regenerateValidationDisplayFields,
  regenerateFinopsDisplayFields
};
