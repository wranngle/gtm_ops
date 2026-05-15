/**
 * Research Schema - Integration research from cache/LLM
 * @module lib/schemas/research.schema
 */

import { type } from 'arktype';
import { ComplexityTierSchema, CitationSchema } from './common.schema.js';

// =============================================================================
// Integration Summary (from research table)
// =============================================================================

export const IntegrationSummarySchema = type({
  name: 'string',
  has_native_node: type('boolean').default(false),
  'auth_type?': 'string',
  'docs_available?': 'boolean',
  'confidence?': '0 <= number <= 1 | null',
});

export type IntegrationSummary = typeof IntegrationSummarySchema.infer;

// =============================================================================
// Integration Detail
// =============================================================================

export const IntegrationDetailSchema = type({
  name: 'string',
  native_node: type('boolean').default(false),
  'native_node_info?': 'string',
  'native_node_name?': 'string',
  'auth?': 'string',
  'auth_type?': 'string',
  gotchas: type('string[]').default(() => []),
  'rate_limits?': 'string | null',
  client_must_provide: type('string[]').default(() => []),
  'complexity_score?': '1 <= number <= 10',
  'complexity_tier?': ComplexityTierSchema,
  'api_reference?': 'string | null',
  'integration_pattern?': 'string',
  'operations?': 'string[] | null',
  citations: type('string[]').default(() => []),
  'api_quality?': "'excellent' | 'good' | 'fair' | 'poor'",
});

export type IntegrationDetail = typeof IntegrationDetailSchema.infer;

// =============================================================================
// Complexity Assessment
// =============================================================================

export const ComplexitySchema = type({
  score: '0 <= number <= 10',
  tier: ComplexityTierSchema,
  factors: type('string[]').default(() => []),
  'estimated_nodes?': 'number >= 0',
});

export type Complexity = typeof ComplexitySchema.infer;

// =============================================================================
// Labor Factor
// =============================================================================

export const LaborFactorSchema = type({
  factor: 'string',
  impact: 'string',
  'notes?': 'string',
});

export type LaborFactor = typeof LaborFactorSchema.infer;

// =============================================================================
// Risk Item
// =============================================================================

export const RiskItemSchema = type({
  risk: 'string',
  'likelihood?': 'string',
  'impact?': 'string',
  'mitigation?': 'string',
});

export type RiskItem = typeof RiskItemSchema.infer;

// =============================================================================
// Effort Recommendation
// =============================================================================

export const EffortRecommendationSchema = type({
  tier: ComplexityTierSchema,
  'rationale?': 'string',
  base_hours: 'number >= 0',
  caveats: type('string[]').default(() => []),
});

export type EffortRecommendation = typeof EffortRecommendationSchema.infer;

// =============================================================================
// Freshness Score
// =============================================================================

export const FreshnessSchema = type({
  stale: 'boolean',
  days: 'number >= 0',
  score: '0 <= number <= 1',
  'reason?': 'string',
});

export type Freshness = typeof FreshnessSchema.infer;

// =============================================================================
// Complete Research Result
// =============================================================================

export const ResearchResultSchema = type({
  'title?': 'string',
  'business_process?': 'string',
  'research_date?': 'string',
  'confidence?': '0 <= number <= 1',
  'executive_summary?': 'string',
  integrations: type(IntegrationSummarySchema, '[]').default(() => []),
  'integration_details?': type('Record<string, unknown>'),
  'complexity?': ComplexitySchema,
  labor_factors: type(LaborFactorSchema, '[]').default(() => []),
  risks: type(RiskItemSchema, '[]').default(() => []),
  'effort_recommendation?': EffortRecommendationSchema,
  citations: type(CitationSchema, '[]').default(() => []),
  'source_file?': 'string',
  'freshness?': FreshnessSchema,
  from_cache: type('boolean').default(false),
  from_db: type('boolean').default(false),
  generated: type('boolean').default(false),
});

export type ResearchResult = typeof ResearchResultSchema.infer;

// =============================================================================
// Integration Research Item (per-integration wrapper)
// =============================================================================

export const IntegrationResearchItemSchema = type({
  integration: 'string',
  'system?': 'string',
  found: type('boolean').default(false),
  'research?': ResearchResultSchema,
  'has_native_n8n_node?': 'boolean',
  'native_node_name?': 'string | null',
  'auth_type?': 'string',
  'api_quality?': "'excellent' | 'good' | 'fair' | 'poor'",
  'complexity?': ComplexitySchema,
  'effort_recommendation?': EffortRecommendationSchema,
  'gotchas?': 'string[]',
  'client_must_provide?': 'string[]',
  'citations?': CitationSchema.array(),
  'freshness?': FreshnessSchema,
  'from_cache?': 'boolean',
});

export type IntegrationResearchItem = typeof IntegrationResearchItemSchema.infer;

// =============================================================================
// Tier Assessment
// =============================================================================

export const TierAssessmentSchema = type({
  key: ComplexityTierSchema,
  label: 'string',
  base_hours: 'number >= 0',
  risk_multiplier: type('1 <= number <= 2').default(1),
  'rationale?': 'string',
  'integration_count?': 'number >= 0',
  'complexity_score?': '0 <= number <= 10',
});

export type TierAssessment = typeof TierAssessmentSchema.infer;

// =============================================================================
// Research Gap Report
// =============================================================================

export const ResearchGapReportSchema = type({
  fresh: type('string[]').default(() => []),
  stale: type('string[]').default(() => []),
  missing: type('string[]').default(() => []),
  actionable_commands: type('string[]').default(() => []),
  'summary?': 'string',
});

export type ResearchGapReport = typeof ResearchGapReportSchema.infer;
