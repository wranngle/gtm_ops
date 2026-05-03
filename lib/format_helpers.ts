/**
 * Format Helpers - Render-time formatting for Schema v2
 *
 * Instead of storing `_display` fields, we format values at render time.
 * This eliminates sync bugs where numeric values change but display doesn't.
 *
 * @module lib/format_helpers
 */

import type {MonetaryValue, DurationValue, MonetaryPeriod, DurationUnit} from './types.js';

// =============================================================================
// TYPES
// =============================================================================

type CurrencyOptions = {
  showPeriod?: boolean;
  compact?: boolean;
};

type PercentOptions = {
  decimals?: number;
  showSign?: boolean;
};

type DurationOptions = {
  defaultUnit?: DurationUnit;
};

type DateOptions = {
  format?: 'long' | 'short' | 'iso';
};

type RoiResult = {
  display: string;
  tier: 'excellent' | 'good' | 'moderate' | 'low' | 'unknown';
  color: 'green' | 'yellow' | 'red' | 'gray';
};

// =============================================================================
// FORMAT FUNCTIONS
// =============================================================================

/**
 * Format a MonetaryValue to display string
 * @param mv - Monetary value or raw number
 * @param options - Formatting options
 * @returns Formatted currency string
 *
 * @example
 * currency({ amount: 74375, currency: "USD", period: "monthly" })
 * // => "$74,375/mo"
 *
 * currency({ amount: 892500, currency: "USD", period: "annual" })
 * // => "$892,500/yr"
 *
 * currency({ amount: 11375, currency: "USD", period: "once" })
 * // => "$11,375"
 */
export function currency(mv: MonetaryValue | number, options: CurrencyOptions = {}): string {
  const {showPeriod = true, compact = false} = options;

  // Handle raw numbers (backward compat)
  if (typeof mv === 'number') {
    return `$${mv.toLocaleString()}`;
  }

  // Handle null/undefined
  if (!mv || typeof mv.amount !== 'number') {
    return '$0';
  }

  const {amount, period = 'once'} = mv;

  // Format the number
  let formatted: string;
  if (compact && amount >= 1000) {
    formatted = amount >= 1_000_000 ? `$${(amount / 1_000_000).toFixed(1)}M` : `$${(amount / 1000).toFixed(0)}K`;
  } else {
    formatted = `$${amount.toLocaleString()}`;
  }

  // Add period suffix
  if (showPeriod) {
    switch (period) {
      case 'monthly': {
        return `${formatted}/mo`;
      }

      case 'annual': {
        return `${formatted}/yr`;
      }

      case 'per_item': {
        return `${formatted}/item`;
      }

      case 'once':
      default: {
        return formatted;
      }
    }
  }

  return formatted;
}

/**
 * Format a decimal as a percentage
 * @param value - Decimal value (0.15 = 15%)
 * @param options - Formatting options
 * @returns Formatted percentage
 *
 * @example
 * percent(0.15) // => "15%"
 * percent(0.456, { decimals: 1 }) // => "45.6%"
 * percent(0.15, { showSign: true }) // => "+15%"
 */
export function percent(value: number, options: PercentOptions = {}): string {
  const {decimals = 0, showSign = false} = options;

  if (typeof value !== 'number' || isNaN(value)) {
    return '0%';
  }

  const pct = value * 100;
  const formatted = decimals > 0 ? pct.toFixed(decimals) : Math.round(pct).toString();
  const sign = showSign && pct > 0 ? '+' : '';

  return `${sign}${formatted}%`;
}

/**
 * Format a DurationValue to display string
 * @param dv - Duration value or raw number (assumes hours)
 * @param options - Formatting options
 * @returns Formatted duration
 *
 * @example
 * duration({ value: 48, unit: "hours" }) // => "48 hours"
 * duration({ value: 2, unit: "weeks" }) // => "2 weeks"
 * duration({ value: 1, unit: "days" }) // => "1 day"
 */
export function duration(dv: DurationValue | number, options: DurationOptions = {}): string {
  const {defaultUnit = 'hours'} = options;

  // Handle raw numbers
  const dvTyped: DurationValue = typeof dv === 'number' ? {value: dv, unit: defaultUnit} : dv;

  if (!dvTyped || typeof dvTyped.value !== 'number') {
    return '0 hours';
  }

  const {value, unit = 'hours'} = dvTyped;

  // Pluralize unit
  const unitLabel = value === 1 ? unit.replace(/s$/, '') : unit;

  return `${value} ${unitLabel}`;
}

/**
 * Format payback period from months
 * @param months - Payback period in months
 * @returns Human-readable payback period
 *
 * @example
 * payback(0.25) // => "1 week"
 * payback(0.5) // => "2 weeks"
 * payback(1.5) // => "6 weeks"
 * payback(3) // => "3 months"
 * payback(14) // => "1.2 years"
 */
export function payback(months: number): string {
  if (typeof months !== 'number' || isNaN(months) || months <= 0) {
    return 'N/A';
  }

  // Less than 1 month = show in weeks
  if (months < 1) {
    const weeks = Math.round(months * 4.33);
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }

  // 1-2 months = show in weeks for precision
  if (months < 2) {
    const weeks = Math.round(months * 4.33);
    return `${weeks} weeks`;
  }

  // 2-12 months = show in months
  if (months < 12) {
    const rounded = Math.round(months);
    return rounded === 1 ? '1 month' : `${rounded} months`;
  }

  // 12+ months = show in years
  const years = (months / 12).toFixed(1);
  return years === '1.0' ? '1 year' : `${years} years`;
}

/**
 * Format ROI percentage with appropriate styling hint
 * @param roiPercent - ROI as percentage (e.g., 450 for 450%)
 * @returns Formatted ROI with tier classification
 *
 * @example
 * roi(450) // => { display: "450%", tier: "excellent", color: "green" }
 * roi(150) // => { display: "150%", tier: "good", color: "green" }
 * roi(50) // => { display: "50%", tier: "moderate", color: "yellow" }
 */
export function roi(roiPercent: number): RoiResult {
  if (typeof roiPercent !== 'number' || isNaN(roiPercent)) {
    return {display: 'N/A', tier: 'unknown', color: 'gray'};
  }

  const display = `${Math.round(roiPercent)}%`;

  if (roiPercent >= 300) {
    return {display, tier: 'excellent', color: 'green'};
  }

  if (roiPercent >= 100) {
    return {display, tier: 'good', color: 'green'};
  }

  if (roiPercent >= 50) {
    return {display, tier: 'moderate', color: 'yellow'};
  }

  return {display, tier: 'low', color: 'red'};
}

/**
 * Format a date for display
 * @param dateValue - ISO date string or Date object
 * @param options - Formatting options
 * @returns Formatted date
 *
 * @example
 * date("2025-12-29") // => "December 29, 2025"
 * date("2025-12-29", { format: "short" }) // => "Dec 29, 2025"
 */
export function date(dateValue: string | Date, options: DateOptions = {}): string {
  const {format = 'long'} = options;

  if (!dateValue) {
    return '';
  }

  const d = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;

  if (isNaN(d.getTime())) {
    return '';
  }

  switch (format) {
    case 'short': {
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }

    case 'iso': {
      return d.toISOString().split('T')[0];
    }

    case 'long':
    default: {
      return d.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }
  }
}

/**
 * Format hours into a human-readable estimate
 * @param hours - Total hours
 * @returns Formatted estimate
 *
 * @example
 * hoursEstimate(80) // => "80 hours (~2 weeks)"
 * hoursEstimate(160) // => "160 hours (~4 weeks)"
 */
export function hoursEstimate(hours: number): string {
  if (typeof hours !== 'number' || hours <= 0) {
    return '0 hours';
  }

  const weeks = Math.round(hours / 40);

  if (weeks <= 1) {
    return `${hours} hours (~1 week)`;
  }

  return `${hours} hours (~${weeks} weeks)`;
}

// =============================================================================
// CONVENIENCE EXPORT
// =============================================================================

/**
 * Convenience object for Mustache lambda-style usage
 * Import as: import { fmt } from './format_helpers.js'
 */
export const fmt = {
  currency,
  percent,
  duration,
  payback,
  roi,
  date,
  hoursEstimate
};

export default fmt;
