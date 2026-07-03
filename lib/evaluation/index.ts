// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * Evaluation Module - Pipeline validation against real case studies
 * @module lib/evaluation
 *
 * Provides double-blind evaluation framework:
 * - Harvest real AI voice agent case studies
 * - Mask PROBLEM into intake format (no solution leakage)
 * - Run pipeline and compare to ground truth
 * - Score on multiple dimensions
 * - Detect systematic flaws
 */

// Corpus - Storage and retrieval
export {
  getDb,
  closeDb,
  resetDb,
  createCaseStudy,
  getCaseStudyById,
  listCaseStudies,
  updateCaseStudyMeta,
  deleteCaseStudy,
  getSourceDistribution,
  getCorpusStats,
  createEvaluationRun,
  updateEvaluationRun,
  getEvaluationRunById,
  getEvaluationsForCaseStudy,
  listEvaluationRuns,
} from './corpus.js';

// Masking - PROBLEM to intake transformation
export {
  toIntake,
  batchToIntake,
  validateNoSolutionLeakage,
  generateMaskingReport,
  default as masker,
} from './masker.js';

// Comparator - Scoring pipeline output vs ground truth
export {
  scoreTierMatch,
  scoreIntegrationCoverage,
  scoreAgentTypeAlignment,
  scorePricingReasonableness,
  scoreTimelineRealism,
  scoreFeatureCoverage,
  calculateAggregateScore,
  compare,
  detectFlaws,
  default as comparator,
} from './comparator.js';

// Runner - Execute pipeline with masked input
export {
  runEvaluation,
  runBatchEvaluation,
  checkReadiness,
  default as runner,
} from './runner.js';

// Harvester - Extract case studies from web
export {
  harvestFromUrl,
  harvestFromContent,
  createManualCaseStudy,
  batchHarvest,
  validateExtraction,
  suggestImprovements,
  detectVendor,
  default as harvester,
} from './harvester.js';

// =============================================================================
// Convenience API
// =============================================================================

/**
 * Quick evaluation of a single case study
 */
export async function quickEval(caseStudyId) {
  const { runEvaluation } = await import('./runner.js');
  return runEvaluation(caseStudyId, { useDirect: true });
}

/**
 * Run full batch evaluation
 */
export async function fullEval(options = {}) {
  const { runBatchEvaluation } = await import('./runner.js');
  return runBatchEvaluation(options);
}

/**
 * Get evaluation summary statistics
 */
export async function getEvalStats() {
  const { getCorpusStats, listEvaluationRuns } = await import('./corpus.js');

  const corpusStats = await getCorpusStats();
  const recentRuns = await listEvaluationRuns({ limit: 100 });

  const completed = recentRuns.filter((r) => r.status === 'completed');
  const scores = completed.map((r) => r.aggregate_score).filter(Boolean);

  return {
    corpus: corpusStats,
    evaluations: {
      total: recentRuns.length,
      completed: completed.length,
      failed: recentRuns.filter((r) => r.status === 'failed').length,
    },
    scores: scores.length > 0 ? {
      mean: Number.parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
      min: Math.min(...scores),
      max: Math.max(...scores),
    } : null,
  };
}
