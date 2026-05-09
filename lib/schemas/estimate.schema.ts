/**
 * Estimate Schema - Financial calculations and effort breakdown
 * @module lib/schemas/estimate.schema
 */

import { type } from 'arktype';
import { PricingTierSchema } from './common.schema.js';

// =============================================================================
// Hours Breakdown
// =============================================================================

export const HoursBreakdownSchema = type({
  solutions_architect: 'number >= 0',
  automation_engineer: 'number >= 0',
  ai_developer: 'number >= 0',
  qa_documentation: 'number >= 0',
  total: 'number >= 0',
});

export type HoursBreakdown = typeof HoursBreakdownSchema.infer;

// =============================================================================
// Effort Section
// =============================================================================

export const IntegrationComplexitySchema = type({
  name: 'string',
  complexity: '1 <= number <= 10',
});

export const EffortSchema = type({
  base_hours: HoursBreakdownSchema,
  adjusted_hours: HoursBreakdownSchema,
  risk_factors: type('string[]').default(() => []),
  risk_multiplier: type('1 <= number <= 2').default(1),
  'complexity_score?': '0 <= number <= 10',
  integrations: type(IntegrationComplexitySchema, '[]').default(() => []),
});

export type Effort = typeof EffortSchema.infer;

// =============================================================================
// Cost Section
// =============================================================================

export const CostBreakdownSchema = type({
  solutions_architect: 'number >= 0',
  automation_engineer: 'number >= 0',
  ai_developer: 'number >= 0',
  qa_documentation: 'number >= 0',
});

export const CostRangeSchema = type({
  low: 'number >= 0',
  high: 'number >= 0',
});

export const CostSchema = type({
  breakdown: CostBreakdownSchema,
  subtotal: 'number >= 0',
  contingency: 'number >= 0',
  contingency_percent: type('0 <= number <= 1').default(0.15),
  total: 'number >= 0',
  'range?': CostRangeSchema,
  'hours?': type({
    'breakdown?': CostBreakdownSchema,
    total: 'number >= 0',
    'with_contingency?': 'number >= 0',
  }),
});

export type Cost = typeof CostSchema.infer;

// =============================================================================
// Milestone
// =============================================================================

export const MilestoneSchema = type({
  milestone_number: 'string',
  name: 'string',
  'phase?': 'string',
  'description?': 'string',
  allocation: '0 <= number <= 1',
  'allocation_display?': 'string',
  hours: 'number >= 0',
  'hours_display?': 'string',
  cost: 'number >= 0',
  'cost_display?': 'string',
  deliverables: type('string[]').default(() => []),
  'duration_days?': 'number >= 0',
});

export type Milestone = typeof MilestoneSchema.infer;

// =============================================================================
// Tier (Pricing Tier)
// =============================================================================

export const TierSchema = type({
  key: PricingTierSchema,
  name: 'string',
  'price_range?': type({
    min: 'number >= 0',
    max: 'number >= 0',
  }),
  'hours_range?': type({
    min: 'number >= 0',
    max: 'number >= 0',
  }),
});

export type Tier = typeof TierSchema.infer;

// =============================================================================
// Value Breakdown
// =============================================================================

export const HardSavingsSchema = type({
  monthly: 'number >= 0',
  annual: 'number >= 0',
  'monthly_display?': 'string',
  'annual_display?': 'string',
  'hours_saved_monthly?': 'number >= 0',
  'client_hourly_value?': 'number >= 0',
  'type?': "'hard_savings'",
  'label?': 'string',
  'formula?': 'string',
});

export type HardSavings = typeof HardSavingsSchema.infer;

export const ModeledOpportunitySchema = type({
  monthly: 'number >= 0',
  annual: 'number >= 0',
  'monthly_display?': 'string',
  'annual_display?': 'string',
  'converted_leads_monthly?': 'number >= 0',
  'daily_leads?': 'number >= 0',
  'lift_percent?': '0 <= number <= 1',
  'avg_deal_value?': 'number >= 0',
  'was_capped?': 'boolean',
  'cap_reason?': 'string',
  'type?': "'modeled_opportunity'",
  'label?': 'string',
  'formula?': 'string',
  'volume_source?': 'string',
  'volume_confidence?': 'string',
  'volume_note?': 'string',
});

export type ModeledOpportunity = typeof ModeledOpportunitySchema.infer;

export const ValueBreakdownSchema = type({
  'hard_savings?': HardSavingsSchema,
  'modeled_opportunity?': ModeledOpportunitySchema,
  total_monthly_value: 'number >= 0',
  total_annual_value: 'number >= 0',
  total_monthly_display: 'string',
  total_annual_display: 'string',
});

export type ValueBreakdown = typeof ValueBreakdownSchema.infer;

// =============================================================================
// FinOps Validation
// =============================================================================

const ValidationItemBase = {
  passes: 'boolean',
  message: 'string',
} as const;

export const ValidationItemSchema = type(ValidationItemBase);

export const ProfitFloorValidationSchema = type({
  ...ValidationItemBase,
  'original_price?': 'number',
  'adjusted_price?': 'number',
  'markup?': 'number',
  'adjusted?': 'boolean',
  'margin_percent?': 'number',
});

export const HardFloorValidationSchema = type({
  ...ValidationItemBase,
  'required_coverage?': 'number',
  'actual_coverage?': 'number',
  'coverage_percent?': 'number',
  'min_coverage_percent?': 'number',
  'annual_value_display?': 'string',
  'investment_display?': 'string',
});

export const PaybackValidationSchema = type({
  ...ValidationItemBase,
  'payback_months?': 'number',
  'payback_display?': 'string',
  'max_payback_months?': 'number',
  'investment_display?': 'string',
  'monthly_value_display?': 'string',
});

export const FinOpsValidationSchema = type({
  'profit_floor?': ProfitFloorValidationSchema,
  'hard_floor?': HardFloorValidationSchema,
  'payback_check?': PaybackValidationSchema,
  all_pass: 'boolean',
  'summary?': 'string',
});

export type FinOpsValidation = typeof FinOpsValidationSchema.infer;

// =============================================================================
// ROI Metrics
// =============================================================================

export const ROISchema = type({
  monthly_value: 'number >= 0',
  payback_months: 'number >= 0',
  annual_roi: 'number',
  annual_value: 'number >= 0',
  'hours_automated?': 'number >= 0',
  'client_hourly_value?': 'number >= 0',
});

export type ROI = typeof ROISchema.infer;

// =============================================================================
// Risk Elaboration
// =============================================================================

export const RiskElaborationSchema = type({
  risk: 'string',
  'technical_dependency?': 'string',
  'mitigation?': 'string',
  'is_high?': 'boolean',
});

export type RiskElaboration = typeof RiskElaborationSchema.infer;

// =============================================================================
// Source Tracking
// =============================================================================

export const SourceTrackingSchema = type({
  field: 'string',
  source: 'string',
  'confidence?': 'string',
});

export type SourceTracking = typeof SourceTrackingSchema.infer;

// =============================================================================
// Complete FinOps Section
// =============================================================================

export const FinOpsSchema = type({
  'raw_production_cost?': 'number >= 0',
  'compute_estimate?': 'number >= 0',
  'total_internal_cost?': 'number >= 0',
  'internal_rate?': 'number >= 0',
  'original_price?': 'number >= 0',
  'target_price?': 'number >= 0',
  'price_adjusted?': 'boolean',
  'margin_amount?': 'number',
  'margin_percent?': 'number',
  value_breakdown: ValueBreakdownSchema,
  validation: FinOpsValidationSchema,
  'roi?': ROISchema,
  'risk_elaboration?': RiskElaborationSchema.array(),
  'sources?': SourceTrackingSchema.array(),
});

export type FinOps = typeof FinOpsSchema.infer;

// =============================================================================
// Complete Estimate Output Schema
// =============================================================================

const RetainerSchema = type({
  'recommended?': 'boolean',
  'tier?': 'string',
  'monthly_rate?': 'number >= 0',
  'hours_included?': 'number >= 0',
  'rationale?': 'string',
});

const RiskAnalysisFactorsSchema = type({
  'integration_count?': 'number',
  'risk_factor_count?': 'number',
  'total_hours?': 'number',
  'risk_multiplier?': 'number',
  'roi_percent?': 'number',
  'payback_months?': 'number',
  'annual_value?': 'number',
});

const RiskAnalysisSchema = type({
  'risk_score?': '1 <= number <= 10',
  'reward_score?': '1 <= number <= 10',
  'ratio?': 'number',
  'ratio_display?': 'string',
  'verdict?': 'string',
  'factors?': RiskAnalysisFactorsSchema,
});

const PaymentTermsSchema = type({
  'structure?': 'string',
  'upfront_percent?': 'number',
  'final_percent?': 'number',
  'final_trigger?': 'string',
});

const LicensingSchema = type({
  'infrastructure?': 'string',
  'data_ownership?': 'string',
  'exportable?': 'boolean',
});

const CommercialSchema = type({
  'pricing_model?': 'string',
  'subscription_price?': 'number',
  'processes_included?': 'number',
  'ad_hoc_rate?': 'number',
  'payment_terms?': PaymentTermsSchema,
  'licensing?': LicensingSchema,
});

const BaselineBreakdownItem = type({
  system: 'string',
  hours: 'number',
  'source?': 'string',
  'complexity?': 'number',
});

const BaselineSchema = type({
  'integration_hours?': 'number',
  'architecture_hours?': 'number',
  'total_baseline?': 'number',
  'breakdown?': BaselineBreakdownItem.array(),
  'rationale?': 'string',
});

export const EstimateOutputSchema = type({
  effort: EffortSchema,
  cost: CostSchema,
  milestones: type(MilestoneSchema, '[]').default(() => []),
  'tier?': TierSchema,
  finops: FinOpsSchema,
  'retainer?': RetainerSchema,
  'risk_analysis?': RiskAnalysisSchema,
  'commercial?': CommercialSchema,
  'est_days?': 'number >= 0',
  'model?': 'string',
  'baseline?': BaselineSchema,
});

export type EstimateOutput = typeof EstimateOutputSchema.infer;
