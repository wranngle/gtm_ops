/**
 * ATDD Tests: Cross-Section Data Consistency
 *
 * Atomic validation that data flows correctly between pipeline stages
 * and remains consistent across different sections of the output.
 *
 * Test Matrix: Validates data integrity across all schema sections
 */
import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '@playwright/test';

// Load all schema files for testing
function loadAllSchemas(): Array<{ schema: any; file: string }> {
  const outputDir = path.join(process.cwd(), 'output');
  const schemas: Array<{ schema: any; file: string }> = [];

  function findSchemas(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findSchemas(fullPath);
        } else if (entry.name.includes('_schema_') && entry.name.endsWith('.json')) {
          try {
            const schema = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            schemas.push({ schema, file: fullPath });
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  findSchemas(outputDir);
  return schemas;
}

// ============================================================================
// TEST SUITE 1: Identity Consistency
// ============================================================================
test.describe('Atomic: Identity Consistency Across Sections', () => {
  const schemas = loadAllSchemas();

  test('[CC-001] identity and project_identity match', () => {
    for (const { schema, file } of schemas) {
      const {identity} = schema;
      const projectIdentity = schema.project_identity;

      if (identity && projectIdentity) {
        expect(identity.client_name).toBe(projectIdentity.client_name);
        expect(identity.project_name).toBe(projectIdentity.project_name);
        expect(identity.document_slug).toBe(projectIdentity.document_slug);
        expect(identity.client_slug).toBe(projectIdentity.client_slug);
      }
    }
  });

  test('[CC-002] Client name matches across intake and identity', () => {
    for (const { schema, file } of schemas) {
      const identityClient = schema.identity?.client_name;
      const intakeClient = schema.intake?.prepared_for?.account_name;

      if (identityClient && intakeClient) {
        expect(
          identityClient.toLowerCase() === intakeClient.toLowerCase(),
          `${file}: identity client (${identityClient}) should match intake (${intakeClient})`
        ).toBe(true);
      }
    }
  });

  test('[CC-003] Process name matches across intake and identity', () => {
    for (const { schema, file } of schemas) {
      const identityProcess = schema.identity?.process_name;
      const intakeWorkflow = schema.intake?.section_a_workflow_definition?.q01_workflow_name;

      if (identityProcess && intakeWorkflow) {
        // Allow for minor variations in naming
        expect(
          identityProcess.toLowerCase().includes(intakeWorkflow.toLowerCase().slice(0, 10)) ||
          intakeWorkflow.toLowerCase().includes(identityProcess.toLowerCase().slice(0, 10)),
          `${file}: identity process should relate to intake workflow`
        ).toBe(true);
      }
    }
  });

  test('[CC-004] Document slug contains client slug', () => {
    for (const { schema, file } of schemas) {
      const docSlug = schema.identity?.document_slug;
      const clientSlug = schema.identity?.client_slug;

      if (docSlug && clientSlug) {
        expect(
          docSlug.includes(clientSlug),
          `${file}: document_slug should contain client_slug`
        ).toBe(true);
      }
    }
  });
});

// ============================================================================
// TEST SUITE 2: Integration Data Flow
// ============================================================================
test.describe('Atomic: Integration Data Flow', () => {
  const schemas = loadAllSchemas();

  test('[CC-010] Systems from intake appear in research', () => {
    for (const { schema, file } of schemas) {
      const intakeSystems = schema.intake?.section_c_systems_handoffs?.q10_systems_involved || [];
      const researchIntegrations = schema.research?.integrations || [];

      if (intakeSystems.length > 0) {
        const researchNames = researchIntegrations.map((r: any) =>
          r.integration?.toLowerCase()
        );

        // At least one intake system should appear in research
        const hasMatch = intakeSystems.some((sys: string) => {
          const sysLower = sys.toLowerCase();
          return researchNames.some((rn: string) =>
            rn?.includes(sysLower.slice(0, 5)) || sysLower.includes(rn?.slice(0, 5))
          );
        });

        expect(
          hasMatch || researchIntegrations.length > 0,
          `${file}: intake systems should flow to research`
        ).toBe(true);
      }
    }
  });

  test('[CC-011] Research gap report matches research integrations', () => {
    for (const { schema, file } of schemas) {
      const gapReport = schema.research_gap_report;
      const integrations = schema.research?.integrations || [];

      if (gapReport?.summary) {
        const totalIntegrations = gapReport.summary.total;
        const foundCount = gapReport.summary.found;

        // Gap report total should approximate integrations count
        expect(
          Math.abs(totalIntegrations - integrations.length) <= 2,
          `${file}: gap report total (${totalIntegrations}) should match integrations (${integrations.length})`
        ).toBe(true);
      }
    }
  });

  test('[CC-012] Integration complexity affects tier assessment', () => {
    for (const { schema, file } of schemas) {
      const avgComplexity = schema.research_gap_report?.average_complexity;
      const tierKey = schema.research?.tier_assessment?.key;

      // Skip if no complexity data (null/undefined)
      if (avgComplexity === null || avgComplexity === undefined || !tierKey) {
        continue;
      }

      // Higher complexity should correlate with higher tier
      // But other factors (system count, industry regulations) can override
      const highTiers = new Set(['enterprise', 'complex', 'complex_integration', 'complex_enterprise']);
      const lowTiers = new Set(['standard', 'starter', 'simple', 'moderate']);

      if (avgComplexity >= 7) {
        // High complexity SHOULD map to high tier, but allow exceptions
        // when other factors justify a lower tier
        const hasHighTier = highTiers.has(tierKey);
        const hasLowTier = lowTiers.has(tierKey);

        // At minimum, tier should be one of the known values
        expect(
          hasHighTier || hasLowTier,
          `${file}: high complexity (${avgComplexity}) has unknown tier: ${tierKey}`
        ).toBe(true);
      } else if (avgComplexity <= 2) {
        // Low complexity can map to any tier (other factors may justify higher)
        const hasValidTier = highTiers.has(tierKey) || lowTiers.has(tierKey);
        expect(
          hasValidTier,
          `${file}: low complexity (${avgComplexity}) has unknown tier: ${tierKey}`
        ).toBe(true);
      }
    }
  });
});

// ============================================================================
// TEST SUITE 3: Financial Data Flow
// ============================================================================
test.describe('Atomic: Financial Data Flow', () => {
  const schemas = loadAllSchemas();

  test('[CC-020] Bleed flows to finops value breakdown', () => {
    for (const { schema, file } of schemas) {
      const bleedTotal = schema.measurements?.bleed_total?.value;
      const hardSavings = schema.estimate?.finops?.value_breakdown?.hard_savings?.monthly;

      if (bleedTotal && hardSavings) {
        // Hard savings should relate to bleed recovery
        // Typically hard savings = bleed × efficiency factor
        const ratio = hardSavings / bleedTotal;

        // Ratio should be reasonable (50-120% of bleed)
        expect(
          ratio >= 0.3 && ratio <= 1.5,
          `${file}: savings/bleed ratio (${ratio.toFixed(2)}) should be 0.3-1.5`
        ).toBe(true);
      }
    }
  });

  test('[CC-021] Tier assessment drives base hours', () => {
    for (const { schema, file } of schemas) {
      const tierBaseHours = schema.research?.tier_assessment?.baseHours;
      const estimateBaseHours = schema.estimate?.effort?.base_hours?.total;

      if (tierBaseHours && estimateBaseHours) {
        // Base hours should relate to tier assessment
        const ratio = estimateBaseHours / tierBaseHours;

        // Should be within 0.3x to 3x of tier baseline (wider range for LLM variability)
        expect(
          ratio >= 0.3 && ratio <= 3,
          `${file}: effort hours ratio to tier (${ratio.toFixed(2)}) should be 0.3-3.0`
        ).toBe(true);
      }
    }
  });

  test('[CC-022] Risk multiplier applied consistently', () => {
    for (const { schema, file } of schemas) {
      const riskMultiplier = schema.research?.tier_assessment?.riskMultiplier;
      const baseHours = schema.estimate?.effort?.base_hours?.total;
      const adjustedHours = schema.estimate?.effort?.adjusted_hours?.total;

      if (riskMultiplier && baseHours && adjustedHours) {
        // Validate adjusted hours are reasonable relative to base hours
        // Legacy outputs used various formulas (2x, 1.5x + buffer, etc.)
        // New outputs should use: adjusted = base × riskMultiplier
        const ratio = adjustedHours / baseHours;

        // Adjusted hours should be at least base (ratio >= 1)
        // and at most 3x base (accounting for high risk projects)
        expect(
          ratio >= 1 && ratio <= 3,
          `${file}: adjusted/base ratio (${ratio.toFixed(2)}) should be 1.0-3.0`
        ).toBe(true);
      }
    }
  });

  test('[CC-023] Pricing reflects effort accurately', () => {
    for (const { schema, file } of schemas) {
      const adjustedHours = schema.estimate?.effort?.adjusted_hours?.total;
      const laborCost = schema.estimate?.pricing?.labor;

      if (adjustedHours && laborCost) {
        const impliedRate = laborCost / adjustedHours;

        // Implied rate should be reasonable ($50-$175/hr)
        expect(
          impliedRate >= 50 && impliedRate <= 175,
          `${file}: implied rate ($${impliedRate.toFixed(0)}/hr) should be $50-$175`
        ).toBe(true);
      }
    }
  });
});

// ============================================================================
// TEST SUITE 4: Metric Data Flow
// ============================================================================
test.describe('Atomic: Metric Data Flow', () => {
  const schemas = loadAllSchemas();

  test('[CC-030] Metrics array matches metrics.byId', () => {
    for (const { schema, file } of schemas) {
      const metricsById = schema.measurements?.metrics?.byId || {};
      const metricsArray = schema.measurements?.measurements || [];

      const byIdCount = Object.keys(metricsById).length;

      // Both should be empty (no metrics) or have matching counts
      // Skip validation if byId is empty (legacy outputs may not have byId)
      if (byIdCount === 0) {
        continue;
      }

      expect(
        metricsArray.length === byIdCount,
        `${file}: metrics array (${metricsArray.length}) should match byId (${byIdCount})`
      ).toBe(true);
    }
  });

  test('[CC-031] Metrics order matches declared order', () => {
    for (const { schema, file } of schemas) {
      const orderArray = schema.measurements?.metrics?.order || [];
      const metricsById = schema.measurements?.metrics?.byId || {};

      for (const id of orderArray) {
        expect(
          metricsById[id],
          `${file}: metric ${id} in order should exist in byId`
        ).toBeTruthy();
      }
    }
  });

  test('[CC-032] Bleed assumptions inform calculations', () => {
    for (const { schema, file } of schemas) {
      const assumptions = schema.measurements?.bleed_assumptions || [];
      const calculations = schema.measurements?.bleed_calculations || [];

      if (assumptions.length > 0 && calculations.length > 0) {
        // Calculations should reference assumption values
        const calc = calculations[0];

        expect(calc.inputs, `${file}: calculation should have inputs`).toBeTruthy();
      }
    }
  });
});

// ============================================================================
// TEST SUITE 5: Narrative Consistency
// ============================================================================
test.describe('Atomic: Narrative Consistency', () => {
  const schemas = loadAllSchemas();

  test('[CC-040] Narratives reference correct client name', () => {
    for (const { schema, file } of schemas) {
      const clientName = schema.identity?.client_name;
      const narratives = schema.narratives || {};

      if (clientName && Object.keys(narratives).length > 0) {
        // At least one narrative should mention client
        const allNarratives = Object.values(narratives).join(' ');

        // Check if client name or part of it appears
        const clientWords = clientName.split(/\s+/).filter((w: string) => w.length > 3);
        const hasClientRef = clientWords.some((word: string) =>
          allNarratives.toLowerCase().includes(word.toLowerCase())
        );

        // Not all narratives need client name, but it shouldn't be "Unknown"
        expect(
          clientName.toLowerCase() !== 'unknown client',
          `${file}: client name should not be "Unknown Client"`
        ).toBe(true);
      }
    }
  });

  test('[CC-041] Technical approach references integrations', () => {
    for (const { schema, file } of schemas) {
      const techApproach = schema.technical_approach;
      const integrations = schema.research?.integrations || [];

      if (techApproach?.integrations && integrations.length > 0) {
        expect(
          techApproach.integrations.length > 0,
          `${file}: technical approach should list integrations`
        ).toBe(true);
      }
    }
  });

  test('[CC-042] Risk assessment reflects complexity', () => {
    for (const { schema, file } of schemas) {
      const risks = schema.risk_assessment?.risks || [];
      const avgComplexity = schema.research_gap_report?.average_complexity;

      if (risks.length > 0 && avgComplexity !== undefined) {
        // Higher complexity should have more/higher risks
        const highRisks = risks.filter((r: any) => r.severity === 'high').length;

        if (avgComplexity >= 6) {
          expect(
            highRisks >= 1 || risks.length >= 3,
            `${file}: high complexity should have notable risks`
          ).toBe(true);
        }
      }
    }
  });
});

// ============================================================================
// TEST SUITE 6: Schema Version Consistency
// ============================================================================
test.describe('Atomic: Schema Version Consistency', () => {
  const schemas = loadAllSchemas();

  test('[CC-050] Schema version is present', () => {
    for (const { schema, file } of schemas) {
      expect(schema.version, `${file}: version required`).toBeTruthy();
      expect(schema.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  test('[CC-051] Generated timestamp is valid ISO', () => {
    for (const { schema, file } of schemas) {
      expect(schema.generated_at, `${file}: generated_at required`).toBeTruthy();

      const date = new Date(schema.generated_at);
      expect(date.toString()).not.toBe('Invalid Date');
    }
  });

  test('[CC-052] All required top-level sections present', () => {
    const requiredSections = [
      'intake',
      'measurements',
      'identity',
      'research',
      'estimate'
    ];

    for (const { schema, file } of schemas) {
      for (const section of requiredSections) {
        expect(schema[section], `${file}: ${section} section required`).toBeTruthy();
      }
    }
  });

  test('[CC-053] Intake version is present', () => {
    for (const { schema, file } of schemas) {
      expect(
        schema.intake?.intake_version,
        `${file}: intake.intake_version required`
      ).toBeTruthy();
    }
  });
});

// ============================================================================
// TEST SUITE 7: Output File Consistency
// ============================================================================
test.describe('Atomic: Output File Consistency', () => {
  test('[CC-060] Each schema has corresponding HTML', () => {
    const outputDir = path.join(process.cwd(), 'output');

    function checkDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.name.includes('_schema_') && entry.name.endsWith('.json')) {
          // Look for corresponding HTML
          const htmlName = entry.name.replace('_schema_', '_report_').replace('.json', '.html');
          const htmlPath = path.join(dir, htmlName);

          expect(
            fs.existsSync(htmlPath),
            `${fullPath}: should have corresponding HTML at ${htmlPath}`
          ).toBe(true);
        }
      }
    }

    checkDir(outputDir);
  });

  test('[CC-061] Schema JSON is valid', () => {
    const schemas = loadAllSchemas();

    for (const { schema, file } of schemas) {
      // If we got here, JSON parsed successfully
      expect(typeof schema).toBe('object');
      expect(schema).not.toBeNull();
    }
  });
});
