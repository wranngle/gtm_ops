#!/usr/bin/env node
/**
 * Evaluation CLI Commands
 * @module lib/evaluation/cli
 *
 * Commands:
 * - eval:stats    - Show corpus and evaluation statistics
 * - eval:list     - List case studies in corpus
 * - eval:run      - Run evaluation on a single case study
 * - eval:batch    - Run batch evaluation on all case studies
 * - eval:harvest  - Harvest a case study from URL content
 * - eval:report   - Generate flaw analysis report
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  listCaseStudies,
  getCorpusStats,
  getCaseStudyById,
  createCaseStudy,
  listEvaluationRuns,
} from './corpus.js';
import { runEvaluation, runBatchEvaluation, checkReadiness } from './runner.js';
import { harvestFromContent, validateExtraction, detectVendor } from './harvester.js';
import { getEvalStats } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'case_studies');

// =============================================================================
// ANSI Colors
// =============================================================================

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// =============================================================================
// Command: eval:stats
// =============================================================================

async function cmdStats() {
  console.log(`\n${c.bold}${c.cyan}EVALUATION STATISTICS${c.reset}\n`);

  try {
    const stats = await getEvalStats();

    console.log(`${c.bold}Corpus:${c.reset}`);
    console.log(`  Total case studies:  ${c.green}${stats.corpus.total}${c.reset}`);
    console.log(`  Training set:        ${stats.corpus.training}`);
    console.log(`  Holdout set:         ${stats.corpus.holdout}`);

    if (stats.corpus.by_vendor) {
      console.log(`\n  ${c.dim}By vendor:${c.reset}`);
      for (const [vendor, count] of Object.entries(stats.corpus.by_vendor)) {
        console.log(`    ${vendor}: ${count}`);
      }
    }

    console.log(`\n${c.bold}Evaluations:${c.reset}`);
    console.log(`  Total runs:     ${stats.evaluations.total}`);
    console.log(`  Completed:      ${c.green}${stats.evaluations.completed}${c.reset}`);
    console.log(`  Failed:         ${c.red}${stats.evaluations.failed}${c.reset}`);

    if (stats.scores) {
      console.log(`\n${c.bold}Scores:${c.reset}`);
      console.log(`  Mean score:     ${c.yellow}${stats.scores.mean}${c.reset}`);
      console.log(`  Range:          ${stats.scores.min} - ${stats.scores.max}`);
    }

    // Check readiness
    const readiness = await checkReadiness();
    console.log(`\n${c.bold}Readiness:${c.reset}`);
    if (readiness.ready) {
      console.log(`  ${c.green}✓ Ready to run evaluations${c.reset}`);
    } else {
      console.log(`  ${c.yellow}⚠ Issues detected:${c.reset}`);
      for (const issue of readiness.issues) {
        console.log(`    - ${issue}`);
      }
    }

    console.log(`\n  Pipeline version: ${readiness.pipeline_version}`);
  } catch (error) {
    console.error(`${c.red}Error: ${error.message}${c.reset}`);
    process.exit(1);
  }
}

// =============================================================================
// Command: eval:list
// =============================================================================

async function cmdList(options = {}) {
  console.log(`\n${c.bold}${c.cyan}CASE STUDY CORPUS${c.reset}\n`);

  try {
    const caseStudies = await listCaseStudies({ holdout: null });

    if (caseStudies.length === 0) {
      console.log(`${c.yellow}No case studies in corpus.${c.reset}`);
      console.log(`\nTo add case studies:`);
      console.log(`  1. Place JSON files in: ${FIXTURES_DIR}`);
      console.log(`  2. Or use: wranngle eval:harvest --url <case-study-url>`);
      return;
    }

    console.log(`Found ${c.green}${caseStudies.length}${c.reset} case studies:\n`);

    for (const cs of caseStudies) {
      const holdoutBadge = cs.meta?.holdout
        ? `${c.yellow}[HOLDOUT]${c.reset} `
        : '';
      const qualityBadge = cs.meta?.quality_score
        ? `${c.dim}(Q:${cs.meta.quality_score}/5)${c.reset}`
        : '';

      console.log(`  ${c.bold}${cs.id}${c.reset} ${holdoutBadge}${qualityBadge}`);
      console.log(`    ${c.dim}Industry: ${cs.problem?.industry || 'unknown'}${c.reset}`);
      console.log(`    ${c.dim}Vendor: ${cs.source?.vendor || 'unknown'}${c.reset}`);

      if (options.verbose) {
        const painPoints = cs.problem?.pain_points?.slice(0, 2) || [];
        if (painPoints.length > 0) {
          console.log(`    ${c.dim}Pain points: ${painPoints.join('; ')}${c.reset}`);
        }
      }

      console.log('');
    }
  } catch (error) {
    console.error(`${c.red}Error: ${error.message}${c.reset}`);
    process.exit(1);
  }
}

// =============================================================================
// Command: eval:run
// =============================================================================

async function cmdRun(caseStudyId, options = {}) {
  if (!caseStudyId) {
    console.error(`${c.red}Error: Case study ID required${c.reset}`);
    console.log(`\nUsage: wranngle eval:run <case-study-id>`);
    console.log(`\nTo list available case studies: wranngle eval:list`);
    process.exit(1);
  }

  console.log(`\n${c.bold}${c.cyan}RUNNING EVALUATION${c.reset}\n`);
  console.log(`Case study: ${c.yellow}${caseStudyId}${c.reset}`);

  if (options.dryRun) {
    console.log(`${c.dim}(dry run - pipeline will not execute)${c.reset}`);
  }

  console.log('');

  try {
    const startTime = Date.now();

    const result = await runEvaluation(caseStudyId, {
      dryRun: options.dryRun,
      includeHoldout: options.includeHoldout,
      useDirect: true,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.status === 'skipped') {
      console.log(`${c.yellow}⚠ Skipped: ${result.reason}${c.reset}`);
      console.log(`${c.dim}Use --include-holdout to evaluate holdout cases${c.reset}`);
      return;
    }

    if (result.status === 'dry_run') {
      console.log(`${c.green}✓ Dry run complete${c.reset}`);
      console.log(`\n${c.bold}Masked Intake Preview:${c.reset}`);
      console.log(JSON.stringify(result.masked_intake, null, 2).slice(0, 1000) + '...');
      return;
    }

    if (result.status === 'failed') {
      console.log(`${c.red}✗ Evaluation failed${c.reset}`);
      console.log(`  Error: ${result.error}`);
      console.log(`  Duration: ${duration}s`);
      process.exit(1);
    }

    // Success
    console.log(`${c.green}✓ Evaluation complete${c.reset}`);
    console.log(`  Run ID: ${result.run_id}`);
    console.log(`  Duration: ${duration}s`);

    console.log(`\n${c.bold}Scores:${c.reset}`);
    console.log(`  Aggregate: ${formatScore(result.aggregate_score)}`);

    if (result.scores?.dimensions) {
      console.log(`\n  ${c.dim}Dimensions:${c.reset}`);
      // dimensions is an array of { dimension, score, rationale, ... }
      for (const dimResult of result.scores.dimensions) {
        const label = (dimResult.dimension || 'unknown').replace(/_/g, ' ');
        const scoreVal = dimResult.score != null ? (dimResult.score * 100).toFixed(0) : 'N/A';
        console.log(`    ${label.padEnd(25)}: ${formatScore(parseFloat(scoreVal))} ${c.dim}(${dimResult.rationale || ''})${c.reset}`);
      }
    }

    if (result.flaws?.length > 0) {
      console.log(`\n${c.bold}${c.yellow}Flaws Detected:${c.reset}`);
      for (const flaw of result.flaws) {
        console.log(`  - ${flaw}`);
      }
    } else {
      console.log(`\n${c.green}No significant flaws detected${c.reset}`);
    }
  } catch (error) {
    console.error(`${c.red}Error: ${error.message}${c.reset}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// =============================================================================
// Command: eval:batch
// =============================================================================

async function cmdBatch(options = {}) {
  console.log(`\n${c.bold}${c.cyan}BATCH EVALUATION${c.reset}\n`);

  // Check readiness
  const readiness = await checkReadiness();
  if (!readiness.ready && !options.force) {
    console.log(`${c.yellow}⚠ System not ready:${c.reset}`);
    for (const issue of readiness.issues) {
      console.log(`  - ${issue}`);
    }
    console.log(`\n${c.dim}Use --force to run anyway${c.reset}`);
    process.exit(1);
  }

  try {
    const startTime = Date.now();

    console.log(`Starting batch evaluation...`);
    console.log(`Pipeline version: ${readiness.pipeline_version}\n`);

    const { summary, results } = await runBatchEvaluation({
      includeHoldout: options.includeHoldout,
      limit: options.limit,
      onProgress: (progress) => {
        process.stdout.write(
          `\r  [${progress.current}/${progress.total}] Evaluating ${progress.case_study_id}...`
        );
      },
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\r${' '.repeat(80)}\r`); // Clear progress line

    console.log(`${c.green}✓ Batch complete${c.reset}`);
    console.log(`  Total duration: ${duration}s`);

    console.log(`\n${c.bold}Summary:${c.reset}`);
    console.log(`  Cases evaluated: ${summary.total_cases}`);
    console.log(`  Completed:       ${c.green}${summary.completed}${c.reset}`);
    console.log(`  Failed:          ${c.red}${summary.failed}${c.reset}`);
    console.log(`  Skipped:         ${summary.skipped}`);

    if (summary.mean_score != null) {
      console.log(`\n${c.bold}Scores:${c.reset}`);
      console.log(`  Mean:  ${formatScore(summary.mean_score)}`);
      console.log(`  Range: ${summary.min_score} - ${summary.max_score}`);

      console.log(`\n  ${c.dim}Distribution:${c.reset}`);
      console.log(`    Excellent (80+): ${summary.score_distribution.excellent}`);
      console.log(`    Good (60-79):    ${summary.score_distribution.good}`);
      console.log(`    Fair (40-59):    ${summary.score_distribution.fair}`);
      console.log(`    Poor (<40):      ${summary.score_distribution.poor}`);
    }

    if (summary.top_flaws?.length > 0) {
      console.log(`\n${c.bold}${c.yellow}Top Flaws:${c.reset}`);
      for (const flaw of summary.top_flaws) {
        console.log(`  - ${flaw.code}: ${flaw.count} cases (${flaw.percent}%)`);
      }
    }

    // Autofix summary
    const autofixed = results.filter((r) => r.autofix);
    if (autofixed.length > 0) {
      console.log(`\n${c.bold}${c.cyan}Autofix Results:${c.reset}`);
      for (const r of autofixed) {
        const af = r.autofix;
        const delta = af.improvement > 0 ? `${c.green}+${af.improvement}` : `${c.red}${af.improvement}`;
        console.log(`  ${r.case_study_id}: ${r.aggregate_score} → ${af.fixed_score} (${delta}${c.reset})`);
        for (const desc of af.remediations) {
          console.log(`    ${c.dim}• ${desc}${c.reset}`);
        }
        if (af.remaining_flaws.length > 0) {
          console.log(`    ${c.yellow}Remaining: ${af.remaining_flaws.join(', ')}${c.reset}`);
        }
      }
      const avgImprovement = autofixed.reduce((s, r) => s + r.autofix.improvement, 0) / autofixed.length;
      console.log(`\n  ${c.bold}Avg improvement: ${avgImprovement > 0 ? c.green + '+' : c.red}${avgImprovement.toFixed(0)} points${c.reset}`);
    }

    // Always save report for regression checking
    const reportPath = options.output || path.join(PROJECT_ROOT, 'evaluation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({ summary, results, dimension_performance: summary.dimension_performance || [], flaw_frequency: summary.top_flaws || [] }, null, 2));
    console.log(`\n${c.dim}Report saved to: ${reportPath}${c.reset}`);

    // Auto-run regression check
    try {
      const baselinePath = path.join(PROJECT_ROOT, 'config', 'eval_baseline.json');
      if (fs.existsSync(baselinePath)) {
        const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
        const meanPct = (summary.mean_score || 0) * 100;
        const totalFlaws = (summary.top_flaws || []).reduce((s, f) => s + f.count, 0);
        const scoreFail = meanPct < baseline.min_acceptable_score;
        const flawFail = totalFlaws > baseline.max_acceptable_flaws;
        if (scoreFail || flawFail) {
          console.log(`\n${c.bold}${c.red}REGRESSION DETECTED${c.reset}`);
          if (scoreFail) console.log(`  Score ${meanPct.toFixed(1)} < baseline ${baseline.min_acceptable_score}`);
          if (flawFail) console.log(`  Flaws ${totalFlaws} > baseline max ${baseline.max_acceptable_flaws}`);
        } else {
          console.log(`\n${c.green}No regressions vs baseline.${c.reset}`);
        }
      }
    } catch { /* baseline check non-critical */ }
  } catch (error) {
    console.error(`${c.red}Error: ${error.message}${c.reset}`);
    process.exit(1);
  }
}

// =============================================================================
// Command: eval:harvest
// =============================================================================

async function cmdHarvest(options = {}) {
  console.log(`\n${c.bold}${c.cyan}HARVEST CASE STUDY${c.reset}\n`);

  if (!options.url) {
    console.error(`${c.red}Error: --url is required${c.reset}`);
    console.log(`\nUsage: wranngle eval:harvest --url <url> --content <file>`);
    console.log(`\nExample:`);
    console.log(`  wranngle eval:harvest --url https://vapi.ai/case-studies/dental --content dental.md`);
    process.exit(1);
  }

  if (!options.content) {
    console.error(`${c.red}Error: --content is required${c.reset}`);
    console.log(`\nProvide a file with the case study page content (text or markdown).`);
    console.log(`You can use WebFetch or copy-paste from the browser.`);
    process.exit(1);
  }

  // Read content file
  let content;
  try {
    content = fs.readFileSync(options.content, 'utf-8');
  } catch (error) {
    console.error(`${c.red}Error reading content file: ${error.message}${c.reset}`);
    process.exit(1);
  }

  console.log(`URL:     ${options.url}`);
  console.log(`Vendor:  ${detectVendor(options.url)}`);
  console.log(`Content: ${content.length} characters`);
  console.log('');

  try {
    console.log(`${c.dim}Extracting with LLM...${c.reset}`);

    const caseStudy = await harvestFromContent(content, {
      url: options.url,
      title: options.title,
      vendor: options.vendor,
    }, {
      autoSave: false,
      holdout: options.holdout,
    });

    // Validate
    const validation = validateExtraction(caseStudy);

    console.log(`\n${c.bold}Extracted Case Study:${c.reset}`);
    console.log(`  ID:       ${caseStudy.id}`);
    console.log(`  Industry: ${caseStudy.problem?.industry}`);
    console.log(`  Quality:  ${caseStudy.meta?.quality_score}/5`);

    if (!validation.valid) {
      console.log(`\n${c.yellow}⚠ Validation issues:${c.reset}`);
      for (const issue of validation.issues) {
        console.log(`  - ${issue}`);
      }
    }

    // Preview
    if (options.verbose) {
      console.log(`\n${c.bold}Full extraction:${c.reset}`);
      console.log(JSON.stringify(caseStudy, null, 2));
    }

    // Save if requested
    if (options.save) {
      const saved = await createCaseStudy(caseStudy);
      console.log(`\n${c.green}✓ Saved to corpus: ${saved.id}${c.reset}`);
    } else {
      // Save to fixtures for review
      const fixtureFile = path.join(FIXTURES_DIR, `${caseStudy.id}.json`);
      fs.writeFileSync(fixtureFile, JSON.stringify({
        ...caseStudy,
        harvested_at: new Date().toISOString(),
      }, null, 2));
      console.log(`\n${c.green}✓ Saved to fixtures: ${fixtureFile}${c.reset}`);
      console.log(`${c.dim}Review and edit before importing to corpus${c.reset}`);
    }
  } catch (error) {
    console.error(`${c.red}Error: ${error.message}${c.reset}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// =============================================================================
// Command: eval:report
// =============================================================================

async function cmdReport(options = {}) {
  console.log(`\n${c.bold}${c.cyan}EVALUATION FLAW REPORT${c.reset}\n`);

  try {
    const runs = await listEvaluationRuns({ limit: 100 });
    const completed = runs.filter((r) => r.status === 'completed');

    if (completed.length === 0) {
      console.log(`${c.yellow}No completed evaluations found.${c.reset}`);
      console.log(`\nRun evaluations first: wranngle eval:batch`);
      return;
    }

    console.log(`Analyzing ${completed.length} completed evaluations...\n`);

    // Aggregate scores by dimension
    const dimensionScores = {};
    const allFlaws = [];

    for (const run of completed) {
      if (run.scores_json) {
        const scores = typeof run.scores_json === 'string'
          ? JSON.parse(run.scores_json)
          : run.scores_json;

        if (scores.dimensions) {
          // dimensions is an array of { dimension, score, rationale, ... }
          for (const dimResult of scores.dimensions) {
            const dim = dimResult.dimension || `dimension_${scores.dimensions.indexOf(dimResult)}`;
            if (!dimensionScores[dim]) {
              dimensionScores[dim] = [];
            }
            dimensionScores[dim].push(dimResult.score);
          }
        }
      }

      if (run.flaws_detected) {
        const flaws = typeof run.flaws_detected === 'string'
          ? JSON.parse(run.flaws_detected)
          : run.flaws_detected;
        allFlaws.push(...flaws);
      }
    }

    // Score summary
    console.log(`${c.bold}DIMENSION PERFORMANCE${c.reset}\n`);

    const dimResults = [];
    for (const [dim, scores] of Object.entries(dimensionScores)) {
      if (scores.length === 0) continue;

      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const min = Math.min(...scores);
      const max = Math.max(...scores);

      dimResults.push({ dim, mean, min, max, count: scores.length });
    }

    // Sort by mean (worst first)
    dimResults.sort((a, b) => a.mean - b.mean);

    for (const { dim, mean, min, max } of dimResults) {
      const label = dim.replace(/_/g, ' ').padEnd(25);
      const bar = generateBar(mean);
      console.log(`  ${label} ${bar} ${mean.toFixed(1)} (${min}-${max})`);
    }

    // Flaw frequency with examples
    console.log(`\n${c.bold}FLAW FREQUENCY${c.reset}\n`);

    // Collect flaws with examples
    const flawCounts = {};
    const flawExamples = {}; // { flawCode: [{ caseStudyId, score, details }] }

    for (const run of completed) {
      if (run.flaws_detected) {
        const flaws = typeof run.flaws_detected === 'string'
          ? JSON.parse(run.flaws_detected)
          : run.flaws_detected;

        const scores = run.scores_json
          ? (typeof run.scores_json === 'string' ? JSON.parse(run.scores_json) : run.scores_json)
          : null;

        for (const flaw of flaws) {
          flawCounts[flaw] = (flawCounts[flaw] || 0) + 1;

          if (!flawExamples[flaw]) {
            flawExamples[flaw] = [];
          }

          // Collect example (limit to 3 per flaw)
          if (flawExamples[flaw].length < 3) {
            // Extract relevant detail for this flaw type
            let detail = '';
            if (scores?.dimensions) {
              const dim = scores.dimensions.find((d) => {
                if (flaw.includes('TIER')) return d.dimension === 'tier_match';
                if (flaw.includes('INTEGRATION')) return d.dimension === 'integration_coverage';
                if (flaw.includes('PRICE')) return d.dimension === 'pricing_reasonableness';
                if (flaw.includes('TIMELINE')) return d.dimension === 'timeline_realism';
                if (flaw.includes('AGENT')) return d.dimension === 'agent_type_alignment';
                if (flaw.includes('FEATURE')) return d.dimension === 'feature_coverage';
                return false;
              });
              if (dim?.details) {
                if (flaw.includes('TIER')) {
                  detail = `proposed ${dim.details.pipeline || '?'} vs actual ${dim.details.truth || '?'}`;
                } else if (flaw.includes('INTEGRATION') && dim.details.missing) {
                  detail = `missing: ${dim.details.missing.slice(0, 3).join(', ')}`;
                } else if (flaw.includes('PRICE')) {
                  detail = `$${dim.details.pipeline?.toLocaleString() || '?'} vs $${dim.details.truth?.toLocaleString() || '?'}`;
                } else if (flaw.includes('TIMELINE')) {
                  detail = `${dim.details.pipeline || '?'} vs ${dim.details.truth || '?'} weeks`;
                }
              }
            }

            flawExamples[flaw].push({
              caseStudyId: run.case_study_id,
              score: scores?.aggregate_score,
              detail,
            });
          }
        }
      }
    }

    const sortedFlaws = Object.entries(flawCounts)
      .sort((a, b) => b[1] - a[1]);

    if (sortedFlaws.length === 0) {
      console.log(`  ${c.green}No significant flaws detected across evaluations${c.reset}`);
    } else {
      for (const [flaw, count] of sortedFlaws) {
        const percent = ((count / completed.length) * 100).toFixed(0);
        const bar = '█'.repeat(Math.round(count / completed.length * 20));
        console.log(`  ${flaw.padEnd(25)} ${bar.padEnd(20)} ${count} (${percent}%)`);

        // Show examples
        const examples = flawExamples[flaw] || [];
        if (examples.length > 0 && options.verbose) {
          for (const ex of examples) {
            const detailStr = ex.detail ? ` - ${ex.detail}` : '';
            console.log(`    ${c.dim}└─ ${ex.caseStudyId} (score: ${ex.score || 'N/A'})${detailStr}${c.reset}`);
          }
        }
      }

      // Always show examples summary in non-verbose mode
      if (!options.verbose && sortedFlaws.length > 0) {
        console.log(`\n  ${c.dim}Use --verbose to see example cases for each flaw${c.reset}`);
      }
    }

    // Flaw examples section (always shown)
    if (sortedFlaws.length > 0) {
      console.log(`\n${c.bold}FLAW EXAMPLES${c.reset}\n`);

      for (const [flaw] of sortedFlaws.slice(0, 5)) {
        const examples = flawExamples[flaw] || [];
        if (examples.length > 0) {
          console.log(`  ${c.yellow}${flaw}${c.reset}`);
          for (const ex of examples.slice(0, 2)) {
            const detailStr = ex.detail ? ` ${c.dim}(${ex.detail})${c.reset}` : '';
            console.log(`    • ${ex.caseStudyId}${detailStr}`);
          }
        }
      }
    }

    // Actionable recommendations
    console.log(`\n${c.bold}ACTIONABLE RECOMMENDATIONS${c.reset}\n`);

    const recommendations = generateRecommendations(dimResults, sortedFlaws, completed.length);
    for (let i = 0; i < recommendations.length; i++) {
      console.log(`  ${i + 1}. ${recommendations[i]}`);
    }

    // Save report
    if (options.output) {
      const report = {
        generated_at: new Date().toISOString(),
        evaluation_count: completed.length,
        dimension_performance: dimResults,
        flaw_frequency: sortedFlaws.map(([code, count]) => ({
          code,
          count,
          percent: ((count / completed.length) * 100).toFixed(1),
          examples: (flawExamples[code] || []).map((ex) => ({
            case_study_id: ex.caseStudyId,
            score: ex.score,
            detail: ex.detail,
          })),
        })),
        recommendations,
      };

      fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
      console.log(`\n${c.dim}Report saved to: ${options.output}${c.reset}`);
    }
  } catch (error) {
    console.error(`${c.red}Error: ${error.message}${c.reset}`);
    process.exit(1);
  }
}

// =============================================================================
// Command: eval:import (Import fixtures to corpus)
// =============================================================================

async function cmdImport(options = {}) {
  console.log(`\n${c.bold}${c.cyan}IMPORT CASE STUDIES${c.reset}\n`);

  // Find JSON files in fixtures
  const files = fs.readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.log(`${c.yellow}No JSON files found in: ${FIXTURES_DIR}${c.reset}`);
    return;
  }

  console.log(`Found ${files.length} fixture files.\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const filePath = path.join(FIXTURES_DIR, file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const caseStudy = JSON.parse(content);

      // Check if already exists
      const existing = await getCaseStudyById(caseStudy.id);
      if (existing && !options.force) {
        console.log(`  ${c.dim}Skipped: ${caseStudy.id} (already exists)${c.reset}`);
        skipped++;
        continue;
      }

      // Validate
      const validation = validateExtraction(caseStudy);
      if (!validation.valid && !options.force) {
        console.log(`  ${c.yellow}Skipped: ${caseStudy.id} (invalid: ${validation.issues[0]})${c.reset}`);
        skipped++;
        continue;
      }

      // Import
      await createCaseStudy(caseStudy);
      console.log(`  ${c.green}Imported: ${caseStudy.id}${c.reset}`);
      imported++;
    } catch (error) {
      console.log(`  ${c.red}Error: ${file} - ${error.message}${c.reset}`);
      errors++;
    }
  }

  console.log(`\nDone: ${imported} imported, ${skipped} skipped, ${errors} errors`);
}

// =============================================================================
// Helpers
// =============================================================================

function formatScore(score) {
  if (score == null) return `${c.dim}N/A${c.reset}`;
  if (score >= 80) return `${c.green}${score}${c.reset}`;
  if (score >= 60) return `${c.yellow}${score}${c.reset}`;
  return `${c.red}${score}${c.reset}`;
}

function generateBar(score) {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  let color = c.red;
  if (score >= 80) color = c.green;
  else if (score >= 60) color = c.yellow;

  return `${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;
}

function generateRecommendations(dimResults, sortedFlaws, evalCount) {
  const recommendations = [];

  // Based on worst dimensions
  for (const { dim, mean } of dimResults.slice(0, 2)) {
    if (mean < 60) {
      switch (dim) {
        case 'tier_match':
          recommendations.push('Review tier assessment logic - frequent tier mismatches');
          break;
        case 'integration_coverage':
          recommendations.push('Improve integration detection from intake text');
          break;
        case 'pricing_reasonableness':
          recommendations.push('Calibrate pricing model against industry benchmarks');
          break;
        case 'timeline_realism':
          recommendations.push('Adjust timeline estimates based on complexity factors');
          break;
        case 'feature_coverage':
          recommendations.push('Expand feature generation to match case study capabilities');
          break;
        default:
          recommendations.push(`Investigate low ${dim.replace(/_/g, ' ')} scores`);
      }
    }
  }

  // Based on top flaws
  for (const [flaw, count] of sortedFlaws.slice(0, 3)) {
    if (count >= evalCount * 0.3) { // Affects 30%+ of cases
      switch (flaw) {
        case 'TIER_UNDERESTIMATE':
          recommendations.push('Pipeline consistently underestimates complexity - review tier thresholds');
          break;
        case 'TIER_OVERESTIMATE':
          recommendations.push('Pipeline over-engineers solutions - simplify default recommendations');
          break;
        case 'PRICE_TOO_HIGH':
          recommendations.push('Pricing above market - review hourly rates and multipliers');
          break;
        case 'PRICE_TOO_LOW':
          recommendations.push('Pricing below market - may be undervaluing work');
          break;
        case 'TIMELINE_OPTIMISTIC':
          recommendations.push('Timeline estimates too aggressive - add buffer time');
          break;
        case 'MISSING_INTEGRATION':
          recommendations.push('Key integrations being missed - improve system extraction');
          break;
        default:
          recommendations.push(`Address frequent flaw: ${flaw}`);
      }
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('Pipeline performance within acceptable ranges');
    recommendations.push('Continue building corpus to identify edge cases');
  }

  return recommendations.slice(0, 5);
}

// =============================================================================
// Main CLI Handler
// =============================================================================

export async function handleEvalCommand(subcommand, args = [], options = {}) {
  switch (subcommand) {
    case 'stats':
      return cmdStats();

    case 'list':
      return cmdList(options);

    case 'run':
      return cmdRun(args[0], options);

    case 'batch':
      return cmdBatch(options);

    case 'harvest':
      return cmdHarvest(options);

    case 'report':
      return cmdReport(options);

    case 'import':
      return cmdImport(options);

    default:
      console.log(`\n${c.bold}${c.cyan}EVALUATION COMMANDS${c.reset}\n`);
      console.log(`Usage: wranngle eval:<command> [options]\n`);
      console.log(`Commands:`);
      console.log(`  ${c.bold}stats${c.reset}    - Show corpus and evaluation statistics`);
      console.log(`  ${c.bold}list${c.reset}     - List case studies in corpus`);
      console.log(`  ${c.bold}run${c.reset}      - Run evaluation on a single case study`);
      console.log(`  ${c.bold}batch${c.reset}    - Run batch evaluation on all case studies`);
      console.log(`  ${c.bold}harvest${c.reset}  - Harvest a case study from URL content`);
      console.log(`  ${c.bold}report${c.reset}   - Generate flaw analysis report`);
      console.log(`  ${c.bold}import${c.reset}   - Import fixture files to corpus`);
      console.log(`\nExamples:`);
      console.log(`  wranngle eval:stats`);
      console.log(`  wranngle eval:list --verbose`);
      console.log(`  wranngle eval:run vapi-dental-001`);
      console.log(`  wranngle eval:batch --output report.json`);
      console.log(`  wranngle eval:harvest --url https://... --content page.md`);
      console.log(`  wranngle eval:report --output flaw-report.json`);
      console.log(`  wranngle eval:import --force`);
  }
}

export default handleEvalCommand;
