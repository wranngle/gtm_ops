/**
 * Unit tests for the Exa/Tavily wiring inside
 * lib/proactive-research.ts#researchIntegrationWithLLM. Pins the seam
 * added when lib/research-tools.ts was ported: retrieved web results are
 * injected into the research prompt as primary evidence when present,
 * the prompt stays unchanged when the adapter returns nothing (no keys
 * configured), and embedded-database hits never reach the web at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/llm.js', () => ({ executeLLMJson: vi.fn() }));
vi.mock('../../lib/research-tools.js', () => ({ performDeepResearch: vi.fn() }));

import { executeLLMJson } from '../../src/services/llm.js';
import { performDeepResearch } from '../../lib/research-tools.js';
import { researchIntegrationWithLLM } from '../../lib/proactive-research.js';

const llmMock = vi.mocked(executeLLMJson);
const webMock = vi.mocked(performDeepResearch);

// Passes validateResearch: real docs URL, specific rate limits, auth notes ≥ 20
// chars, and no native-node claim without a node name.
const validResearch = {
  integration_name: 'ObscureServiceXyz',
  has_native_n8n_node: false,
  native_node_name: null,
  auth_type: 'API Key',
  auth_complexity: 'simple',
  auth_notes: 'Create an API key from the developer portal settings page.',
  api_quality: 'good',
  api_documentation_url: 'https://developers.obscureservice.dev/api',
  rate_limits: '120 req/min',
  complexity_score: 5,
  complexity_tier: 'moderate',
  estimated_hours: 8,
  webhook_support: true,
  gotchas: [],
  client_must_provide: ['API key'],
  operations_available: ['contacts.list'],
  confidence: 0.9,
  research_notes: 'Solid REST API.',
  sources_consulted: ['Official Docs']
};

beforeEach(() => {
  llmMock.mockReset();
  webMock.mockReset();
  llmMock.mockResolvedValue({ data: validResearch });
});

describe('[P0] researchIntegrationWithLLM web-context injection', () => {
  it('[P0] injects retrieved Exa/Tavily results into the research prompt', async () => {
    webMock.mockResolvedValue({
      sources: [{ source: 'exa', results: [] }],
      context: '\n\n### Exa Research Results\n- [Doc](https://x.dev): auth via API key'
    });

    await researchIntegrationWithLLM('ObscureServiceXyz');

    expect(webMock).toHaveBeenCalledTimes(1);
    expect(String(webMock.mock.calls[0][0])).toContain('ObscureServiceXyz');
    const prompt = llmMock.mock.calls[0][0] as string;
    expect(prompt).toContain('REAL WEB SEARCH RESULTS');
    expect(prompt).toContain('### Exa Research Results');
  });

  it('[P0] leaves the prompt clean when the adapter returns nothing (no keys)', async () => {
    webMock.mockResolvedValue({ sources: [], context: '' });

    const result = await researchIntegrationWithLLM('ObscureServiceXyz');

    const prompt = llmMock.mock.calls[0][0] as string;
    expect(prompt).not.toContain('REAL WEB SEARCH RESULTS');
    expect(result.found).toBe(true);
    expect(result.generated).toBe(true);
  });

  it('[P1] embedded-database hits skip web research and the LLM entirely', async () => {
    const result = await researchIntegrationWithLLM('HubSpot');
    expect(webMock).not.toHaveBeenCalled();
    expect(llmMock).not.toHaveBeenCalled();
    expect(result.from_database).toBe(true);
  });
});
