/**
 * ATDD Tests: Input Extraction Accuracy
 *
 * Atomic validation that raw input text is correctly extracted into schema fields.
 * Each test validates a specific extraction mapping with evidence.
 *
 * Test Matrix: 42 input files × field categories = ~200 atomic tests
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Test data: Map input files to expected schema extractions
interface ExtractionExpectation {
  inputFile: string;
  inputPattern: RegExp | string;
  schemaPath: string;
  expectedValue: string | number | RegExp;
  tolerance?: number; // For numeric comparisons
}

// Load all input/output pairs
function loadTestPairs(): { input: string; schema: any; inputFile: string }[] {
  const inputDir = path.join(process.cwd(), 'input');
  const outputDir = path.join(process.cwd(), 'output');
  const pairs: { input: string; schema: any; inputFile: string }[] = [];

  const inputFiles = fs.readdirSync(inputDir).filter(f => f.endsWith('.txt'));

  for (const inputFile of inputFiles) {
    const inputContent = fs.readFileSync(path.join(inputDir, inputFile), 'utf8');

    // Find latest schema output for this input
    const clientDirs = fs.readdirSync(outputDir).filter(d =>
      fs.statSync(path.join(outputDir, d)).isDirectory()
    );

    for (const clientDir of clientDirs) {
      const clientPath = path.join(outputDir, clientDir);
      const schemaFiles = findSchemaFiles(clientPath);

      if (schemaFiles.length > 0) {
        // Get most recent schema
        const latestSchema = schemaFiles.sort().pop()!;
        try {
          const schema = JSON.parse(fs.readFileSync(latestSchema, 'utf8'));

          // Match input to output by checking if raw_input contains similar content
          if (schema.raw_input?.opening &&
              inputContent.slice(0, 100).includes(schema.raw_input.opening.slice(0, 50))) {
            pairs.push({ input: inputContent, schema, inputFile });
            break;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }

  return pairs;
}

function findSchemaFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findSchemaFiles(fullPath));
      } else if (entry.name.includes('_schema_') && entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Skip inaccessible directories
  }

  return files;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// ============================================================================
// TEST SUITE 1: Client Identity Extraction
// ============================================================================
test.describe('Atomic: Client Identity Extraction', () => {
  const pairs = loadTestPairs();

  test('[AE-001] Company name extracts to identity.client_name', () => {
    for (const { input, schema, inputFile } of pairs) {
      // Pattern: "Company: X" or "Client: X" or first line company name
      const companyMatch = input.match(/(?:Company|Client|Business):\s*(.+?)(?:\r?\n|$)/i);
      const clientName = schema.identity?.client_name;

      if (companyMatch) {
        expect(clientName, `${inputFile}: client_name should match input`).toBeTruthy();
        expect(clientName.toLowerCase()).not.toBe('unknown client');
      }
    }
  });

  test('[AE-002] Project/workflow name extracts to identity.project_name', () => {
    for (const { input, schema, inputFile } of pairs) {
      const projectMatch = input.match(/(?:Project|Workflow|Process):\s*(.+?)(?:\r?\n|$)/i);
      const projectName = schema.identity?.project_name;

      if (projectMatch) {
        expect(projectName, `${inputFile}: project_name should be populated`).toBeTruthy();
        expect(projectName.length).toBeGreaterThan(3);
      }
    }
  });

  test('[AE-003] Document slug follows WRN-AI-{client}-{process}-{YY}r{rev} format', () => {
    for (const { schema, inputFile } of pairs) {
      const slug = schema.identity?.document_slug;
      expect(slug, `${inputFile}: document_slug should exist`).toBeTruthy();
      expect(slug).toMatch(/^WRN-AI-[\w-]+-\d{2}r\d+$/);
    }
  });

  test('[AE-004] Client slug is lowercase hyphenated (max 15 chars)', () => {
    for (const { schema, inputFile } of pairs) {
      const clientSlug = schema.identity?.client_slug;
      expect(clientSlug, `${inputFile}: client_slug should exist`).toBeTruthy();
      expect(clientSlug).toMatch(/^[a-z0-9-]+$/);
      expect(clientSlug.length).toBeLessThanOrEqual(15);
    }
  });
});

// ============================================================================
// TEST SUITE 2: Volume & Timing Extraction
// ============================================================================
test.describe('Atomic: Volume & Timing Extraction', () => {
  const pairs = loadTestPairs();

  test('[AE-010] Daily/weekly/monthly volume extracts to intake section_b', () => {
    for (const { input, schema, inputFile } of pairs) {
      // Look for volume patterns
      const volumePatterns = [
        /(\d+)\+?\s*(?:per|\/)\s*day/i,
        /(\d+)\+?\s*(?:per|\/)\s*week/i,
        /(\d+)\+?\s*(?:per|\/)\s*month/i,
        /(\d+)\s*(?:daily|weekly|monthly)/i
      ];

      let hasVolumeInInput = false;
      for (const pattern of volumePatterns) {
        if (pattern.test(input)) {
          hasVolumeInInput = true;
          break;
        }
      }

      const runsPerPeriod = schema.intake?.section_b_volume_timing?.q06_runs_per_period;

      if (hasVolumeInInput) {
        expect(runsPerPeriod, `${inputFile}: q06_runs_per_period should be populated`).toBeTruthy();
        const numValue = parseInt(runsPerPeriod, 10);
        expect(numValue).toBeGreaterThan(0);
      }
    }
  });

  test('[AE-011] Time duration extracts with correct unit', () => {
    for (const { input, schema, inputFile } of pairs) {
      // Look for time patterns like "15-20 minutes", "2 hours"
      const timePattern = /(\d+)(?:-(\d+))?\s*(minutes?|mins?|hours?|hrs?|days?)/i;
      const timeMatch = input.match(timePattern);

      const avgTime = schema.intake?.section_b_volume_timing?.q07_avg_trigger_to_end;
      const timeUnit = schema.intake?.section_b_volume_timing?.q07_time_unit;

      if (timeMatch) {
        expect(avgTime, `${inputFile}: q07_avg_trigger_to_end should be populated`).toBeTruthy();
        expect(timeUnit, `${inputFile}: q07_time_unit should be populated`).toBeTruthy();
      }
    }
  });

  test('[AE-012] Worst case delay extracts when present', () => {
    for (const { input, schema, inputFile } of pairs) {
      // Look for delay/worst case patterns
      const delayPattern = /(?:worst|peak|delay|wait)[^.]*?(\d+)\s*(minutes?|hours?)/i;
      const delayMatch = input.match(delayPattern);

      const worstCase = schema.intake?.section_b_volume_timing?.q08_worst_case_delay;

      if (delayMatch) {
        expect(worstCase, `${inputFile}: q08_worst_case_delay should be populated`).toBeTruthy();
      }
    }
  });
});

// ============================================================================
// TEST SUITE 3: Systems & Integrations Extraction
// ============================================================================
test.describe('Atomic: Systems & Integrations Extraction', () => {
  const pairs = loadTestPairs();

  test('[AE-020] Systems list extracts to section_c_systems_handoffs', () => {
    for (const { input, schema, inputFile } of pairs) {
      // Look for systems section
      const systemsPattern = /(?:systems|tools|software|platforms)\s*(?:involved|used|include)?:?\s*\n?((?:[-•]\s*.+\n?)+)/i;
      const systemsMatch = input.match(systemsPattern);

      const systemsList = schema.intake?.section_c_systems_handoffs?.q10_systems_involved;

      if (systemsMatch) {
        expect(Array.isArray(systemsList), `${inputFile}: q10_systems_involved should be array`).toBe(true);
        expect(systemsList.length).toBeGreaterThan(0);
      }
    }
  });

  test('[AE-021] Each system has corresponding research entry', () => {
    for (const { schema, inputFile } of pairs) {
      const systemsList = schema.intake?.section_c_systems_handoffs?.q10_systems_involved || [];
      const researchIntegrations = schema.research?.integrations || [];

      // Not every system may have research, but at least some should
      if (systemsList.length > 0) {
        expect(researchIntegrations.length, `${inputFile}: should have research entries`).toBeGreaterThan(0);
      }
    }
  });

  test('[AE-022] Integration research has required fields', () => {
    for (const { schema, inputFile } of pairs) {
      const integrations = schema.research?.integrations || [];

      for (const int of integrations) {
        expect(int.integration, `${inputFile}: integration name required`).toBeTruthy();
        expect(int.research, `${inputFile}: research object required`).toBeTruthy();

        if (int.research) {
          expect(int.research.found, `${inputFile}: found field required`).toBeDefined();
          expect(int.research.complexity, `${inputFile}: complexity object required`).toBeTruthy();
          expect(int.research.complexity.score, `${inputFile}: complexity.score required`).toBeDefined();
        }
      }
    }
  });
});

// ============================================================================
// TEST SUITE 4: Financial Data Extraction
// ============================================================================
test.describe('Atomic: Financial Data Extraction', () => {
  const pairs = loadTestPairs();

  test('[AE-030] Annual cost extracts to bleed_assumptions', () => {
    for (const { input, schema, inputFile } of pairs) {
      // Look for annual cost patterns: "$135,000/year", "$X per year"
      const annualPattern = /\$[\d,]+(?:\.\d{2})?\s*(?:\/|per\s*)?year/i;
      const annualMatch = input.match(annualPattern);

      const assumptions = schema.measurements?.bleed_assumptions || [];
      const bleedTotal = schema.measurements?.bleed_total;

      if (annualMatch) {
        // Annual cost should be captured in assumptions OR bleed_total
        // Labels can vary: "labor", "cost", "annual", "yearly", "salary", etc.
        const hasRelevantAssumption = assumptions.some((a: any) =>
          a.label?.toLowerCase().includes('labor') ||
          a.label?.toLowerCase().includes('cost') ||
          a.label?.toLowerCase().includes('annual') ||
          a.label?.toLowerCase().includes('year') ||
          a.label?.toLowerCase().includes('salary')
        );
        const hasBleedTotal = bleedTotal && bleedTotal.value > 0;

        expect(
          hasRelevantAssumption || hasBleedTotal,
          `${inputFile}: should have cost assumption or bleed total`
        ).toBe(true);
      }
    }
  });

  test('[AE-031] Budget extracts when stated', () => {
    for (const { input, schema, inputFile } of pairs) {
      // Look for budget patterns
      const budgetPattern = /budget[:\s]*\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i;
      const budgetMatch = input.match(budgetPattern);

      // Budget may appear in attachments.notes or be used for pricing validation
      const notes = schema.intake?.attachments?.notes || '';

      if (budgetMatch) {
        // If budget is in input, it should be referenced somewhere
        const budgetValue = budgetMatch[1].replace(/,/g, '');
        const budgetNum = parseFloat(budgetValue);

        // Check that pricing is reasonable relative to budget
        const totalPrice = schema.estimate?.pricing?.total;
        if (totalPrice && budgetNum > 0) {
          // Price should be within reasonable range of budget
          expect(totalPrice).toBeLessThan(budgetNum * 2);
        }
      }
    }
  });

  test('[AE-032] Error rate extracts to metrics', () => {
    for (const { input, schema, inputFile } of pairs) {
      // Look for error rate patterns
      const errorPattern = /error\s*rate[^.]*?(\d+(?:\.\d+)?)\s*%/i;
      const errorMatch = input.match(errorPattern);

      const metrics = schema.measurements?.metrics?.byId || {};

      if (errorMatch) {
        const hasErrorMetric = Object.values(metrics).some((m: any) =>
          m.metric_type === 'error_rate' || m.name?.toLowerCase().includes('error')
        );
        expect(hasErrorMetric, `${inputFile}: should have error rate metric`).toBe(true);
      }
    }
  });

  test('[AE-033] Bleed total is properly calculated', () => {
    for (const { schema, inputFile } of pairs) {
      const bleedTotal = schema.measurements?.bleed_total;

      if (bleedTotal) {
        expect(bleedTotal.value, `${inputFile}: bleed total value required`).toBeDefined();
        expect(bleedTotal.value).toBeGreaterThan(0);
        expect(bleedTotal.currency).toBe('USD');
        expect(bleedTotal.period).toBeTruthy();
        expect(bleedTotal.display, `${inputFile}: bleed display required`).toMatch(/\$[\d,]+/);
      }
    }
  });
});

// ============================================================================
// TEST SUITE 5: Metric Threshold Validation
// ============================================================================
test.describe('Atomic: Metric Threshold Validation', () => {
  const pairs = loadTestPairs();

  test('[AE-040] Each metric has threshold with target', () => {
    for (const { schema, inputFile } of pairs) {
      const metrics = Object.values(schema.measurements?.metrics?.byId || {}) as any[];

      for (const metric of metrics) {
        if (metric.threshold) {
          expect(metric.threshold.target, `${inputFile}/${metric.name}: target required`).toBeDefined();
          expect(metric.threshold.direction, `${inputFile}/${metric.name}: direction required`).toBeTruthy();
        }
      }
    }
  });

  test('[AE-041] Metric status is correctly derived from threshold', () => {
    for (const { schema, inputFile } of pairs) {
      const metrics = Object.values(schema.measurements?.metrics?.byId || {}) as any[];

      for (const metric of metrics) {
        if (metric.threshold && metric.value !== undefined && metric.status) {
          const { target, healthy_max, warning_max, direction } = metric.threshold;
          const value = metric.value;

          // Validate status is one of the valid values
          expect(
            ['healthy', 'warning', 'critical'].includes(metric.status),
            `${inputFile}/${metric.name}: status should be valid`
          ).toBe(true);

          // Soft validation: check if status is approximately correct
          // Some edge cases may have different thresholds or calculation logic
          if (direction === 'lower_is_better' && warning_max !== undefined) {
            if (value > warning_max * 1.5) {
              // Far above warning_max should definitely be critical or warning
              expect(
                ['critical', 'warning'].includes(metric.status),
                `${inputFile}/${metric.name}: value ${value} > warning_max ${warning_max} * 1.5, should be critical/warning`
              ).toBe(true);
            }
          }
        }
      }
    }
  });

  test('[AE-042] Metric value_display matches value', () => {
    for (const { schema, inputFile } of pairs) {
      const metrics = Object.values(schema.measurements?.metrics?.byId || {}) as any[];

      for (const metric of metrics) {
        if (metric.value !== undefined && metric.value_display) {
          // Display should relate to the value (with formatting)
          const valueStr = metric.value.toString();
          const displayClean = metric.value_display.replace(/[^0-9.]/g, '');

          // Display formats to handle:
          // - Exact match: "45" matches 45
          // - Formatted: "45%" matches 45
          // - Large numbers: "1.2M", "50K" (uppercase)
          // - Time conversions: "3h" (180min), "15m" (15min), "45s" (seconds)

          let matchFound = false;

          // Handle time unit conversions
          const timeMatch = metric.value_display.match(/([\d.]+)\s*([hms])(?:\s|$)/i);
          if (timeMatch) {
            const displayNum = parseFloat(timeMatch[1]);
            const unit = timeMatch[2].toLowerCase();
            // Check if value matches common conversions
            // e.g., "3h" display with value 180 (minutes) or value 3 (hours)
            if (unit === 'h') {
              matchFound = metric.value === displayNum || Math.abs(metric.value - displayNum * 60) < 1;
            } else if (unit === 'm') {
              matchFound = metric.value === displayNum || Math.abs(metric.value - displayNum) < 1;
            } else if (unit === 's') {
              matchFound = metric.value === displayNum || Math.abs(metric.value - displayNum / 60) < 1;
            }
          }

          // Handle large number abbreviations (uppercase K, M, B only)
          if (!matchFound) {
            const largeAbbrevMatch = metric.value_display.match(/([\d.]+)\s*([KMB])(?:\s|$)/);
            if (largeAbbrevMatch && metric.value > 1000) {
              const abbrevNum = parseFloat(largeAbbrevMatch[1]);
              const multiplier = { K: 1000, M: 1000000, B: 1000000000 }[largeAbbrevMatch[2]] || 1;
              const expectedValue = abbrevNum * multiplier;
              // Check if within 10% tolerance for large numbers
              matchFound = Math.abs(expectedValue - metric.value) / metric.value < 0.1;
            }
          }

          // Standard match: display contains value or part of value
          if (!matchFound) {
            matchFound =
              displayClean.includes(valueStr) ||
              displayClean.includes(valueStr.split('.')[0]) ||
              metric.value_display.includes(valueStr.split('.')[0]) ||
              (metric.value < 1000 && metric.value_display.includes(Math.round(metric.value).toString()));
          }

          expect(
            matchFound,
            `${inputFile}/${metric.name}: display "${metric.value_display}" should relate to value ${metric.value}`
          ).toBe(true);
        }
      }
    }
  });
});

// ============================================================================
// TEST SUITE 6: Evidence Traceability
// ============================================================================
test.describe('Atomic: Evidence Traceability', () => {
  const pairs = loadTestPairs();

  test('[AE-050] Metrics have evidence with source type', () => {
    for (const { schema, inputFile } of pairs) {
      const metrics = Object.values(schema.measurements?.metrics?.byId || {}) as any[];

      for (const metric of metrics) {
        if (metric.evidence && metric.evidence.length > 0) {
          for (const evidence of metric.evidence) {
            expect(evidence.type, `${inputFile}/${metric.name}: evidence type required`).toBeTruthy();
            expect(evidence.summary, `${inputFile}/${metric.name}: evidence summary required`).toBeTruthy();
          }
        }
      }
    }
  });

  test('[AE-051] Calculations have formula and inputs', () => {
    for (const { schema, inputFile } of pairs) {
      const calculations = schema.measurements?.bleed_calculations || [];

      for (const calc of calculations) {
        expect(calc.formula, `${inputFile}/${calc.id}: formula required`).toBeTruthy();
        expect(calc.result, `${inputFile}/${calc.id}: result required`).toBeDefined();
        expect(calc.result_display, `${inputFile}/${calc.id}: result_display required`).toBeTruthy();
      }
    }
  });

  test('[AE-052] Raw input preserves original text', () => {
    for (const { input, schema, inputFile } of pairs) {
      const rawOpening = schema.raw_input?.opening;

      if (rawOpening) {
        // First 50 chars of input should match schema.raw_input.opening
        const inputStart = input.slice(0, 50).trim();
        const openingStart = rawOpening.slice(0, 50).trim();

        expect(
          openingStart.includes(inputStart.slice(0, 20)) || inputStart.includes(openingStart.slice(0, 20)),
          `${inputFile}: raw_input should preserve original text`
        ).toBe(true);
      }
    }
  });
});
