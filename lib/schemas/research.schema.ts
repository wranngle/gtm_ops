/**
 * Research Schema - Integration research from cache/LLM
 * @module lib/schemas/research.schema
 */

import { z } from 'zod';
import { ComplexityTierSchema, CitationSchema } from './common.schema.js';

// =============================================================================
// Integration Summary (from research table)
// =============================================================================

export const IntegrationSummarySchema = z.object({
  name: z.string(),
  has_native_node: z.boolean().default(false),
  auth_type: z.string().optional(),
  docs_available: z.boolean().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export type IntegrationSummary = z.infer<typeof IntegrationSummarySchema>;

// =============================================================================
// Integration Detail (rich per-integration info)
// =============================================================================

export const IntegrationDetailSchema = z.object({
  name: z.string(),
  native_node: z.boolean().default(false),
  native_node_info: z.string().optional(),
  native_node_name: z.string().optional(),
  auth: z.string().optional(),
  auth_type: z.string().optional(),
  gotchas: z.array(z.string()).default([]),
  rate_limits: z.string().nullable().optional(),
  client_must_provide: z.array(z.string()).default([]),
  complexity_score: z.number().min(1).max(10).optional(),
  complexity_tier: ComplexityTierSchema.optional(),
  api_reference: z.string().nullable().optional(),
  integration_pattern: z.string().optional(),
  operations: z.array(z.string()).nullable().optional(),
  citations: z.array(z.string()).default([]),
  api_quality: z.enum(['excellent', 'good', 'fair', 'poor']).optional(),
});

export type IntegrationDetail = z.infer<typeof IntegrationDetailSchema>;

// =============================================================================
// Complexity Assessment
// =============================================================================

export const ComplexitySchema = z.object({
  score: z.number().min(0).max(10),
  tier: ComplexityTierSchema,
  factors: z.array(z.string()).default([]),
  estimated_nodes: z.number().nonnegative().optional(),
});

export type Complexity = z.infer<typeof ComplexitySchema>;

// =============================================================================
// Labor Factor
// =============================================================================

export const LaborFactorSchema = z.object({
  factor: z.string(),
  impact: z.string(),
  notes: z.string().optional(),
});

export type LaborFactor = z.infer<typeof LaborFactorSchema>;

// =============================================================================
// Risk Item
// =============================================================================

export const RiskItemSchema = z.object({
  risk: z.string(),
  likelihood: z.string().optional(),
  impact: z.string().optional(),
  mitigation: z.string().optional(),
});

export type RiskItem = z.infer<typeof RiskItemSchema>;

// =============================================================================
// Effort Recommendation
// =============================================================================

export const EffortRecommendationSchema = z.object({
  tier: ComplexityTierSchema,
  rationale: z.string().optional(),
  base_hours: z.number().nonnegative(),
  caveats: z.array(z.string()).default([]),
});

export type EffortRecommendation = z.infer<typeof EffortRecommendationSchema>;

// =============================================================================
// Freshness Score
// =============================================================================

export const FreshnessSchema = z.object({
  stale: z.boolean(),
  days: z.number().nonnegative(),
  score: z.number().min(0).max(1),
  reason: z.string().optional(),
});

export type Freshness = z.infer<typeof FreshnessSchema>;

// =============================================================================
// Complete Research Result
// =============================================================================

export const ResearchResultSchema = z.object({
  // Identification
  title: z.string().optional(),
  business_process: z.string().optional(),
  research_date: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  executive_summary: z.string().optional(),

  // Integrations
  integrations: z.array(IntegrationSummarySchema).default([]),
  integration_details: z.record(z.string(), IntegrationDetailSchema).optional(),

  // Assessment
  complexity: ComplexitySchema.optional(),
  labor_factors: z.array(LaborFactorSchema).default([]),
  risks: z.array(RiskItemSchema).default([]),
  effort_recommendation: EffortRecommendationSchema.optional(),

  // Citations
  citations: z.array(CitationSchema).default([]),

  // Metadata
  source_file: z.string().optional(),
  freshness: FreshnessSchema.optional(),
  from_cache: z.boolean().default(false),
  from_db: z.boolean().default(false),
  generated: z.boolean().default(false),
});

export type ResearchResult = z.infer<typeof ResearchResultSchema>;

// =============================================================================
// Integration Research Item (per-integration wrapper)
// =============================================================================

export const IntegrationResearchItemSchema = z.object({
  integration: z.string(),
  system: z.string().optional(),
  found: z.boolean().default(false),
  research: ResearchResultSchema.optional(),
  // Flat fields for backward compatibility
  has_native_n8n_node: z.boolean().optional(),
  native_node_name: z.string().nullable().optional(),
  auth_type: z.string().optional(),
  api_quality: z.enum(['excellent', 'good', 'fair', 'poor']).optional(),
  complexity: ComplexitySchema.optional(),
  effort_recommendation: EffortRecommendationSchema.optional(),
  gotchas: z.array(z.string()).optional(),
  client_must_provide: z.array(z.string()).optional(),
  citations: z.array(CitationSchema).optional(),
  freshness: FreshnessSchema.optional(),
  from_cache: z.boolean().optional(),
});

export type IntegrationResearchItem = z.infer<typeof IntegrationResearchItemSchema>;

// =============================================================================
// Tier Assessment
// =============================================================================

export const TierAssessmentSchema = z.object({
  key: ComplexityTierSchema,
  label: z.string(),
  base_hours: z.number().nonnegative(),
  risk_multiplier: z.number().min(1).max(2).default(1),
  rationale: z.string().optional(),
  integration_count: z.number().nonnegative().optional(),
  complexity_score: z.number().min(0).max(10).optional(),
});

export type TierAssessment = z.infer<typeof TierAssessmentSchema>;

// =============================================================================
// Research Gap Report
// =============================================================================

export const ResearchGapReportSchema = z.object({
  fresh: z.array(z.string()).default([]),
  stale: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
  actionable_commands: z.array(z.string()).default([]),
  summary: z.string().optional(),
});

export type ResearchGapReport = z.infer<typeof ResearchGapReportSchema>;
