/**
 * Unit tests for lib/research.ts — prospect research queries and the
 * quickTierAssessment LLM call with its deterministic fallback. Pins:
 * (1) declared (string) + legacy ({ name }) systems consolidate by NAME,
 * so prompts and factors never render "[object Object]"; (2) when the
 * LLM is unavailable the assessment degrades to the documented
 * count-based heuristic instead of crashing the pipeline.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/llm.js', () => ({
  executeLLMJson: vi.fn()
}));

import { executeLLMJson } from '../../src/services/llm.js';
import { buildResearchQueries, generateResearchPlan, quickTierAssessment } from '../../lib/research.js';

const llmMock = vi.mocked(executeLLMJson);

beforeEach(() => {
  llmMock.mockReset();
});

describe('[P1] buildResearchQueries', () => {
  it('[P1] emits 4 company queries plus 2 per integration', () => {
    const queries = buildResearchQueries({
      client: { name: 'Acme HVAC' },
      project: { integrations: [{ name: 'HubSpot' }, { name: 'Twilio' }] }
    });
    expect(queries).toHaveLength(8);
    expect(queries[0]).toBe('Acme HVAC company funding valuation');
    expect(queries).toContain('HubSpot API documentation');
    expect(queries).toContain('Twilio API authentication');
  });
});

describe('[P1] generateResearchPlan', () => {
  it('[P1] deep depth for enterprise tier, standard otherwise', () => {
    expect(generateResearchPlan({ classification: { estimated_tier: 'enterprise' } }).depth).toBe('deep');
    expect(generateResearchPlan({}).depth).toBe('standard');
  });
});

describe('[P0] quickTierAssessment', () => {
  it('[P0] returns LLM data for both the {data} wrapper and direct-object APIs', async () => {
    const assessment = { key: 'standard', tier: 'mid-market' };
    llmMock.mockResolvedValueOnce({ data: assessment });
    expect(await quickTierAssessment({})).toEqual(assessment);
    llmMock.mockResolvedValueOnce(assessment);
    expect(await quickTierAssessment({})).toEqual(assessment);
  });

  it('[P0] consolidates declared strings + legacy {name} objects by name in the prompt', async () => {
    llmMock.mockResolvedValueOnce({ data: { key: 'standard' } });
    await quickTierAssessment({
      section_c_systems_handoffs: { q10_systems_involved: ['HubSpot', 'Slack'] },
      project: { integrations: [{ name: 'HubSpot' }, { name: 'Stripe' }] }
    });
    const prompt = llmMock.mock.calls[0][0] as string;
    expect(prompt).toContain('Systems Involved: HubSpot, Slack, Stripe');
    expect(prompt).toContain('System Count: 3');
    expect(prompt).not.toContain('[object Object]');
  });

  it('[P0] falls back to the deterministic heuristic when the LLM is unavailable', async () => {
    llmMock.mockRejectedValue(new Error('429 rate limited'));

    const simple = await quickTierAssessment({
      section_c_systems_handoffs: { q10_systems_involved: ['A'] }
    });
    expect(simple).toMatchObject({
      key: 'simple',
      tier: 'startup',
      baseHours: 40,
      riskMultiplier: 1,
      pricing_strategy: 'standard',
      needs_deep_research: false
    });

    const standard = await quickTierAssessment({
      section_c_systems_handoffs: { q10_systems_involved: ['A', 'B', 'C'] }
    });
    expect(standard).toMatchObject({
      key: 'standard',
      tier: 'mid-market',
      baseHours: 80,
      riskMultiplier: 1.15
    });

    const complex = await quickTierAssessment({
      section_c_systems_handoffs: { q10_systems_involved: ['A', 'B', 'C', 'D', 'E', 'F'] }
    });
    expect(complex).toMatchObject({
      key: 'complex',
      tier: 'enterprise',
      baseHours: 120,
      riskMultiplier: 1.3,
      needs_deep_research: true
    });
    expect(complex.factors).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(complex.confidence).toBe(0.6);
  });

  it('[P1] fallback factors are plain strings when legacy integrations are objects', async () => {
    llmMock.mockRejectedValue(new Error('boom'));
    const result = await quickTierAssessment({
      project: { integrations: [{ name: 'HubSpot' }, { name: 'Stripe' }] }
    });
    expect(result.factors).toEqual(['HubSpot', 'Stripe']);
  });
});
