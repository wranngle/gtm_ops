/**
 * Template Context Builder for Schema v2
 *
 * Generates render-time formatted values (`_fmt.*`) from typed data.
 * This eliminates the need for stored `_display` fields and ensures
 * formatting is always in sync with numeric values.
 *
 * @module lib/template_context
 */

import { fmt } from './format_helpers.js';
import { isMonetaryValue, getMonthlyAmount, getAnnualAmount } from './types.js';

/**
 * Build template context with _fmt.* formatted values
 *
 * Spreads the schema at root level and adds _fmt namespace with
 * all pre-formatted display values for Mustache templates.
 *
 * @param {Object} schema - Unified schema object
 * @returns {Object} Template context with _fmt.* values
 *
 * @example
 * const context = buildTemplateContext(schema);
 * // context._fmt.monthly_bleed === "$74,375/mo"
 * // context._fmt.annual_savings === "$892,500/yr"
 * // context._fmt.total_price === "$11,375"
 */
export function buildTemplateContext(schema) {
  const _fmt = {};

  // === FINANCIAL VALUES ===
  const finops = schema.estimate?.finops || schema.finops || {};
  const valueBreakdown = finops.value_breakdown || {};
  const validation = finops.validation || {};

  // Hard Savings (typed MonetaryValue or legacy)
  // NOTE: showPeriod: false - templates add suffixes manually where needed
  const hardSavings = valueBreakdown.hard_savings || {};
  if (isMonetaryValue(hardSavings)) {
    _fmt.hard_savings_monthly = fmt.currency(getMonthlyAmount(hardSavings), { showPeriod: false });
    _fmt.hard_savings_annual = fmt.currency(getAnnualAmount(hardSavings), { showPeriod: false });
  } else {
    // Legacy format: { monthly: number, annual: number }
    _fmt.hard_savings_monthly = fmt.currency({ amount: hardSavings.monthly || 0, period: 'monthly', currency: 'USD' }, { showPeriod: false });
    _fmt.hard_savings_annual = fmt.currency({ amount: hardSavings.annual || 0, period: 'annual', currency: 'USD' }, { showPeriod: false });
  }

  // Modeled Opportunity (typed MonetaryValue or legacy)
  const modeledOpportunity = valueBreakdown.modeled_opportunity || {};
  if (isMonetaryValue(modeledOpportunity)) {
    _fmt.modeled_opportunity_monthly = fmt.currency(getMonthlyAmount(modeledOpportunity), { showPeriod: false });
    _fmt.modeled_opportunity_annual = fmt.currency(getAnnualAmount(modeledOpportunity), { showPeriod: false });
  } else {
    _fmt.modeled_opportunity_monthly = fmt.currency({ amount: modeledOpportunity.monthly || 0, period: 'monthly', currency: 'USD' }, { showPeriod: false });
    _fmt.modeled_opportunity_annual = fmt.currency({ amount: modeledOpportunity.annual || 0, period: 'annual', currency: 'USD' }, { showPeriod: false });
  }

  // Total Value (combined hard + modeled)
  // NOTE: showPeriod: false to match _display behavior (templates add suffixes manually)
  _fmt.total_monthly_value = fmt.currency({
    amount: valueBreakdown.total_monthly_value || 0,
    period: 'monthly',
    currency: 'USD'
  }, { showPeriod: false });
  _fmt.total_annual_value = fmt.currency({
    amount: valueBreakdown.total_annual_value || 0,
    period: 'annual',
    currency: 'USD'
  }, { showPeriod: false });

  // Investment/Price - USE CLIENT-FACING PRICE, not internal costs
  // Priority: schema.pricing.final_price (client price) > finops.target_price (internal)
  const clientPrice = schema.pricing?.final_price || schema.pricing?.total?.amount || 0;
  const targetPrice = clientPrice || finops.target_price || schema.proposal?.pricing?.total || 0;
  _fmt.investment = fmt.currency({ amount: targetPrice, period: 'once', currency: 'USD' });
  _fmt.total_price = _fmt.investment;

  // Margin
  _fmt.margin_percent = fmt.percent(finops.margin_percent || 0);
  _fmt.margin_amount = fmt.currency({ amount: finops.margin_amount || 0, period: 'once', currency: 'USD' });

  // === ROI / PAYBACK ===
  const roi = finops.roi || {};
  const paybackCheck = validation.payback_check || {};

  // Payback period
  const paybackMonths = paybackCheck.payback_months || roi.payback_period_months || 0;
  _fmt.payback = fmt.payback(paybackMonths);

  // ROI percentage
  const roiPercent = roi.percent || roi.roi_percent || 0;
  const roiResult = fmt.roi(roiPercent);
  _fmt.roi_percent = roiResult.display;
  _fmt.roi_tier = roiResult.tier;

  // === BLEED / MONTHLY LOSSES ===
  // NOTE: showPeriod: false - templates handle period display separately
  const bleed = schema.audit_report?.bleed || schema.bleed || {};
  const bleedTotal = bleed.total || {};

  if (isMonetaryValue(bleedTotal)) {
    _fmt.monthly_bleed = fmt.currency(getMonthlyAmount(bleedTotal), { showPeriod: false });
    _fmt.annual_bleed = fmt.currency(getAnnualAmount(bleedTotal), { showPeriod: false });
  } else {
    // Legacy format
    const bleedAmount = bleedTotal.amount || bleedTotal.value || 0;
    _fmt.monthly_bleed = fmt.currency({ amount: bleedAmount, period: 'monthly', currency: 'USD' }, { showPeriod: false });
    _fmt.annual_bleed = fmt.currency({ amount: bleedAmount * 12, period: 'annual', currency: 'USD' }, { showPeriod: false });
  }

  // === HOURS / EFFORT ===
  const effort = schema.estimate?.effort || schema.effort || {};
  const totalHours = effort.adjusted_hours?.total || effort.base_hours?.total || 0;

  _fmt.total_hours = fmt.hoursEstimate(totalHours);
  _fmt.duration_weeks = `${Math.ceil(totalHours / 40)} weeks`;

  // === PRICING MILESTONES ===
  const milestones = schema.milestones?.[0]?.milestones || schema.proposal?.milestones || [];
  _fmt.milestones = milestones.map((m, idx) => ({
    ...m,
    _fmt_amount: fmt.currency({ amount: m.amount || m.cost || 0, period: 'once', currency: 'USD' }),
    _fmt_percent: fmt.percent((m.allocation || m.percent || 0) / 100)
  }));

  // === VALIDATION CHECKS ===
  const profitFloor = validation.profit_floor || {};
  const hardFloor = validation.hard_floor || {};

  _fmt.profit_floor_percent = fmt.percent(profitFloor.actual_percent / 100 || 0);
  _fmt.hard_floor_coverage = fmt.percent(hardFloor.coverage_percent / 100 || 0);

  // === PRICING / SUBTOTAL ===
  // USE CLIENT-FACING PRICING FIRST (schema.pricing), not internal costs (proposal.pricing)
  const clientPricing = schema.pricing || {};
  const internalPricing = schema.proposal?.pricing || {};
  // Client-facing values take priority
  const subtotalValue = clientPricing.subtotal || (isMonetaryValue(internalPricing.subtotal) ? internalPricing.subtotal.amount : (internalPricing.subtotal || 0));
  const totalValueForFmt = clientPricing.final_price || clientPricing.total?.amount || (isMonetaryValue(internalPricing.total) ? internalPricing.total.amount : (internalPricing.total || 0));
  _fmt.pricing_subtotal = fmt.currency({ amount: subtotalValue, period: 'once', currency: 'USD' });
  _fmt.pricing_total = fmt.currency({ amount: totalValueForFmt, period: 'once', currency: 'USD' });

  // === DURATION / TIMELINE ===
  const totalDurationSchema = schema.total_duration || schema.estimate?.duration || {};
  // est_days is the primary value (business days)
  const estDays = totalDurationSchema.business_days || Math.ceil(totalHours / 8);
  _fmt.est_days = estDays;
  // Derive weeks from est_days for consistency (not from totalDurationSchema.display)
  // Using 5 business days per week for accurate week calculation
  const estWeeks = Math.ceil(estDays / 5);
  _fmt.est_weeks = estWeeks;
  _fmt.est_weeks_display = `${estWeeks} week${estWeeks === 1 ? '' : 's'}`;
  // total_duration as object with .display for template compatibility
  // IMPORTANT: Derive from est_days to ensure consistency (100 days → 20 weeks, not 12)
  _fmt.total_duration = {
    value: estWeeks,
    unit: 'weeks',
    display: `${estWeeks} week${estWeeks === 1 ? '' : 's'}`
  };

  // === RISK ANALYSIS ===
  const riskAnalysis = schema.risk_analysis || {};
  _fmt.risk_ratio = riskAnalysis.ratio_display || 'N/A';
  _fmt.risk_verdict = riskAnalysis.verdict || 'Standard';

  // === CONTINGENCY ===
  const estimateCost = schema.estimate?.cost || {};
  _fmt.contingency_percent = `${estimateCost.contingency_percent || 15}%`;

  // === BLEED AMOUNT (no suffix) ===
  const bleedAmount = bleedTotal.amount || bleedTotal.value || 0;
  _fmt.bleed_amount = fmt.currency({ amount: bleedAmount, period: 'once', currency: 'USD' });
  _fmt.bleed_period = bleed.period_display || (bleed.period === 'month' ? 'Per Month' : `Per ${bleed.period || 'Month'}`);

  // === ROI SECTION SPECIFIC ===
  // For the ROI breakdown display in proposal
  // NOTE: showPeriod: false - matches _display behavior
  const roiSection = schema.roi || finops.roi || {};
  _fmt.annual_value = fmt.currency({ amount: roiSection.annual_value || valueBreakdown.total_annual_value || 0, period: 'annual', currency: 'USD' }, { showPeriod: false });
  _fmt.monthly_value = fmt.currency({ amount: roiSection.monthly_value || valueBreakdown.total_monthly_value || 0, period: 'monthly', currency: 'USD' }, { showPeriod: false });
  _fmt.investment_amount = fmt.currency({ amount: roiSection.investment || targetPrice, period: 'once', currency: 'USD' });

  // === IDENTITY SHORTCUTS ===
  // Allow templates to use {{_fmt.client_name}} as shortcut
  if (schema.identity) {
    _fmt.client_name = schema.identity.client_name;
    _fmt.process_name = schema.identity.process_name;
    _fmt.document_slug = schema.identity.document_slug;
    _fmt.process_date = schema.identity.process_date_display;
    _fmt.valid_until = schema.identity.valid_until_display;
  }

  // Return schema spread with _fmt namespace
  return {
    ...schema,
    _fmt
  };
}

/**
 * Format a single monetary value at render time
 * For use in templates with {{#_fmt.money}}{{amount}}{{/_fmt.money}} pattern
 *
 * @param {Object|number} value - Value to format
 * @param {string} [period='once'] - Period if value is a number
 * @returns {string} Formatted currency string
 */
export function formatMoney(value, period = 'once') {
  if (typeof value === 'number') {
    return fmt.currency({ amount: value, period, currency: 'USD' });
  }

  if (isMonetaryValue(value)) {
    return fmt.currency(value);
  }

  return fmt.currency({ amount: value?.amount || value?.value || 0, period, currency: 'USD' });
}

/**
 * Build minimal _fmt context for a specific section
 * Useful when rendering partial templates
 *
 * @param {Object} section - Section data (e.g., finops, bleed)
 * @param {string} sectionType - Type of section for context-aware formatting
 * @returns {Object} Section-specific _fmt values
 */
export function buildSectionContext(section, sectionType) {
  const _fmt = {};

  switch (sectionType) {
    case 'finops': {
      _fmt.target_price = formatMoney(section.target_price);
      _fmt.margin_percent = fmt.percent(section.margin_percent || 0);
      break;
    }

    case 'bleed': {
      _fmt.total = formatMoney(section.total?.amount || 0, 'monthly');
      _fmt.annual = formatMoney((section.total?.amount || 0) * 12, 'annual');
      break;
    }

    case 'roi': {
      _fmt.percent = fmt.roi(section.percent || 0).display;
      _fmt.payback = fmt.payback(section.payback_period_months || 0);
      break;
    }

    default: {
      break;
    }
  }

  return _fmt;
}

export default {
  buildTemplateContext,
  formatMoney,
  buildSectionContext
};
