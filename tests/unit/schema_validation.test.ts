/**
 * Schema Validation Tests (ATDD)
 *
 * Unit tests for pipeline schema validation and display field contracts.
 * These tests use factory data and don't require LLM calls.
 *
 * @priority P0/P1 - Critical validation tests
 */
import { describe, it, expect } from 'vitest';
import {
  createPipelineSchema,
  createProjectIdentity,
  createTierAssessment,
  createBleedCalculation,
  createPricingStructure,
  createFinOpsCalculation,
  createTechnicalApproach,
  createPipelineResult
} from '../support/factories/index.js';

describe('Schema Validation (ATDD)', () => {
  describe('AC1: Schema Structure Requirements', () => {
    /**
     * ACCEPTANCE CRITERIA:
     * Given a complete pipeline schema
     * When validating required fields
     * Then all required sections should exist and be non-null
     */
    it('[P0] should have required schema sections', () => {
      // GIVEN: A pipeline schema
      const schema = createPipelineSchema();

      // THEN: Required sections exist
      expect(schema.$schema).toBe('wranngle://presales/v2');
      expect(schema.version).toBe('2.0.0');
      expect(schema.generated_at).toBeDefined();
      expect(schema.project_identity).toBeDefined();
      expect(schema.intake).toBeDefined();
      expect(schema.tier_assessment).toBeDefined();
      expect(schema.pricing).toBeDefined();
      expect(schema.finops).toBeDefined();
      expect(schema.technical_approach).toBeDefined();
    });

    it('[P0] should have valid project_identity fields', () => {
      // GIVEN: A project identity
      const identity = createProjectIdentity();

      // THEN: All required fields exist and are non-empty
      expect(identity.client_name).toBeTruthy();
      expect(identity.client_slug).toBeTruthy();
      expect(identity.process_name).toBeTruthy();
      expect(identity.document_slug).toBeTruthy();
      expect(identity.process_date_display).toBeTruthy();
      expect(identity.year).toBeGreaterThan(2020);
    });
  });

  describe('AC2: No undefined or NaN values', () => {
    /**
     * ACCEPTANCE CRITERIA:
     * Given a complete schema
     * When serializing to JSON
     * Then no values should be undefined, NaN, or [object Object]
     */
    it('[P0] should not contain undefined in serialized schema', () => {
      // GIVEN: A complete schema
      const schema = createPipelineSchema();

      // WHEN: Serializing to JSON string
      const jsonStr = JSON.stringify(schema, null, 2);

      // THEN: No undefined values
      expect(jsonStr).not.toContain('undefined');
    });

    it('[P0] should not contain NaN in serialized schema', () => {
      // GIVEN: A complete schema
      const schema = createPipelineSchema();

      // WHEN: Serializing to JSON string
      const jsonStr = JSON.stringify(schema, null, 2);

      // THEN: No NaN values (NaN serializes to null in JSON, but check anyway)
      expect(jsonStr).not.toContain('NaN');
    });

    it('[P0] should not contain [object Object] in serialized schema', () => {
      // GIVEN: A complete schema
      const schema = createPipelineSchema();

      // WHEN: Serializing to JSON string
      const jsonStr = JSON.stringify(schema, null, 2);

      // THEN: No [object Object] values
      expect(jsonStr).not.toContain('[object Object]');
    });

    it('[P0] should have numeric values that are actual numbers', () => {
      // GIVEN: A pricing structure
      const pricing = createPricingStructure();

      // THEN: All numeric values should be valid numbers
      expect(typeof pricing.final_price).toBe('number');
      expect(Number.isNaN(pricing.final_price)).toBe(false);
      expect(pricing.final_price).toBeGreaterThan(0);

      expect(typeof pricing.hourly_rate).toBe('number');
      expect(typeof pricing.total_hours).toBe('number');
      expect(typeof pricing.subtotal).toBe('number');
    });
  });

  describe('AC3: Client name requirements', () => {
    /**
     * ACCEPTANCE CRITERIA:
     * Given intake data with a client name
     * When generating project identity
     * Then client_name should match intake and NOT be "Unknown Client"
     */
    it('[P0] should preserve client name from intake', () => {
      // GIVEN: Intake with specific client
      const schema = createPipelineSchema({
        intake: {
          intake_version: '1.0.0',
          captured_at: new Date().toISOString(),
          captured_by: 'Test',
          prepared_for: {
            account_id: 'TEST-001',
            account_name: 'Acme Dental Group'
          },
          section_a_workflow_definition: {
            q01_workflow_name: 'Patient Scheduling',
            q02_trigger_event: 'Phone call',
            q03_business_objective: 'Improve efficiency',
            q04_end_condition: 'Appointment booked',
            q05_outcome_owner: 'Front Desk'
          },
          section_b_volume_timing: {
            q06_runs_per_period: '100',
            q06_period_unit: 'day',
            q07_avg_trigger_to_end: '15',
            q07_time_unit: 'minutes',
            q08_worst_case_delay: null,
            q08_delay_unit: null,
            q09_business_hours_expected: null
          },
          section_c_systems_handoffs: {
            q10_systems_involved: ['Dentrix', 'Weave'],
            q11_manual_data_transfers: 'Manual copy',
            q12_human_decision_gates: 'None'
          },
          section_d_failure_cost: {
            q13_common_failures: 'Missed calls',
            q14_cost_if_slow_or_failed: '$500/missed patient'
          },
          section_e_priority: {
            q15_strategic_priority: 'High',
            q16_automation_readiness: 'Ready'
          }
        },
        project_identity: createProjectIdentity({ client_name: 'Acme Dental Group' })
      });

      // THEN: Client name should match
      expect(schema.project_identity.client_name).toBe('Acme Dental Group');
      expect(schema.project_identity.client_name).not.toBe('Unknown Client');
      expect(schema.project_identity.client_name).not.toBe('');
    });
  });

  describe('AC4: Document slug format', () => {
    /**
     * ACCEPTANCE CRITERIA:
     * Given a project identity
     * When checking document_slug
     * Then it should match WRN-AI-{client}-{process}-{YY}r{N} format
     */
    it('[P1] should match WRN-AI slug format', () => {
      // GIVEN: A project identity
      const identity = createProjectIdentity({
        client_name: 'Test Client',
        process_name: 'Test Process'
      });

      // THEN: Slug should match expected pattern
      expect(identity.document_slug).toMatch(/^WRN-AI(?:-[\w-]+){2}-\d{2}r\d+$/);
    });

    it('[P1] should include current year in slug', () => {
      // GIVEN: A project identity
      const identity = createProjectIdentity();
      const currentYearShort = String(new Date().getFullYear()).slice(2);

      // THEN: Slug should contain current year
      expect(identity.document_slug).toContain(currentYearShort);
    });
  });

  describe('AC5: Currency formatting', () => {
    /**
     * ACCEPTANCE CRITERIA:
     * Given numeric values
     * When display fields are generated
     * Then they should use $X,XXX format with commas
     */
    it('[P1] should format final_price_display with $ and commas', () => {
      // GIVEN: A pricing structure with known value
      const pricing = createPricingStructure(100); // 100 hours

      // THEN: Display should be formatted
      expect(pricing.final_price_display).toMatch(/^\$[\d,]+$/);
      expect(pricing.final_price_display).toContain('$');
    });

    it('[P1] should format bleed display values correctly', () => {
      // GIVEN: A bleed calculation
      const bleed = createBleedCalculation();

      // THEN: Display values should be formatted with $ and commas
      expect(bleed.monthly_bleed_display).toMatch(/^\$[\d,]+$/);
      expect(bleed.annual_bleed_display).toMatch(/^\$[\d,]+$/);
      
      // AND: Display should match numeric value
      const monthlyNumeric = Number.parseInt(bleed.monthly_bleed_display.replaceAll(/[$,]/g, ''), 10);
      expect(monthlyNumeric).toBe(bleed.monthly_bleed);
    });

    it('[P1] should format finops value_breakdown displays', () => {
      // GIVEN: A finops calculation
      const finops = createFinOpsCalculation();

      // THEN: All display values should be formatted with $
      expect(finops.value_breakdown.total_annual_display).toMatch(/^\$[\d,]+$/);
      expect(finops.value_breakdown.total_monthly_display).toMatch(/^\$[\d,]+$/);
      expect(finops.value_breakdown.hard_savings.annual_display).toMatch(/^\$[\d,]+$/);
      expect(finops.value_breakdown.modeled_opportunity.annual_display).toMatch(/^\$[\d,]+$/);
    });
  });

  describe('AC6: ROI values populated', () => {
    /**
     * ACCEPTANCE CRITERIA:
     * Given pricing and bleed data
     * When calculating finops
     * Then payback_period_months and value totals should be populated
     */
    it('[P1] should calculate payback period in months', () => {
      // GIVEN: Finops with pricing
      const pricing = createPricingStructure(120);
      pricing.final_price = 10_000;

      const bleed = createBleedCalculation({ monthly_bleed: 5000 });
      const finops = createFinOpsCalculation(pricing, bleed);

      // THEN: Payback should be calculated
      expect(finops.payback_period_months).toBeDefined();
      expect(typeof finops.payback_period_months).toBe('number');
      expect(finops.payback_period_months).toBeGreaterThan(0);
    });

    it('[P1] should have payback_period_display', () => {
      // GIVEN: Finops calculation
      const finops = createFinOpsCalculation();

      // THEN: Display string should exist
      expect(finops.payback_period_display).toBeDefined();
      expect(finops.payback_period_display).toBeTruthy();
      expect(finops.payback_period_display).not.toBe('N/A');
    });

    it('[P1] should calculate annual value totals', () => {
      // GIVEN: Finops calculation
      const finops = createFinOpsCalculation();

      // THEN: Total annual value should be sum of hard + modeled
      const expectedTotal = finops.value_breakdown.hard_savings.annual + finops.value_breakdown.modeled_opportunity.annual;
      expect(finops.value_breakdown.total_annual_value).toBe(expectedTotal);
    });
  });

  describe('AC7: Display field synchronization', () => {
    /**
     * ACCEPTANCE CRITERIA:
     * Given numeric values with _display counterparts
     * When comparing them
     * Then display value should match numeric value formatted
     */
    it('[P1] should sync total_annual_display with total_annual_value', () => {
      // GIVEN: Finops with known value
      const finops = createFinOpsCalculation();

      // WHEN: Extracting numeric from display
      const displayNumeric = Number.parseInt(finops.value_breakdown.total_annual_display.replaceAll(/[$,]/g, ''), 10);

      // THEN: Values should match
      expect(displayNumeric).toBe(finops.value_breakdown.total_annual_value);
    });

    it('[P1] should sync final_price_display with final_price', () => {
      // GIVEN: Pricing with known value
      const pricing = createPricingStructure();

      // WHEN: Extracting numeric from display
      const displayNumeric = Number.parseInt(pricing.final_price_display.replaceAll(/[$,]/g, ''), 10);

      // THEN: Values should match
      expect(displayNumeric).toBe(pricing.final_price);
    });

    it('[P1] should sync milestone amount_display with amount', () => {
      // GIVEN: Pricing with milestones
      const pricing = createPricingStructure();

      // THEN: Each milestone display should match amount
      for (const milestone of Object.values(pricing.milestones)) {
        const displayNumeric = Number.parseInt(milestone.amount_display.replaceAll(/[$,]/g, ''), 10);
        expect(displayNumeric).toBe(milestone.amount);
      }
    });
  });

  describe('AC8: Integration list requirements', () => {
    /**
     * ACCEPTANCE CRITERIA:
     * Given intake with systems
     * When building technical approach
     * Then integrations array should be populated
     */
    it('[P1] should populate integrations from systems', () => {
      // GIVEN: Systems list
      const systems = ['Dentrix G7', 'Weave', 'Google Calendar'];
      const techApproach = createTechnicalApproach(systems);

      // THEN: Integrations should exist
      expect(techApproach.integrations).toBeDefined();
      expect(Array.isArray(techApproach.integrations)).toBe(true);
      expect(techApproach.integrations.length).toBe(systems.length);
    });

    it('[P1] should include technology_stack', () => {
      // GIVEN: Technical approach
      const techApproach = createTechnicalApproach();

      // THEN: Technology stack should include base technologies
      expect(techApproach.technology_stack).toContain('n8n');
      expect(techApproach.technology_stack.length).toBeGreaterThan(0);
    });
  });
});

describe('Pipeline Result Validation', () => {
  describe('Successful pipeline result', () => {
    it('[P0] should have success=true for successful run', () => {
      // GIVEN: A successful result
      const result = createPipelineResult(true);

      // THEN: Success should be true
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('[P0] should have valid output paths', () => {
      // GIVEN: A successful result
      const result = createPipelineResult(true);

      // THEN: Output paths should exist
      expect(result.outputs.html).toContain('.html');
      expect(result.outputs.pdf).toContain('.pdf');
      expect(result.outputs.json).toContain('.json');
    });

    it('[P0] should include complete schema', () => {
      // GIVEN: A successful result
      const result = createPipelineResult(true);

      // THEN: Schema should be complete
      expect(result.schema.$schema).toBe('wranngle://presales/v2');
      expect(result.schema.project_identity).toBeDefined();
      expect(result.schema.pricing).toBeDefined();
    });
  });

  describe('Failed pipeline result', () => {
    it('[P0] should have success=false for failed run', () => {
      // GIVEN: A failed result
      const result = createPipelineResult(false);

      // THEN: Success should be false
      expect(result.success).toBe(false);
    });
  });
});

describe('Tier Assessment Validation', () => {
  it('[P1] should have valid tier keys', () => {
    // GIVEN: A tier assessment
    const tier = createTierAssessment();

    // THEN: Key should be one of valid options
    expect(['standard', 'moderate', 'complex', 'enterprise']).toContain(tier.key);
  });

  it('[P1] should have positive base hours', () => {
    // GIVEN: A tier assessment
    const tier = createTierAssessment();

    // THEN: Base hours should be positive
    expect(tier.base_hours).toBeGreaterThan(0);
  });

  it('[P1] should have risk multiplier >= 1.0', () => {
    // GIVEN: A tier assessment
    const tier = createTierAssessment();

    // THEN: Risk multiplier should be at least 1.0
    expect(tier.risk_multiplier).toBeGreaterThanOrEqual(1);
  });
});
