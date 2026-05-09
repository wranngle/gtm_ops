/**
 * Evaluation Schema - Pipeline evaluation runs and scoring
 * @module lib/schemas/evaluation.schema
 */

import { type } from 'arktype';

// =============================================================================
// Scoring Dimensions
// =============================================================================

export const DimensionScoreSchema = type({
  dimension:
    "'tier_match' | 'integration_coverage' | 'agent_type_alignment' | 'pricing_reasonableness' | 'timeline_realism' | 'feature_coverage'",
  score: '0 <= number <= 1',
  weight: '0 <= number <= 1',
  weighted_score: 'number',
  rationale: 'string',
  'details?': 'Record<string, unknown>',
});

export type DimensionScore = typeof DimensionScoreSchema.infer;

export const EvaluationScoresSchema = type({
  dimensions: DimensionScoreSchema.array(),
  aggregate_score: '0 <= number <= 100',
  summary: 'string',
  'comparison_data?': type({
    'pipeline_tier?': 'string',
    'ground_truth_tier?': 'string',
    'pipeline_integrations?': 'string[]',
    'ground_truth_integrations?': 'string[]',
    'pipeline_price?': 'number',
    'ground_truth_price?': 'number',
    'pipeline_timeline_weeks?': 'number',
    'ground_truth_timeline_weeks?': 'number',
  }),
});

export type EvaluationScores = typeof EvaluationScoresSchema.infer;

// =============================================================================
// Evaluation Run
// =============================================================================

export const EvaluationStatusSchema = type(
  "'pending' | 'running' | 'completed' | 'failed' | 'skipped'",
);

export type EvaluationStatus = typeof EvaluationStatusSchema.infer;

export const FlawCodeSchema = type(
  "'TIER_UNDERESTIMATE' | 'TIER_OVERESTIMATE' | 'MISSING_INTEGRATION' | 'EXTRA_INTEGRATION' | 'PRICE_TOO_HIGH' | 'PRICE_TOO_LOW' | 'TIMELINE_OPTIMISTIC' | 'TIMELINE_PESSIMISTIC' | 'ROI_INFLATED' | 'ROI_CONSERVATIVE' | 'AGENT_TYPE_MISMATCH' | 'FEATURE_GAP'",
);

export type FlawCode = typeof FlawCodeSchema.infer;

export const EvaluationRunSchema = type({
  id: 'string.uuid',
  case_study_id: 'string',
  pipeline_version: 'string',
  schema_version: type('string').default('1.0.0'),
  status: EvaluationStatusSchema,
  'error_message?': 'string',
  input_json: 'Record<string, unknown>',
  'output_json?': 'Record<string, unknown>',
  'scores?': EvaluationScoresSchema,
  flaws_detected: type(FlawCodeSchema, '[]').default(() => []),
  run_at: 'string',
  'completed_at?': 'string',
  'duration_ms?': 'number',
  triggered_by: type("'manual' | 'batch' | 'ci'").default('manual'),
});

export type EvaluationRun = typeof EvaluationRunSchema.infer;

export const CreateEvaluationRunSchema = type({
  case_study_id: 'string',
  pipeline_version: 'string',
  schema_version: type('string').default('1.0.0'),
  status: EvaluationStatusSchema.default('pending'),
  'error_message?': 'string',
  input_json: 'Record<string, unknown>',
  'output_json?': 'Record<string, unknown>',
  'scores?': EvaluationScoresSchema,
  flaws_detected: type(FlawCodeSchema, '[]').default(() => []),
  'completed_at?': 'string',
  'duration_ms?': 'number',
  triggered_by: type("'manual' | 'batch' | 'ci'").default('manual'),
});

export type CreateEvaluationRun = typeof CreateEvaluationRunSchema.infer;

// =============================================================================
// Flaw Patterns
// =============================================================================

export const FlawSeveritySchema = type("'low' | 'medium' | 'high' | 'critical'");
export type FlawSeverity = typeof FlawSeveritySchema.infer;

export const FlawPatternSchema = type({
  id: 'string.uuid',
  pattern_code: FlawCodeSchema,
  description: 'string',
  business_impact: 'string',
  affected_runs: 'string[]',
  total_evaluations: 'number',
  frequency_percent: 'number',
  severity: FlawSeveritySchema,
  severity_rationale: 'string',
  recommendations: 'string[]',
  'affected_code_paths?': 'string[]',
  first_seen: 'string',
  last_seen: 'string',
  status: type("'active' | 'investigating' | 'fixed' | 'wont_fix'").default('active'),
});

export type FlawPattern = typeof FlawPatternSchema.infer;

// =============================================================================
// Batch Evaluation
// =============================================================================

export const BatchEvaluationSummarySchema = type({
  batch_id: 'string.uuid',
  total_cases: 'number',
  completed: 'number',
  failed: 'number',
  skipped: 'number',
  'mean_score?': 'number',
  'median_score?': 'number',
  'min_score?': 'number',
  'max_score?': 'number',
  'std_dev?': 'number',
  'score_distribution?': type({
    excellent: 'number',
    good: 'number',
    fair: 'number',
    poor: 'number',
  }),
  'top_flaws?': type({
    code: FlawCodeSchema,
    count: 'number',
    percent: 'number',
  }).array(),
  started_at: 'string',
  'completed_at?': 'string',
  'total_duration_ms?': 'number',
  run_ids: 'string[]',
});

export type BatchEvaluationSummary = typeof BatchEvaluationSummarySchema.infer;

// =============================================================================
// Scoring Configuration
// =============================================================================

export const ScoringWeightsSchema = type({
  tier_match: type('number').default(0.2),
  integration_coverage: type('number').default(0.25),
  agent_type_alignment: type('number').default(0.15),
  pricing_reasonableness: type('number').default(0.2),
  timeline_realism: type('number').default(0.1),
  feature_coverage: type('number').default(0.1),
}).narrow((weights, ctx) => {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) >= 0.001) {
    return ctx.reject({ expected: 'weights summing to 1.0', actual: String(sum) });
  }
  return true;
});

export type ScoringWeights = typeof ScoringWeightsSchema.infer;

export const ScoringThresholdsSchema = type({
  pricing_exact_threshold: type('number').default(0.3),
  pricing_acceptable_threshold: type('number').default(0.5),
  timeline_exact_weeks: type('number').default(2),
  timeline_acceptable_weeks: type('number').default(4),
  pattern_min_frequency: type('number').default(0.3),
  pattern_min_samples: type('number').default(5),
});

export type ScoringThresholds = typeof ScoringThresholdsSchema.infer;

export const ScoringConfigSchema = type({
  weights: ScoringWeightsSchema,
  thresholds: ScoringThresholdsSchema,
});

export type ScoringConfig = typeof ScoringConfigSchema.infer;

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateEvaluationRun(data: unknown): {
  success: boolean;
  data?: EvaluationRun;
  errors?: string[];
} {
  const result = EvaluationRunSchema(data);
  if (!(result instanceof type.errors)) {
    return { success: true, data: result };
  }
  return {
    success: false,
    errors: [...result].map((issue: any) =>
      `${Array.isArray(issue.path) ? issue.path.join('.') : issue.path ?? ''}: ${issue.message ?? String(issue)}`),
  };
}

export function validateFlawPattern(data: unknown): {
  success: boolean;
  data?: FlawPattern;
  errors?: string[];
} {
  const result = FlawPatternSchema(data);
  if (!(result instanceof type.errors)) {
    return { success: true, data: result };
  }
  return {
    success: false,
    errors: [...result].map((issue: any) =>
      `${Array.isArray(issue.path) ? issue.path.join('.') : issue.path ?? ''}: ${issue.message ?? String(issue)}`),
  };
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    tier_match: 0.2,
    integration_coverage: 0.25,
    agent_type_alignment: 0.15,
    pricing_reasonableness: 0.2,
    timeline_realism: 0.1,
    feature_coverage: 0.1,
  },
  thresholds: {
    pricing_exact_threshold: 0.3,
    pricing_acceptable_threshold: 0.5,
    timeline_exact_weeks: 2,
    timeline_acceptable_weeks: 4,
    pattern_min_frequency: 0.3,
    pattern_min_samples: 5,
  },
};
