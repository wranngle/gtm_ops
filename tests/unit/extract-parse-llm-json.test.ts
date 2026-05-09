/**
 * Unit tests for lib/extract.ts#parseLLMJson — the parse-with-actionable-
 * context helper that PR #96 added inside callLLM and PR (this one)
 * extracted into a pure function. Pins the contract so a future
 * refactor that bypasses the wrapper (or trims the snippet) doesn't
 * regress the operator-debugging surface.
 */
import { describe, expect, it } from 'vitest';
import { parseLLMJson } from '../../lib/extract.js';

describe('[P0] parseLLMJson - wrapped LLM JSON parsing', () => {
  it('[P0] should parse plain JSON', () => {
    const result = parseLLMJson('{"answer":42}', 100);
    expect(result).toEqual({ answer: 42 });
  });

  it('[P0] should strip ```json fence', () => {
    const fenced = '```json\n{"answer":42}\n```';
    expect(parseLLMJson(fenced, 100)).toEqual({ answer: 42 });
  });

  it('[P0] should strip bare ``` fence', () => {
    const fenced = '```\n{"answer":42}\n```';
    expect(parseLLMJson(fenced, 100)).toEqual({ answer: 42 });
  });

  it('[P0] should wrap parse errors with token count and body snippet', () => {
    const broken = '{"answer": 42, "trail":';
    expect(() => parseLLMJson(broken, 4567)).toThrow(/malformed JSON/);
    try {
      parseLLMJson(broken, 4567);
    } catch (err: any) {
      expect(err.message).toContain('Tokens used: 4567');
      expect(err.message).toContain('Response (');
      // The original SyntaxError is preserved for stack inspection.
      expect(err.cause).toBeDefined();
      expect(err.cause).toBeInstanceOf(SyntaxError);
    }
  });

  it('[P0] should head+tail snippet a large body (200+ char threshold)', () => {
    // 250-char string of 'a's followed by an unterminated quote so it
    // fails to parse — confirms the snippet form is "head...tail".
    const big = `{"x":"${'a'.repeat(250)}`;
    try {
      parseLLMJson(big, 100);
      throw new Error('should have thrown');
    } catch (err: any) {
      expect(err.message).toMatch(/\.\.\./);
      // Total snippet ≤ 203 chars (100 head + 3 ellipsis + 100 tail).
      // The error message wraps it with prefix text, so just bound the
      // dot-dot-dot existence.
    }
  });

  it('[P1] should treat null/undefined input as empty (parse fails clearly)', () => {
    expect(() => parseLLMJson(null as any, 0)).toThrow(/malformed JSON/);
    expect(() => parseLLMJson(undefined as any, 0)).toThrow(/malformed JSON/);
  });
});
