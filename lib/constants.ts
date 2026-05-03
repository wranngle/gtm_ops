/**
 * Constants Module
 *
 * Centralizes magic numbers and business constants used across the pipeline.
 * Change values here to adjust business rules globally.
 *
 * @module lib/constants
 */

// =============================================================================
// WORKING TIME CONSTANTS
// =============================================================================

/**
 * Standard working days per time period.
 * Used for effort-to-duration conversions.
 */
export const WORKING_DAYS = {
  WEEK: 5,
  MONTH: 22,
  QUARTER: 66,
  YEAR: 260
} as const;

/**
 * Calendar days per time period.
 * Used for volume/lead calculations (includes weekends for customer activity).
 */
export const CALENDAR_DAYS = {
  WEEK: 7,
  MONTH: 30,
  YEAR: 365
} as const;

// =============================================================================
// INTEGRATION COMPLEXITY ADJUSTMENTS
// =============================================================================

/**
 * Multiplier applied when an integration has a native n8n node.
 * Native nodes reduce implementation effort by 20%.
 */
export const NATIVE_NODE_MULTIPLIER = 0.8;

/**
 * Additional hours added for OAuth2 authentication integrations.
 * Accounts for auth flow testing, token refresh logic, etc.
 */
export const OAUTH2_BUFFER_HOURS = 4;

/**
 * Default complexity score when research data is unavailable.
 * Scale is 1-10, with 5 being moderate complexity.
 */
export const DEFAULT_COMPLEXITY_SCORE = 5;

/**
 * Architecture/PM buffer added to integration hours.
 * Covers project management, architecture decisions, documentation.
 */
export const ARCHITECTURE_BUFFER_PERCENT = 0.2;

// =============================================================================
// ROI & OPPORTUNITY CALCULATIONS
// =============================================================================

/**
 * Default hourly rate for client labor value calculations.
 * Used when calculating bleed and labor savings.
 */
export const DEFAULT_CLIENT_HOURLY_RATE = 75;

/**
 * Default minutes per item for manual task estimation.
 * Used when inferring volume from bleed calculations.
 */
export const DEFAULT_MINUTES_PER_ITEM = 10;

/**
 * Default daily lead volume when no data available.
 * Conservative estimate for service businesses.
 */
export const DEFAULT_DAILY_LEADS = 15;

/**
 * Default average deal value for opportunity modeling.
 * Conservative estimate suitable for service businesses.
 */
export const DEFAULT_DEAL_VALUE = 500;

/**
 * Maximum modeled opportunity per month (guardrail).
 * Prevents unrealistic projections in ROI calculations.
 */
export const MAX_MODELED_OPPORTUNITY_MONTHLY = 50000;

/**
 * Cap modeled opportunity at this multiple of hard savings.
 * Ensures modeled opportunity doesn't wildly exceed proven savings.
 */
export const MODELED_TO_HARD_SAVINGS_CAP_RATIO = 2;

// =============================================================================
// ENTERPRISE PRICING VALIDATION
// =============================================================================

/**
 * Minimum profit margin percentage (floor).
 * Project pricing is marked up if margin falls below this.
 */
export const PROFIT_FLOOR_PERCENT = 50;

/**
 * Minimum hard savings coverage percentage.
 * Year 1 labor savings must cover this % of project price.
 */
export const HARD_FLOOR_COVERAGE_PERCENT = 50;

/**
 * Maximum acceptable payback period in months.
 * Projects exceeding this trigger validation warnings.
 */
export const MAX_PAYBACK_MONTHS = 3;

/**
 * Conversion lift percentage for opportunity modeling.
 * Conservative 1% lift estimate for revenue impact calculations.
 */
export const OPPORTUNITY_LIFT_PERCENT = 1;

/**
 * Labor savings multiplier for hard savings calculations.
 * 30% of project hours become monthly recurring savings.
 */
export const LABOR_SAVINGS_MULTIPLIER = 0.30;

/**
 * Internal hourly rate for cost calculations.
 * Used to calculate production cost and margins.
 */
export const INTERNAL_HOURLY_RATE = 50;

/**
 * Price rounding increment.
 * Client-facing prices are rounded to nearest $100.
 */
export const PRICE_ROUNDING_INCREMENT = 100;

// =============================================================================
// MILESTONE ALLOCATION PERCENTAGES
// =============================================================================

/**
 * Standard milestone allocation percentages.
 * Used for payment schedules and effort distribution.
 */
export const MILESTONE_ALLOCATION = {
  DESIGN: 20,
  BUILD: 45,
  TEST: 15,
  DEPLOY: 20
} as const;

// =============================================================================
// PRICING GUARDRAILS
// =============================================================================

/**
 * Maximum minutes per item before triggering validation warning.
 * 480 minutes = 8 hours. Values above this likely indicate unit errors.
 */
export const MAX_MINUTES_PER_ITEM = 480;

/**
 * Minimum profitable hourly rate (floor).
 * Rates below this trigger validation warnings.
 */
export const MIN_HOURLY_RATE = 10;

/**
 * Maximum reasonable hourly rate (ceiling).
 * Rates above this trigger validation warnings.
 */
export const MAX_HOURLY_RATE = 500;

/**
 * Maximum monthly bleed before triggering verification.
 * $500K/month is extremely high and warrants human review.
 */
export const MAX_MONTHLY_BLEED = 500000;

// =============================================================================
// TYPE EXPORTS
// =============================================================================

/** Type representing valid working day period keys */
export type WorkingDaysPeriod = keyof typeof WORKING_DAYS;

/** Type representing valid calendar day period keys */
export type CalendarDaysPeriod = keyof typeof CALENDAR_DAYS;

/** Type representing valid milestone phases */
export type MilestonePhase = keyof typeof MILESTONE_ALLOCATION;

// =============================================================================
// EXPORT ALL CONSTANTS
// =============================================================================

export default {
  WORKING_DAYS,
  CALENDAR_DAYS,
  NATIVE_NODE_MULTIPLIER,
  OAUTH2_BUFFER_HOURS,
  DEFAULT_COMPLEXITY_SCORE,
  ARCHITECTURE_BUFFER_PERCENT,
  DEFAULT_CLIENT_HOURLY_RATE,
  DEFAULT_MINUTES_PER_ITEM,
  DEFAULT_DAILY_LEADS,
  DEFAULT_DEAL_VALUE,
  MAX_MODELED_OPPORTUNITY_MONTHLY,
  MODELED_TO_HARD_SAVINGS_CAP_RATIO,
  // Enterprise pricing validation
  PROFIT_FLOOR_PERCENT,
  HARD_FLOOR_COVERAGE_PERCENT,
  MAX_PAYBACK_MONTHS,
  OPPORTUNITY_LIFT_PERCENT,
  LABOR_SAVINGS_MULTIPLIER,
  INTERNAL_HOURLY_RATE,
  PRICE_ROUNDING_INCREMENT,
  MILESTONE_ALLOCATION,
  // Pricing guardrails
  MAX_MINUTES_PER_ITEM,
  MIN_HOURLY_RATE,
  MAX_HOURLY_RATE,
  MAX_MONTHLY_BLEED
} as const;
