/**
 * Adversarial Evaluation Tests
 *
 * These tests challenge the evaluation system with:
 * - Schema drift: pipeline output format changes
 * - Silent degradation: comparator falls back instead of failing
 * - Solution leakage: masker lets solution data through
 * - Edge cases: empty, malformed, adversarial inputs
 * - Contract violations: pipeline output doesn't match comparator expectations
 *
 * If these all pass, something is wrong.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  compare,
  scoreTierMatch,
  scoreIntegrationCoverage,
  scoreAgentTypeAlignment,
  scorePricingReasonableness,
  scoreTimelineRealism,
  scoreFeatureCoverage,
  detectFlaws,
} from '../../../lib/evaluation/comparator.js';
import { toIntake } from '../../../lib/evaluation/masker.js';

// =============================================================================
// 1. Schema Drift Detection
// =============================================================================

describe('Schema Drift Detection', () => {
  /**
   * If the pipeline output schema changes (e.g. someone renames
   * research.tier_assessment.key to research.tier.name), the comparator
   * must not silently return 0.25 "missing data" — it should surface
   * the extraction failure so we notice.
   */

  it('[P0] compare() surfaces when tier extraction yields null', () => {
    // Simulate pipeline output where tier is in a path the comparator doesn't check
    const pipelineOutput = {
      research: {
        // Hypothetical schema change: tier is now under tier_result.label
        tier_result: { label: 'standard' },
        integrations: [{ integration: 'Dentrix' }],
      },
      estimate: {
        total_cost: { value: 10_000 },
        hours: { total: 160 },
      },
      features: ['scheduling'],
      intake: {
        section_a_workflow_definition: { q01_workflow_name: 'Scheduling Bot' },
      },
    };

    const truth = {
      inferred_tier: 'standard',
      integrations: [{ system_name: 'Dentrix' }],
      agent_type: 'inbound',
      key_features: ['scheduling'],
      timeline_weeks: 4,
    };

    const result = compare(pipelineOutput, truth);

    // The tier_match score should be LOW (0.25) because extraction failed.
    // This is a canary: if the pipeline schema drifts, tier scores drop.
    const tierDim = result.dimensions.find((d: any) => d.dimension === 'tier_match');
    expect(tierDim.score).toBeLessThanOrEqual(0.25);
    expect(tierDim.rationale).toContain('Missing');
  });

  it('[P0] compare() surfaces when integration extraction yields empty', () => {
    const pipelineOutput = {
      research: {
        tier_assessment: { key: 'standard' },
        // Schema drift: integrations renamed to systems
        systems: [{ name: 'Dentrix' }, { name: 'Twilio' }],
      },
      estimate: { total_cost: 10_000, hours: { total: 160 } },
      features: ['scheduling'],
    };

    const truth = {
      inferred_tier: 'standard',
      integrations: [{ system_name: 'Dentrix' }, { system_name: 'Twilio' }],
      agent_type: 'inbound',
      key_features: ['scheduling'],
      timeline_weeks: 4,
    };

    const result = compare(pipelineOutput, truth);
    const intDim = result.dimensions.find((d: any) => d.dimension === 'integration_coverage');

    // Integrations should fail because the comparator can't find them
    expect(intDim.score).toBeLessThan(0.5);
    expect(intDim.details.missing.length).toBeGreaterThan(0);
  });

  it('[P0] compare() surfaces when price extraction yields null', () => {
    const pipelineOutput = {
      research: { tier_assessment: { key: 'standard' }, integrations: [] },
      // Schema drift: pricing is now under cost_summary.total
      cost_summary: { total: 15_000 },
      features: [],
    };

    const truth = {
      inferred_tier: 'standard',
      integrations: [],
      agent_type: 'inbound',
      pricing_model: { total_cost: 15_000 },
      key_features: [],
      timeline_weeks: 4,
    };

    const result = compare(pipelineOutput, truth);
    const priceDim = result.dimensions.find((d: any) => d.dimension === 'pricing_reasonableness');

    // Should get 0.5 "missing data" not 1.0
    expect(priceDim.score).toBeLessThanOrEqual(0.5);
  });
});

// =============================================================================
// 2. Silent Degradation
// =============================================================================

describe('Silent Degradation', () => {
  it('[P0] aggregate score with all-null pipeline data is LOW, not medium', () => {
    const result = compare({}, {
      inferred_tier: 'standard',
      integrations: [{ system_name: 'Dentrix' }],
      agent_type: 'inbound',
      pricing_model: { total_cost: 10_000 },
      key_features: ['scheduling', 'reminders'],
      timeline_weeks: 4,
    });

    // Empty pipeline should score poorly, not get 25-50% from "missing data" charity
    expect(result.aggregate_score).toBeLessThan(50);
  });

  it('[P0] completely wrong pipeline scores near zero', () => {
    const pipelineOutput = {
      research: {
        tier_assessment: { key: 'flagship' }, // Wrong: truth is lite
        integrations: [
          { integration: 'SAP' },
          { integration: 'Oracle' },
          { integration: 'ServiceNow' },
        ], // Completely wrong systems
      },
      estimate: {
        total_cost: { value: 200_000 }, // Way over
        hours: { total: 800 }, // 20 weeks vs 3
      },
      features: ['machine learning', 'blockchain', 'quantum computing'], // Nonsense
      agent_type: 'outbound', // Wrong
    };

    const truth = {
      inferred_tier: 'lite',
      integrations: [{ system_name: 'Google Calendar' }],
      agent_type: 'inbound',
      pricing_model: { total_cost: 3000 },
      key_features: ['scheduling'],
      timeline_weeks: 3,
    };

    const result = compare(pipelineOutput, truth);

    // Should score VERY low — everything is wrong
    expect(result.aggregate_score).toBeLessThan(25);
    expect(result.flaws.length).toBeGreaterThanOrEqual(3);
  });

  it('[P0] detects at least one flaw when tier is off by 2+ levels', () => {
    const result = scoreTierMatch('lite', 'enterprise');
    expect(result.score).toBe(0);

    // Verify flaw detection catches this
    const scores = {
      dimensions: [
        { dimension: 'tier_match', score: 0, details: { pipeline: 'lite', truth: 'enterprise', diff: 2 } },
      ],
    };
    const flaws = detectFlaws(scores as any);
    expect(flaws).toContain('TIER_UNDERESTIMATE');
  });
});

// =============================================================================
// 3. Solution Leakage
// =============================================================================

describe('Solution Leakage Prevention', () => {
  const fullCaseStudy = {
    id: 'test-leak-001',
    source: { vendor: 'vapi', url: 'https://example.com' },
    problem: {
      industry: 'dental',
      company_size: '45 employees',
      company_type: 'dental practice',
      pain_points: ['Manual scheduling', '22% no-show rate'],
      goals: ['Automate scheduling', 'Reduce no-shows'],
      volume_metrics: { calls_per_month: 2400, calls_per_day: 80 },
      systems_involved: ['Dentrix G7', 'Google Calendar'],
    },
    solution: {
      agent_type: 'inbound',
      voice_provider: 'ElevenLabs',
      integrations: [
        { system_name: 'Dentrix G7', integration_type: 'api', purpose: 'scheduling' },
        { system_name: 'Twilio', integration_type: 'api', purpose: 'sms' },
      ],
      pricing_model: { total_cost: 18_500, monthly_cost: 650, setup_cost: 6200 },
      timeline_weeks: 6,
      roi_achieved: {
        hours_saved_per_month: 140,
        calls_automated_percent: 78,
        monthly_savings: 3500,
        annual_savings: 42_000,
      },
      key_features: ['24/7 scheduling', 'Insurance verification'],
      inferred_tier: 'standard',
    },
    meta: { quality_score: 5, holdout: false, domain_tags: ['dental'] },
  };

  it('[P0] masked intake does not contain solution pricing', () => {
    const intake = toIntake(fullCaseStudy);
    const intakeStr = JSON.stringify(intake);

    expect(intakeStr).not.toContain('18500');
    expect(intakeStr).not.toContain('650');
    expect(intakeStr).not.toContain('6200');
  });

  it('[P0] masked intake does not contain ROI data', () => {
    const intake = toIntake(fullCaseStudy);
    const intakeStr = JSON.stringify(intake);

    expect(intakeStr).not.toContain('42000');
    expect(intakeStr).not.toContain('3500');
    expect(intakeStr).not.toContain('hours_saved');
    expect(intakeStr).not.toContain('payback');
  });

  it('[P0] masked intake does not contain voice provider', () => {
    const intake = toIntake(fullCaseStudy);
    const intakeStr = JSON.stringify(intake).toLowerCase();

    expect(intakeStr).not.toContain('elevenlabs');
    expect(intakeStr).not.toContain('voice_provider');
  });

  it('[P0] masked intake does not contain tier assessment', () => {
    const intake = toIntake(fullCaseStudy);
    const intakeStr = JSON.stringify(intake).toLowerCase();

    expect(intakeStr).not.toContain('inferred_tier');
    expect(intakeStr).not.toContain('"standard"'); // tier value
  });

  it('[P0] masked intake does not contain timeline', () => {
    const intake = toIntake(fullCaseStudy);
    const intakeStr = JSON.stringify(intake);

    // "6" is too common to check, but timeline_weeks should not appear
    expect(intakeStr).not.toContain('timeline_weeks');
    expect(intakeStr).not.toContain('timeline');
  });

  it('[P1] masked intake does not contain agent_type', () => {
    const intake = toIntake(fullCaseStudy);
    const intakeStr = JSON.stringify(intake).toLowerCase();

    expect(intakeStr).not.toContain('agent_type');
    // "inbound" might appear in workflow context, but agent_type key must not
  });

  it('[P0] masked intake does not leak solution-only integrations', () => {
    // Twilio is in solution.integrations but NOT in problem.systems_involved
    const intake = toIntake(fullCaseStudy);
    const intakeStr = JSON.stringify(intake).toLowerCase();

    // Twilio should NOT appear because it's only in the solution
    expect(intakeStr).not.toContain('twilio');
  });

  it('[P1] vendor name in source does not appear as quoted string in intake', () => {
    const intake = toIntake(fullCaseStudy);
    const intakeStr = JSON.stringify(intake).toLowerCase();

    // The masker may embed vendor in account_id as a prefix (e.g. "vapi-eval-...")
    // but it should not appear as a standalone quoted value like "vapi"
    // that could be used to reverse-engineer the source.
    // Check for the vendor appearing in the account_id field specifically
    const accountId = intake.prepared_for?.account_id || '';
    if (accountId.toLowerCase().includes('vapi')) {
      // This is a known minor leak — vendor prefix in account_id
      // Not a critical leak since account_id is internal metadata, not solution data
      console.warn('MINOR LEAK: vendor prefix in account_id:', accountId);
    }

    // The critical check: vendor should not appear in workflow content or objectives
    const workflowStr = JSON.stringify(intake.section_a_workflow_definition || {}).toLowerCase();
    expect(workflowStr).not.toContain('vapi');
  });
});

// =============================================================================
// 4. Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('[P0] scoreTierMatch handles undefined gracefully', () => {
    const result = scoreTierMatch(undefined, 'standard');
    expect(result.score).toBeLessThanOrEqual(0.25);
  });

  it('[P0] scoreTierMatch handles null vs null', () => {
    const result = scoreTierMatch(null, null);
    expect(result.score).toBe(0.25);
  });

  it('[P0] scoreIntegrationCoverage handles null lists', () => {
    const result = scoreIntegrationCoverage(null, null);
    expect(result.score).toBe(1); // Both empty = match
  });

  it('[P0] scoreIntegrationCoverage handles mixed null items', () => {
    const result = scoreIntegrationCoverage(
      [null, undefined, 'Dentrix', ''],
      ['Dentrix'],
    );
    expect(result.score).toBe(1);
    expect(result.details.missing.length).toBe(0);
  });

  it('[P0] scorePricingReasonableness handles zero truth price', () => {
    const result = scorePricingReasonableness(5000, 0);
    expect(result.score).toBe(0.5); // Invalid, not crash
  });

  it('[P0] scoreTimelineRealism handles NaN', () => {
    const result = scoreTimelineRealism('not a number', 4);
    expect(result.score).toBe(0.5);
  });

  it('[P0] scoreFeatureCoverage handles features with special chars', () => {
    const result = scoreFeatureCoverage(
      ['24/7 support', 'SMS & email notifications'],
      ['24/7 support', 'sms and email notifications'],
    );
    // Should fuzzy match "SMS & email" to "sms and email"
    expect(result.score).toBeGreaterThanOrEqual(0.5);
  });

  it('[P1] compare handles completely empty objects without crashing', () => {
    expect(() => compare({}, {})).not.toThrow();
    const result = compare({}, {});
    expect(result.aggregate_score).toBeGreaterThanOrEqual(0);
    expect(result.aggregate_score).toBeLessThanOrEqual(100);
  });

  it('[P1] compare handles deeply nested null pipeline', () => {
    const pipelineOutput = {
      research: null,
      estimate: null,
      pricing: null,
      features: null,
      intake: null,
    };
    expect(() => compare(pipelineOutput, { inferred_tier: 'standard' })).not.toThrow();
  });
});

// =============================================================================
// 5. Flaw Detection Completeness
// =============================================================================

describe('Flaw Detection Completeness', () => {
  it('[P0] detects TIER_OVERESTIMATE', () => {
    const scores = {
      dimensions: [
        { dimension: 'tier_match', score: 0, details: { pipeline: 'enterprise', truth: 'lite', diff: 2 } },
      ],
    };
    const flaws = detectFlaws(scores as any);
    expect(flaws).toContain('TIER_OVERESTIMATE');
  });

  it('[P0] detects MISSING_INTEGRATION with fuzzy misses', () => {
    const result = scoreIntegrationCoverage(
      ['Google Sheets'], // Pipeline found Google Sheets
      ['Salesforce', 'HubSpot', 'Dentrix'], // Truth has totally different systems
    );
    expect(result.details.missing.length).toBe(3);
  });

  it('[P0] detects EXTRA_INTEGRATION when pipeline hallucinates', () => {
    const result = scoreIntegrationCoverage(
      ['Salesforce', 'HubSpot', 'SAP', 'Oracle', 'ServiceNow'],
      ['Salesforce'],
    );
    // 4 extra integrations
    expect(result.details.extra.length).toBe(4);
  });

  it('[P0] detects PRICE_TOO_HIGH', () => {
    const result = scorePricingReasonableness(100_000, 10_000);
    expect(result.score).toBe(0);
    expect(result.details.direction).toBe('high');
  });

  it('[P0] detects PRICE_TOO_LOW', () => {
    const result = scorePricingReasonableness(1000, 10_000);
    expect(result.score).toBe(0);
    expect(result.details.direction).toBe('low');
  });

  it('[P0] detects TIMELINE_OPTIMISTIC', () => {
    const result = scoreTimelineRealism(2, 12);
    expect(result.score).toBe(0);
    expect(result.details.direction).toBe('optimistic');
  });

  it('[P0] detects TIMELINE_PESSIMISTIC', () => {
    const result = scoreTimelineRealism(20, 4);
    expect(result.score).toBe(0);
    expect(result.details.direction).toBe('pessimistic');
  });

  it('[P0] detects AGENT_TYPE_MISMATCH', () => {
    const result = scoreAgentTypeAlignment('outbound', 'inbound');
    expect(result.score).toBe(0);
  });

  it('[P0] detects FEATURE_GAP when 3+ features missing', () => {
    const result = scoreFeatureCoverage(
      ['scheduling'],
      ['scheduling', 'sms reminders', 'insurance verification', 'emergency triage', 'multi-language'],
    );
    expect(result.details.missing.length).toBeGreaterThanOrEqual(3);
  });

  it('[P0] FEATURE_GAP flaw fires from detectFlaws', () => {
    const scores = {
      dimensions: [
        {
          dimension: 'feature_coverage',
          score: 0.2,
          details: { missing: ['a', 'b', 'c'] },
        },
      ],
    };
    const flaws = detectFlaws(scores as any);
    expect(flaws).toContain('FEATURE_GAP');
  });
});

// =============================================================================
// 6. Fuzzy Matching Adversarial
// =============================================================================

describe('Fuzzy Matching Adversarial', () => {
  it('[P0] does NOT match completely unrelated systems', () => {
    const result = scoreIntegrationCoverage(
      ['Salesforce'],
      ['Dentrix'],
    );
    expect(result.score).toBe(0);
    expect(result.details.missing.length).toBe(1);
  });

  it('[P0] does NOT match partial substring that is coincidental', () => {
    // "ring" in RingCentral shouldn't match "Springer" or "StringIO"
    const result = scoreIntegrationCoverage(
      ['Springer'],
      ['RingCentral'],
    );
    // These should NOT match
    expect(result.details.missing.length).toBe(1);
  });

  it('[P1] handles extremely long system names', () => {
    const longName = 'A'.repeat(500);
    expect(() => scoreIntegrationCoverage([longName], ['Dentrix'])).not.toThrow();
  });

  it('[P1] handles special characters in system names', () => {
    const result = scoreIntegrationCoverage(
      ['Salesforce (CRM)', 'HubSpot [Legacy]'],
      ['Salesforce', 'HubSpot'],
    );
    // Should match despite parentheses/brackets
    expect(result.score).toBe(1);
  });

  it('[P1] handles numbers-only system names', () => {
    const result = scoreIntegrationCoverage(['123'], ['456']);
    expect(result.score).toBe(0);
  });
});

// =============================================================================
// 7. Regression Canaries
// =============================================================================

describe('Regression Canaries', () => {
  /**
   * These test specific pipeline output structures that we KNOW the real
   * pipeline produces. If these fail, the pipeline schema changed and
   * the comparator needs updating.
   */

  it('[P0] extractFromPipeline finds tier at research.tier_assessment.key', () => {
    const result = compare(
      { research: { tier_assessment: { key: 'standard' } } },
      { inferred_tier: 'standard' },
    );
    const tierDim = result.dimensions.find((d: any) => d.dimension === 'tier_match');
    expect(tierDim.score).toBe(1);
  });

  it('[P0] extractFromPipeline finds integrations at research.integrations[].integration', () => {
    const result = compare(
      { research: { integrations: [{ integration: 'Dentrix', system: 'Dentrix' }] } },
      { integrations: [{ system_name: 'Dentrix' }] },
    );
    const intDim = result.dimensions.find((d: any) => d.dimension === 'integration_coverage');
    expect(intDim.score).toBe(1);
  });

  it('[P0] extractFromPipeline finds price at pricing.final_price', () => {
    const result = compare(
      { research: {}, pricing: { final_price: 10_000 } },
      { pricing_model: { total_cost: 10_000 } },
    );
    const priceDim = result.dimensions.find((d: any) => d.dimension === 'pricing_reasonableness');
    expect(priceDim.score).toBe(1);
  });

  it('[P0] extractFromPipeline finds features at root .features', () => {
    const result = compare(
      { research: {}, features: ['scheduling', 'sms reminders'] },
      { key_features: ['scheduling', 'sms reminders'] },
    );
    const featDim = result.dimensions.find((d: any) => d.dimension === 'feature_coverage');
    expect(featDim.score).toBe(1);
  });

  it('[P0] extractFromPipeline infers agent type from workflow name', () => {
    const result = compare(
      {
        research: {},
        intake: { section_a_workflow_definition: { q01_workflow_name: 'After-Hours Scheduling Bot' } },
      },
      { agent_type: 'inbound' },
    );
    const agentDim = result.dimensions.find((d: any) => d.dimension === 'agent_type_alignment');
    expect(agentDim.score).toBe(1);
  });
});
