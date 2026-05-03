#!/usr/bin/env bun
/**
 * Check evaluation regression against baseline.
 * Exits non-zero if mean score drops below threshold.
 *
 * Used by CI — runs automatically, no human input needed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const BASELINE_PATH = path.join(PROJECT_ROOT, 'config', 'eval_baseline.json');
const REPORT_PATH = path.join(PROJECT_ROOT, 'evaluation-report.json');

interface Baseline {
  min_acceptable_score: number;
  max_acceptable_flaws: number;
  updated_at: string;
}

const DEFAULT_BASELINE: Baseline = {
  min_acceptable_score: 40, // Start lenient, tighten over time
  max_acceptable_flaws: 8,
  updated_at: new Date().toISOString(),
};

function loadBaseline(): Baseline {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
  } catch {
    // No baseline yet — create default
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(DEFAULT_BASELINE, null, 2));
    console.log(`Created default baseline at ${BASELINE_PATH}`);
    return DEFAULT_BASELINE;
  }
}

function main() {
  const baseline = loadBaseline();

  // Check if report exists
  if (!fs.existsSync(REPORT_PATH)) {
    console.log('No evaluation report found. Skipping regression check.');
    process.exit(0);
  }

  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'));

  if (!report.dimension_performance || report.dimension_performance.length === 0) {
    console.log('No evaluation results. Skipping regression check.');
    process.exit(0);
  }

  // Calculate mean score across dimensions
  const scores = report.dimension_performance.map((d: any) => d.mean);
  const meanScore = (scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 100;

  // Count total flaws
  const totalFlaws = (report.flaw_frequency || []).reduce(
    (sum: number, f: any) => sum + f.count,
    0,
  );

  console.log(`\nEvaluation Results:`);
  console.log(`  Mean score:  ${meanScore.toFixed(1)}`);
  console.log(`  Total flaws: ${totalFlaws}`);
  console.log(`  Baseline:    score >= ${baseline.min_acceptable_score}, flaws <= ${baseline.max_acceptable_flaws}`);

  let failed = false;

  if (meanScore < baseline.min_acceptable_score) {
    console.error(
      `\nREGRESSION: Mean score ${meanScore.toFixed(1)} below baseline ${baseline.min_acceptable_score}`,
    );
    failed = true;
  }

  if (totalFlaws > baseline.max_acceptable_flaws) {
    console.error(
      `\nREGRESSION: ${totalFlaws} flaws exceeds baseline max ${baseline.max_acceptable_flaws}`,
    );
    failed = true;
  }

  if (failed) {
    console.error('\nRun `npm run eval:report` locally for details.');
    process.exit(1);
  }

  console.log('\nNo regressions detected.');
}

main();
