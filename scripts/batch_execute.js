#!/usr/bin/env bun
/**
 * Batch Execute All Inputs
 * Runs the pipeline against all input files in sequence
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

// Get all .txt files in input directory
const inputFiles = fs.readdirSync(inputDir)
  .filter(f => f.endsWith('.txt'))
  .map(f => path.join(inputDir, f));

console.log(`\n========================================`);
console.log(`BATCH EXECUTION: ${inputFiles.length} input files`);
console.log(`========================================\n`);

const results = {
  success: [],
  failed: [],
  skipped: []
};

async function runPipeline(inputPath) {
  const filename = path.basename(inputPath);
  console.log(`\n[START] ${filename}`);

  try {
    const pipeline = new UnifiedPipeline({
      outputDir,
      enableHistory: false, // Skip history for batch mode
      verbose: false
    });

    // Pass file path directly - pipeline reads the file
    const result = await pipeline.run(inputPath, outputDir);

    if (result.success) {
      console.log(`[SUCCESS] ${filename} -> ${result.clientSlug}`);
      results.success.push({ file: filename, slug: result.clientSlug });
    } else {
      console.log(`[FAILED] ${filename}: ${result.error}`);
      results.failed.push({ file: filename, error: result.error });
    }

    return result;
  } catch (err) {
    console.log(`[ERROR] ${filename}: ${err.message}`);
    results.failed.push({ file: filename, error: err.message });
    return { success: false, error: err.message };
  }
}

// Run all inputs sequentially
async function main() {
  const startTime = Date.now();

  for (let i = 0; i < inputFiles.length; i++) {
    const inputPath = inputFiles[i];
    console.log(`\n[${i + 1}/${inputFiles.length}] Processing: ${path.basename(inputPath)}`);
    await runPipeline(inputPath);
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log(`\n========================================`);
  console.log(`BATCH EXECUTION COMPLETE`);
  console.log(`========================================`);
  console.log(`Total Time: ${duration} minutes`);
  console.log(`Success: ${results.success.length}`);
  console.log(`Failed: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log(`\nFailed Files:`);
    results.failed.forEach(f => console.log(`  - ${f.file}: ${f.error}`));
  }

  console.log(`\n`);
}

main().catch(console.error);
