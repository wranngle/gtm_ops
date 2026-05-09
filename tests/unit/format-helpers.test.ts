/**
 * Unit tests for lib/format-helpers.ts — render-time formatters used
 * across the proposal UI and PDF output. Untested before this file:
 * a regression that silently produces "$0" for valid amounts, drops
 * the "/mo" suffix, or rounds payback months wrong would hit
 * customer-facing surfaces with no test catching it.
 */
import { describe, expect, it } from 'vitest';
import {
  currency,
  percent,
  duration,
  payback,
  roi,
  date,
  hoursEstimate,
  fmt,
} from '../../lib/format-helpers.js';

describe('[P0] currency - monetary formatter', () => {
  it('[P0] should format MonetaryValue with monthly period as "$X/mo"', () => {
    expect(currency({ amount: 74_375, currency: 'USD', period: 'monthly' })).toBe('$74,375/mo');
  });

  it('[P0] should format annual period as "$X/yr"', () => {
    expect(currency({ amount: 892_500, currency: 'USD', period: 'annual' })).toBe('$892,500/yr');
  });

  it('[P0] should format once with no period suffix', () => {
    expect(currency({ amount: 11_375, currency: 'USD', period: 'once' })).toBe('$11,375');
  });

  it('[P0] should format raw numbers (back-compat path)', () => {
    expect(currency(11_375)).toBe('$11,375');
  });

  it('[P0] should fall back to "$0" for null/undefined/missing amount', () => {
    expect(currency(null as any)).toBe('$0');
    expect(currency(undefined as any)).toBe('$0');
    expect(currency({} as any)).toBe('$0');
    expect(currency({ amount: 'oops' } as any)).toBe('$0');
  });

  it('[P1] should support compact notation (1.2K, 45M)', () => {
    expect(currency({ amount: 1234, currency: 'USD', period: 'once' }, { compact: true })).toBe('$1K');
    expect(currency({ amount: 1_500_000, currency: 'USD', period: 'monthly' }, { compact: true })).toBe('$1.5M/mo');
  });

  it('[P1] should support showPeriod=false to drop the suffix', () => {
    expect(currency({ amount: 100, currency: 'USD', period: 'monthly' }, { showPeriod: false })).toBe('$100');
  });

  it('[P1] should support per_item period', () => {
    expect(currency({ amount: 5, currency: 'USD', period: 'per_item' })).toBe('$5/item');
  });
});

describe('[P0] percent - decimal-to-percentage formatter', () => {
  it('[P0] should format 0.15 as "15%" by default', () => {
    expect(percent(0.15)).toBe('15%');
  });

  it('[P0] should support fractional decimals', () => {
    expect(percent(0.456, { decimals: 1 })).toBe('45.6%');
  });

  it('[P0] should support showSign=true for positives', () => {
    expect(percent(0.15, { showSign: true })).toBe('+15%');
    // Zero never gets a + sign.
    expect(percent(0, { showSign: true })).toBe('0%');
  });

  it('[P1] should fall back to "0%" for NaN / non-number', () => {
    expect(percent(Number.NaN)).toBe('0%');
    expect(percent('15' as any)).toBe('0%');
  });
});

describe('[P0] duration - human-readable duration', () => {
  it('[P0] should render plural by default and singular for value=1', () => {
    expect(duration({ value: 48, unit: 'hours' })).toBe('48 hours');
    expect(duration({ value: 1, unit: 'hours' })).toBe('1 hour');
    expect(duration({ value: 1, unit: 'days' })).toBe('1 day');
    expect(duration({ value: 2, unit: 'weeks' })).toBe('2 weeks');
  });

  it('[P0] should treat raw numbers as hours by default', () => {
    expect(duration(48)).toBe('48 hours');
  });

  it('[P1] should fall back to "0 hours" for null/undefined/non-number', () => {
    expect(duration(null as any)).toBe('0 hours');
    expect(duration({} as any)).toBe('0 hours');
  });
});

describe('[P0] payback - months → human-readable', () => {
  it('[P0] should map sub-month payback to weeks (with singular form)', () => {
    expect(payback(0.25)).toBe('1 week');
    expect(payback(0.5)).toBe('2 weeks');
  });

  it('[P0] should keep 1-2 months on the weeks scale', () => {
    expect(payback(1.5)).toBe('6 weeks');
  });

  it('[P0] should map 2-11 months to integer-month form', () => {
    expect(payback(3)).toBe('3 months');
    expect(payback(11.4)).toBe('11 months');
  });

  it('[P0] should map 12+ months to years (with singular form)', () => {
    expect(payback(12)).toBe('1 year');
    expect(payback(14)).toBe('1.2 years');
    expect(payback(36)).toBe('3.0 years');
  });

  it('[P1] should return "N/A" for non-positive / non-number', () => {
    expect(payback(0)).toBe('N/A');
    expect(payback(-1)).toBe('N/A');
    expect(payback(Number.NaN)).toBe('N/A');
  });
});

describe('[P0] roi - tier + color classification', () => {
  it('[P0] should classify 300%+ as excellent + green', () => {
    expect(roi(450)).toEqual({ display: '450%', tier: 'excellent', color: 'green' });
    expect(roi(300)).toMatchObject({ tier: 'excellent', color: 'green' });
  });

  it('[P0] should classify 100..299% as good + green', () => {
    expect(roi(150)).toMatchObject({ tier: 'good', color: 'green' });
    expect(roi(100)).toMatchObject({ tier: 'good', color: 'green' });
  });

  it('[P0] should classify 50..99% as moderate + yellow', () => {
    expect(roi(75)).toMatchObject({ tier: 'moderate', color: 'yellow' });
  });

  it('[P0] should classify <50% as low + red', () => {
    expect(roi(20)).toMatchObject({ tier: 'low', color: 'red' });
  });

  it('[P1] should fall back to N/A on non-number / NaN', () => {
    expect(roi(Number.NaN)).toEqual({ display: 'N/A', tier: 'unknown', color: 'gray' });
  });
});

describe('[P1] date - locale formatting', () => {
  // Use noon UTC so the date doesn't shift across timezones during
  // local-formatting (toLocaleDateString respects TZ).
  it('[P0] should format ISO date as "long" by default', () => {
    expect(date('2025-12-29T12:00:00Z')).toBe('December 29, 2025');
  });

  it('[P0] should support short format', () => {
    expect(date('2025-12-29T12:00:00Z', { format: 'short' })).toBe('Dec 29, 2025');
  });

  it('[P0] should support iso format', () => {
    expect(date('2025-12-29T15:30:00Z', { format: 'iso' })).toBe('2025-12-29');
  });

  it('[P1] should return empty string for falsy / invalid', () => {
    expect(date('')).toBe('');
    expect(date(null as any)).toBe('');
    expect(date('not a date')).toBe('');
  });
});

describe('[P1] hoursEstimate - hours → "X hours (~N weeks)"', () => {
  it('[P0] should format 80 hours as "80 hours (~2 weeks)"', () => {
    expect(hoursEstimate(80)).toBe('80 hours (~2 weeks)');
  });

  it('[P0] should pluralize correctly at the 1-week boundary', () => {
    expect(hoursEstimate(40)).toBe('40 hours (~1 week)');
    expect(hoursEstimate(20)).toBe('20 hours (~1 week)');
  });

  it('[P1] should fall back to "0 hours" for non-positive', () => {
    expect(hoursEstimate(0)).toBe('0 hours');
    expect(hoursEstimate(-5)).toBe('0 hours');
  });
});

describe('[P1] fmt - default export bundle', () => {
  it('[P1] should expose every formatter as a named property', () => {
    expect(fmt.currency).toBe(currency);
    expect(fmt.percent).toBe(percent);
    expect(fmt.duration).toBe(duration);
    expect(fmt.payback).toBe(payback);
    expect(fmt.roi).toBe(roi);
    expect(fmt.date).toBe(date);
    expect(fmt.hoursEstimate).toBe(hoursEstimate);
  });
});
