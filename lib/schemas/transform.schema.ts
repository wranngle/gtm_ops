/**
 * Transform Schema - Template context for Mustache rendering
 * @module lib/schemas/transform.schema
 */

import { type } from 'arktype';

// =============================================================================
// Project Identity
// =============================================================================

export const ProjectIdentitySchema = type({
  client_name: 'string',
  process_name: 'string',
  'friendly_name?': 'string',
  document_slug: 'string',
  process_date_display: 'string',
  'valid_until_display?': 'string',
  year: 'number',
});

export type ProjectIdentity = typeof ProjectIdentitySchema.infer;

// =============================================================================
// Technical Approach
// =============================================================================

export const TechStackItemSchema = type({
  name: 'string',
  'type?': 'string',
  'version?': 'string',
});

export type TechStackItem = typeof TechStackItemSchema.infer;

export const IntegrationRowSchema = type({
  system: 'string',
  'type?': 'string',
  'complexity?': 'string',
  'complexity_score?': 'number',
  'has_native_node?': 'boolean',
  'native_node_name?': 'string',
  'notes?': 'string',
});

export type IntegrationRow = typeof IntegrationRowSchema.infer;

const LaborFactorSchema = type({
  factor: 'string',
  impact: 'string',
  'notes?': 'string',
});

const TechCitationSchema = type({
  'id?': 'number',
  url: 'string',
  'type?': 'string',
});

export const TechnicalApproachSchema = type({
  'summary?': 'string',
  technology_stack: type(TechStackItemSchema, '[]').default(() => []),
  integrations: type(IntegrationRowSchema, '[]').default(() => []),
  labor_factors: type(LaborFactorSchema, '[]').default(() => []),
  citations: type(TechCitationSchema, '[]').default(() => []),
});

export type TechnicalApproach = typeof TechnicalApproachSchema.infer;

// =============================================================================
// Scorecard Row (AI Audit)
// =============================================================================

export const ScorecardRowSchema = type({
  name: 'string',
  status: "'healthy' | 'warning' | 'critical'",
  'status_is_critical?': 'boolean',
  'status_is_warning?': 'boolean',
  'status_is_healthy?': 'boolean',
  'value?': 'string',
  'value_display?': 'string',
  'has_metrics?': 'boolean',
  'description?': 'string',
});

export type ScorecardRow = typeof ScorecardRowSchema.infer;

// =============================================================================
// Rendering Metadata
// =============================================================================

export const RenderingSchema = type({
  is_conversion_mode: type('boolean').default(false),
  is_efficiency_mode: type('boolean').default(true),
  show_roi_section: type('boolean').default(true),
  show_payment_schedule: type('boolean').default(true),
  show_risk_section: type('boolean').default(true),
});

export type Rendering = typeof RenderingSchema.infer;

// =============================================================================
// Payment Schedule Item
// =============================================================================

export const PaymentScheduleItemSchema = type({
  name: 'string',
  percentage: '0 <= number <= 1',
  percentage_display: 'string',
  amount: 'number >= 0',
  amount_display: 'string',
  'trigger?': 'string',
});

export type PaymentScheduleItem = typeof PaymentScheduleItemSchema.infer;

// =============================================================================
// Neural Ops Tier (Proposal)
// =============================================================================

export const NeuralOpsTierSchema = type({
  name: 'string',
  price: 'number >= 0',
  price_display: 'string',
  hours: 'number >= 0',
  features: type('string[]').default(() => []),
  is_recommended: type('boolean').default(false),
});

export type NeuralOpsTier = typeof NeuralOpsTierSchema.infer;

// =============================================================================
// Complete Transform Context (kept loose — Mustache renderer accepts unknown extras)
// =============================================================================

const ScorecardSchema = type({
  rows: type(ScorecardRowSchema, '[]').default(() => []),
  'summary?': 'string',
});

const BleedTotalInner = type({
  value: 'number',
  display: 'string',
});

const BleedCalcInner = type({
  label: 'string',
  'formula?': 'string',
  result_display: 'string',
});

const BleedSchema = type({
  'period?': 'string',
  'period_display?': 'string',
  'total?': BleedTotalInner,
  'calculations?': BleedCalcInner.array(),
});

const MilestoneInner = type({
  number: 'string',
  name: 'string',
  'description?': 'string',
  'deliverables?': 'string[]',
  'hours_display?': 'string',
  'duration_display?': 'string',
});

const TimelineSchema = type({
  'start_date?': 'string',
  'end_date?': 'string',
  'total_days?': 'number',
  'total_days_display?': 'string',
});

const PricingSchema = type({
  'subtotal?': 'number',
  'subtotal_display?': 'string',
  'contingency?': 'number',
  'contingency_display?': 'string',
  'total?': 'number',
  'total_display?': 'string',
});

const ValueBreakdownInner = type({
  'annual?': 'number',
  'annual_display?': 'string',
  'monthly?': 'number',
  'monthly_display?': 'string',
});

const ValidationGate = type({ passes: 'boolean' });

const RoiSchema = type({
  'payback_months?': 'number',
  'payback_display?': 'string',
  'annual_roi?': 'number',
  'annual_roi_display?': 'string',
  'annual_value?': 'number',
  'annual_value_display?': 'string',
  'value_breakdown?': type({
    'hard_savings?': ValueBreakdownInner,
    'modeled_opportunity?': ValueBreakdownInner,
    'total_annual_value?': 'number',
    'total_annual_display?': 'string',
  }),
  'validation?': type({
    'all_pass?': 'boolean',
    'profit_floor?': ValidationGate,
    'hard_floor?': ValidationGate,
    'payback_check?': ValidationGate,
  }),
});

const ScopeBoundariesSchema = type({
  in_scope: type('string[]').default(() => []),
  out_of_scope: type('string[]').default(() => []),
  assumptions: type('string[]').default(() => []),
  dependencies: type('string[]').default(() => []),
});

const RiskSchema = type({
  risk: 'string',
  'likelihood?': 'string',
  'impact?': 'string',
  'mitigation?': 'string',
  'is_high?': 'boolean',
});

export const TransformContextSchema = type({
  identity: ProjectIdentitySchema,
  'shared_css?': 'string',
  'unified_header_html?': 'string',
  'unified_footer_html?': 'string',
  'rendering?': RenderingSchema,
  'scorecard?': ScorecardSchema,
  'bleed?': BleedSchema,
  'executive_summary?': 'string',
  'recommendations?': 'string[]',
  'milestones?': MilestoneInner.array(),
  'timeline?': TimelineSchema,
  'pricing?': PricingSchema,
  'payment_schedule?': PaymentScheduleItemSchema.array(),
  'roi?': RoiSchema,
  'neural_ops_tiers?': NeuralOpsTierSchema.array(),
  'scope_boundaries?': ScopeBoundariesSchema,
  'technical_approach?': TechnicalApproachSchema,
  'risks?': RiskSchema.array(),
  '_has_savings?': 'boolean',
  '_has_opportunity?': 'boolean',
  '_has_risks?': 'boolean',
  '_has_integrations?': 'boolean',
});

export type TransformContext = typeof TransformContextSchema.infer;
