/**
 * Unit tests for lib/types.ts — Schema v2 typed value constructors
 * + period conversions + legacy migration. Untested before this
 * file. The annual ↔ monthly conversion math is exactly the kind of
 * code that the $10.7M-era incident report cited; sanity.ts pinned
 * the runtime guard, this pins the type-aware conversion.
 */
import { describe, expect, it, beforeEach } from 'vitest';

let createMonetaryValue: any;
let createDurationValue: any;
let createPercentageValue: any;
let isMonetaryValue: any;
let isDurationValue: any;
let getMonthlyAmount: any;
let getAnnualAmount: any;
let sumMonetaryValues: any;
let migrateToMonetaryValue: any;

beforeEach(async () => {
  const mod: any = await import('../../lib/types.js');
  ({
    createMonetaryValue,
    createDurationValue,
    createPercentageValue,
    isMonetaryValue,
    isDurationValue,
    getMonthlyAmount,
    getAnnualAmount,
    sumMonetaryValues,
    migrateToMonetaryValue,
  } = mod);
});

describe('[P0] createMonetaryValue', () => {
  it('[P0] should build {amount, currency, period}', () => {
    expect(createMonetaryValue(100, 'monthly')).toEqual({
      amount: 100,
      currency: 'USD',
      period: 'monthly',
    });
  });

  it('[P0] should accept a custom currency', () => {
    expect(createMonetaryValue(100, 'monthly', 'EUR').currency).toBe('EUR');
  });

  it('[P0] should reject NaN / non-number amount', () => {
    expect(() => createMonetaryValue(Number.NaN, 'monthly')).toThrow(TypeError);
    expect(() => createMonetaryValue('100' as any, 'monthly')).toThrow(TypeError);
  });

  it('[P0] should reject an unknown period', () => {
    expect(() => createMonetaryValue(100, 'forever' as any)).toThrow(/Invalid period/);
  });
});

describe('[P0] createDurationValue / createPercentageValue', () => {
  it('[P0] createDurationValue should build {value, unit}', () => {
    expect(createDurationValue(8, 'hours')).toEqual({ value: 8, unit: 'hours' });
  });

  it('[P0] createDurationValue should reject NaN / unknown unit', () => {
    expect(() => createDurationValue(Number.NaN, 'hours')).toThrow(TypeError);
    expect(() => createDurationValue(8, 'fortnights' as any)).toThrow(/Invalid unit/);
  });

  it('[P0] createPercentageValue should build {value, basis}', () => {
    expect(createPercentageValue(0.15, 'total_cost')).toEqual({
      value: 0.15,
      basis: 'total_cost',
    });
    expect(createPercentageValue(0.15)).toEqual({ value: 0.15, basis: '' });
  });

  it('[P0] createPercentageValue should reject NaN', () => {
    expect(() => createPercentageValue(Number.NaN)).toThrow(TypeError);
  });
});

describe('[P0] type guards', () => {
  it('[P0] isMonetaryValue accepts a fully-formed value', () => {
    expect(isMonetaryValue({ amount: 100, currency: 'USD', period: 'monthly' })).toBe(true);
  });

  it('[P0] isMonetaryValue rejects missing fields / wrong types', () => {
    expect(isMonetaryValue(null)).toBe(false);
    expect(isMonetaryValue(100)).toBe(false);
    expect(isMonetaryValue({ amount: 100 })).toBe(false);
    expect(isMonetaryValue({ amount: '100', currency: 'USD', period: 'monthly' })).toBe(false);
    expect(isMonetaryValue({ amount: 100, currency: 'USD', period: 'forever' })).toBe(false);
  });

  it('[P0] isDurationValue accepts a fully-formed value', () => {
    expect(isDurationValue({ value: 8, unit: 'hours' })).toBe(true);
  });

  it('[P0] isDurationValue rejects missing fields / wrong types', () => {
    expect(isDurationValue(null)).toBe(false);
    expect(isDurationValue({ value: 8 })).toBe(false);
    expect(isDurationValue({ value: 8, unit: 'fortnights' })).toBe(false);
  });
});

describe('[P0] getMonthlyAmount / getAnnualAmount - period conversion', () => {
  it('[P0] should convert annual → monthly with rounded /12', () => {
    // The example from the docstring: $892,500/yr → $74,375/mo.
    const annual = createMonetaryValue(892_500, 'annual');
    const monthly = getMonthlyAmount(annual);
    expect(monthly).toEqual({ amount: 74_375, currency: 'USD', period: 'monthly' });
  });

  it('[P0] should convert monthly → annual via *12', () => {
    const monthly = createMonetaryValue(74_375, 'monthly');
    const annual = getAnnualAmount(monthly);
    expect(annual).toEqual({ amount: 892_500, currency: 'USD', period: 'annual' });
  });

  it('[P0] should pass-through monthly→monthly and annual→annual', () => {
    const monthly = createMonetaryValue(100, 'monthly');
    const annual = createMonetaryValue(1200, 'annual');
    expect(getMonthlyAmount(monthly)).toEqual(monthly);
    expect(getAnnualAmount(annual)).toEqual(annual);
  });

  it('[P0] should leave once + per_item alone (no defensible conversion)', () => {
    const once = createMonetaryValue(50_000, 'once');
    const perItem = createMonetaryValue(10, 'per_item');
    expect(getMonthlyAmount(once)).toEqual(once);
    expect(getMonthlyAmount(perItem)).toEqual(perItem);
    expect(getAnnualAmount(once)).toEqual(once);
    expect(getAnnualAmount(perItem)).toEqual(perItem);
  });

  it('[P0] should throw on a non-MonetaryValue input', () => {
    expect(() => getMonthlyAmount({ amount: 100 } as any)).toThrow(/Invalid MonetaryValue/);
    expect(() => getAnnualAmount(null as any)).toThrow(/Invalid MonetaryValue/);
  });
});

describe('[P0] sumMonetaryValues', () => {
  it('[P0] should sum same-period same-currency values', () => {
    const a = createMonetaryValue(100, 'monthly');
    const b = createMonetaryValue(50, 'monthly');
    expect(sumMonetaryValues([a, b])).toEqual({ amount: 150, currency: 'USD', period: 'monthly' });
  });

  it('[P0] should refuse to mix periods (an actual bug surface)', () => {
    const monthly = createMonetaryValue(100, 'monthly');
    const annual = createMonetaryValue(1200, 'annual');
    expect(() => sumMonetaryValues([monthly, annual])).toThrow(/different periods/);
  });

  it('[P0] should refuse to mix currencies', () => {
    const usd = createMonetaryValue(100, 'monthly');
    const eur = createMonetaryValue(100, 'monthly', 'EUR');
    expect(() => sumMonetaryValues([usd, eur])).toThrow(/different currencies/);
  });

  it('[P1] should return $0 once for empty / non-array', () => {
    expect(sumMonetaryValues([])).toEqual({ amount: 0, currency: 'USD', period: 'once' });
    expect(sumMonetaryValues(null as any)).toEqual({ amount: 0, currency: 'USD', period: 'once' });
  });

  it('[P0] should validate every element is a MonetaryValue', () => {
    const ok = createMonetaryValue(100, 'monthly');
    expect(() => sumMonetaryValues([ok, { amount: 5 } as any])).toThrow(/All values must be valid/);
  });
});

describe('[P0] migrateToMonetaryValue - schema v1 → v2', () => {
  it('[P0] should pass through an already-typed MonetaryValue', () => {
    const mv = createMonetaryValue(100, 'monthly');
    expect(migrateToMonetaryValue(mv)).toBe(mv);
  });

  it('[P0] should convert a raw number using the assumed period', () => {
    expect(migrateToMonetaryValue(100, 'monthly')).toEqual({
      amount: 100,
      currency: 'USD',
      period: 'monthly',
    });
  });

  it('[P0] should map legacy period strings (month/year/quarter) to canonical periods', () => {
    expect(migrateToMonetaryValue({ amount: 100, period: 'month' })).toMatchObject({ period: 'monthly' });
    expect(migrateToMonetaryValue({ amount: 100, period: 'year' })).toMatchObject({ period: 'annual' });
    // Quarter collapses to monthly per the comment on the period map.
    expect(migrateToMonetaryValue({ amount: 100, period: 'quarter' })).toMatchObject({ period: 'monthly' });
  });

  it('[P0] should accept legacy {value, ...} shape (uses .value if .amount missing)', () => {
    expect(migrateToMonetaryValue({ value: 100 })).toMatchObject({ amount: 100, period: 'monthly' });
  });

  it('[P1] should fall back to the assumed period when the input period is unknown', () => {
    // PR #135 noted that lib/types.js was missing the
    // `validPeriods.includes(mappedPeriod) ? mappedPeriod :
    // assumedPeriod` fallback that lib/types.ts had — which made
    // unknown period values throw at runtime. This PR collapses the
    // duplicate (cf. PR #128 for lib/health), so the canonical .ts
    // behavior is what runs: unknown periods fall through to
    // assumedPeriod (default 'monthly') instead of throwing.
    expect(migrateToMonetaryValue({ amount: 100, period: 'eternity' })).toMatchObject({
      amount: 100,
      period: 'monthly',
    });
  });

  it('[P1] should fall back to $0 once for null/undefined input', () => {
    expect(migrateToMonetaryValue(null as any)).toEqual({ amount: 0, currency: 'USD', period: 'monthly' });
  });
});
