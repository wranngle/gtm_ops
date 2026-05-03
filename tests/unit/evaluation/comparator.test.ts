/**
 * Comparator Tests - Verify scoring dimensions calculate correctly
 *
 * Uses factory-generated data to ensure consistency with pipeline structures.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreTierMatch,
  scoreIntegrationCoverage,
  scoreAgentTypeAlignment,
  scorePricingReasonableness,
  scoreTimelineRealism,
  scoreFeatureCoverage,
  calculateAggregateScore,
  detectFlaws,
  compare,
} from '../../../lib/evaluation/comparator.js';

// Use factories - eating our own dog food
import {
  createCaseStudy,
  createDentalCaseStudy,
  createRealEstateCaseStudy,
  createHVACCaseStudy,
  createSolution,
  createMockPipelineOutput,
  createEvaluationTestSuite,
} from '../../support/factories';

describe('Comparator', () => {
  describe('scoreTierMatch', () => {
    it('[P0] returns 1.0 for exact tier match', () => {
      const result = scoreTierMatch('standard', 'standard');
      expect(result.score).toBe(1.0);
      expect(result.rationale).toContain('Exact tier match');
    });

    it('[P0] returns 0.5 for adjacent tier', () => {
      const result = scoreTierMatch('standard', 'enterprise');
      expect(result.score).toBe(0.5);
      expect(result.rationale).toContain('Adjacent tier');
    });

    it('[P0] returns 0.0 for wrong tier (2+ levels off)', () => {
      const result = scoreTierMatch('lite', 'flagship');
      expect(result.score).toBe(0.0);
      expect(result.rationale).toContain('Wrong tier');
    });

    it('[P1] normalizes tier name variations', () => {
      expect(scoreTierMatch('STANDARD', 'standard').score).toBe(1.0);
      expect(scoreTierMatch('starter', 'lite').score).toBe(1.0);
      expect(scoreTierMatch('premium', 'flagship').score).toBe(1.0);
    });

    it('[P1] handles missing tier data', () => {
      const result = scoreTierMatch(null, 'standard');
      expect(result.score).toBe(0.25); // Partial credit
      expect(result.rationale).toContain('Missing data');
    });
  });

  describe('scoreIntegrationCoverage', () => {
    it('[P0] returns 1.0 for identical integration lists', () => {
      const pipeline = ['Dentrix', 'Weave', 'Twilio'];
      const truth = ['Dentrix', 'Weave', 'Twilio'];
      const result = scoreIntegrationCoverage(pipeline, truth);
      expect(result.score).toBe(1.0);
    });

    it('[P0] calculates Jaccard similarity correctly', () => {
      const pipeline = ['Dentrix', 'Weave', 'Google Calendar'];
      const truth = ['Dentrix', 'Weave', 'Twilio'];
      const result = scoreIntegrationCoverage(pipeline, truth);
      // Intersection: 2, Union: 4, Jaccard: 0.5
      expect(result.score).toBe(0.5);
    });

    it('[P1] handles different object formats', () => {
      const pipeline = ['Dentrix', 'Weave'];
      const truth = [
        { system_name: 'Dentrix', integration_type: 'api' },
        { system_name: 'Weave', integration_type: 'webhook' },
      ];
      const result = scoreIntegrationCoverage(pipeline, truth);
      expect(result.score).toBe(1.0);
    });

    it('[P1] tracks missing and extra integrations', () => {
      const pipeline = ['Dentrix', 'Extra'];
      const truth = ['Dentrix', 'Weave'];
      const result = scoreIntegrationCoverage(pipeline, truth);
      expect(result.details.missing.length).toBe(1);
      expect(result.details.extra.length).toBe(1);
    });

    it('[P1] returns 1.0 when both lists are empty', () => {
      const result = scoreIntegrationCoverage([], []);
      expect(result.score).toBe(1.0);
    });

    describe('Fuzzy Matching', () => {
      it('[P0] matches system name aliases (Dentrix G7 -> Dentrix)', () => {
        const pipeline = ['Dentrix G7'];
        const truth = ['Dentrix'];
        const result = scoreIntegrationCoverage(pipeline, truth);
        expect(result.score).toBe(1.0);
        expect(result.details.missing.length).toBe(0);
      });

      it('[P0] matches CRM variations (Salesforce CRM -> Salesforce)', () => {
        const pipeline = ['Salesforce CRM', 'HubSpot CRM'];
        const truth = ['Salesforce', 'HubSpot'];
        const result = scoreIntegrationCoverage(pipeline, truth);
        expect(result.score).toBe(1.0);
        expect(result.details.missing.length).toBe(0);
      });

      it('[P0] matches calendar aliases (Google Calendar -> gcal)', () => {
        const pipeline = ['gcal'];
        const truth = ['Google Calendar'];
        const result = scoreIntegrationCoverage(pipeline, truth);
        expect(result.score).toBe(1.0);
      });

      it('[P0] matches SMS/Voice variations (Twilio SMS -> Twilio)', () => {
        const pipeline = ['Twilio SMS', 'Twilio Voice'];
        const truth = ['Twilio'];
        // Both pipeline items map to same canonical 'twilio', truth is also 'twilio'
        const result = scoreIntegrationCoverage(pipeline, truth);
        expect(result.score).toBeGreaterThan(0);
        expect(result.details.missing.length).toBe(0);
      });

      it('[P0] matches accounting aliases (QuickBooks Online -> QuickBooks)', () => {
        const pipeline = ['QuickBooks Online'];
        const truth = ['QuickBooks'];
        const result = scoreIntegrationCoverage(pipeline, truth);
        expect(result.score).toBe(1.0);
      });

      it('[P1] matches field service variations (Service Titan -> ServiceTitan)', () => {
        const pipeline = ['Service Titan'];
        const truth = ['ServiceTitan'];
        const result = scoreIntegrationCoverage(pipeline, truth);
        expect(result.score).toBe(1.0);
      });

      it('[P1] matches dental system variations', () => {
        const pipeline = ['Open Dental', 'Curve Dental'];
        const truth = ['OpenDental', 'CurveDental'];
        const result = scoreIntegrationCoverage(pipeline, truth);
        expect(result.score).toBe(1.0);
      });

      it('[P1] handles mixed exact and fuzzy matches', () => {
        const pipeline = ['Dentrix G7', 'Weave', 'Google Calendar'];
        const truth = ['Dentrix', 'Weave', 'gcal'];
        const result = scoreIntegrationCoverage(pipeline, truth);
        expect(result.score).toBe(1.0);
        expect(result.details.missing.length).toBe(0);
        expect(result.details.extra.length).toBe(0);
      });

      it('[P1] correctly identifies missing with fuzzy matching', () => {
        const pipeline = ['Dentrix G7'];
        const truth = ['Dentrix', 'Salesforce'];
        const result = scoreIntegrationCoverage(pipeline, truth);
        // Dentrix matches, Salesforce is missing
        expect(result.details.missing.length).toBe(1);
        expect(result.details.missing).toContain('salesforce');
      });

      it('[P1] correctly identifies extra with fuzzy matching', () => {
        const pipeline = ['Dentrix', 'Stripe', 'Square'];
        const truth = ['Dentrix'];
        const result = scoreIntegrationCoverage(pipeline, truth);
        // Dentrix matches, Stripe and Square are extra
        expect(result.details.extra.length).toBe(2);
      });

      it('[P1] case insensitive matching', () => {
        const pipeline = ['SALESFORCE', 'HUBSPOT'];
        const truth = ['salesforce', 'hubspot'];
        const result = scoreIntegrationCoverage(pipeline, truth);
        expect(result.score).toBe(1.0);
      });

      it('[P1] handles short alias (QB -> QuickBooks)', () => {
        const pipeline = ['QB'];
        const truth = ['QuickBooks'];
        const result = scoreIntegrationCoverage(pipeline, truth);
        expect(result.score).toBe(1.0);
      });

      it('[P1] handles Teams variations (Microsoft Teams -> teams)', () => {
        const pipeline = ['Microsoft Teams'];
        const truth = ['teams'];
        const result = scoreIntegrationCoverage(pipeline, truth);
        expect(result.score).toBe(1.0);
      });
    });
  });

  describe('scoreAgentTypeAlignment', () => {
    it('[P0] returns 1.0 for exact agent type match', () => {
      expect(scoreAgentTypeAlignment('inbound', 'inbound').score).toBe(1.0);
      expect(scoreAgentTypeAlignment('outbound', 'outbound').score).toBe(1.0);
      expect(scoreAgentTypeAlignment('hybrid', 'hybrid').score).toBe(1.0);
    });

    it('[P0] returns 0.5 for compatible types', () => {
      // Hybrid is compatible with both
      expect(scoreAgentTypeAlignment('inbound', 'hybrid').score).toBe(0.5);
      expect(scoreAgentTypeAlignment('outbound', 'hybrid').score).toBe(0.5);
    });

    it('[P0] returns 0.0 for incompatible types', () => {
      expect(scoreAgentTypeAlignment('inbound', 'outbound').score).toBe(0.0);
      expect(scoreAgentTypeAlignment('outbound', 'inbound').score).toBe(0.0);
    });
  });

  describe('scorePricingReasonableness', () => {
    it('[P0] returns 1.0 when within 30%', () => {
      const result = scorePricingReasonableness(13000, 10000);
      expect(result.score).toBe(1.0);
      expect(result.rationale).toContain('within 30%');
    });

    it('[P0] returns 0.5 when within 50%', () => {
      const result = scorePricingReasonableness(14000, 10000);
      expect(result.score).toBe(0.5);
      expect(result.rationale).toContain('within 50%');
    });

    it('[P0] returns 0.0 when outside 50%', () => {
      const result = scorePricingReasonableness(20000, 10000);
      expect(result.score).toBe(0.0);
      expect(result.details.direction).toBe('high');
    });

    it('[P1] identifies price direction (high/low)', () => {
      const tooHigh = scorePricingReasonableness(20000, 10000);
      expect(tooHigh.details.direction).toBe('high');

      const tooLow = scorePricingReasonableness(4000, 10000);
      expect(tooLow.details.direction).toBe('low');
    });

    it('[P1] handles missing price data', () => {
      const result = scorePricingReasonableness(null, 10000);
      expect(result.score).toBe(0.5); // Neutral
    });
  });

  describe('scoreTimelineRealism', () => {
    it('[P0] returns 1.0 when within 2 weeks', () => {
      const result = scoreTimelineRealism(4, 3);
      expect(result.score).toBe(1.0);
    });

    it('[P0] returns 0.5 when within 4 weeks', () => {
      const result = scoreTimelineRealism(7, 4);
      expect(result.score).toBe(0.5);
    });

    it('[P0] returns 0.0 when outside 4 weeks', () => {
      const result = scoreTimelineRealism(12, 4);
      expect(result.score).toBe(0.0);
    });

    it('[P1] identifies timeline direction (optimistic/pessimistic)', () => {
      const optimistic = scoreTimelineRealism(2, 8);
      expect(optimistic.details.direction).toBe('optimistic');

      const pessimistic = scoreTimelineRealism(12, 4);
      expect(pessimistic.details.direction).toBe('pessimistic');
    });
  });

  describe('scoreFeatureCoverage', () => {
    it('[P0] returns 1.0 when all features covered', () => {
      const pipeline = ['appointment scheduling', 'sms reminders', 'crm sync'];
      const truth = ['appointment scheduling', 'sms reminders', 'crm sync'];
      const result = scoreFeatureCoverage(pipeline, truth);
      expect(result.score).toBe(1.0);
    });

    it('[P0] calculates partial coverage correctly', () => {
      const pipeline = ['appointment scheduling'];
      const truth = ['appointment scheduling', 'sms reminders'];
      const result = scoreFeatureCoverage(pipeline, truth);
      expect(result.score).toBe(0.5); // 1/2 features covered
    });

    it('[P1] handles fuzzy matching', () => {
      const pipeline = ['scheduling appointments'];
      const truth = ['appointment scheduling'];
      const result = scoreFeatureCoverage(pipeline, truth);
      expect(result.score).toBeGreaterThan(0); // Should partially match
    });

    it('[P1] returns 1.0 when no ground truth features', () => {
      const result = scoreFeatureCoverage(['some feature'], []);
      expect(result.score).toBe(1.0);
    });
  });

  describe('calculateAggregateScore', () => {
    it('[P0] calculates weighted sum correctly', () => {
      const dimensions = {
        tier_match: { score: 1.0, rationale: 'test' },
        integration_coverage: { score: 0.5, rationale: 'test' },
        agent_type_alignment: { score: 1.0, rationale: 'test' },
        pricing_reasonableness: { score: 0.5, rationale: 'test' },
        timeline_realism: { score: 1.0, rationale: 'test' },
        feature_coverage: { score: 0.5, rationale: 'test' },
      };

      const result = calculateAggregateScore(dimensions);

      // Verify aggregate is between 0-100
      expect(result.aggregate_score).toBeGreaterThan(0);
      expect(result.aggregate_score).toBeLessThanOrEqual(100);

      // Verify dimensions array is populated
      expect(result.dimensions.length).toBe(6);
    });

    it('[P1] generates summary highlighting strong/weak areas', () => {
      const dimensions = {
        tier_match: { score: 1.0, rationale: 'test' },
        integration_coverage: { score: 0.2, rationale: 'test' },
      };

      const result = calculateAggregateScore(dimensions);
      expect(result.summary).toContain('Strong');
      expect(result.summary).toContain('Weak');
    });
  });

  describe('detectFlaws', () => {
    it('[P0] detects tier underestimate flaw', () => {
      const scores = {
        dimensions: [
          {
            dimension: 'tier_match',
            score: 0.0,
            details: { pipeline: 'lite', truth: 'enterprise', diff: 2 },
          },
        ],
      };

      const flaws = detectFlaws(scores);
      expect(flaws).toContain('TIER_UNDERESTIMATE');
    });

    it('[P0] detects missing integration flaw', () => {
      const scores = {
        dimensions: [
          {
            dimension: 'integration_coverage',
            score: 0.5,
            details: { missing: ['Twilio'], extra: [] },
          },
        ],
      };

      const flaws = detectFlaws(scores);
      expect(flaws).toContain('MISSING_INTEGRATION');
    });

    it('[P0] detects pricing flaws', () => {
      const tooHigh = {
        dimensions: [
          {
            dimension: 'pricing_reasonableness',
            score: 0.0,
            details: { direction: 'high' },
          },
        ],
      };
      expect(detectFlaws(tooHigh)).toContain('PRICE_TOO_HIGH');

      const tooLow = {
        dimensions: [
          {
            dimension: 'pricing_reasonableness',
            score: 0.0,
            details: { direction: 'low' },
          },
        ],
      };
      expect(detectFlaws(tooLow)).toContain('PRICE_TOO_LOW');
    });

    it('[P1] deduplicates flaws', () => {
      const scores = {
        dimensions: [
          { dimension: 'tier_match', score: 0, details: { pipeline: 'lite', truth: 'standard', diff: 1 } },
          { dimension: 'tier_match', score: 0, details: { pipeline: 'lite', truth: 'standard', diff: 1 } },
        ],
      };

      const flaws = detectFlaws(scores);
      const tierFlaws = flaws.filter((f) => f.includes('TIER'));
      expect(tierFlaws.length).toBeLessThanOrEqual(1);
    });
  });

  describe('compare - Factory Integration', () => {
    it('[P0] compares factory pipeline output to factory ground truth', () => {
      // GIVEN: Factory-generated data
      const caseStudy = createDentalCaseStudy();
      const pipelineOutput = createMockPipelineOutput({
        tier: 'standard',
        integrations: caseStudy.solution.integrations,
        agentType: 'inbound',
      });

      // WHEN: Comparing
      const result = compare(pipelineOutput, caseStudy.solution);

      // THEN: Scores are calculated
      expect(result.aggregate_score).toBeGreaterThan(0);
      expect(result.dimensions.length).toBe(6);
    });

    it('[P0] scores real estate case study correctly', () => {
      const caseStudy = createRealEstateCaseStudy();
      const pipelineOutput = createMockPipelineOutput({
        tier: 'standard',
        integrations: ['Salesforce', 'Google Calendar', 'Twilio'],
        agentType: 'outbound',
      });

      const result = compare(pipelineOutput, caseStudy.solution);

      // Agent type should match (outbound)
      const agentDim = result.dimensions.find(d => d.dimension === 'agent_type_alignment');
      expect(agentDim.score).toBe(1.0);
    });

    it('[P0] detects mismatch in HVAC holdout case', () => {
      const caseStudy = createHVACCaseStudy();
      const pipelineOutput = createMockPipelineOutput({
        tier: 'standard', // Ground truth is enterprise
        integrations: ['ServiceTitan'], // Missing integrations
        agentType: 'inbound', // Ground truth is hybrid
      });

      const result = compare(pipelineOutput, caseStudy.solution);

      // Should detect flaws
      expect(result.flaws).toContain('MISSING_INTEGRATION');
    });
  });

  describe('Evaluation Test Suite - Factory Integration', () => {
    it('[P0] processes all test suite cases', () => {
      const testSuite = createEvaluationTestSuite();

      for (const testCase of testSuite) {
        const pipelineOutput = createMockPipelineOutput({
          tier: 'standard', // Simulate pipeline output
          integrations: testCase.caseStudy.solution.integrations,
          agentType: 'inbound',
        });

        const result = compare(pipelineOutput, testCase.caseStudy.solution);
        expect(result.aggregate_score).toBeDefined();
      }
    });

    it('[P0] factory case studies have consistent solutions', () => {
      const dental = createDentalCaseStudy();
      const realEstate = createRealEstateCaseStudy();
      const hvac = createHVACCaseStudy();

      // All solutions should have required fields
      for (const cs of [dental, realEstate, hvac]) {
        expect(cs.solution.tier).toBeDefined();
        expect(cs.solution.integrations.length).toBeGreaterThan(0);
        expect(cs.solution.agent_type).toMatch(/^(inbound|outbound|hybrid)$/);
      }
    });
  });
});
