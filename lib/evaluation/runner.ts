// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * Evaluation Runner - Execute pipeline with masked input
 * @module lib/evaluation/runner
 *
 * Orchestrates blind evaluation by:
 * 1. Loading case study from corpus
 * 2. Masking PROBLEM into intake format
 * 3. Running pipeline (capture all output)
 * 4. Comparing output to SOLUTION (ground truth)
 * 5. Storing evaluation results
 */

import { randomUUID } from 'crypto';
import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DEFAULT_SCORING_CONFIG } from '../schemas/evaluation.schema.js';
import {
  getCaseStudyById,
  listCaseStudies,
  createEvaluationRun,
  updateEvaluationRun,
  getCorpusStats,
} from './corpus.js';
import { toIntake, generateMaskingReport } from './masker.js';
import { compare, detectFlaws } from './comparator.js';
import { autofixAndRescore } from './autofix.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// =============================================================================
// Pipeline Version Detection
// =============================================================================

/**
 * Get current pipeline version (git SHA or package version)
 */
function getPipelineVersion() {
  try {
    // Try git SHA first
    const sha = execSync('git rev-parse --short HEAD', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return sha;
  } catch {
    // Fall back to package version
    try {
      const pkgPath = path.join(PROJECT_ROOT, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.version || 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

// =============================================================================
// Pipeline Execution
// =============================================================================

/**
 * Execute pipeline with masked intake and capture output
 *
 * @param {object} maskedIntake - Intake object (masked from case study)
 * @param {object} options - Execution options
 * @returns {object} Pipeline output or error
 */
async function executePipeline(maskedIntake, options = {}) {
  const { timeout = 120_000, outputDir = null } = options;

  // Write masked intake to temp file
  const tempDir = outputDir || path.join(PROJECT_ROOT, 'output', '.eval-temp');
  fs.mkdirSync(tempDir, { recursive: true });

  const intakeFile = path.join(tempDir, `eval-intake-${Date.now()}.json`);
  fs.writeFileSync(intakeFile, JSON.stringify(maskedIntake, null, 2));

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // Execute pipeline via CLI (captures full output)
    const proc = spawn('node', [
      path.join(PROJECT_ROOT, 'src', 'cli', 'index.js'),
      'generate',
      intakeFile,
      '--output', tempDir,
      '--json', // Output JSON result
    ], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, EVAL_MODE: 'true' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Pipeline execution timed out after ${timeout}ms`));
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      // Clean up temp intake file
      try {
        fs.unlinkSync(intakeFile);
      } catch {
        // Ignore cleanup errors
      }

      if (code !== 0) {
        resolve({
          success: false,
          error: `Pipeline exited with code ${code}: ${stderr || stdout}`,
          duration_ms: duration,
          stdout,
          stderr,
        });
        return;
      }

      // Try to parse JSON output
      try {
        // Look for JSON in stdout (might have other output before it)
        const jsonMatch = stdout.match(/{[\s\S]*}$/);
        if (jsonMatch) {
          const output = JSON.parse(jsonMatch[0]);
          resolve({
            success: true,
            output,
            duration_ms: duration,
          });
        } else {
          // Look for output files
          const outputFiles = fs.readdirSync(tempDir).filter(
            (f) => f.endsWith('.json') && !f.startsWith('eval-intake')
          );

          if (outputFiles.length > 0) {
            const latestFile = outputFiles.sort().pop();
            const output = JSON.parse(
              fs.readFileSync(path.join(tempDir, latestFile), 'utf8')
            );
            resolve({
              success: true,
              output,
              duration_ms: duration,
            });
          } else {
            resolve({
              success: false,
              error: 'No output produced',
              duration_ms: duration,
              stdout,
              stderr,
            });
          }
        }
      } catch (parseError) {
        resolve({
          success: false,
          error: `Failed to parse output: ${parseError.message}`,
          duration_ms: duration,
          stdout,
          stderr,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

/**
 * Alternative: Execute pipeline directly via module import
 * (Faster but requires careful isolation)
 */
async function executePipelineDirect(maskedIntake, options = {}) {
  const tempDir = path.join(PROJECT_ROOT, 'output', '.eval-temp');
  fs.mkdirSync(tempDir, { recursive: true });

  const timestamp = Date.now();
  const intakeFile = path.join(tempDir, `eval-intake-${timestamp}.json`);
  const outputDir = path.join(tempDir, `eval-output-${timestamp}`);
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    // Write masked intake to temp file
    fs.writeFileSync(intakeFile, JSON.stringify(maskedIntake, null, 2));

    // Dynamic import to avoid circular dependencies
    const { UnifiedPipeline } = await import('../pipeline.js');

    const startTime = Date.now();

    // Create pipeline with suppressed logging for evaluation
    const pipeline = new UnifiedPipeline({
      structured: true, // Intake is already structured JSON
      logHandler: options.verbose ? undefined : () => {}, // Suppress logs unless verbose
    });

    // Run the pipeline
    await pipeline.run(intakeFile, outputDir);

    // Get the schema output
    const output = pipeline.schema;

    // Clean up temp files
    try {
      fs.unlinkSync(intakeFile);
      fs.rmSync(outputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: true,
      output,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    // Clean up temp files on error
    try {
      fs.unlinkSync(intakeFile);
      fs.rmSync(outputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      error: error.message,
      stack: error.stack,
      duration_ms: 0,
    };
  }
}

// =============================================================================
// Single Evaluation
// =============================================================================

/**
 * Run a single evaluation on a case study
 *
 * @param {string} caseStudyId - ID of case study to evaluate
 * @param {object} options - Evaluation options
 * @returns {object} Evaluation result
 */
export async function runEvaluation(caseStudyId, options = {}) {
  const {
    scoringConfig = DEFAULT_SCORING_CONFIG,
    triggeredBy = 'manual',
    dryRun = false,
    useDirect = true, // Use direct execution by default
  } = options;

  // Load case study
  const caseStudy = await getCaseStudyById(caseStudyId);
  if (!caseStudy) {
    throw new Error(`Case study not found: ${caseStudyId}`);
  }

  // Check if holdout (skip unless forced)
  if (caseStudy.meta.holdout && !options.includeHoldout) {
    return {
      case_study_id: caseStudyId,
      status: 'skipped',
      reason: 'Holdout case study',
    };
  }

  // Mask PROBLEM to intake
  const maskedIntake = toIntake(caseStudy, {
    validateOutput: true,
    checkLeaks: true,
  });

  // Generate masking report for debugging
  const maskingReport = generateMaskingReport(caseStudy, maskedIntake);

  if (dryRun) {
    return {
      case_study_id: caseStudyId,
      status: 'dry_run',
      masked_intake: maskedIntake,
      masking_report: maskingReport,
    };
  }

  // Create evaluation run record
  const pipelineVersion = getPipelineVersion();
  const evalRun = await createEvaluationRun({
    case_study_id: caseStudyId,
    pipeline_version: pipelineVersion,
    input_json: maskedIntake,
    triggered_by: triggeredBy,
  });

  // Update status to running
  await updateEvaluationRun(evalRun.id, { status: 'running' });

  // Execute pipeline
  const execResult = useDirect
    ? await executePipelineDirect(maskedIntake, options)
    : await executePipeline(maskedIntake, options);

  const completedAt = new Date().toISOString();

  if (!execResult.success) {
    // Record failure
    await updateEvaluationRun(evalRun.id, {
      status: 'failed',
      error_message: execResult.error,
      completed_at: completedAt,
      duration_ms: execResult.duration_ms,
    });

    return {
      case_study_id: caseStudyId,
      run_id: evalRun.id,
      status: 'failed',
      error: execResult.error,
      duration_ms: execResult.duration_ms,
    };
  }

  // Compare output to ground truth
  const scores = compare(execResult.output, caseStudy.solution, scoringConfig);
  const flaws = detectFlaws(scores);

  // Autofix: diagnose and patch pipeline output, then re-score
  let autofix = null;
  if (flaws.length > 0) {
    autofix = autofixAndRescore(execResult.output, caseStudy.solution, scores, scoringConfig);
  }

  // Update evaluation run with results (include autofix data)
  await updateEvaluationRun(evalRun.id, {
    status: 'completed',
    output_json: execResult.output,
    scores,
    flaws_detected: flaws,
    completed_at: completedAt,
    duration_ms: execResult.duration_ms,
    // Store autofix data inside scores for simplicity (no schema migration)
    ...(autofix?.applied ? {
      scores: {
        ...scores,
        autofix: {
          fixed_score: autofix.fixed_score,
          improvement: autofix.improvement,
          remediations: autofix.remediations.map((r) => r.description),
          remaining_flaws: autofix.remaining_flaws,
        },
      },
    } : {}),
  });

  return {
    case_study_id: caseStudyId,
    run_id: evalRun.id,
    status: 'completed',
    aggregate_score: scores.aggregate_score,
    scores,
    flaws,
    autofix: autofix?.applied ? {
      fixed_score: autofix.fixed_score,
      improvement: autofix.improvement,
      remediations: autofix.remediations.map((r) => r.description),
      remaining_flaws: autofix.remaining_flaws,
    } : null,
    duration_ms: execResult.duration_ms,
    masking_report: maskingReport,
  };
}

// =============================================================================
// Batch Evaluation
// =============================================================================

/**
 * Run evaluations on all non-holdout case studies
 *
 * @param {object} options - Batch options
 * @returns {object} Batch summary
 */
export async function runBatchEvaluation(options = {}) {
  const {
    // concurrency is accepted but ignored — runs sequentially to respect
    // LLM provider rate limits. Wire to a parallel runner when we add
    // multi-provider load balancing.
    concurrency: _concurrency = 1,
    scoringConfig = DEFAULT_SCORING_CONFIG,
    includeHoldout = false,
    onProgress = null,
    limit = null, // Optional limit for quick evaluations
  } = options;

  // Get all case studies
  let caseStudies = await listCaseStudies({ holdout: includeHoldout ? null : false });

  // Apply limit if specified
  if (limit && limit > 0) {
    caseStudies = caseStudies.slice(0, limit);
  }

  if (caseStudies.length === 0) {
    return {
      total: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      message: 'No case studies in corpus',
    };
  }

  const batchId = randomUUID();
  const startedAt = new Date().toISOString();
  const results = [];

  // Run evaluations (sequential for now)
  for (let i = 0; i < caseStudies.length; i++) {
    const caseStudy = caseStudies[i];

    if (onProgress) {
      onProgress({
        batch_id: batchId,
        current: i + 1,
        total: caseStudies.length,
        case_study_id: caseStudy.id,
      });
    }

    try {
      const result = await runEvaluation(caseStudy.id, {
        scoringConfig,
        triggeredBy: 'batch',
        includeHoldout,
      });
      results.push(result);
    } catch (error) {
      results.push({
        case_study_id: caseStudy.id,
        status: 'failed',
        error: error.message,
      });
    }
  }

  // Calculate summary statistics
  const completed = results.filter((r) => r.status === 'completed');
  const failed = results.filter((r) => r.status === 'failed');
  const skipped = results.filter((r) => r.status === 'skipped');

  const scores = completed.map((r) => r.aggregate_score).filter((s) => s != null);

  const summary = {
    batch_id: batchId,
    total_cases: caseStudies.length,
    completed: completed.length,
    failed: failed.length,
    skipped: skipped.length,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    run_ids: results.map((r) => r.run_id).filter(Boolean),
  };

  if (scores.length > 0) {
    summary.mean_score = Number.parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));
    summary.min_score = Math.min(...scores);
    summary.max_score = Math.max(...scores);

    // Score distribution
    summary.score_distribution = {
      excellent: scores.filter((s) => s >= 80).length,
      good: scores.filter((s) => s >= 60 && s < 80).length,
      fair: scores.filter((s) => s >= 40 && s < 60).length,
      poor: scores.filter((s) => s < 40).length,
    };

    // Top flaws
    const allFlaws = completed.flatMap((r) => r.flaws || []);
    const flawCounts = {};
    for (const flaw of allFlaws) {
      flawCounts[flaw] = (flawCounts[flaw] || 0) + 1;
    }

    summary.top_flaws = Object.entries(flawCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({
        code,
        count,
        percent: Number.parseFloat(((count / completed.length) * 100).toFixed(1)),
      }));
  }

  return {
    summary,
    results,
  };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Check if evaluation system is ready
 */
export async function checkReadiness() {
  const issues = [];

  // Check corpus
  try {
    const stats = await getCorpusStats();
    if (stats.total === 0) {
      issues.push('No case studies in corpus. Run harvesting first.');
    } else if (stats.training < 5) {
      issues.push(`Only ${stats.training} training case studies. Recommend at least 5.`);
    }
  } catch (error) {
    issues.push(`Cannot access corpus: ${error.message}`);
  }

  // Check pipeline
  try {
    const pipelinePath = path.join(PROJECT_ROOT, 'lib', 'pipeline.ts');
    if (!fs.existsSync(pipelinePath)) {
      issues.push('Pipeline module not found');
    }
  } catch (error) {
    issues.push(`Cannot check pipeline: ${error.message}`);
  }

  return {
    ready: issues.length === 0,
    issues,
    pipeline_version: getPipelineVersion(),
  };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  runEvaluation,
  runBatchEvaluation,
  checkReadiness,
  getPipelineVersion,
};
