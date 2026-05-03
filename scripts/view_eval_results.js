#!/usr/bin/env bun
/**
 * View evaluation results from database
 */

import { listEvaluationRuns, getCorpusStats } from '../lib/evaluation/corpus.js';

async function main() {
  // Get corpus stats
  const stats = await getCorpusStats();
  console.log('=== CORPUS STATS ===');
  console.log('Total case studies:', stats.total_case_studies);
  console.log('By vendor:', JSON.stringify(stats.vendor_distribution, null, 2));
  console.log('Holdout:', stats.holdout_count);
  console.log('Total evaluations:', stats.total_evaluations);

  // Get recent runs
  const runs = await listEvaluationRuns({ limit: 15, orderBy: 'run_at', orderDir: 'DESC' });
  console.log('\n=== RECENT EVALUATION RUNS ===');

  // Aggregate flaws
  const flawCounts = {};
  let totalScore = 0;
  let scoreCount = 0;

  for (const run of runs) {
    const flaws = JSON.parse(run.flaws_detected || '[]');
    const flawStr = flaws.length ? flaws.join(', ') : 'none';
    const score = run.aggregate_score != null ? run.aggregate_score.toFixed(1) : 'ERR';
    console.log(`  ${run.case_study_id}: ${score}/100 | Status: ${run.status} | Flaws: ${flawStr}`);

    if (run.aggregate_score != null) {
      totalScore += run.aggregate_score;
      scoreCount++;
    }

    for (const flaw of flaws) {
      flawCounts[flaw] = (flawCounts[flaw] || 0) + 1;
    }
  }

  console.log('\n=== FLAW FREQUENCY ===');
  const sortedFlaws = Object.entries(flawCounts).sort((a, b) => b[1] - a[1]);
  for (const [flaw, count] of sortedFlaws) {
    const pct = ((count / scoreCount) * 100).toFixed(0);
    console.log(`  ${flaw}: ${count}/${scoreCount} (${pct}%)`);
  }

  console.log('\n=== SUMMARY ===');
  console.log('Evaluated:', scoreCount);
  console.log('Mean Score:', (totalScore / scoreCount).toFixed(2) + '/100');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
