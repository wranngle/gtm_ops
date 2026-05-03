/**
 * Evaluation Schema - Pipeline evaluation runs and scoring
 * @module lib/schemas/evaluation.schema
 *
 * Defines structures for:
 * - Evaluation runs (masked input → pipeline output → comparison)
 * - Multi-dimensional scoring
 * - Flaw pattern detection
 */

import { z } from 'zod';

// =============================================================================
// Scoring Dimensions
// =============================================================================

/**
 * Individual dimension score with rationale
 */
export const DimensionScoreSchema = z.object({
  dimension: z.enum([
    'tier_match',
    'integration_coverage',
    'agent_type_alignment',
    'pricing_reasonableness',
    'timeline_realism',
    'feature_coverage',
  ]),
  score: z.number().min(0).max(1), // 0.0 to 1.0
  weight: z.number().min(0).max(1), // Weight for aggregate
  weighted_score: z.number(), // score * weight
  rationale: z.string(), // Human-readable explanation
  details: z.record(z.unknown()).optional(), // Dimension-specific data
});

export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

/**
 * Complete scoring result for an evaluation
 */
export const EvaluationScoresSchema = z.object({
  // Individual dimensions
  dimensions: z.array(DimensionScoreSchema),

  // Aggregate score (0-100)
  aggregate_score: z.number().min(0).max(100),

  // Summary
  summary: z.string(), // e.g., "Strong tier match, weak pricing accuracy"

  // Comparison data used for scoring
  comparison_data: z.object({
    pipeline_tier: z.string().optional(),
    ground_truth_tier: z.string().optional(),
    pipeline_integrations: z.array(z.string()).optional(),
    ground_truth_integrations: z.array(z.string()).optional(),
    pipeline_price: z.number().optional(),
    ground_truth_price: z.number().optional(),
    pipeline_timeline_weeks: z.number().optional(),
    ground_truth_timeline_weeks: z.number().optional(),
  }).optional(),
});

export type EvaluationScores = z.infer<typeof EvaluationScoresSchema>;

// =============================================================================
// Evaluation Run
// =============================================================================

/**
 * Status of an evaluation run
 */
export const EvaluationStatusSchema = z.enum([
  'pending',    // Created but not executed
  'running',    // Pipeline executing
  'completed',  // Successfully finished
  'failed',     // Pipeline error
  'skipped',    // Skipped (e.g., holdout)
]);

export type EvaluationStatus = z.infer<typeof EvaluationStatusSchema>;

/**
 * Flaw codes detected in an evaluation
 */
export const FlawCodeSchema = z.enum([
  'TIER_UNDERESTIMATE',
  'TIER_OVERESTIMATE',
  'MISSING_INTEGRATION',
  'EXTRA_INTEGRATION',
  'PRICE_TOO_HIGH',
  'PRICE_TOO_LOW',
  'TIMELINE_OPTIMISTIC',
  'TIMELINE_PESSIMISTIC',
  'ROI_INFLATED',
  'ROI_CONSERVATIVE',
  'AGENT_TYPE_MISMATCH',
  'FEATURE_GAP',
]);

export type FlawCode = z.infer<typeof FlawCodeSchema>;

/**
 * A single evaluation run
 */
export const EvaluationRunSchema = z.object({
  // Identity
  id: z.string().uuid(),
  case_study_id: z.string(),

  // Version tracking
  pipeline_version: z.string(), // Git SHA or semver
  schema_version: z.string().default('1.0.0'),

  // Execution state
  status: EvaluationStatusSchema,
  error_message: z.string().optional(),

  // Input (masked intake)
  input_json: z.record(z.unknown()), // The masked intake fed to pipeline

  // Output (pipeline result)
  output_json: z.record(z.unknown()).optional(), // Full pipeline output

  // Scoring
  scores: EvaluationScoresSchema.optional(),

  // Detected flaws
  flaws_detected: z.array(FlawCodeSchema).default([]),

  // Timing
  run_at: z.string(), // ISO timestamp when run started
  completed_at: z.string().optional(), // ISO timestamp when finished
  duration_ms: z.number().optional(), // Execution time

  // Audit
  triggered_by: z.enum(['manual', 'batch', 'ci']).default('manual'),
});

export type EvaluationRun = z.infer<typeof EvaluationRunSchema>;

/**
 * Schema for creating a new evaluation run
 */
export const CreateEvaluationRunSchema = EvaluationRunSchema.omit({
  id: true,
  run_at: true,
  status: true,
}).extend({
  status: EvaluationStatusSchema.optional().default('pending'),
});

export type CreateEvaluationRun = z.infer<typeof CreateEvaluationRunSchema>;

// =============================================================================
// Flaw Patterns
// =============================================================================

/**
 * Severity levels for flaw patterns
 */
export const FlawSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export type FlawSeverity = z.infer<typeof FlawSeveritySchema>;

/**
 * A detected pattern across multiple evaluations
 */
export const FlawPatternSchema = z.object({
  // Identity
  id: z.string().uuid(),
  pattern_code: FlawCodeSchema,

  // Description
  description: z.string(),
  business_impact: z.string(), // Why this matters

  // Frequency
  affected_runs: z.array(z.string()), // Run IDs
  total_evaluations: z.number(), // Denominator
  frequency_percent: z.number(), // affected / total * 100

  // Severity
  severity: FlawSeveritySchema,
  severity_rationale: z.string(),

  // Recommendations
  recommendations: z.array(z.string()),
  affected_code_paths: z.array(z.string()).optional(), // e.g., ["lib/research.js"]

  // Tracking
  first_seen: z.string(), // ISO timestamp
  last_seen: z.string(), // ISO timestamp
  status: z.enum(['active', 'investigating', 'fixed', 'wont_fix']).default('active'),
});

export type FlawPattern = z.infer<typeof FlawPatternSchema>;

// =============================================================================
// Batch Evaluation
// =============================================================================

/**
 * Summary of a batch evaluation run
 */
export const BatchEvaluationSummarySchema = z.object({
  // Identity
  batch_id: z.string().uuid(),

  // Scope
  total_cases: z.number(),
  completed: z.number(),
  failed: z.number(),
  skipped: z.number(),

  // Scores
  mean_score: z.number().optional(),
  median_score: z.number().optional(),
  min_score: z.number().optional(),
  max_score: z.number().optional(),
  std_dev: z.number().optional(),

  // Score distribution
  score_distribution: z.object({
    excellent: z.number(), // 80-100
    good: z.number(),      // 60-79
    fair: z.number(),      // 40-59
    poor: z.number(),      // 0-39
  }).optional(),

  // Top flaws
  top_flaws: z.array(z.object({
    code: FlawCodeSchema,
    count: z.number(),
    percent: z.number(),
  })).optional(),

  // Timing
  started_at: z.string(),
  completed_at: z.string().optional(),
  total_duration_ms: z.number().optional(),

  // Run IDs
  run_ids: z.array(z.string()),
});

export type BatchEvaluationSummary = z.infer<typeof BatchEvaluationSummarySchema>;

// =============================================================================
// Scoring Configuration
// =============================================================================

/**
 * Configurable weights for scoring dimensions
 */
export const ScoringWeightsSchema = z.object({
  tier_match: z.number().default(0.20),
  integration_coverage: z.number().default(0.25),
  agent_type_alignment: z.number().default(0.15),
  pricing_reasonableness: z.number().default(0.20),
  timeline_realism: z.number().default(0.10),
  feature_coverage: z.number().default(0.10),
}).refine(
  (weights) => {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    return Math.abs(sum - 1.0) < 0.001;
  },
  { message: 'Scoring weights must sum to 1.0' }
);

export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

/**
 * Thresholds for scoring dimensions
 */
export const ScoringThresholdsSchema = z.object({
  // Pricing reasonableness
  pricing_exact_threshold: z.number().default(0.30), // Within 30% = 1.0
  pricing_acceptable_threshold: z.number().default(0.50), // Within 50% = 0.5

  // Timeline realism
  timeline_exact_weeks: z.number().default(2), // Within 2 weeks = 1.0
  timeline_acceptable_weeks: z.number().default(4), // Within 4 weeks = 0.5

  // Pattern detection
  pattern_min_frequency: z.number().default(0.30), // 30% to flag as pattern
  pattern_min_samples: z.number().default(5), // Need at least 5 runs
});

export type ScoringThresholds = z.infer<typeof ScoringThresholdsSchema>;

/**
 * Complete scoring configuration
 */
export const ScoringConfigSchema = z.object({
  weights: ScoringWeightsSchema,
  thresholds: ScoringThresholdsSchema,
});

export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validates an evaluation run
 */
export function validateEvaluationRun(data: unknown): {
  success: boolean;
  data?: EvaluationRun;
  errors?: string[];
} {
  const result = EvaluationRunSchema.safeParse(data);

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
 * Validates a flaw pattern
 */
export function validateFlawPattern(data: unknown): {
  success: boolean;
  data?: FlawPattern;
  errors?: string[];
} {
  const result = FlawPatternSchema.safeParse(data);

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
 * Default scoring configuration
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    tier_match: 0.20,
    integration_coverage: 0.25,
    agent_type_alignment: 0.15,
    pricing_reasonableness: 0.20,
    timeline_realism: 0.10,
    feature_coverage: 0.10,
  },
  thresholds: {
    pricing_exact_threshold: 0.30,
    pricing_acceptable_threshold: 0.50,
    timeline_exact_weeks: 2,
    timeline_acceptable_weeks: 4,
    pattern_min_frequency: 0.30,
    pattern_min_samples: 5,
  },
};
