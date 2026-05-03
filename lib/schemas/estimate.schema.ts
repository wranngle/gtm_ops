/**
 * Estimate Schema - Financial calculations and effort breakdown
 * @module lib/schemas/estimate.schema
 */

import { z } from 'zod';
import { PricingTierSchema, ComplexityTierSchema } from './common.schema.js';

// =============================================================================
// Hours Breakdown
// =============================================================================

export const HoursBreakdownSchema = z.object({
  solutions_architect: z.number().nonnegative(),
  automation_engineer: z.number().nonnegative(),
  ai_developer: z.number().nonnegative(),
  qa_documentation: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

export type HoursBreakdown = z.infer<typeof HoursBreakdownSchema>;

// =============================================================================
// Effort Section
// =============================================================================

export const IntegrationComplexitySchema = z.object({
  name: z.string(),
  complexity: z.number().min(1).max(10),
});

export const EffortSchema = z.object({
  base_hours: HoursBreakdownSchema,
  adjusted_hours: HoursBreakdownSchema,
  risk_factors: z.array(z.string()).default([]),
  risk_multiplier: z.number().min(1).max(2).default(1),
  complexity_score: z.number().min(0).max(10).optional(),
  integrations: z.array(IntegrationComplexitySchema).default([]),
});

export type Effort = z.infer<typeof EffortSchema>;

// =============================================================================
// Cost Section
// =============================================================================

export const CostBreakdownSchema = z.object({
  solutions_architect: z.number().nonnegative(),
  automation_engineer: z.number().nonnegative(),
  ai_developer: z.number().nonnegative(),
  qa_documentation: z.number().nonnegative(),
});

export const CostRangeSchema = z.object({
  low: z.number().nonnegative(),
  high: z.number().nonnegative(),
});

export const CostSchema = z.object({
  breakdown: CostBreakdownSchema,
  subtotal: z.number().nonnegative(),
  contingency: z.number().nonnegative(),
  contingency_percent: z.number().min(0).max(1).default(0.15),
  total: z.number().nonnegative(),
  range: CostRangeSchema.optional(),
  hours: z.object({
    breakdown: CostBreakdownSchema.optional(),
    total: z.number().nonnegative(),
    with_contingency: z.number().nonnegative().optional(),
  }).optional(),
});

export type Cost = z.infer<typeof CostSchema>;

// =============================================================================
// Milestone
// =============================================================================

export const MilestoneSchema = z.object({
  milestone_number: z.string(),
  name: z.string(),
  phase: z.string().optional(),
  description: z.string().optional(),
  allocation: z.number().min(0).max(1), // Percentage as decimal
  allocation_display: z.string().optional(),
  hours: z.number().nonnegative(),
  hours_display: z.string().optional(),
  cost: z.number().nonnegative(),
  cost_display: z.string().optional(),
  deliverables: z.array(z.string()).default([]),
  duration_days: z.number().nonnegative().optional(),
});

export type Milestone = z.infer<typeof MilestoneSchema>;

// =============================================================================
// Tier (Pricing Tier)
// =============================================================================

export const TierSchema = z.object({
  key: PricingTierSchema,
  name: z.string(),
  price_range: z.object({
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
  }).optional(),
  hours_range: z.object({
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
  }).optional(),
});

export type Tier = z.infer<typeof TierSchema>;

// =============================================================================
// Value Breakdown (Hard Savings + Modeled Opportunity)
// =============================================================================

export const HardSavingsSchema = z.object({
  monthly: z.number().nonnegative(),
  annual: z.number().nonnegative(),
  monthly_display: z.string().optional(),
  annual_display: z.string().optional(),
  hours_saved_monthly: z.number().nonnegative().optional(),
  client_hourly_value: z.number().nonnegative().optional(),
  type: z.literal('hard_savings').optional(),
  label: z.string().optional(),
  formula: z.string().optional(),
});

export type HardSavings = z.infer<typeof HardSavingsSchema>;

export const ModeledOpportunitySchema = z.object({
  monthly: z.number().nonnegative(),
  annual: z.number().nonnegative(),
  monthly_display: z.string().optional(),
  annual_display: z.string().optional(),
  converted_leads_monthly: z.number().nonnegative().optional(),
  daily_leads: z.number().nonnegative().optional(),
  lift_percent: z.number().min(0).max(1).optional(),
  avg_deal_value: z.number().nonnegative().optional(),
  was_capped: z.boolean().optional(),
  cap_reason: z.string().optional(),
  type: z.literal('modeled_opportunity').optional(),
  label: z.string().optional(),
  formula: z.string().optional(),
  volume_source: z.string().optional(),
  volume_confidence: z.string().optional(),
  volume_note: z.string().optional(),
});

export type ModeledOpportunity = z.infer<typeof ModeledOpportunitySchema>;

export const ValueBreakdownSchema = z.object({
  hard_savings: HardSavingsSchema.optional(),
  modeled_opportunity: ModeledOpportunitySchema.optional(),
  total_monthly_value: z.number().nonnegative(),
  total_annual_value: z.number().nonnegative(),
  total_monthly_display: z.string(),
  total_annual_display: z.string(),
});

export type ValueBreakdown = z.infer<typeof ValueBreakdownSchema>;

// =============================================================================
// FinOps Validation
// =============================================================================

export const ValidationItemSchema = z.object({
  passes: z.boolean(),
  message: z.string(),
});

export const ProfitFloorValidationSchema = ValidationItemSchema.extend({
  original_price: z.number().optional(),
  adjusted_price: z.number().optional(),
  markup: z.number().optional(),
  adjusted: z.boolean().optional(),
  margin_percent: z.number().optional(),
});

export const HardFloorValidationSchema = ValidationItemSchema.extend({
  required_coverage: z.number().optional(),
  actual_coverage: z.number().optional(),
  coverage_percent: z.number().optional(),
  min_coverage_percent: z.number().optional(),
  annual_value_display: z.string().optional(),
  investment_display: z.string().optional(),
});

export const PaybackValidationSchema = ValidationItemSchema.extend({
  payback_months: z.number().optional(),
  payback_display: z.string().optional(),
  max_payback_months: z.number().optional(),
  investment_display: z.string().optional(),
  monthly_value_display: z.string().optional(),
});

export const FinOpsValidationSchema = z.object({
  profit_floor: ProfitFloorValidationSchema.optional(),
  hard_floor: HardFloorValidationSchema.optional(),
  payback_check: PaybackValidationSchema.optional(),
  all_pass: z.boolean(),
  summary: z.string().optional(),
});

export type FinOpsValidation = z.infer<typeof FinOpsValidationSchema>;

// =============================================================================
// ROI Metrics
// =============================================================================

export const ROISchema = z.object({
  monthly_value: z.number().nonnegative(),
  payback_months: z.number().nonnegative(),
  annual_roi: z.number(),
  annual_value: z.number().nonnegative(),
  hours_automated: z.number().nonnegative().optional(),
  client_hourly_value: z.number().nonnegative().optional(),
});

export type ROI = z.infer<typeof ROISchema>;

// =============================================================================
// Risk Elaboration
// =============================================================================

export const RiskElaborationSchema = z.object({
  risk: z.string(),
  technical_dependency: z.string().optional(),
  mitigation: z.string().optional(),
  is_high: z.boolean().optional(),
});

export type RiskElaboration = z.infer<typeof RiskElaborationSchema>;

// =============================================================================
// Source Tracking
// =============================================================================

export const SourceTrackingSchema = z.object({
  field: z.string(),
  source: z.string(),
  confidence: z.string().optional(),
});

export type SourceTracking = z.infer<typeof SourceTrackingSchema>;

// =============================================================================
// Complete FinOps Section
// =============================================================================

export const FinOpsSchema = z.object({
  raw_production_cost: z.number().nonnegative().optional(),
  compute_estimate: z.number().nonnegative().optional(),
  total_internal_cost: z.number().nonnegative().optional(),
  internal_rate: z.number().nonnegative().optional(),
  original_price: z.number().nonnegative().optional(),
  target_price: z.number().nonnegative().optional(),
  price_adjusted: z.boolean().optional(),
  margin_amount: z.number().optional(),
  margin_percent: z.number().optional(),

  value_breakdown: ValueBreakdownSchema,
  validation: FinOpsValidationSchema,
  roi: ROISchema.optional(),

  risk_elaboration: z.array(RiskElaborationSchema).optional(),
  sources: z.array(SourceTrackingSchema).optional(),
});

export type FinOps = z.infer<typeof FinOpsSchema>;

// =============================================================================
// Complete Estimate Output Schema
// =============================================================================

export const EstimateOutputSchema = z.object({
  // Core Sections
  effort: EffortSchema,
  cost: CostSchema,
  milestones: z.array(MilestoneSchema).default([]),
  tier: TierSchema.optional(),

  // Financial Operations
  finops: FinOpsSchema,

  // Retainer
  retainer: z.object({
    recommended: z.boolean().optional(),
    tier: z.string().optional(),
    monthly_rate: z.number().nonnegative().optional(),
    hours_included: z.number().nonnegative().optional(),
    rationale: z.string().optional(),
  }).optional(),

  // Risk Analysis
  risk_analysis: z.object({
    risk_score: z.number().min(1).max(10).optional(),
    reward_score: z.number().min(1).max(10).optional(),
    ratio: z.number().optional(),
    ratio_display: z.string().optional(),
    verdict: z.string().optional(),
    factors: z.object({
      integration_count: z.number().optional(),
      risk_factor_count: z.number().optional(),
      total_hours: z.number().optional(),
      risk_multiplier: z.number().optional(),
      roi_percent: z.number().optional(),
      payback_months: z.number().optional(),
      annual_value: z.number().optional(),
    }).optional(),
  }).optional(),

  // Commercial Terms
  commercial: z.object({
    pricing_model: z.string().optional(),
    subscription_price: z.number().optional(),
    processes_included: z.number().optional(),
    ad_hoc_rate: z.number().optional(),
    payment_terms: z.object({
      structure: z.string().optional(),
      upfront_percent: z.number().optional(),
      final_percent: z.number().optional(),
      final_trigger: z.string().optional(),
    }).optional(),
    licensing: z.object({
      infrastructure: z.string().optional(),
      data_ownership: z.string().optional(),
      exportable: z.boolean().optional(),
    }).optional(),
  }).optional(),

  // Metadata
  est_days: z.number().nonnegative().optional(),
  model: z.string().optional(),
  baseline: z.object({
    integration_hours: z.number().optional(),
    architecture_hours: z.number().optional(),
    total_baseline: z.number().optional(),
    breakdown: z.array(z.object({
      system: z.string(),
      hours: z.number(),
      source: z.string().optional(),
      complexity: z.number().optional(),
    })).optional(),
    rationale: z.string().optional(),
  }).optional(),
});

export type EstimateOutput = z.infer<typeof EstimateOutputSchema>;
