/**
 * Format Helpers - Render-time formatting for Schema v2
 *
 * Instead of storing `_display` fields, we format values at render time.
 * This eliminates sync bugs where numeric values change but display doesn't.
 *
 * @module lib/format_helpers
 */

/**
 * @typedef {Object} MonetaryValue
 * @property {number} amount - Raw numeric value
 * @property {string} currency - ISO currency code (default: "USD")
 * @property {"once"|"monthly"|"annual"|"per_item"} period - Time scope
 */

/**
 * @typedef {Object} DurationValue
 * @property {number} value - Numeric duration
 * @property {"minutes"|"hours"|"days"|"weeks"|"months"} unit - Time unit
 */

/**
 * Format a MonetaryValue to display string
 * @param {MonetaryValue|number} mv - Monetary value or raw number
 * @param {Object} options - Formatting options
 * @param {boolean} [options.showPeriod=true] - Include /mo or /yr suffix
 * @param {boolean} [options.compact=false] - Use compact notation (1.2K, 45M)
 * @returns {string} Formatted currency string
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
export function currency(mv, options = {}) {
  const { showPeriod = true, compact = false } = options;

  // Handle raw numbers (backward compat)
  if (typeof mv === 'number') {
    return `$${mv.toLocaleString()}`;
  }

  // Handle null/undefined
  if (!mv || typeof mv.amount !== 'number') {
    return '$0';
  }

  const { amount, period = 'once' } = mv;

  // Format the number
  let formatted;
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
 * @param {number} value - Decimal value (0.15 = 15%)
 * @param {Object} options - Formatting options
 * @param {number} [options.decimals=0] - Decimal places
 * @param {boolean} [options.showSign=false] - Show + for positive
 * @returns {string} Formatted percentage
 *
 * @example
 * percent(0.15) // => "15%"
 * percent(0.456, { decimals: 1 }) // => "45.6%"
 * percent(0.15, { showSign: true }) // => "+15%"
 */
export function percent(value, options = {}) {
  const { decimals = 0, showSign = false } = options;

  if (typeof value !== 'number' || isNaN(value)) {
    return '0%';
  }

  const pct = value * 100;
  const formatted = decimals > 0 ? pct.toFixed(decimals) : Math.round(pct);
  const sign = showSign && pct > 0 ? '+' : '';

  return `${sign}${formatted}%`;
}

/**
 * Format a DurationValue to display string
 * @param {DurationValue|number} dv - Duration value or raw number (assumes hours)
 * @param {Object} options - Formatting options
 * @param {string} [options.defaultUnit="hours"] - Unit for raw numbers
 * @returns {string} Formatted duration
 *
 * @example
 * duration({ value: 48, unit: "hours" }) // => "48 hours"
 * duration({ value: 2, unit: "weeks" }) // => "2 weeks"
 * duration({ value: 1, unit: "days" }) // => "1 day"
 */
export function duration(dv, options = {}) {
  const { defaultUnit = 'hours' } = options;

  // Handle raw numbers
  if (typeof dv === 'number') {
    dv = { value: dv, unit: defaultUnit };
  }

  if (!dv || typeof dv.value !== 'number') {
    return '0 hours';
  }

  const { value, unit = 'hours' } = dv;

  // Pluralize unit
  const unitLabel = value === 1 ? unit.replace(/s$/, '') : unit;

  return `${value} ${unitLabel}`;
}

/**
 * Format payback period from months
 * @param {number} months - Payback period in months
 * @returns {string} Human-readable payback period
 *
 * @example
 * payback(0.25) // => "1 week"
 * payback(0.5) // => "2 weeks"
 * payback(1.5) // => "6 weeks"
 * payback(3) // => "3 months"
 * payback(14) // => "1.2 years"
 */
export function payback(months) {
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
 * @param {number} roiPercent - ROI as percentage (e.g., 450 for 450%)
 * @returns {Object} Formatted ROI with tier classification
 *
 * @example
 * roi(450) // => { display: "450%", tier: "excellent", color: "green" }
 * roi(150) // => { display: "150%", tier: "good", color: "green" }
 * roi(50) // => { display: "50%", tier: "moderate", color: "yellow" }
 */
export function roi(roiPercent) {
  if (typeof roiPercent !== 'number' || isNaN(roiPercent)) {
    return { display: 'N/A', tier: 'unknown', color: 'gray' };
  }

  const display = `${Math.round(roiPercent)}%`;

  if (roiPercent >= 300) {
    return { display, tier: 'excellent', color: 'green' };
  }

  if (roiPercent >= 100) {
    return { display, tier: 'good', color: 'green' };
  }

  if (roiPercent >= 50) {
    return { display, tier: 'moderate', color: 'yellow' };
  }
 
  return { display, tier: 'low', color: 'red' };
  
}

/**
 * Format a date for display
 * @param {string|Date} date - ISO date string or Date object
 * @param {Object} options - Formatting options
 * @param {string} [options.format="long"] - "long", "short", or "iso"
 * @returns {string} Formatted date
 *
 * @example
 * date("2025-12-29") // => "December 29, 2025"
 * date("2025-12-29", { format: "short" }) // => "Dec 29, 2025"
 */
export function date(dateValue, options = {}) {
  const { format = 'long' } = options;

  if (!dateValue) return '';

  const d = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;

  if (isNaN(d.getTime())) return '';

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
 * @param {number} hours - Total hours
 * @returns {string} Formatted estimate
 *
 * @example
 * hoursEstimate(80) // => "80 hours (~2 weeks)"
 * hoursEstimate(160) // => "160 hours (~4 weeks)"
 */
export function hoursEstimate(hours) {
  if (typeof hours !== 'number' || hours <= 0) {
    return '0 hours';
  }

  const weeks = Math.round(hours / 40);

  if (weeks <= 1) {
    return `${hours} hours (~1 week)`;
  }

  return `${hours} hours (~${weeks} weeks)`;
}

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
