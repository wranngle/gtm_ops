#!/usr/bin/env node
/**
 * Script to check data consistency issues in output schemas
 */
import fs from 'fs';
import path from 'path';

const outputDir = './output';

function findSchemas(dir) {
  const schemas = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        schemas.push(...findSchemas(fullPath));
      } else if (entry.name.includes('_schema_') && entry.name.endsWith('.json')) {
        try {
          schemas.push({ file: fullPath, schema: JSON.parse(fs.readFileSync(fullPath, 'utf8')) });
        } catch (e) {}
      }
    }
  } catch (e) {}
  return schemas;
}

const schemas = findSchemas(outputDir);
console.log(`Checking ${schemas.length} schemas...\n`);

// CC-030: Metrics array vs byId
console.log('=== CC-030: Metrics array vs byId ===');
let cc030Fails = 0;
for (const { schema, file } of schemas) {
  const byIdCount = Object.keys(schema.measurements?.metrics?.byId || {}).length;
  const arrayLen = schema.measurements?.measurements?.length || 0;
  if (byIdCount !== arrayLen) {
    cc030Fails++;
    console.log(`  MISMATCH: ${path.basename(path.dirname(file))}`);
    console.log(`    byId: ${byIdCount}, array: ${arrayLen}`);
  }
}
console.log(`  ${cc030Fails} mismatches found\n`);

// CC-022: Risk multiplier consistency
console.log('=== CC-022: Risk multiplier consistency ===');
let cc022Fails = 0;
for (const { schema, file } of schemas) {
  const riskMultiplier = schema.research?.tier_assessment?.riskMultiplier;
  const baseHours = schema.estimate?.effort?.base_hours?.total;
  const adjustedHours = schema.estimate?.effort?.adjusted_hours?.total;

  if (riskMultiplier && baseHours && adjustedHours) {
    const expectedAdjusted = baseHours * riskMultiplier;
    const tolerance = expectedAdjusted * 0.15;
    const diff = Math.abs(adjustedHours - expectedAdjusted);

    if (diff > tolerance) {
      cc022Fails++;
      console.log(`  MISMATCH: ${path.basename(path.dirname(file))}`);
      console.log(`    base: ${baseHours}, risk: ${riskMultiplier}, expected: ${expectedAdjusted}`);
      console.log(`    actual: ${adjustedHours}, diff: ${diff.toFixed(1)}, tolerance: ${tolerance.toFixed(1)}`);
    }
  }
}
console.log(`  ${cc022Fails} mismatches found\n`);

// CC-012: Integration complexity vs tier
console.log('=== CC-012: Integration complexity vs tier ===');
let cc012Fails = 0;
for (const { schema, file } of schemas) {
  const avgComplexity = schema.research_gap_report?.average_complexity;
  const tierKey = schema.research?.tier_assessment?.key;

  if (avgComplexity !== undefined && tierKey) {
    let shouldFail = false;
    if (avgComplexity >= 7 && tierKey !== 'enterprise' && tierKey !== 'complex' && tierKey !== 'complex_integration') {
      shouldFail = true;
    } else if (avgComplexity <= 2 && tierKey !== 'standard' && tierKey !== 'starter' && tierKey !== 'simple') {
      shouldFail = true;
    }

    if (shouldFail) {
      cc012Fails++;
      console.log(`  MISMATCH: ${path.basename(path.dirname(file))}`);
      console.log(`    complexity: ${avgComplexity}, tier: ${tierKey}`);
    }
  }
}
console.log(`  ${cc012Fails} mismatches found\n`);

// CC-021: Tier assessment drives base hours
console.log('=== CC-021: Tier assessment drives base hours ===');
let cc021Fails = 0;
for (const { schema, file } of schemas) {
  const tierBaseHours = schema.research?.tier_assessment?.baseHours;
  const estimateBaseHours = schema.estimate?.effort?.base_hours?.total;

  if (tierBaseHours && estimateBaseHours) {
    const ratio = estimateBaseHours / tierBaseHours;

    if (ratio < 0.5 || ratio > 2.0) {
      cc021Fails++;
      console.log(`  MISMATCH: ${path.basename(path.dirname(file))}`);
      console.log(`    tier baseHours: ${tierBaseHours}, estimate baseHours: ${estimateBaseHours}`);
      console.log(`    ratio: ${ratio.toFixed(2)} (should be 0.5-2.0)`);
    }
  }
}
console.log(`  ${cc021Fails} mismatches found\n`);
