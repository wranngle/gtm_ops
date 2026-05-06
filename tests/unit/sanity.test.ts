/**
 * Unit tests for lib/sanity.ts.
 *
 * The header comment in the module says "These checks would have
 * prevented the $10.7M calculation bug." Financial bounds validators
 * are the kind of code where a silent regression — say, dropping the
 * 480-minute ceiling on minutes_per_item — re-opens the door to the
 * incident the file was created to prevent.
 *
 * No test file existed; pinning each guard so a regression fails CI.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  validateBleedInputs,
  validateMonetaryAmount,
  validatePercentage,
  validateDuration,
} from '../../lib/sanity.js';

describe('[P0] validateBleedInputs - financial bounds', () => {
  it('[P0] should accept reasonable inputs and return them as-is', () => {
    const inputs = {
      volume_per_day: 75,
      days_per_month: 22,
      minutes_per_item: 10,
      hourly_rate: 75,
    };
    expect(validateBleedInputs(inputs)).toBe(inputs);
  });

  it('[P0] should reject minutes_per_item > 480 (the $10.7M-bug guard)', () => {
    expect(() => validateBleedInputs({ minutes_per_item: 600 })).toThrow(
      /SANITY CHECK FAILED.*minutes_per_item=600.*8 hours/,
    );
  });

  it('[P0] should reject volume_per_day > 10,000', () => {
    expect(() => validateBleedInputs({ volume_per_day: 10_001 })).toThrow(
      /volume_per_day=10001/,
    );
  });

  it('[P0] should reject days_per_month outside 1..31', () => {
    expect(() => validateBleedInputs({ days_per_month: 0 })).toThrow(/days_per_month/);
    expect(() => validateBleedInputs({ days_per_month: 32 })).toThrow(/days_per_month/);
  });

  it('[P0] should reject combined inputs that yield > $500K monthly bleed', () => {
    // 1000 vol/day × 30d × 480min/60 × $500/hr = $120,000,000 monthly. Way over.
    // Use values that individually pass but combine to a too-large total.
    expect(() =>
      validateBleedInputs({
        volume_per_day: 1000,
        days_per_month: 30,
        minutes_per_item: 60,
        hourly_rate: 500,
      }),
    ).toThrow(/Calculated monthly bleed.*exceeds \$500K/);
  });

  it('[P1] should warn on hourly_rate outside $10-$500 but still return inputs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = validateBleedInputs({ hourly_rate: 5 });
    expect(result.hourly_rate).toBe(5);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('[P0] validateMonetaryAmount - dollar guards', () => {
  it('[P0] should accept zero and reasonable amounts', () => {
    expect(validateMonetaryAmount(0, 'fee')).toBe(0);
    expect(validateMonetaryAmount(50_000, 'fee')).toBe(50_000);
  });

  it('[P0] should reject NaN / non-number', () => {
    expect(() => validateMonetaryAmount(Number.NaN, 'fee')).toThrow(TypeError);
    expect(() => validateMonetaryAmount('100' as any, 'fee')).toThrow(TypeError);
  });

  it('[P0] should reject negative amount by default', () => {
    expect(() => validateMonetaryAmount(-1, 'fee')).toThrow(/negative/);
  });

  it('[P0] should accept negative when allowNegative=true', () => {
    expect(validateMonetaryAmount(-500, 'refund', { allowNegative: true })).toBe(-500);
  });

  it('[P0] should reject amount above maxAmount (default $100M)', () => {
    expect(() => validateMonetaryAmount(100_000_001, 'fee')).toThrow(/exceeds max/);
  });

  it('[P1] should respect a custom maxAmount', () => {
    expect(() => validateMonetaryAmount(11, 'small', { maxAmount: 10 })).toThrow(/exceeds max/);
    expect(validateMonetaryAmount(10, 'small', { maxAmount: 10 })).toBe(10);
  });
});

describe('[P0] validatePercentage - format-aware', () => {
  it('[P0] should accept 0..1 in decimal mode', () => {
    expect(validatePercentage(0, 'p')).toBe(0);
    expect(validatePercentage(0.5, 'p')).toBe(0.5);
    expect(validatePercentage(1, 'p')).toBe(1);
  });

  it('[P0] should reject decimal mode value outside 0..1', () => {
    expect(() => validatePercentage(1.5, 'p')).toThrow(/decimal range/);
    expect(() => validatePercentage(-0.1, 'p')).toThrow(/decimal range/);
  });

  it('[P1] should warn when an integer percentage is passed in decimal mode', () => {
    // 15 looks like an integer percentage; the warning should fire.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => validatePercentage(15, 'p')).toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('[P0] should accept 0..100 in integer mode', () => {
    expect(validatePercentage(0, 'p', 'integer')).toBe(0);
    expect(validatePercentage(100, 'p', 'integer')).toBe(100);
  });

  it('[P0] should reject integer mode value outside 0..100', () => {
    expect(() => validatePercentage(101, 'p', 'integer')).toThrow(/integer percentage/);
  });

  it('[P0] should reject NaN / non-number', () => {
    expect(() => validatePercentage(Number.NaN, 'p')).toThrow(TypeError);
  });
});

describe('[P1] validateDuration - unit-aware bounds', () => {
  it('[P0] should reject an unknown unit', () => {
    expect(() => validateDuration(1, 'fortnights' as any, 'd')).toThrow(/invalid unit/);
  });

  it('[P0] should reject negative or NaN value', () => {
    expect(() => validateDuration(-1, 'hours', 'd')).toThrow(/value is invalid/);
    expect(() => validateDuration(Number.NaN, 'hours', 'd')).toThrow(/value is invalid/);
  });

  it('[P0] should return the {value, unit} pair on accept', () => {
    expect(validateDuration(8, 'hours', 'd')).toEqual({ value: 8, unit: 'hours' });
  });

  it('[P1] should warn (but accept) when value exceeds the typical max for the unit', () => {
    // Years has a max of 10. 50 years should warn but not throw.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(validateDuration(50, 'years', 'd')).toEqual({ value: 50, unit: 'years' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
