/**
 * Unit tests for lib/research-tools.ts — the Exa/Tavily adapter behind
 * proactive research. Pins the env-gating contract: with no API keys the
 * aggregate helper is a silent no-op (empty findings, no network), and
 * the low-level search helpers refuse to run without a key.
 */
import { describe, expect, it } from 'vitest';
import { performDeepResearch, searchExa, searchTavily } from '../../lib/research-tools.js';

describe('[P0] performDeepResearch env gating', () => {
  it('[P0] returns empty findings and makes no network calls when no keys are configured', async () => {
    const findings = await performDeepResearch('acme api', {});
    expect(findings).toEqual({ sources: [], context: '' });
  });
});

describe('[P1] key guards', () => {
  it('[P1] searchExa rejects without a key', async () => {
    await expect(searchExa('q', '')).rejects.toThrow('Exa API key missing');
  });

  it('[P1] searchTavily rejects without a key', async () => {
    await expect(searchTavily('q', '')).rejects.toThrow('Tavily API key missing');
  });
});
