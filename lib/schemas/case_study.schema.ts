/**
 * Case Study Schema - Ground truth for pipeline evaluation
 * @module lib/schemas/case_study.schema
 *
 * Defines the structure for real-world AI voice agent case studies
 * used to evaluate and improve the presales pipeline.
 *
 * Case studies are split into:
 * - PROBLEM: Masked input shown to pipeline (no solution hints)
 * - SOLUTION: Ground truth hidden during evaluation
 * - META: Corpus management data
 */

import { z } from 'zod';

// =============================================================================
// Source Tracking
// =============================================================================

/**
 * Known AI voice agent vendors we harvest case studies from
 */
export const VendorSchema = z.enum([
  'vapi',
  'retell',
  'bland',
  'synthflow',
  'air',
  'playht',
  'voiceflow',
  'elevenlabs',
  'other',
]);

export type Vendor = z.infer<typeof VendorSchema>;

/**
 * Source information for audit trail
 */
export const CaseStudySourceSchema = z.object({
  vendor: VendorSchema,
  url: z.string().url(),
  title: z.string().optional(),
  published_date: z.string().optional(), // ISO date if available
});

export type CaseStudySource = z.infer<typeof CaseStudySourceSchema>;

// =============================================================================
// PROBLEM Section (Masked - shown to pipeline)
// =============================================================================

/**
 * Volume metrics extracted from case study
 */
export const VolumeMetricsSchema = z.object({
  calls_per_month: z.number().nullable().optional(),
  calls_per_day: z.number().nullable().optional(),
  avg_call_duration_minutes: z.number().nullable().optional(),
  staff_hours_per_month: z.number().nullable().optional(),
  items_processed_per_month: z.number().nullable().optional(),
  items_processed_per_week: z.number().nullable().optional(),
  items_processed_per_year: z.number().nullable().optional(),
  // Raw text if numbers aren't extractable
  raw_description: z.string().nullable().optional(),
}).passthrough(); // Allow additional volume metrics

export type VolumeMetrics = z.infer<typeof VolumeMetricsSchema>;

/**
 * PROBLEM section - What the client faced BEFORE the solution.
 * This is transformed to intake format and fed to pipeline.
 * MUST NOT contain any solution hints.
 */
export const CaseStudyProblemSchema = z.object({
  // Client context
  industry: z.string(),
  company_size: z.string().optional(), // e.g., "45 employees", "mid-market"
  company_type: z.string().optional(), // e.g., "veterinary clinic", "dental practice"

  // Pain points (specific, quantified where possible)
  pain_points: z.array(z.string()).min(1),

  // Volume/scale
  volume_metrics: VolumeMetricsSchema.optional(),

  // Systems already in use
  systems_involved: z.array(z.string()).default([]),

  // What they wanted to achieve
  goals: z.array(z.string()).min(1),

  // Additional context that doesn't reveal solution
  constraints: z.array(z.string()).optional(), // e.g., "must integrate with existing CRM"
  timeline_pressure: z.string().optional(), // e.g., "needed solution within 30 days"
});

export type CaseStudyProblem = z.infer<typeof CaseStudyProblemSchema>;

// =============================================================================
// SOLUTION Section (Ground Truth - hidden during evaluation)
// =============================================================================

/**
 * Type of AI voice agent deployed
 */
export const AgentTypeSchema = z.enum(['inbound', 'outbound', 'hybrid']);

export type AgentType = z.infer<typeof AgentTypeSchema>;

/**
 * Integration in the solution
 */
export const SolutionIntegrationSchema = z.object({
  system_name: z.string(),
  integration_type: z.enum(['api', 'webhook', 'native', 'custom', 'unknown']).optional(),
  purpose: z.string().optional(), // e.g., "appointment scheduling"
});

export type SolutionIntegration = z.infer<typeof SolutionIntegrationSchema>;

/**
 * Pricing model if disclosed
 */
export const PricingModelSchema = z.object({
  model_type: z.enum(['one_time', 'monthly', 'per_minute', 'hybrid', 'unknown', 'enterprise']),
  total_cost: z.number().nullable().optional(),
  monthly_cost: z.number().nullable().optional(),
  setup_cost: z.number().nullable().optional(),
  per_minute_rate: z.number().nullable().optional(),
  // Raw text if structured pricing not available
  raw_description: z.string().nullable().optional(),
});

export type PricingModel = z.infer<typeof PricingModelSchema>;

/**
 * ROI metrics achieved
 */
export const ROIMetricsSchema = z.object({
  // Time savings
  hours_saved_per_month: z.number().nullable().optional(),
  hours_saved_total: z.number().nullable().optional(),
  calls_automated_percent: z.number().nullable().optional(),

  // Cost savings
  monthly_savings: z.number().nullable().optional(),
  annual_savings: z.number().nullable().optional(),

  // Business impact
  revenue_increase_percent: z.number().nullable().optional(),
  conversion_rate_improvement: z.number().nullable().optional(),
  customer_satisfaction_improvement: z.string().nullable().optional(),
  staff_reduction_percent: z.number().nullable().optional(),
  efficiency_multiplier: z.number().nullable().optional(),

  // Payback
  payback_period_weeks: z.number().nullable().optional(),
  payback_period_months: z.number().nullable().optional(),

  // Raw text if structured metrics not available
  raw_description: z.string().nullable().optional(),
}).passthrough(); // Allow additional ROI fields

export type ROIMetrics = z.infer<typeof ROIMetricsSchema>;

/**
 * SOLUTION section - What was actually implemented.
 * This is the ground truth we compare pipeline output against.
 */
export const CaseStudySolutionSchema = z.object({
  // Agent configuration
  agent_type: AgentTypeSchema,
  voice_provider: z.string().optional(), // e.g., "ElevenLabs", "PlayHT"

  // Integrations built
  integrations: z.array(SolutionIntegrationSchema).default([]),

  // Pricing (if disclosed)
  pricing_model: PricingModelSchema.optional(),

  // Timeline
  timeline_weeks: z.number().nullable().optional(),
  implementation_phases: z.array(z.string()).optional(),

  // ROI achieved
  roi_achieved: ROIMetricsSchema.optional(),

  // Key features of the solution
  key_features: z.array(z.string()).default([]),

  // Tier equivalent (our assessment of complexity)
  inferred_tier: z.enum(['lite', 'standard', 'enterprise', 'flagship']).optional(),
});

export type CaseStudySolution = z.infer<typeof CaseStudySolutionSchema>;

// =============================================================================
// META Section (Corpus Management)
// =============================================================================

/**
 * Quality score for case study completeness
 * 1 = minimal info, 5 = highly detailed with metrics
 */
export const QualityScoreSchema = z.number().int().min(1).max(5);

/**
 * Known domain tags for filtering and analysis
 */
export const KnownDomainTagSchema = z.enum([
  // Industries
  'dental',
  'medical',
  'veterinary',
  'real-estate',
  'insurance',
  'automotive',
  'home-services',
  'hospitality',
  'retail',
  'financial-services',
  'legal',
  'education',
  'technology',
  'logistics',
  'healthcare',
  // Use cases
  'scheduling',
  'lead-qualification',
  'customer-support',
  'collections',
  'surveys',
  'appointment-reminders',
  'after-hours',
  'onboarding',
  'admissions',
  'outbound',
  'sales-automation',
  // Technical
  'sms-integration',
  'crm-integration',
  'calendar-integration',
  'payment-integration',
  'high-volume',
  'multilingual',
  'compliance',
  'omnichannel',
]);

/**
 * Domain tags - allows known tags or any custom string
 */
export const DomainTagSchema = z.union([KnownDomainTagSchema, z.string()]);

export type DomainTag = z.infer<typeof DomainTagSchema>;

/**
 * META section - For corpus management
 */
export const CaseStudyMetaSchema = z.object({
  // Quality assessment
  quality_score: QualityScoreSchema,
  quality_notes: z.string().optional(), // Why this score

  // Categorization
  domain_tags: z.array(DomainTagSchema).default([]),
  custom_tags: z.array(z.string()).default([]), // Free-form tags

  // Evaluation control
  holdout: z.boolean().default(false), // Reserved for final validation

  // Audit trail
  harvested_by: z.string().optional(), // Who added this
  reviewed_by: z.string().optional(), // Who validated
  reviewed_at: z.string().optional(), // ISO timestamp
});

export type CaseStudyMeta = z.infer<typeof CaseStudyMetaSchema>;

// =============================================================================
// Complete Case Study Schema
// =============================================================================

/**
 * Complete case study with PROBLEM, SOLUTION, and META sections
 */
export const CaseStudySchema = z.object({
  // Identity
  id: z.string().regex(/^[a-z\d-]+$/), // e.g., "vapi-dental-scheduling-001"

  // Source tracking
  source: CaseStudySourceSchema,
  harvested_at: z.string(), // ISO timestamp

  // Core data (explicit separation)
  problem: CaseStudyProblemSchema,
  solution: CaseStudySolutionSchema,
  meta: CaseStudyMetaSchema,
});

export type CaseStudy = z.infer<typeof CaseStudySchema>;

// =============================================================================
// Partial Schemas for Creation/Update
// =============================================================================

/**
 * Schema for creating a new case study (id and timestamps auto-generated)
 */
export const CreateCaseStudySchema = CaseStudySchema.omit({
  id: true,
  harvested_at: true,
}).extend({
  id: z.string().regex(/^[a-z\d-]+$/).optional(),
});

export type CreateCaseStudy = z.infer<typeof CreateCaseStudySchema>;

/**
 * Schema for updating case study meta only
 */
export const UpdateCaseStudyMetaSchema = CaseStudyMetaSchema.partial();

export type UpdateCaseStudyMeta = z.infer<typeof UpdateCaseStudyMetaSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validates a case study and returns typed result
 */
export function validateCaseStudy(data: unknown): {
  success: boolean;
  data?: CaseStudy;
  errors?: string[];
} {
  const result = CaseStudySchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    ),
  };
}

/**
 * Generates a case study ID from source info
 */
export function generateCaseStudyId(
  vendor: Vendor,
  industry: string,
  index: number
): string {
  const sanitizedIndustry = industry
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 20);

  return `${vendor}-${sanitizedIndustry}-${String(index).padStart(3, '0')}`;
}
