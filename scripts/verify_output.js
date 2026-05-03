#!/usr/bin/env node
/**
 * Verify Pipeline Output
 *
 * Automated verification for the unified presales pipeline.
 * Checks for missing display fields, undefined values, and data path issues.
 *
 * Usage: node scripts/verify-output.js [output_dir]
 * Default: ./output/
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logCheck(pass, message) {
  const icon = pass ? '✓' : '✗';
  const color = pass ? 'green' : 'red';
  log(`  ${icon} ${message}`, color);
  return pass;
}

/**
 * Get nested value from object using dot notation path
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Find all JSON schema files in output directory
 */
function findSchemaFiles(outputDir) {
  const files = [];

  function walkDir(dir) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.includes('unified_schema') && entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }
  }

  walkDir(outputDir);
  return files;
}

/**
 * Check for undefined values in schema
 */
function checkUndefinedValues(schema, path = '') {
  const issues = [];

  function walk(obj, currentPath) {
    if (obj === undefined) {
      issues.push(currentPath);
      return;
    }
    if (obj === null || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      if (value === undefined) {
        issues.push(newPath);
      } else if (typeof value === 'object' && value !== null) {
        walk(value, newPath);
      }
    }
  }

  walk(schema, path);
  return issues;
}

/**
 * Check display fields contract
 */
function checkDisplayFields(schema) {
  const requiredDisplayFields = [
    // FinOps value breakdown
    { numeric: 'estimate.finops.value_breakdown.total_annual_value', display: 'estimate.finops.value_breakdown.total_annual_display' },
    { numeric: 'estimate.finops.value_breakdown.total_monthly_value', display: 'estimate.finops.value_breakdown.total_monthly_display' },
    { numeric: 'estimate.finops.value_breakdown.hard_savings.annual', display: 'estimate.finops.value_breakdown.hard_savings.annual_display' },
    { numeric: 'estimate.finops.value_breakdown.hard_savings.monthly', display: 'estimate.finops.value_breakdown.hard_savings.monthly_display' },
    { numeric: 'estimate.finops.value_breakdown.modeled_opportunity.annual', display: 'estimate.finops.value_breakdown.modeled_opportunity.annual_display' },
    { numeric: 'estimate.finops.value_breakdown.modeled_opportunity.monthly', display: 'estimate.finops.value_breakdown.modeled_opportunity.monthly_display' },
    // Proposal ROI
    { numeric: 'proposal.roi.value_breakdown.total_annual_value', display: 'proposal.roi.value_breakdown.total_annual_display' },
    { numeric: 'proposal.roi.value_breakdown.hard_savings.annual', display: 'proposal.roi.value_breakdown.hard_savings.annual_display' },
    { numeric: 'proposal.roi.value_breakdown.modeled_opportunity.annual', display: 'proposal.roi.value_breakdown.modeled_opportunity.annual_display' },
    // Project plan finops
    { numeric: 'project_plan.finops.value_breakdown.total_annual_value', display: 'project_plan.finops.value_breakdown.total_annual_display' },
  ];

  const issues = [];

  for (const field of requiredDisplayFields) {
    const numericValue = getNestedValue(schema, field.numeric);
    const displayValue = getNestedValue(schema, field.display);

    if (numericValue !== undefined && displayValue === undefined) {
      issues.push({
        numeric: field.numeric,
        display: field.display,
        numericValue,
        message: `Missing display field for ${field.numeric} (value: ${numericValue})`
      });
    }

    // Check that display matches numeric
    if (numericValue !== undefined && displayValue !== undefined) {
      const expectedDisplay = `$${numericValue.toLocaleString()}`;
      if (displayValue !== expectedDisplay) {
        issues.push({
          numeric: field.numeric,
          display: field.display,
          numericValue,
          displayValue,
          expectedDisplay,
          message: `Display mismatch: ${field.display} is "${displayValue}" but expected "${expectedDisplay}"`
        });
      }
    }
  }

  return issues;
}

/**
 * Check for common data path issues
 */
function checkDataPaths(schema) {
  const issues = [];

  // Client name should be populated
  const clientName = getNestedValue(schema, 'project_identity.client_name');
  if (!clientName || clientName === 'Unknown Client') {
    issues.push('Client name is missing or default');
  }

  // Process name should be populated
  const processName = getNestedValue(schema, 'project_identity.process_name');
  if (!processName || processName === 'Business Process') {
    issues.push('Process name is missing or default');
  }

  // ROI payback should be calculated
  const paybackMonths = getNestedValue(schema, 'proposal.roi.payback_period_months') ||
                        getNestedValue(schema, 'proposal.roi.payback_months');
  if (paybackMonths === undefined || paybackMonths === 'N/A') {
    issues.push('ROI payback period is missing or N/A');
  }

  // Payment schedule should have amounts
  const milestones = getNestedValue(schema, 'proposal.pricing.milestones');
  if (milestones) {
    const milestonesArray = Array.isArray(milestones) ? milestones : Object.values(milestones);
    for (const milestone of milestonesArray) {
      if (!milestone.amount && !milestone.cost) {
        issues.push(`Milestone "${milestone.name || milestone.phase}" missing amount`);
      }
    }
  }

  return issues;
}

/**
 * Main verification function
 */
async function verify(outputDir) {
  log('\n╔══════════════════════════════════════════════════════════════════╗', 'blue');
  log('║  WRANNGLE PIPELINE VERIFICATION                                  ║', 'blue');
  log('╚══════════════════════════════════════════════════════════════════╝', 'blue');

  log(`\nOutput directory: ${outputDir}`, 'bold');

  // Find schema files
  const schemaFiles = findSchemaFiles(outputDir);
  if (schemaFiles.length === 0) {
    log('\n✗ No schema files found!', 'red');
    process.exit(1);
  }

  log(`\nFound ${schemaFiles.length} schema file(s)`, 'blue');

  let allPassed = true;

  for (const schemaFile of schemaFiles) {
    log(`\n━━━ ${schemaFile} ━━━`, 'bold');

    let schema;
    try {
      schema = JSON.parse(readFileSync(schemaFile, 'utf-8'));
    } catch (e) {
      log(`  ✗ Failed to parse JSON: ${e.message}`, 'red');
      allPassed = false;
      continue;
    }

    // Check 1: Undefined values
    log('\n  [1] Checking for undefined values...', 'blue');
    const undefinedIssues = checkUndefinedValues(schema);
    if (undefinedIssues.length > 0) {
      allPassed = false;
      log(`  ✗ Found ${undefinedIssues.length} undefined values:`, 'red');
      for (const issue of undefinedIssues.slice(0, 5)) {
        log(`      - ${issue}`, 'yellow');
      }
      if (undefinedIssues.length > 5) {
        log(`      ... and ${undefinedIssues.length - 5} more`, 'yellow');
      }
    } else {
      logCheck(true, 'No undefined values found');
    }

    // Check 2: Display fields
    log('\n  [2] Checking display field contract...', 'blue');
    const displayIssues = checkDisplayFields(schema);
    if (displayIssues.length > 0) {
      allPassed = false;
      log(`  ✗ Found ${displayIssues.length} display field issues:`, 'red');
      for (const issue of displayIssues) {
        log(`      - ${issue.message}`, 'yellow');
      }
    } else {
      logCheck(true, 'All display fields present and correct');
    }

    // Check 3: Data paths
    log('\n  [3] Checking data paths...', 'blue');
    const dataIssues = checkDataPaths(schema);
    if (dataIssues.length > 0) {
      allPassed = false;
      log(`  ✗ Found ${dataIssues.length} data path issues:`, 'red');
      for (const issue of dataIssues) {
        log(`      - ${issue}`, 'yellow');
      }
    } else {
      logCheck(true, 'All data paths populated correctly');
    }
  }

  // Summary
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'bold');
  if (allPassed) {
    log('✓ ALL CHECKS PASSED', 'green');
    process.exit(0);
  } else {
    log('✗ SOME CHECKS FAILED - Review issues above', 'red');
    process.exit(1);
  }
}

// Run verification
const outputDir = process.argv[2] || './output/';
verify(outputDir);
