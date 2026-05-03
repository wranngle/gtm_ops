#!/usr/bin/env bun
/**
 * Run batch evaluation on case study corpus
 */

import { runBatchEvaluation, checkReadiness } from '../lib/evaluation/runner.js';

async function main() {
  // Check readiness
  const ready = await checkReadiness();
  console.log('Pipeline version:', ready.pipeline_version);
  console.log('Ready:', ready.ready);

  if (!ready.ready) {
    console.log('Issues:', ready.issues);
    process.exit(1);
  }

  // Run batch evaluation (excluding holdout)
  console.log('\nRunning batch evaluation (excluding holdout cases)...');
  console.log('This may take a few minutes...\n');

  const results = await runBatchEvaluation({
    excludeHoldout: true,
    verbose: false,
    directExecution: true  // Skip subprocess for speed
  });

  console.log('\n=== BATCH EVALUATION COMPLETE ===');
  console.log('Total cases:', results.summary.total);
  console.log('Completed:', results.summary.completed);
  console.log('Failed:', results.summary.failed);
  console.log('Mean Score:', (results.summary.mean_score || 0).toFixed(2) + '/100');
  console.log('Score Range:', (results.summary.min_score || 0).toFixed(1), '-', (results.summary.max_score || 0).toFixed(1));

  console.log('\n=== FLAW FREQUENCY ===');
  const flaws = results.summary.flaw_counts || {};
  const sortedFlaws = Object.entries(flaws).sort((a, b) => b[1] - a[1]);
  for (const [flaw, count] of sortedFlaws) {
    const pct = ((count / results.summary.completed) * 100).toFixed(0);
    console.log(`  ${flaw}: ${count}/${results.summary.completed} (${pct}%)`);
  }

  console.log('\n=== PER-CASE SCORES ===');
  for (const run of results.runs || []) {
    const score = run.aggregate_score != null ? run.aggregate_score.toFixed(1) : 'ERR';
    const flawsStr = run.flaws?.length ? run.flaws.join(', ') : 'none';
    console.log(`  ${run.case_study_id}: ${score} | Flaws: ${flawsStr}`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
