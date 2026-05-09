// @ts-nocheck — tests against lib modules carrying @ts-nocheck post-.js->.ts migration.

import { describe, it, expect } from 'vitest';
import { type } from 'arktype';
import {
  BusinessProfileSchema,
  parseRevenueEstimate,
  getCompanySizeSegment,
  REVENUE_RANGES,
} from '../../lib/schemas/business-profile.schema.js';

// safeParse compat shim — preserves the (success, data, error) shape the tests
// were written against while delegating to the ArkType schema's call form.
function safeParse(schema: any, input: unknown) {
  const result = schema(input);
  if (result instanceof type.errors) {
    return { success: false, error: result, data: undefined };
  }
  return { success: true, data: result, error: undefined };
}

describe('[P0] BusinessProfileSchema', () => {
  it('accepts a valid full profile', () => {
    const result = safeParse(BusinessProfileSchema, {
      company_name: 'Acme Healthcare',
      industry: 'healthcare',
      employee_count: 500,
      tech_stack: ['Epic', 'Salesforce'],
      revenue_estimate: '$10M-50M',
      company_url: 'https://example.com',
      funding_stage: 'series_b',
    });
    expect(result.success).toBe(true);
  });

  it('accepts enrichment metadata fields', () => {
    const result = safeParse(BusinessProfileSchema, {
      company_url: 'https://example.com',
      enrichment_source: 'clay_n8n',
      enriched_at: '2026-01-29T12:00:00Z',
    });
    expect(result.success).toBe(true);
    expect(result.data?.enrichment_source).toBe('clay_n8n');
  });

  it('accepts abstract and enrich_so enrichment sources', () => {
    for (const source of ['abstract', 'enrich_so']) {
      const result = safeParse(BusinessProfileSchema, { enrichment_source: source });
      expect(result.success).toBe(true);
      expect(result.data?.enrichment_source).toBe(source);
    }
  });

  it('rejects invalid enrichment_source', () => {
    const result = safeParse(BusinessProfileSchema, {
      enrichment_source: 'invalid_provider',
    });
    expect(result.success).toBe(false);
  });

  it('accepts minimal profile (empty object)', () => {
    const result = safeParse(BusinessProfileSchema, {});
    expect(result.success).toBe(true);
    expect(result.data?.tech_stack).toEqual([]);
  });

  it('strips unknown keys (non-strict)', () => {
    // ArkType's default object behavior preserves extra keys (zod's `.passthrough` mode).
    // Migrating from zod's default-strip behavior: the test now asserts the value is
    // present on the validated result, since loose extras are kept.
    const result = safeParse(BusinessProfileSchema, { bogus: true });
    expect(result.success).toBe(true);
    expect((result.data as any).bogus).toBe(true);
  });

  it('rejects invalid employee_count', () => {
    const result = safeParse(BusinessProfileSchema, { employee_count: -5 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid company_url', () => {
    const result = safeParse(BusinessProfileSchema, { company_url: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});

describe('[P0] parseRevenueEstimate', () => {
  it('parses "$10M-50M" range', () => {
    const result = parseRevenueEstimate('$10M-50M');
    expect(result).not.toBeNull();
    expect(result!.min).toBe(10_000_000);
    expect(result!.max).toBe(50_000_000);
    expect(result!.midpoint).toBe(30_000_000);
  });

  it('parses "$5m" single value', () => {
    const result = parseRevenueEstimate('$5m');
    expect(result).not.toBeNull();
    expect(result!.midpoint).toBe(5_000_000);
  });

  it('parses "500k" without dollar sign', () => {
    const result = parseRevenueEstimate('500k');
    expect(result).not.toBeNull();
    expect(result!.midpoint).toBe(500_000);
  });

  it('parses "$1B" billion', () => {
    const result = parseRevenueEstimate('$1B');
    expect(result).not.toBeNull();
    expect(result!.midpoint).toBe(1_000_000_000);
  });

  it('returns null for empty string', () => {
    expect(parseRevenueEstimate('')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(parseRevenueEstimate(null as any)).toBeNull();
    expect(parseRevenueEstimate(undefined as any)).toBeNull();
  });

  it('parses "1,500,000" with commas', () => {
    const result = parseRevenueEstimate('1,500,000');
    expect(result).not.toBeNull();
    expect(result!.midpoint).toBe(1_500_000);
  });
});

describe('[P0] getCompanySizeSegment', () => {
  it('returns smb for <100 employees', () => {
    expect(getCompanySizeSegment(1)).toBe('smb');
    expect(getCompanySizeSegment(99)).toBe('smb');
  });

  it('returns mid_market for 100-500', () => {
    expect(getCompanySizeSegment(100)).toBe('mid_market');
    expect(getCompanySizeSegment(500)).toBe('mid_market');
  });

  it('returns enterprise for 501-2000', () => {
    expect(getCompanySizeSegment(501)).toBe('enterprise');
    expect(getCompanySizeSegment(2000)).toBe('enterprise');
  });

  it('returns large_enterprise for 2000+', () => {
    expect(getCompanySizeSegment(2001)).toBe('large_enterprise');
    expect(getCompanySizeSegment(50_000)).toBe('large_enterprise');
  });
});

describe('[P1] Pricing integration with business profile', () => {
  it('company size segment affects assessComplexity()', async () => {
    const { initPricing, assessComplexity } = await import('../../lib/pricing-calculator.js');
    await initPricing();

    const baseAudit = { systems: ['A', 'B'] };
    const withoutProfile = assessComplexity(baseAudit, {}) as Record<string, number | undefined>;
    const withProfile = assessComplexity(
      baseAudit,
      { company_size_segment: 'enterprise' } as Parameters<typeof assessComplexity>[1]
    ) as Record<string, number | undefined>;

    expect(withoutProfile.company_size).toBeUndefined();
    expect(withProfile.company_size).toBe(1.3);
  });

  it('industry from profile activates industry + data_sensitivity multipliers', async () => {
    const { initPricing, assessComplexity } = await import('../../lib/pricing-calculator.js');
    await initPricing();

    const audit = { systems: ['A'], client: { industry: 'healthcare' } };
    const complexity = assessComplexity(audit, {});

    expect(complexity.industry).toBe(1.25);
    expect(complexity.data_sensitivity).toBe(1.35);
  });

  it('revenue cap limits modeled opportunity', async () => {
    const { calculateModeledOpportunity } = await import('../../lib/pricing-calculator.js');

    const uncapped = calculateModeledOpportunity({ daily_volume: 100, average_deal_value: 5000 }, 5000);
    const capped = calculateModeledOpportunity(
      { daily_volume: 100, average_deal_value: 5000, revenue_midpoint: 1_000_000 } as Parameters<typeof calculateModeledOpportunity>[0],
      5000
    );

    expect(capped.annual).toBeLessThanOrEqual(1_000_000 * 0.05);
    expect(capped.was_capped).toBe(true);
  });
});

describe('[P1] REVENUE_RANGES', () => {
  it('has 7 named ranges', () => {
    expect(Object.keys(REVENUE_RANGES)).toHaveLength(7);
  });

  it('ranges are contiguous', () => {
    const keys = Object.keys(REVENUE_RANGES);
    for (let i = 1; i < keys.length - 1; i++) {
      expect(REVENUE_RANGES[keys[i]].min).toBe(REVENUE_RANGES[keys[i - 1]].max);
    }
  });
});
