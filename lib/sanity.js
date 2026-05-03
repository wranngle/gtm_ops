/**
 * Sanity Checks - Runtime bounds validation
 * 
 * These checks would have prevented the $10.7M calculation bug.
 * All financial calculations MUST pass through these gates.
 * 
 * @module lib/sanity
 */

/**
 * Validate bleed calculation inputs
 * @param {Object} inputs - Bleed calculation inputs
 * @throws {Error} If any input exceeds sanity bounds
 * @returns {Object} Validated inputs (pass-through)
 */
export function validateBleedInputs(inputs) {
  const { volume_per_day, days_per_month, minutes_per_item, hourly_rate } = inputs;

  // Minutes per item sanity check - THE KEY CHECK
  // 480 minutes = 8 hours max per single task
  if (minutes_per_item !== undefined && minutes_per_item > 480) {
    throw new Error(
      `SANITY CHECK FAILED: minutes_per_item=${minutes_per_item} exceeds 8 hours (480 minutes). ` +
      `Did you mean ${(minutes_per_item / 60).toFixed(1)} hours? ` +
      `If this is actually minutes, the value seems unrealistic for a single task.`
    );
  }

  // Volume sanity check
  if (volume_per_day !== undefined && volume_per_day > 10_000) {
    throw new Error(
      `SANITY CHECK FAILED: volume_per_day=${volume_per_day} exceeds 10,000. ` +
      `This means over 10K tasks per day. Verify this is correct.`
    );
  }

  // Days per month sanity check
  if (days_per_month !== undefined && (days_per_month < 1 || days_per_month > 31)) {
    throw new Error(
      `SANITY CHECK FAILED: days_per_month=${days_per_month} is outside valid range (1-31).`
    );
  }

  // Hourly rate sanity check
  if (hourly_rate !== undefined && (hourly_rate < 10 || hourly_rate > 500)) {
    console.warn(
      `SANITY WARNING: hourly_rate=${hourly_rate} is outside typical range ($10-$500). ` +
      `Proceeding but verify this is intentional.`
    );
  }

  // Calculate and validate the result
  if (volume_per_day && days_per_month && minutes_per_item && hourly_rate) {
    const monthlyBleed = volume_per_day * days_per_month * (minutes_per_item / 60) * hourly_rate;
    
    if (monthlyBleed > 500_000) {
      throw new Error(
        `SANITY CHECK FAILED: Calculated monthly bleed $${monthlyBleed.toLocaleString()} exceeds $500K. ` +
        `This seems unrealistically high. Verify inputs:\n` +
        `  - volume_per_day: ${volume_per_day}\n` +
        `  - days_per_month: ${days_per_month}\n` +
        `  - minutes_per_item: ${minutes_per_item}\n` +
        `  - hourly_rate: $${hourly_rate}`
      );
    }
  }

  return inputs;
}

/**
 * Validate monetary value sanity
 * @param {number} amount - Dollar amount
 * @param {string} label - Description for error messages
 * @param {Object} options - Validation options
 * @returns {number} Validated amount (pass-through)
 */
export function validateMonetaryAmount(amount, label = 'amount', options = {}) {
  const { maxAmount = 100_000_000, allowNegative = false } = options;

  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new TypeError(`SANITY CHECK FAILED: ${label} is not a valid number: ${amount}`);
  }

  if (!allowNegative && amount < 0) {
    throw new Error(`SANITY CHECK FAILED: ${label} is negative: $${amount.toLocaleString()}`);
  }

  if (amount > maxAmount) {
    throw new Error(
      `SANITY CHECK FAILED: ${label} ($${amount.toLocaleString()}) exceeds max ($${maxAmount.toLocaleString()}). ` +
      `This may indicate a unit conversion error.`
    );
  }

  return amount;
}

/**
 * Validate percentage value
 * @param {number} value - Percentage value (can be 0-1 decimal or 0-100 integer)
 * @param {string} label - Description for error messages
 * @param {'decimal'|'integer'} format - Expected format
 * @returns {number} Validated value (pass-through)
 */
export function validatePercentage(value, label = 'percentage', format = 'decimal') {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new TypeError(`SANITY CHECK FAILED: ${label} is not a valid number: ${value}`);
  }

  if (format === 'decimal') {
    // Expect 0-1 range (0.15 = 15%)
    if (value < 0 || value > 1) {
      // Check if it looks like they passed an integer percentage
      if (value > 1 && value <= 100) {
        console.warn(
          `SANITY WARNING: ${label}=${value} looks like an integer percentage but decimal format expected. ` +
          `Did you mean ${value / 100}?`
        );
      }

      throw new Error(`SANITY CHECK FAILED: ${label}=${value} is outside decimal range (0-1).`);
    }
  } else if (value < 0 || value > 100) {
    // Expect 0-100 range (15 = 15%)
    throw new Error(`SANITY CHECK FAILED: ${label}=${value} is outside integer percentage range (0-100).`);
  }

  return value;
}

/**
 * Validate duration value
 * @param {number} value - Duration amount
 * @param {string} unit - Time unit
 * @param {string} label - Description for error messages
 * @returns {Object} Validated duration object
 */
export function validateDuration(value, unit, label = 'duration') {
  const validUnits = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'];
  
  if (!validUnits.includes(unit)) {
    throw new Error(`SANITY CHECK FAILED: ${label} has invalid unit '${unit}'. Valid: ${validUnits.join(', ')}`);
  }

  if (typeof value !== 'number' || isNaN(value) || value < 0) {
    throw new Error(`SANITY CHECK FAILED: ${label} value is invalid: ${value}`);
  }

  // Unit-specific sanity checks
  const maxValues = {
    minutes: 1440 * 365, // 1 year in minutes
    hours: 24 * 365,     // 1 year in hours
    days: 365 * 2,       // 2 years
    weeks: 104,          // 2 years
    months: 24,          // 2 years
    years: 10            // 10 years
  };

  if (value > maxValues[unit]) {
    console.warn(
      `SANITY WARNING: ${label}=${value} ${unit} exceeds typical maximum (${maxValues[unit]} ${unit}).`
    );
  }

  return { value, unit };
}

export default {
  validateBleedInputs,
  validateMonetaryAmount,
  validatePercentage,
  validateDuration
};
