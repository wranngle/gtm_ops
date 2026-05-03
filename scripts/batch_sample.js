#!/usr/bin/env node
/**
 * Batch Execute Sample Inputs
 * Runs the pipeline against a diverse sample of 10 inputs
 */

import dotenv from 'dotenv';
import { UnifiedPipeline } from '../lib/pipeline.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirnameInit = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirnameInit, '..', '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const inputDir = path.join(rootDir, 'input');
const outputDir = path.join(rootDir, 'output');

// Diverse sample of inputs covering different industries and scenarios
const sampleInputs = [
  'test_medical_intake.txt',      // Healthcare
  'test_legal_routing.txt',       // Legal
  'test_real_estate_leads.txt',   // Real estate
  'test_logistics_dispatch.txt',  // Logistics
  'novel_test_01_veterinary.txt', // Novel industry
  'novel_test_09_hvac_contractor.txt', // Trades
  'stress_03_missing_data.txt',   // Edge case - missing data
  'stress_05_extreme_scale.txt',  // Edge case - large scale
  'stress_10_zero_values.txt',    // Edge case - zero values
  'test_recruitment_agency.txt',  // Service industry
].map(f => path.join(inputDir, f)).filter(f => fs.existsSync(f));

console.log(`\n========================================`);
console.log(`SAMPLE BATCH: ${sampleInputs.length} diverse inputs`);
console.log(`========================================\n`);

const results = {
  success: [],
  failed: []
};

async function runPipeline(inputPath, index, total) {
  const filename = path.basename(inputPath);
  console.log(`\n[${index + 1}/${total}] ${filename}`);
  console.log(`${'─'.repeat(50)}`);

  const startTime = Date.now();

  try {
    const pipeline = new UnifiedPipeline({
      outputDir,
      enableHistory: false,
      verbose: false
    });

    // pipeline.run expects (inputPath, outputDir)
    const result = await pipeline.run(inputPath, outputDir);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      console.log(`✓ SUCCESS in ${duration}s -> ${result.clientSlug}`);
      results.success.push({ file: filename, slug: result.clientSlug, duration });
    } else {
      console.log(`✗ FAILED in ${duration}s: ${result.error}`);
      results.failed.push({ file: filename, error: result.error });
    }

    return result;
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✗ ERROR in ${duration}s: ${err.message}`);
    results.failed.push({ file: filename, error: err.message });
    return { success: false, error: err.message };
  }
}

async function main() {
  const startTime = Date.now();

  for (let i = 0; i < sampleInputs.length; i++) {
    await runPipeline(sampleInputs[i], i, sampleInputs.length);
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`SAMPLE BATCH COMPLETE`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`Duration: ${duration} minutes`);
  console.log(`Success: ${results.success.length}/${sampleInputs.length}`);
  console.log(`Failed: ${results.failed.length}/${sampleInputs.length}`);

  if (results.failed.length > 0) {
    console.log(`\nFailed:`);
    results.failed.forEach(f => console.log(`  • ${f.file}: ${f.error}`));
  }

  // Output summary for each success
  if (results.success.length > 0) {
    console.log(`\nGenerated Outputs:`);
    results.success.forEach(s => console.log(`  ✓ ${s.slug} (${s.duration}s)`));
  }

  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
