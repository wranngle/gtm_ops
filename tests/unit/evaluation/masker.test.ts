/**
 * Masker Tests - Verify PROBLEM to intake transformation and no solution leakage
 *
 * Uses factory-generated case studies to ensure consistency with pipeline data.
 */

import { describe, it, expect } from 'vitest';
import {
  toIntake as _toIntake,
  validateNoSolutionLeakage,
  generateMaskingReport,
} from '../../../lib/evaluation/masker.js';
import type { EvalIntake } from '../../_helpers/eval-types.js';
// Use factories - eating our own dog food
import {
  createCaseStudy,
  createDentalCaseStudy,
  createSolution,
  createEvaluationTestSuite,
  createIntake,
} from '../../support/factories/index.js';

const toIntake = (cs: object): EvalIntake => _toIntake(cs) as EvalIntake;

describe('Masker', () => {
  describe('toIntake - Factory-Based Tests', () => {
    it('[P0] transforms factory case study into valid intake structure', () => {
      // GIVEN: A factory-generated case study
      const caseStudy = createDentalCaseStudy();

      // WHEN: Masking to intake
      const intake = toIntake(caseStudy);

      // THEN: All required sections exist
      expect(intake.prepared_for).toBeDefined();
      expect(intake.section_a_workflow_definition).toBeDefined();
      expect(intake.section_b_volume_timing).toBeDefined();
      expect(intake.section_c_systems_handoffs).toBeDefined();
      expect(intake.section_d_failure_cost).toBeDefined();
    });

    it('[P0] preserves systems from case study problem', () => {
      // GIVEN: Case study with specific systems
      const caseStudy = createCaseStudy({
        problem: createIntake({
          section_c_systems_handoffs: {
            q10_systems_involved: ['Dentrix G7', 'Weave', 'Google Calendar'],
            q11_manual_data_transfers: 'Manual copy',
            q12_human_decision_gates: 'Manager approval',
          },
        }),
      });

      // WHEN: Masking
      const intake = toIntake(caseStudy);

      // THEN: Systems are preserved
      expect(intake.section_c_systems_handoffs.q10_systems_involved).toContain('Dentrix G7');
      expect(intake.section_c_systems_handoffs.q10_systems_involved).toContain('Weave');
    });

    it('[P0] maps account info from prepared_for', () => {
      // GIVEN: Case study with known client
      const caseStudy = createDentalCaseStudy();

      // WHEN: Masking
      const intake = toIntake(caseStudy);

      // THEN: Account name maps through
      expect(intake.prepared_for.account_name).toBe('Bright Smile Dental');
      expect(intake.prepared_for.account_id).toContain('DENTAL');
    });
  });

  describe('validateNoSolutionLeakage', () => {
    it('[P0] passes when intake contains no solution data', () => {
      // GIVEN: Clean case study
      const caseStudy = createDentalCaseStudy();
      const intake = toIntake(caseStudy);

      // WHEN: Validating
      const result = validateNoSolutionLeakage(intake, caseStudy.solution);

      // THEN: No leaks
      expect(result.clean).toBe(true);
      expect(result.leaks).toHaveLength(0);
    });

    it('[P0] detects voice provider leakage', () => {
      // GIVEN: Solution with voice provider specified
      const solution = {
        ...createSolution({ tier: 'enterprise' }),
        voice_provider: 'ElevenLabs', // Must be in solution for leakage detection
      };
      const badIntake = {
        section_a_workflow_definition: {
          q03_business_objective: 'Use ElevenLabs for voice synthesis', // LEAK!
        },
      };

      // WHEN: Validating
      const result = validateNoSolutionLeakage(badIntake, solution);

      // THEN: Leak detected
      expect(result.clean).toBe(false);
      expect(result.leaks.some((l) => l.includes('ElevenLabs'))).toBe(true);
    });

    it('[P0] detects pricing leakage', () => {
      // GIVEN: Solution with known price
      const caseStudy = createCaseStudy({
        solution: createSolution({
          price_min: 15_000,
          price_max: 20_000,
        }),
      });
      const badIntake = {
        section_d_failure_cost: {
          q14_cost_if_slow_or_failed: 'Budget is $15000 for implementation',
        },
      };

      // WHEN: Validating
      const result = validateNoSolutionLeakage(badIntake, caseStudy.solution);

      // THEN: Price leak detected
      expect(result.clean).toBe(false);
      expect(result.leaks.some((l) => l.includes('15000'))).toBe(true);
    });

    it('[P1] allows systems in both problem and solution (not leakage)', () => {
      // GIVEN: Case study where systems naturally appear in both
      const caseStudy = createDentalCaseStudy();
      const intake = toIntake(caseStudy);

      // WHEN: Validating
      const result = validateNoSolutionLeakage(intake, caseStudy.solution);

      // THEN: Dentrix is NOT flagged as leak
      const dentrixLeaks = result.leaks.filter((l) => l.toLowerCase().includes('dentrix'));
      expect(dentrixLeaks).toHaveLength(0);
    });
  });

  describe('generateMaskingReport', () => {
    it('[P0] generates comprehensive report', () => {
      // GIVEN: Factory case study
      const caseStudy = createDentalCaseStudy();
      const intake = toIntake(caseStudy);

      // WHEN: Generating report
      const report = generateMaskingReport(caseStudy, intake);

      // THEN: All sections present
      expect(report.case_study_id).toBe('vapi-dental-001');
      expect(report.timestamp).toBeDefined();
      expect(report.problem_summary).toBeDefined();
      expect(report.masked_intake_summary).toBeDefined();
      expect(report.leakage_check).toBeDefined();
      expect(report.solution_hidden).toBeDefined();
    });

    it('[P1] reports problem summary correctly', () => {
      const caseStudy = createDentalCaseStudy();
      const intake = toIntake(caseStudy);
      const report = generateMaskingReport(caseStudy, intake);

      expect(report.problem_summary.systems_count).toBe(5); // Dental has 5 systems
      expect(report.solution_hidden.integration_count).toBe(5);
    });

    it('[P1] reports solution is hidden', () => {
      const caseStudy = createDentalCaseStudy();
      const intake = toIntake(caseStudy);
      const report = generateMaskingReport(caseStudy, intake);

      expect(report.solution_hidden.agent_type).toBe('inbound');
      expect(report.solution_hidden.has_pricing).toBe(true);
    });
  });

  describe('Evaluation Test Suite', () => {
    it('[P0] processes all test suite cases without errors', () => {
      // GIVEN: The evaluation test suite
      const testSuite = createEvaluationTestSuite();

      // THEN: All cases transform successfully
      for (const testCase of testSuite) {
        const intake = toIntake(testCase.caseStudy);
        expect(intake.section_a_workflow_definition).toBeDefined();
      }
    });

    it('[P0] no test suite cases have leakage', () => {
      const testSuite = createEvaluationTestSuite();

      for (const testCase of testSuite) {
        const intake = toIntake(testCase.caseStudy);
        const result = validateNoSolutionLeakage(intake, testCase.caseStudy.solution);
        expect(result.clean).toBe(true);
      }
    });
  });

  describe('Edge Cases', () => {
    it('[P1] handles minimal problem data', () => {
      // GIVEN: Case study with minimal info
      const minimalCaseStudy = createCaseStudy({
        problem: createIntake({
          section_a_workflow_definition: {
            q01_workflow_name: 'Generic Process',
            q02_trigger_event: 'Event occurs',
            q03_business_objective: 'Improve efficiency',
            q04_end_condition: 'Task complete',
            q05_outcome_owner: 'Manager',
          },
        }),
      });

      // WHEN: Masking
      const intake = toIntake(minimalCaseStudy);

      // THEN: Still produces valid intake
      expect(intake.prepared_for.account_name).toBeDefined();
      expect(intake.section_a_workflow_definition.q01_workflow_name).toBeDefined();
    });

    it('[P1] throws error for missing problem section', () => {
      const badCaseStudy = {
        id: 'bad-001',
        solution: { tier: 'standard' },
      };

      expect(() => toIntake(badCaseStudy)).toThrow('must have a problem section');
    });
  });
});
