#!/usr/bin/env bun
/**
 * Re-score all stored evaluations with updated comparator
 */

import sqlite3 from 'sqlite3';
import { compare } from '../lib/evaluation/comparator.js';
import { getCaseStudyById } from '../lib/evaluation/corpus.js';

const db = new sqlite3.Database('./config/evaluation.db');

// Get unique case studies from recent runs
db.all(`
  SELECT DISTINCT case_study_id, output_json
  FROM evaluation_runs
  WHERE status = 'completed'
  ORDER BY run_at DESC
`, [], async (err, rows) => {
  if (err) { console.error(err); process.exit(1); }

  // Dedupe by case_study_id (keep most recent)
  const seen = new Set();
  const unique = rows.filter(r => {
    if (seen.has(r.case_study_id)) return false;
    seen.add(r.case_study_id);
    return true;
  });

  console.log('Re-scoring', unique.length, 'case studies with updated comparator...\n');

  const results = [];
  const flawCounts = {};

  for (const row of unique) {
    try {
      const pipelineOutput = JSON.parse(row.output_json || '{}');
      const caseStudy = await getCaseStudyById(row.case_study_id);

      if (!caseStudy) {
        console.log('  ' + row.case_study_id + ': SKIPPED (not in corpus)');
        continue;
      }

      const result = compare(pipelineOutput, caseStudy.solution);
      results.push({ id: row.case_study_id, score: result.aggregate_score, flaws: result.flaws });

      for (const flaw of result.flaws) {
        flawCounts[flaw] = (flawCounts[flaw] || 0) + 1;
      }

      const flawStr = result.flaws.length > 0 ? result.flaws.join(', ') : 'none';
      console.log('  ' + row.case_study_id + ': ' + result.aggregate_score.toFixed(1) + '/100 | ' + flawStr);
    } catch (e) {
      console.log('  ' + row.case_study_id + ': ERROR - ' + e.message);
    }
  }

  // Summary
  const scores = results.map(r => r.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  console.log('\n=== SUMMARY ===');
  console.log('Cases:', results.length);
  console.log('Mean Score:', mean.toFixed(2) + '/100');
  console.log('Range:', min.toFixed(1) + ' - ' + max.toFixed(1));

  console.log('\n=== FLAW FREQUENCY ===');
  const sorted = Object.entries(flawCounts).sort((a, b) => b[1] - a[1]);
  for (const [flaw, count] of sorted) {
    const pct = ((count / results.length) * 100).toFixed(0);
    console.log('  ' + flaw + ': ' + count + '/' + results.length + ' (' + pct + '%)');
  }

  db.close();
});
