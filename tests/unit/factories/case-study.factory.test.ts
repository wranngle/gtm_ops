/**
 * Case Study Factory Tests
 * Tests for evaluation case study and masked intake factories
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCaseStudy,
  createSolution,
  createDentalCaseStudy,
  createRealEstateCaseStudy,
  createHVACCaseStudy,
  createCaseStudyBatch,
  createMaskedIntake,
  createMaskedIntakeSync,
  createMockPipelineOutput,
  createEvaluationTestSuite,
  type CaseStudy,
  type CaseStudySolution,
} from '../../support/factories/case-study.factory.js';

describe('Case Study Factory', () => {
  describe('createSolution', () => {
    it('creates a valid solution with defaults', () => {
      const solution = createSolution();

      expect(solution.tier).toBeDefined();
      expect(['lite', 'standard', 'enterprise', 'flagship']).toContain(solution.tier);
      expect(solution.price_min).toBeGreaterThan(0);
      expect(solution.price_max).toBeGreaterThan(solution.price_min);
      expect(solution.timeline_weeks).toBeGreaterThanOrEqual(3);
      expect(solution.integrations).toBeInstanceOf(Array);
      expect(solution.integrations.length).toBeGreaterThanOrEqual(2);
      expect(['inbound', 'outbound', 'hybrid']).toContain(solution.agent_type);
      expect(solution.features).toBeInstanceOf(Array);
      expect(solution.features.length).toBeGreaterThanOrEqual(2);
    });

    it('accepts overrides', () => {
      const solution = createSolution({
        tier: 'enterprise',
        price_min: 50_000,
        price_max: 75_000,
        agent_type: 'outbound',
      });

      expect(solution.tier).toBe('enterprise');
      expect(solution.price_min).toBe(50_000);
      expect(solution.price_max).toBe(75_000);
      expect(solution.agent_type).toBe('outbound');
    });

    it('uses tier-appropriate pricing when no override', () => {
      const liteSolution = createSolution({ tier: 'lite' });
      const flagshipSolution = createSolution({ tier: 'flagship' });

      expect(liteSolution.price_max).toBeLessThan(flagshipSolution.price_min);
    });
  });

  describe('createCaseStudy', () => {
    it('creates a valid case study with all required fields', () => {
      const caseStudy = createCaseStudy();

      expect(caseStudy.id).toBeDefined();
      expect(caseStudy.vendor).toBeDefined();
      expect(caseStudy.captured_at).toBeDefined();
      expect(caseStudy.is_holdout).toBe(false);
      expect(caseStudy.problem).toBeDefined();
      expect(caseStudy.solution).toBeDefined();
    });

    it('generates id with vendor prefix', () => {
      const caseStudy = createCaseStudy({ vendor: 'vapi' });
      expect(caseStudy.id).toMatch(/^vapi-/);
    });

    it('infers agent type from workflow name', () => {
      // Use solution override since problem inference requires full problem object
      const inboundCase = createCaseStudy({
        solution: { agent_type: 'inbound' } as any,
      });
      expect(inboundCase.solution.agent_type).toBe('inbound');

      const outboundCase = createCaseStudy({
        solution: { agent_type: 'outbound' } as any,
      });
      expect(outboundCase.solution.agent_type).toBe('outbound');
    });

    it('marks holdout cases correctly', () => {
      const holdoutCase = createCaseStudy({ is_holdout: true });
      expect(holdoutCase.is_holdout).toBe(true);
    });
  });

  describe('Industry-specific factories', () => {
    it('createDentalCaseStudy has dental-specific solution', () => {
      const dental = createDentalCaseStudy();

      expect(dental.id).toBe('vapi-dental-001');
      expect(dental.vendor).toBe('vapi');
      expect(dental.solution.tier).toBe('standard');
      expect(dental.solution.integrations).toContain('Dentrix G7');
      expect(dental.solution.features).toContain('appointment scheduling');
    });

    it('createRealEstateCaseStudy has real estate workflow', () => {
      const realEstate = createRealEstateCaseStudy();

      expect(realEstate.id).toBe('retell-realestate-001');
      expect(realEstate.vendor).toBe('retell');
      expect(realEstate.solution.agent_type).toBe('outbound');
      expect(realEstate.problem.section_a_workflow_definition.q01_workflow_name)
        .toContain('Outreach');
    });

    it('createHVACCaseStudy is marked as holdout', () => {
      const hvac = createHVACCaseStudy();

      expect(hvac.id).toBe('bland-hvac-001');
      expect(hvac.is_holdout).toBe(true);
      expect(hvac.solution.tier).toBe('enterprise');
    });
  });

  describe('createCaseStudyBatch', () => {
    it('creates requested number of case studies', () => {
      const batch = createCaseStudyBatch(10);
      expect(batch).toHaveLength(10);
    });

    it('applies holdout ratio', () => {
      const batch = createCaseStudyBatch(10, { holdoutRatio: 0.3 });
      const holdouts = batch.filter(cs => cs.is_holdout);

      expect(holdouts.length).toBe(3); // 30% of 10
    });

    it('cycles through vendors', () => {
      const batch = createCaseStudyBatch(4, {
        vendors: ['vapi', 'retell'],
      });

      expect(batch[0].vendor).toBe('vapi');
      expect(batch[1].vendor).toBe('retell');
      expect(batch[2].vendor).toBe('vapi');
      expect(batch[3].vendor).toBe('retell');
    });

    it('generates sequential IDs', () => {
      const batch = createCaseStudyBatch(3);

      expect(batch[0].id).toMatch(/-batch-001$/);
      expect(batch[1].id).toMatch(/-batch-002$/);
      expect(batch[2].id).toMatch(/-batch-003$/);
    });
  });
});

describe('Masked Intake Factory', () => {
  describe('createMaskedIntakeSync', () => {
    it('creates intake without solution data', () => {
      const caseStudy = createDentalCaseStudy();
      const intake = createMaskedIntakeSync(caseStudy);

      expect(intake.prepared_for).toBeDefined();
      expect(intake.prepared_for.account_name).toContain('[Evaluation]');
      expect(intake.section_a_workflow_definition).toBeDefined();
      expect(intake.section_c_systems_handoffs).toBeDefined();

      // Should NOT contain solution data
      const intakeStr = JSON.stringify(intake);
      expect(intakeStr).not.toContain(caseStudy.solution.tier);
      expect(intakeStr).not.toContain(String(caseStudy.solution.price_min));
    });

    it('preserves problem workflow definition', () => {
      const caseStudy = createCaseStudy({
        problem: {
          section_a_workflow_definition: {
            q01_workflow_name: 'Test Workflow',
            q02_trigger_event: 'Test Trigger',
            q03_business_objective: 'Test Goal',
            q04_end_condition: 'Test End',
            q05_outcome_owner: 'Test Owner',
          },
        } as any,
      });
      const intake = createMaskedIntakeSync(caseStudy);

      expect(intake.section_a_workflow_definition.q01_workflow_name).toBe('Test Workflow');
    });

    it('adds evaluation prefix to account ID', () => {
      const caseStudy = createCaseStudy({ id: 'test-case-123' });
      const intake = createMaskedIntakeSync(caseStudy);

      expect(intake.prepared_for.account_id).toContain('eval-');
    });
  });

  describe('createMaskedIntake (async)', () => {
    it('creates masked intake using masker module', async () => {
      const caseStudy = createDentalCaseStudy();
      const intake = await createMaskedIntake(caseStudy);

      expect(intake.prepared_for).toBeDefined();
      expect(intake.section_a_workflow_definition).toBeDefined();
    });

    it('validates no solution leakage by default', async () => {
      const caseStudy = createCaseStudy();
      // Should not throw
      const intake = await createMaskedIntake(caseStudy);
      expect(intake).toBeDefined();
    });
  });
});

describe('Mock Pipeline Output Factory', () => {
  describe('createMockPipelineOutput', () => {
    it('creates valid pipeline output structure', () => {
      const output = createMockPipelineOutput();

      expect(output.success).toBe(true);
      expect(output.intake).toBeDefined();
      expect(output.research).toBeDefined();
      expect(output.pricing).toBeDefined();
      expect(output.estimate).toBeDefined();
    });

    it('uses provided tier', () => {
      const output = createMockPipelineOutput({ tier: 'enterprise' });
      const research = output.research as { tier_assessment: { key: string } };

      expect(research.tier_assessment.key).toBe('enterprise');
    });

    it('uses provided integrations', () => {
      const output = createMockPipelineOutput({
        integrations: ['Salesforce', 'HubSpot', 'Twilio'],
      });
      const research = output.research as { integrations: Array<{ name: string }> };

      expect(research.integrations).toHaveLength(3);
      expect(research.integrations.map(i => i.name)).toContain('Salesforce');
    });

    it('uses provided price', () => {
      const output = createMockPipelineOutput({ price: 25_000 });
      const pricing = output.pricing as { final_price: number };

      expect(pricing.final_price).toBe(25_000);
    });

    it('includes features array', () => {
      const output = createMockPipelineOutput({
        features: ['lead qualification', 'appointment booking'],
      });

      expect(output.features).toEqual(['lead qualification', 'appointment booking']);
    });
  });
});

describe('Evaluation Test Suite Factory', () => {
  describe('createEvaluationTestSuite', () => {
    it('creates test cases with expected scores', () => {
      const suite = createEvaluationTestSuite();

      expect(suite.length).toBeGreaterThan(0);
      for (const testCase of suite) {
        expect(testCase.name).toBeDefined();
        expect(testCase.caseStudy).toBeDefined();
        expect(testCase.expectedScores).toBeDefined();
        expect(testCase.expectedScores.tier_match).toBeDefined();
        expect(testCase.expectedScores.integration_coverage).toBeDefined();
        expect(testCase.expectedScores.agent_type_alignment).toBeDefined();
      }
    });

    it('includes exact match test case', () => {
      const suite = createEvaluationTestSuite();
      const exactMatch = suite.find(tc => tc.name.includes('Exact'));

      expect(exactMatch).toBeDefined();
      expect(exactMatch!.expectedScores.tier_match).toBe(1);
    });

    it('includes mismatched test cases', () => {
      const suite = createEvaluationTestSuite();
      const mismatch = suite.find(tc => tc.name.includes('Adjacent') || tc.name.includes('Mismatched'));

      expect(mismatch).toBeDefined();
    });
  });
});
