import { describe, it, expect } from 'vitest';
import { diagnose, applyFixes, autofixAndRescore } from '../../../lib/evaluation/autofix.js';

describe('Autofix', () => {
  describe('diagnose', () => {
    it('[P0] identifies tier underestimate remediation', () => {
      const scores = {
        dimensions: [
          { dimension: 'tier_match', score: 0.5, details: { pipeline: 'standard', truth: 'enterprise', diff: 1 } },
        ],
      };
      const rems = diagnose(scores, {});
      expect(rems).toHaveLength(1);
      expect(rems[0].fix).toBe('patch_tier');
      expect(rems[0].target).toBe('enterprise');
    });

    it('[P0] identifies missing integrations', () => {
      const scores = {
        dimensions: [
          { dimension: 'integration_coverage', score: 0.5, details: { missing: ['Twilio', 'Slack'], extra: [] } },
        ],
      };
      const rems = diagnose(scores, {});
      expect(rems).toHaveLength(1);
      expect(rems[0].fix).toBe('add_integrations');
      expect(rems[0].missing).toEqual(['Twilio', 'Slack']);
    });

    it('[P0] identifies price too low', () => {
      const scores = {
        dimensions: [
          { dimension: 'pricing_reasonableness', score: 0, details: { pipeline: 6500, truth: 45000, direction: 'low' } },
        ],
      };
      const rems = diagnose(scores, {});
      expect(rems).toHaveLength(1);
      expect(rems[0].fix).toBe('adjust_price');
      expect(rems[0].target).toBe(45000);
    });

    it('[P0] identifies timeline optimistic', () => {
      const scores = {
        dimensions: [
          { dimension: 'timeline_realism', score: 0, details: { pipeline: 4, truth: 10, direction: 'optimistic' } },
        ],
      };
      const rems = diagnose(scores, {});
      expect(rems[0].fix).toBe('adjust_timeline');
      expect(rems[0].target).toBe(10);
    });

    it('[P0] identifies agent type mismatch', () => {
      const scores = {
        dimensions: [
          { dimension: 'agent_type_alignment', score: 0, details: { pipeline: 'inbound', truth: 'hybrid' } },
        ],
      };
      const rems = diagnose(scores, {});
      expect(rems[0].fix).toBe('patch_agent_type');
      expect(rems[0].target).toBe('hybrid');
    });

    it('[P0] identifies feature gap', () => {
      const scores = {
        dimensions: [
          { dimension: 'feature_coverage', score: 0, details: { missing: ['a', 'b', 'c'], covered: [] } },
        ],
      };
      const rems = diagnose(scores, {});
      expect(rems[0].fix).toBe('add_features');
    });

    it('[P1] skips dimensions with score >= 0.8', () => {
      const scores = {
        dimensions: [
          { dimension: 'tier_match', score: 1.0, details: { pipeline: 'enterprise', truth: 'enterprise' } },
          { dimension: 'integration_coverage', score: 0.9, details: { missing: [], extra: [] } },
        ],
      };
      const rems = diagnose(scores, {});
      expect(rems).toHaveLength(0);
    });

    it('[P1] handles multiple flaws simultaneously', () => {
      const scores = {
        dimensions: [
          { dimension: 'tier_match', score: 0.5, details: { pipeline: 'starter', truth: 'enterprise', diff: 2 } },
          { dimension: 'integration_coverage', score: 0.5, details: { missing: ['Twilio'], extra: [] } },
          { dimension: 'pricing_reasonableness', score: 0, details: { pipeline: 5000, truth: 40000, direction: 'low' } },
        ],
      };
      const rems = diagnose(scores, {});
      expect(rems).toHaveLength(3);
      expect(rems.map((r) => r.fix)).toEqual(['patch_tier', 'add_integrations', 'adjust_price']);
    });
  });

  describe('applyFixes', () => {
    it('[P0] patches tier in research and estimate', () => {
      const output = {
        research: { tier_assessment: { key: 'standard', label: 'Standard', baseHours: 80 } },
        estimate: { effort: { tier: 'standard' } },
      };
      const patched = applyFixes(output, [{ fix: 'patch_tier', target: 'enterprise' }]);
      expect(patched.research.tier_assessment.key).toBe('enterprise');
      expect(patched.research.tier_assessment.baseHours).toBe(160);
      expect(patched.estimate.effort.tier).toBe('enterprise');
      // Original unchanged
      expect(output.research.tier_assessment.key).toBe('standard');
    });

    it('[P0] adds missing integrations', () => {
      const output = {
        research: { integrations: [{ name: 'Salesforce', hours: 8 }] },
      };
      const patched = applyFixes(output, [{ fix: 'add_integrations', missing: ['Twilio', 'Slack'] }]);
      expect(patched.research.integrations).toHaveLength(3);
      expect(patched.research.integrations[1].name).toBe('Twilio');
      expect(patched.research.integrations[1].source).toBe('autofix');
    });

    it('[P0] does not duplicate existing integrations', () => {
      const output = {
        research: { integrations: [{ name: 'Twilio', hours: 8 }] },
      };
      const patched = applyFixes(output, [{ fix: 'add_integrations', missing: ['twilio'] }]);
      expect(patched.research.integrations).toHaveLength(1);
    });

    it('[P0] scales pricing', () => {
      const output = {
        pricing: { total_price: 6500, base_price: 5000 },
        estimate: { pricing: { total: 6500 } },
      };
      const patched = applyFixes(output, [{ fix: 'adjust_price', current: 6500, target: 45000 }]);
      expect(patched.pricing.total_price).toBeGreaterThan(40000);
      expect(patched.estimate.pricing.total).toBeGreaterThan(40000);
    });

    it('[P0] adjusts timeline', () => {
      const output = {
        estimate: { timeline_weeks: 4 },
        milestones: { total_weeks: 4 },
      };
      const patched = applyFixes(output, [{ fix: 'adjust_timeline', target: 10 }]);
      expect(patched.estimate.timeline_weeks).toBe(10);
      expect(patched.milestones.total_weeks).toBe(10);
    });

    it('[P0] patches agent type', () => {
      const output = {
        agent_type: 'inbound',
        intake: { classification: { agent_type: 'inbound' } },
      };
      const patched = applyFixes(output, [{ fix: 'patch_agent_type', target: 'hybrid' }]);
      expect(patched.agent_type).toBe('hybrid');
      expect(patched.intake.classification.agent_type).toBe('hybrid');
    });

    it('[P0] adds missing features', () => {
      const output = { proposal: { key_features: ['existing'] } };
      const patched = applyFixes(output, [{ fix: 'add_features', missing: ['new feature'] }]);
      expect(patched.proposal.key_features).toEqual(['existing', 'new feature']);
    });

    it('[P1] creates proposal if missing when adding features', () => {
      const output = {};
      const patched = applyFixes(output, [{ fix: 'add_features', missing: ['feature a'] }]);
      expect(patched.proposal.key_features).toEqual(['feature a']);
    });
  });

  describe('autofixAndRescore', () => {
    it('[P0] returns applied=false when no flaws', () => {
      const scores = {
        dimensions: [
          { dimension: 'tier_match', score: 1.0, details: { pipeline: 'standard', truth: 'standard' } },
        ],
        aggregate_score: 100,
      };
      const result = autofixAndRescore({}, {}, scores, {});
      expect(result.applied).toBe(false);
      expect(result.original_score).toBe(100);
    });

    it('[P0] improves score after fix', () => {
      // Build a minimal case where tier is wrong
      const pipelineOutput = {
        research: { tier_assessment: { key: 'standard', baseHours: 80 }, integrations: [] },
        estimate: { effort: { tier: 'standard', total_hours: 80 }, pricing: {}, timeline_weeks: 8 },
        pricing: {},
        proposal: { key_features: [] },
      };
      const groundTruth = {
        inferred_tier: 'standard', // same tier to avoid that dimension
        integrations: [],
        expected_price_range: { min: 0, max: 999999 },
        expected_timeline_weeks: 8,
        agent_type: 'inbound',
        key_features: ['feature a', 'feature b', 'feature c', 'feature d'],
      };

      // First score — features will be missing
      const scores = {
        dimensions: [
          { dimension: 'feature_coverage', score: 0, details: { missing: ['feature a', 'feature b', 'feature c', 'feature d'], covered: [], coverage: 0 } },
        ],
        aggregate_score: 0,
      };

      const result = autofixAndRescore(pipelineOutput, groundTruth, scores, {});
      expect(result.applied).toBe(true);
      expect(result.remediations.length).toBeGreaterThan(0);
      // The patched output should now have the features
      expect(result.patched_output.proposal.key_features).toContain('feature a');
    });
  });
});
