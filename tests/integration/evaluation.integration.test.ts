/**
 * Evaluation Integration Tests
 *
 * Tests the full evaluation flow: case study → masked intake → pipeline → comparison
 * Uses factory data to validate the evaluation system end-to-end.
 *
 * @priority P0 - Critical path tests for evaluation framework
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Import factories - eating our own dog food
import {
  createCaseStudy,
  createDentalCaseStudy,
  createRealEstateCaseStudy,
  createHVACCaseStudy,
  createCaseStudyBatch,
  createMockPipelineOutput,
  createSolution,
  createEvaluationTestSuite,
} from '../support/factories';

// Import evaluation modules
import { toIntake, validateNoSolutionLeakage } from '../../lib/evaluation/masker.js';
import { compare, detectFlaws, calculateAggregateScore } from '../../lib/evaluation/comparator.js';

// Test output directory
const TEST_OUTPUT_DIR = path.join(process.cwd(), 'output_test', 'evaluation');

describe('Evaluation Integration Tests', () => {
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

  describe('AC1: Case Study to Intake Transformation', () => {
    it('[P0] transforms dental case study to valid intake', () => {
      // GIVEN: Factory dental case study
      const caseStudy = createDentalCaseStudy();

      // WHEN: Masking to intake
      const intake = toIntake(caseStudy);

      // THEN: Intake has all required sections
      expect(intake.prepared_for).toBeDefined();
      expect(intake.prepared_for.account_name).toBe('Bright Smile Dental');
      expect(intake.section_a_workflow_definition).toBeDefined();
      expect(intake.section_b_volume_timing).toBeDefined();
      expect(intake.section_c_systems_handoffs).toBeDefined();
    });

    it('[P0] transforms real estate case study to valid intake', () => {
      const caseStudy = createRealEstateCaseStudy();
      const intake = toIntake(caseStudy);

      expect(intake.prepared_for.account_name).toBe('Precision Realty Group');
      expect(intake.section_c_systems_handoffs.q10_systems_involved).toContain('Salesforce CRM');
    });

    it('[P0] transforms HVAC case study to valid intake', () => {
      const caseStudy = createHVACCaseStudy();
      const intake = toIntake(caseStudy);

      expect(intake.prepared_for.account_name).toBe('Comfort Climate Solutions');
      expect(caseStudy.is_holdout).toBe(true);
    });
  });

  describe('AC2: No Solution Leakage', () => {
    it('[P0] dental case study intake has no solution leakage', () => {
      const caseStudy = createDentalCaseStudy();
      const intake = toIntake(caseStudy);
      const result = validateNoSolutionLeakage(intake, caseStudy.solution);

      expect(result.clean).toBe(true);
      expect(result.leaks).toHaveLength(0);
    });

    it('[P0] real estate case study intake has no solution leakage', () => {
      const caseStudy = createRealEstateCaseStudy();
      const intake = toIntake(caseStudy);
      const result = validateNoSolutionLeakage(intake, caseStudy.solution);

      expect(result.clean).toBe(true);
    });

    it('[P0] batch of case studies all have clean intakes', () => {
      const batch = createCaseStudyBatch(10);

      for (const caseStudy of batch) {
        const intake = toIntake(caseStudy);
        const result = validateNoSolutionLeakage(intake, caseStudy.solution);
        expect(result.clean).toBe(true);
      }
    });
  });

  describe('AC3: Comparison Scoring', () => {
    it('[P0] perfect match yields high score', () => {
      // GIVEN: Case study with known solution
      const caseStudy = createDentalCaseStudy();

      // AND: Pipeline output that exactly matches solution
      const pipelineOutput = createMockPipelineOutput({
        tier: caseStudy.solution.tier,
        price: (caseStudy.solution.price_min + caseStudy.solution.price_max) / 2,
        integrations: caseStudy.solution.integrations,
        agentType: caseStudy.solution.agent_type,
        features: caseStudy.solution.features,
      });

      // WHEN: Comparing
      const result = compare(pipelineOutput, caseStudy.solution);

      // THEN: High aggregate score
      expect(result.aggregate_score).toBeGreaterThanOrEqual(70);
    });

    it('[P0] tier mismatch lowers score', () => {
      const caseStudy = createDentalCaseStudy(); // tier: standard

      const pipelineOutput = createMockPipelineOutput({
        tier: 'flagship', // Wrong tier
        integrations: caseStudy.solution.integrations,
        agentType: caseStudy.solution.agent_type,
      });

      const result = compare(pipelineOutput, caseStudy.solution);

      const tierDim = result.dimensions.find(d => d.dimension === 'tier_match');
      expect(tierDim.score).toBeLessThan(1.0);
    });

    it('[P0] missing integrations detected', () => {
      const caseStudy = createDentalCaseStudy();

      const pipelineOutput = createMockPipelineOutput({
        tier: caseStudy.solution.tier,
        integrations: ['Dentrix G7'], // Missing most integrations
        agentType: caseStudy.solution.agent_type,
      });

      const result = compare(pipelineOutput, caseStudy.solution);

      expect(result.flaws).toContain('MISSING_INTEGRATION');
    });
  });

  describe('AC4: Flaw Detection', () => {
    it('[P0] detects TIER_UNDERESTIMATE when pipeline underestimates', () => {
      const caseStudy = createHVACCaseStudy(); // tier: enterprise

      const pipelineOutput = createMockPipelineOutput({
        tier: 'lite', // Severe underestimate
        integrations: caseStudy.solution.integrations,
        agentType: caseStudy.solution.agent_type,
      });

      const result = compare(pipelineOutput, caseStudy.solution);
      expect(result.flaws).toContain('TIER_UNDERESTIMATE');
    });

    it('[P0] detects PRICE_TOO_LOW when pipeline underprices', () => {
      const caseStudy = createCaseStudy({
        solution: createSolution({
          price_min: 20000,
          price_max: 25000,
        }),
      });

      const pipelineOutput = createMockPipelineOutput({
        tier: caseStudy.solution.tier,
        price: 5000, // Way too low
        integrations: caseStudy.solution.integrations,
        agentType: caseStudy.solution.agent_type,
      });

      const result = compare(pipelineOutput, caseStudy.solution);
      expect(result.flaws).toContain('PRICE_TOO_LOW');
    });

    it('[P0] detects AGENT_TYPE_MISMATCH when types incompatible', () => {
      const caseStudy = createRealEstateCaseStudy(); // agent_type: outbound

      const pipelineOutput = createMockPipelineOutput({
        tier: caseStudy.solution.tier,
        integrations: caseStudy.solution.integrations,
        agentType: 'inbound', // Mismatch
      });

      const result = compare(pipelineOutput, caseStudy.solution);
      expect(result.flaws).toContain('AGENT_TYPE_MISMATCH');
    });
  });

  describe('AC5: Batch Evaluation Statistics', () => {
    it('[P0] batch evaluation produces meaningful statistics', () => {
      // GIVEN: Batch of case studies
      const batch = createCaseStudyBatch(10);
      const scores: number[] = [];
      const allFlaws: string[] = [];

      // WHEN: Evaluating each
      for (const caseStudy of batch) {
        const pipelineOutput = createMockPipelineOutput({
          tier: 'standard', // Simulate consistent pipeline behavior
          integrations: caseStudy.solution.integrations.slice(0, 2),
          agentType: 'inbound',
        });

        const result = compare(pipelineOutput, caseStudy.solution);
        scores.push(result.aggregate_score);
        allFlaws.push(...result.flaws);
      }

      // THEN: Can compute statistics
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const min = Math.min(...scores);
      const max = Math.max(...scores);

      expect(mean).toBeGreaterThan(0);
      expect(min).toBeLessThanOrEqual(max);
      expect(scores.length).toBe(10);

      // AND: Flaws are detected across batch
      expect(allFlaws.length).toBeGreaterThan(0);
    });

    it('[P0] holdout cases are identified', () => {
      const batch = createCaseStudyBatch(10, { holdoutRatio: 0.3 });

      const holdoutCount = batch.filter(cs => cs.is_holdout).length;
      const trainingCount = batch.filter(cs => !cs.is_holdout).length;

      expect(holdoutCount).toBe(3); // 30% of 10
      expect(trainingCount).toBe(7);
    });
  });

  describe('AC6: Evaluation Test Suite', () => {
    it('[P0] all test suite cases produce valid comparisons', () => {
      const testSuite = createEvaluationTestSuite();

      for (const testCase of testSuite) {
        const intake = toIntake(testCase.caseStudy);
        expect(intake.section_a_workflow_definition).toBeDefined();

        const pipelineOutput = createMockPipelineOutput({
          tier: 'standard',
          integrations: testCase.caseStudy.solution.integrations,
          agentType: 'inbound',
        });

        const result = compare(pipelineOutput, testCase.caseStudy.solution);
        expect(result.aggregate_score).toBeDefined();
        expect(result.dimensions.length).toBe(6);
      }
    });

    it('[P0] test suite covers different scenarios', () => {
      const testSuite = createEvaluationTestSuite();

      // Verify test names indicate different scenarios
      const names = testSuite.map(t => t.name);
      expect(names.some(n => n.includes('Exact'))).toBe(true);
      expect(names.some(n => n.includes('Adjacent'))).toBe(true);
      expect(names.some(n => n.includes('Mismatch'))).toBe(true);
    });
  });

  describe('AC7: Factory Data Consistency', () => {
    it('[P0] factory case studies have consistent structure', () => {
      const dental = createDentalCaseStudy();
      const realEstate = createRealEstateCaseStudy();
      const hvac = createHVACCaseStudy();
      const random = createCaseStudy();

      for (const cs of [dental, realEstate, hvac, random]) {
        // Required fields
        expect(cs.id).toBeDefined();
        expect(cs.vendor).toBeDefined();
        expect(cs.problem).toBeDefined();
        expect(cs.solution).toBeDefined();

        // Solution fields
        expect(cs.solution.tier).toBeDefined();
        expect(cs.solution.integrations).toBeInstanceOf(Array);
        expect(cs.solution.agent_type).toMatch(/^(inbound|outbound|hybrid)$/);
        expect(cs.solution.features).toBeInstanceOf(Array);
      }
    });

    it('[P0] factory solutions are valid for comparison', () => {
      const batch = createCaseStudyBatch(20);

      for (const cs of batch) {
        // All solutions can be compared
        const pipelineOutput = createMockPipelineOutput();
        const result = compare(pipelineOutput, cs.solution);

        expect(result.aggregate_score).toBeGreaterThanOrEqual(0);
        expect(result.aggregate_score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('AC8: Report Generation', () => {
    it('[P0] generates evaluation report with proper structure', () => {
      const batch = createCaseStudyBatch(5);
      const results: Array<{
        case_id: string;
        score: number;
        flaws: string[];
      }> = [];

      for (const cs of batch) {
        const pipelineOutput = createMockPipelineOutput({
          tier: 'standard',
          integrations: cs.solution.integrations.slice(0, 2),
          agentType: 'inbound',
        });

        const result = compare(pipelineOutput, cs.solution);
        results.push({
          case_id: cs.id,
          score: result.aggregate_score,
          flaws: result.flaws,
        });
      }

      // Build report structure
      const report = {
        generated_at: new Date().toISOString(),
        evaluation_count: results.length,
        mean_score: results.reduce((a, r) => a + r.score, 0) / results.length,
        flaw_frequency: {} as Record<string, number>,
      };

      // Count flaw frequency
      for (const r of results) {
        for (const flaw of r.flaws) {
          report.flaw_frequency[flaw] = (report.flaw_frequency[flaw] || 0) + 1;
        }
      }

      // Validate report structure
      expect(report.generated_at).toBeDefined();
      expect(report.evaluation_count).toBe(5);
      expect(report.mean_score).toBeGreaterThan(0);
      expect(Object.keys(report.flaw_frequency).length).toBeGreaterThan(0);
    });
  });
});

describe('Evaluation Data Contract', () => {
  it('[P0] factory intake maps correctly to pipeline intake', () => {
    // Generate 10 random case studies
    for (let i = 0; i < 10; i++) {
      const caseStudy = createCaseStudy();
      const intake = toIntake(caseStudy);

      // Intake structure matches pipeline expectations
      expect(intake.prepared_for.account_name).toBeDefined();
      expect(intake.section_a_workflow_definition.q01_workflow_name).toBeDefined();
      expect(intake.section_c_systems_handoffs.q10_systems_involved).toBeInstanceOf(Array);
    }
  });

  it('[P0] factory solutions match comparison contract', () => {
    // Generate 10 random solutions
    for (let i = 0; i < 10; i++) {
      const solution = createSolution();

      // Solution has all fields needed for comparison
      expect(solution.tier).toBeDefined();
      expect(solution.price_min).toBeLessThanOrEqual(solution.price_max);
      expect(solution.timeline_weeks).toBeGreaterThan(0);
      expect(solution.integrations.length).toBeGreaterThan(0);
      expect(solution.agent_type).toMatch(/^(inbound|outbound|hybrid)$/);
    }
  });
});
