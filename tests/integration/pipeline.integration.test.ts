/**
 * Pipeline Integration Tests
 *
 * Tests the pipeline data transformations without LLM calls.
 * Uses factory data to validate the full data flow.
 *
 * @priority P0 - Critical path tests
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Import factories
import {
  createPipelineSchema,
  createDentalIntake,
  createProjectIdentity,
  createPricingStructure,
  createFinOpsCalculation,
  createBleedCalculation,
  createTechnicalApproach,
  createTierAssessment,
  createIntegrationResearch
} from '../support/factories';

// Import actual pipeline modules (no mocking needed for these)
import { buildTechnicalApproach } from '../../lib/build_technical_approach.js';
import { generateProjectIdentity } from '../../lib/project_identity.js';

// Test output directory
const TEST_OUTPUT_DIR = path.join(process.cwd(), 'output_test', 'integration');

describe('Pipeline Data Flow Integration Tests', () => {
  beforeAll(() => {
    if (!fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('AC1: Full Schema Generation', () => {
    it('[P0] should generate complete schema with all required sections', () => {
      // GIVEN: Factory-generated schema
      const schema = createPipelineSchema();

      // THEN: All sections should exist
      expect(schema.$schema).toBe('wranngle://presales/v2');
      expect(schema.version).toBe('2.0.0');
      expect(schema.project_identity).toBeDefined();
      expect(schema.intake).toBeDefined();
      expect(schema.tier_assessment).toBeDefined();
      expect(schema.pricing).toBeDefined();
      expect(schema.finops).toBeDefined();
      expect(schema.technical_approach).toBeDefined();
      expect(schema.integration_research).toBeDefined();
    });

    it('[P0] should generate 4 milestone payments', () => {
      // GIVEN: Pricing structure
      const pricing = createPricingStructure();

      // THEN: Should have 4 milestones
      const milestones = Object.keys(pricing.milestones);
      expect(milestones).toHaveLength(4);
      expect(milestones).toContain('design');
      expect(milestones).toContain('build');
      expect(milestones).toContain('test');
      expect(milestones).toContain('deploy');

      // AND: Percentages should sum to 100
      const totalPercent = Object.values(pricing.milestones)
        .reduce((sum, m) => sum + m.percentage, 0);
      expect(totalPercent).toBe(100);
    });
  });

  describe('AC2: No undefined/NaN values in output', () => {
    it('[P0] should serialize schema without undefined values', () => {
      // GIVEN: Complete schema
      const schema = createPipelineSchema();

      // WHEN: Serializing to JSON
      const json = JSON.stringify(schema, null, 2);

      // THEN: No undefined or NaN
      expect(json).not.toContain('undefined');
      expect(json).not.toContain('NaN');
      expect(json).not.toContain('[object Object]');
    });

    it('[P0] should have all numeric fields as valid numbers', () => {
      // GIVEN: Pricing and finops
      const pricing = createPricingStructure();
      const finops = createFinOpsCalculation();

      // THEN: All numeric fields should be valid
      expect(Number.isFinite(pricing.final_price)).toBe(true);
      expect(Number.isFinite(pricing.subtotal)).toBe(true);
      expect(Number.isFinite(pricing.total_hours)).toBe(true);
      expect(Number.isFinite(finops.payback_period_months)).toBe(true);
      expect(Number.isFinite(finops.value_breakdown.total_annual_value)).toBe(true);
    });
  });

  describe('AC3: Client name flows through pipeline', () => {
    it('[P0] should preserve client name from intake to identity', () => {
      // GIVEN: Intake with specific client
      const intake = createDentalIntake();
      intake.prepared_for.account_name = 'Acme Dental Partners';

      // WHEN: Creating project identity
      const identity = createProjectIdentity({
        client_name: intake.prepared_for.account_name
      });

      // THEN: Client name should match
      expect(identity.client_name).toBe('Acme Dental Partners');
      expect(identity.client_name).not.toBe('Unknown Client');
      expect(identity.client_name).not.toBe('');
    });

    it('[P0] should generate client slug from name', () => {
      // GIVEN: Client name with spaces and caps
      const identity = createProjectIdentity({
        client_name: 'Premier Dental Care LLC'
      });

      // THEN: Slug should be lowercase with hyphens
      expect(identity.client_slug).toMatch(/^[a-z0-9-]+$/);
      expect(identity.client_slug).not.toContain(' ');
    });
  });

  describe('AC4: Document slug format', () => {
    it('[P0] should match WRN-AI-{client}-{process}-{YY}r{N} format', () => {
      // GIVEN: Project identity
      const identity = createProjectIdentity();

      // THEN: Slug should match format
      expect(identity.document_slug).toMatch(/^WRN-AI-[\w-]+-[\w-]+-\d{2}r\d+$/);
    });

    it('[P0] should include current year', () => {
      // GIVEN: Project identity
      const identity = createProjectIdentity();
      const currentYear = new Date().getFullYear();

      // THEN: Year should be in slug
      expect(identity.year).toBe(currentYear);
      expect(identity.document_slug).toContain(String(currentYear).slice(2));
    });
  });

  describe('AC5: Currency formatting', () => {
    it('[P0] should format all currency with $ and commas', () => {
      // GIVEN: Pricing structure
      const pricing = createPricingStructure();

      // THEN: Display fields should be formatted
      expect(pricing.final_price_display).toMatch(/^\$[\d,]+$/);

      // AND: Milestones should be formatted
      Object.values(pricing.milestones).forEach(m => {
        expect(m.amount_display).toMatch(/^\$[\d,]+$/);
      });
    });

    it('[P0] should format bleed calculations', () => {
      // GIVEN: Bleed calculation
      const bleed = createBleedCalculation();

      // THEN: Display fields should be formatted
      expect(bleed.monthly_bleed_display).toMatch(/^\$[\d,]+$/);
      expect(bleed.annual_bleed_display).toMatch(/^\$[\d,]+$/);
    });

    it('[P0] should format finops value breakdown', () => {
      // GIVEN: Finops calculation
      const finops = createFinOpsCalculation();

      // THEN: All display fields should be formatted
      expect(finops.value_breakdown.total_annual_display).toMatch(/^\$[\d,]+$/);
      expect(finops.value_breakdown.total_monthly_display).toMatch(/^\$[\d,]+$/);
      expect(finops.value_breakdown.hard_savings.annual_display).toMatch(/^\$[\d,]+$/);
      expect(finops.value_breakdown.modeled_opportunity.annual_display).toMatch(/^\$[\d,]+$/);
    });
  });

  describe('AC6: ROI values populated', () => {
    it('[P0] should calculate payback period', () => {
      // GIVEN: Finops with known values
      const pricing = createPricingStructure();
      pricing.final_price = 10000;

      const bleed = createBleedCalculation();
      bleed.monthly_bleed = 5000;

      const finops = createFinOpsCalculation(pricing, bleed);

      // THEN: Payback should be calculated
      expect(finops.payback_period_months).toBeGreaterThan(0);
      expect(finops.payback_period_display).toBeTruthy();
      expect(finops.payback_period_display).not.toBe('N/A');
    });

    it('[P0] should calculate annual value as sum of hard + modeled', () => {
      // GIVEN: Finops calculation
      const finops = createFinOpsCalculation();

      // THEN: Total should be sum of components
      const expectedTotal =
        finops.value_breakdown.hard_savings.annual +
        finops.value_breakdown.modeled_opportunity.annual;

      expect(finops.value_breakdown.total_annual_value).toBe(expectedTotal);
    });
  });

  describe('AC7: Display field synchronization', () => {
    it('[P0] should sync pricing display with value', () => {
      // GIVEN: Pricing structure
      const pricing = createPricingStructure();

      // WHEN: Extracting numeric from display
      const displayNumeric = parseInt(pricing.final_price_display.replace(/[$,]/g, ''), 10);

      // THEN: Should match
      expect(displayNumeric).toBe(pricing.final_price);
    });

    it('[P0] should sync finops display with value', () => {
      // GIVEN: Finops calculation
      const finops = createFinOpsCalculation();

      // WHEN: Extracting numeric from display
      const displayNumeric = parseInt(
        finops.value_breakdown.total_annual_display.replace(/[$,]/g, ''),
        10
      );

      // THEN: Should match
      expect(displayNumeric).toBe(finops.value_breakdown.total_annual_value);
    });

    it('[P0] should sync all milestone displays', () => {
      // GIVEN: Pricing with milestones
      const pricing = createPricingStructure();

      // THEN: Each milestone should sync
      Object.values(pricing.milestones).forEach(milestone => {
        const displayNumeric = parseInt(milestone.amount_display.replace(/[$,]/g, ''), 10);
        expect(displayNumeric).toBe(milestone.amount);
      });
    });
  });

  describe('AC8: Integration list from systems', () => {
    it('[P0] should build integrations from intake systems', () => {
      // GIVEN: Intake with systems
      const intake = createDentalIntake();
      const systems = intake.section_c_systems_handoffs.q10_systems_involved;

      // AND: Research data for each system
      const research = systems.map(sys => createIntegrationResearch({ integration: sys }));

      // WHEN: Building technical approach with real function and research
      const techApproach = buildTechnicalApproach(intake, research);

      // THEN: Should have integrations
      expect(techApproach.integrations).toBeDefined();
      expect(Array.isArray(techApproach.integrations)).toBe(true);
      expect(techApproach.integrations.length).toBeGreaterThan(0);
    });

    it('[P0] should include technology stack', () => {
      // GIVEN: Technical approach
      const techApproach = createTechnicalApproach();

      // THEN: Stack should include base technologies
      expect(techApproach.technology_stack).toContain('n8n');
      expect(techApproach.technology_stack.length).toBeGreaterThan(0);
    });
  });
});

describe('Real Module Integration Tests', () => {
  describe('buildTechnicalApproach integration', () => {
    it('[P0] should deduplicate generic vs specific integrations', () => {
      // GIVEN: Intake with both generic and specific
      const intake = createDentalIntake();
      intake.section_c_systems_handoffs.q10_systems_involved = [
        'Phone/SMS',        // Generic
        'Weave',            // Specific - should replace Phone/SMS
        'Payments',         // Generic
        'Rectangle Health', // Specific - should replace Payments
        'Dentrix G7'        // Specific
      ];

      // AND: Research data for each system
      const research = intake.section_c_systems_handoffs.q10_systems_involved.map(sys =>
        createIntegrationResearch({ integration: sys })
      );

      // WHEN: Building technical approach
      const result = buildTechnicalApproach(intake, research);

      // THEN: Generics should be removed when specific exists
      const integrationNames = result.integrations.map((i: {system_name: string}) => i.system_name);

      // Weave should replace Phone/SMS
      expect(integrationNames).toContain('Weave');
      expect(integrationNames).not.toContain('Phone/SMS');

      // Rectangle Health should replace Payments
      expect(integrationNames).toContain('Rectangle Health');
      expect(integrationNames).not.toContain('Payments');

      // Dentrix should remain
      expect(integrationNames).toContain('Dentrix G7');
    });

    it('[P0] should track specificity correctly', () => {
      // GIVEN: Intake with mixed integrations
      const intake = createDentalIntake();
      intake.section_c_systems_handoffs.q10_systems_involved = [
        'Weave',
        'Dentrix G7',
        'Google Calendar'
      ];

      // AND: Research data for each system
      const research = intake.section_c_systems_handoffs.q10_systems_involved.map(sys =>
        createIntegrationResearch({ integration: sys })
      );

      // WHEN: Building technical approach
      const result = buildTechnicalApproach(intake, research);

      // THEN: Should track specificity
      expect(result.specificity).toBeDefined();
      expect(result.specificity.specific_count).toBeGreaterThan(0);
    });
  });

  describe('generateProjectIdentity integration', () => {
    it('[P0] should generate valid identity from intake', () => {
      // GIVEN: Dental intake
      const intake = createDentalIntake();

      // WHEN: Generating identity
      const identity = generateProjectIdentity(intake, {
        documentType: 'proposal'
      });

      // THEN: Should have valid fields
      expect(identity.client_name).toBe('Bright Smile Dental');
      expect(identity.document_slug).toMatch(/^WRN-AI-/);
      expect(identity.process_date_display).toBeTruthy();
    });
  });
});

describe('Data Contract Validation', () => {
  it('[P0] should maintain display field contract across all schemas', () => {
    // Generate 10 random schemas
    for (let i = 0; i < 10; i++) {
      const schema = createPipelineSchema();

      // Validate pricing display sync
      const pricingDisplay = parseInt(schema.pricing.final_price_display.replace(/[$,]/g, ''), 10);
      expect(pricingDisplay).toBe(schema.pricing.final_price);

      // Validate finops display sync
      const finopsDisplay = parseInt(
        schema.finops.value_breakdown.total_annual_display.replace(/[$,]/g, ''),
        10
      );
      expect(finopsDisplay).toBe(schema.finops.value_breakdown.total_annual_value);

      // Validate bleed display sync
      const bleedDisplay = parseInt(schema.bleed.monthly_bleed_display.replace(/[$,]/g, ''), 10);
      expect(bleedDisplay).toBe(schema.bleed.monthly_bleed);
    }
  });

  it('[P0] should never produce undefined in any schema field', () => {
    // Generate 10 random schemas
    for (let i = 0; i < 10; i++) {
      const schema = createPipelineSchema();
      const json = JSON.stringify(schema);

      expect(json).not.toContain('undefined');
      expect(json).not.toContain('NaN');
    }
  });
});
