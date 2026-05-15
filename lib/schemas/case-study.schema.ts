/**
 * Case Study Schema - Ground truth for pipeline evaluation
 * @module lib/schemas/case-study.schema
 *
 * Defines the structure for real-world AI voice agent case studies
 * used to evaluate and improve the presales pipeline.
 *
 * Case studies are split into:
 * - PROBLEM: Masked input shown to pipeline (no solution hints)
 * - SOLUTION: Ground truth hidden during evaluation
 * - META: Corpus management data
 */

import { type } from 'arktype';

// =============================================================================
// Source Tracking
// =============================================================================

export const VendorSchema = type(
  "'vapi' | 'retell' | 'bland' | 'synthflow' | 'air' | 'playht' | 'voiceflow' | 'elevenlabs' | 'other'",
);

export type Vendor = typeof VendorSchema.infer;

export const CaseStudySourceSchema = type({
  vendor: VendorSchema,
  url: 'string.url',
  'title?': 'string',
  'published_date?': 'string',
});

export type CaseStudySource = typeof CaseStudySourceSchema.infer;

// =============================================================================
// PROBLEM Section
// =============================================================================

// `passthrough()` zod equivalent: ArkType objects allow extra keys by default
// when not declared with `+reject` mode, which matches the prior intent.
export const VolumeMetricsSchema = type({
  'calls_per_month?': 'number | null',
  'calls_per_day?': 'number | null',
  'avg_call_duration_minutes?': 'number | null',
  'staff_hours_per_month?': 'number | null',
  'items_processed_per_month?': 'number | null',
  'items_processed_per_week?': 'number | null',
  'items_processed_per_year?': 'number | null',
  'raw_description?': 'string | null',
  '[string]': 'unknown',
});

export type VolumeMetrics = typeof VolumeMetricsSchema.infer;

export const CaseStudyProblemSchema = type({
  industry: 'string',
  'company_size?': 'string',
  'company_type?': 'string',
  pain_points: 'string[] >= 1',
  'volume_metrics?': VolumeMetricsSchema,
  systems_involved: type('string[]').default(() => []),
  goals: 'string[] >= 1',
  'constraints?': 'string[]',
  'timeline_pressure?': 'string',
});

export type CaseStudyProblem = typeof CaseStudyProblemSchema.infer;

// =============================================================================
// SOLUTION Section
// =============================================================================

export const AgentTypeSchema = type("'inbound' | 'outbound' | 'hybrid'");
export type AgentType = typeof AgentTypeSchema.infer;

export const SolutionIntegrationSchema = type({
  system_name: 'string',
  'integration_type?': "'api' | 'webhook' | 'native' | 'custom' | 'unknown'",
  'purpose?': 'string',
});

export type SolutionIntegration = typeof SolutionIntegrationSchema.infer;

export const PricingModelSchema = type({
  model_type: "'one_time' | 'monthly' | 'per_minute' | 'hybrid' | 'unknown' | 'enterprise'",
  'total_cost?': 'number | null',
  'monthly_cost?': 'number | null',
  'setup_cost?': 'number | null',
  'per_minute_rate?': 'number | null',
  'raw_description?': 'string | null',
});

export type PricingModel = typeof PricingModelSchema.infer;

export const ROIMetricsSchema = type({
  'hours_saved_per_month?': 'number | null',
  'hours_saved_total?': 'number | null',
  'calls_automated_percent?': 'number | null',
  'monthly_savings?': 'number | null',
  'annual_savings?': 'number | null',
  'revenue_increase_percent?': 'number | null',
  'conversion_rate_improvement?': 'number | null',
  'customer_satisfaction_improvement?': 'string | null',
  'staff_reduction_percent?': 'number | null',
  'efficiency_multiplier?': 'number | null',
  'payback_period_weeks?': 'number | null',
  'payback_period_months?': 'number | null',
  'raw_description?': 'string | null',
  '[string]': 'unknown',
});

export type ROIMetrics = typeof ROIMetricsSchema.infer;

export const CaseStudySolutionSchema = type({
  agent_type: AgentTypeSchema,
  'voice_provider?': 'string',
  integrations: type(SolutionIntegrationSchema, '[]').default(() => []),
  'pricing_model?': PricingModelSchema,
  'timeline_weeks?': 'number | null',
  'implementation_phases?': 'string[]',
  'roi_achieved?': ROIMetricsSchema,
  key_features: type('string[]').default(() => []),
  'inferred_tier?': "'lite' | 'standard' | 'enterprise' | 'flagship'",
});

export type CaseStudySolution = typeof CaseStudySolutionSchema.infer;

// =============================================================================
// META Section
// =============================================================================

export const QualityScoreSchema = type('1 <= number.integer <= 5');

// 33-element string union exceeds ArkType's literal-union recursion budget at
// typecheck. Domain tags are validated as plain strings (the union with `string`
// in DomainTagSchema absorbed the literal members anyway); the canonical tag list
// is documented here for reference / authoring.
export const KNOWN_DOMAIN_TAGS = [
  'dental', 'medical', 'veterinary', 'real-estate', 'insurance', 'automotive',
  'home-services', 'hospitality', 'retail', 'financial-services', 'legal',
  'education', 'technology', 'logistics', 'healthcare', 'scheduling',
  'lead-qualification', 'customer-support', 'collections', 'surveys',
  'appointment-reminders', 'after-hours', 'onboarding', 'admissions', 'outbound',
  'sales-automation', 'sms-integration', 'crm-integration', 'calendar-integration',
  'payment-integration', 'high-volume', 'multilingual', 'compliance', 'omnichannel',
] as const;

export type KnownDomainTag = (typeof KNOWN_DOMAIN_TAGS)[number];

export const KnownDomainTagSchema = type('string').narrow((v: string, ctx: any) =>
  (KNOWN_DOMAIN_TAGS as readonly string[]).includes(v) || ctx.reject(`one of ${KNOWN_DOMAIN_TAGS.join(', ')}`),
);

// DomainTag is "known tag OR any string" — collapses to `string` at the type
// level since unions with `string` absorb literal members. Validation accepts
// either form at runtime.
export const DomainTagSchema = type('string');

export type DomainTag = typeof DomainTagSchema.infer;

export const CaseStudyMetaSchema = type({
  quality_score: QualityScoreSchema,
  'quality_notes?': 'string',
  domain_tags: type('string[]').default(() => []),
  custom_tags: type('string[]').default(() => []),
  holdout: type('boolean').default(false),
  'harvested_by?': 'string',
  'reviewed_by?': 'string',
  'reviewed_at?': 'string',
});

export type CaseStudyMeta = typeof CaseStudyMetaSchema.infer;

// =============================================================================
// Complete Case Study Schema
// =============================================================================

const CASE_STUDY_ID_PATTERN = /^[a-z\d-]+$/;

export const CaseStudySchema = type({
  id: type('string').narrow((id, ctx) =>
    CASE_STUDY_ID_PATTERN.test(id) || ctx.reject('a kebab/digit lowercase id'),
  ),
  source: CaseStudySourceSchema,
  harvested_at: 'string',
  problem: CaseStudyProblemSchema,
  solution: CaseStudySolutionSchema,
  meta: CaseStudyMetaSchema,
});

export type CaseStudy = typeof CaseStudySchema.infer;

// =============================================================================
// Partial Schemas for Creation/Update
// =============================================================================

export const CreateCaseStudySchema = type({
  'id?': type('string').narrow((id, ctx) =>
    CASE_STUDY_ID_PATTERN.test(id) || ctx.reject('a kebab/digit lowercase id'),
  ),
  source: CaseStudySourceSchema,
  problem: CaseStudyProblemSchema,
  solution: CaseStudySolutionSchema,
  meta: CaseStudyMetaSchema,
});

export type CreateCaseStudy = typeof CreateCaseStudySchema.infer;

export const UpdateCaseStudyMetaSchema = CaseStudyMetaSchema.partial();

export type UpdateCaseStudyMeta = typeof UpdateCaseStudyMetaSchema.infer;

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateCaseStudy(data: unknown): {
  success: boolean;
  data?: CaseStudy;
  errors?: string[];
} {
  const result = CaseStudySchema(data);

  if (!(result instanceof type.errors)) {
    return { success: true, data: result };
  }

  return {
    success: false,
    errors: [...result].map((issue: any) =>
      `${Array.isArray(issue.path) ? issue.path.join('.') : issue.path ?? ''}: ${issue.message ?? String(issue)}`),
  };
}

export function generateCaseStudyId(
  vendor: Vendor,
  industry: string,
  index: number,
): string {
  const sanitizedIndustry = industry
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 20);

  return `${vendor}-${sanitizedIndustry}-${String(index).padStart(3, '0')}`;
}
