/**
 * Unit tests for lib/provenance.ts — the audit trail for fallback
 * values, hardcoded defaults, clamps, and extracted data through the
 * pipeline. Untested before this file: a regression that drops the
 * confidence classification (e.g. always returns HIGH) would silently
 * mark every default as trustworthy and break the operator's "what
 * data is real vs. inferred" debugging loop.
 */
import { describe, expect, it, beforeEach } from 'vitest';

let ProvenanceType: any;
let Confidence: any;
let createProvenance: any;
let trackFallbackChain: any;
let trackDefault: any;
let trackClamped: any;
let trackExtracted: any;
let ProvenanceCollector: any;
let getCollector: any;
let resetCollector: any;

beforeEach(async () => {
  const mod: any = await import('../../lib/provenance.js');
  ({
    ProvenanceType,
    Confidence,
    createProvenance,
    trackFallbackChain,
    trackDefault,
    trackClamped,
    trackExtracted,
    ProvenanceCollector,
    getCollector,
    resetCollector,
  } = mod);
});

describe('[P0] ProvenanceType / Confidence enums', () => {
  it('[P0] should expose every known provenance type', () => {
    expect(ProvenanceType).toMatchObject({
      FALLBACK: 'fallback',
      DEFAULT: 'default',
      CLAMPED: 'clamped',
      INFERRED: 'inferred',
      NORMALIZED: 'normalized',
      EXTRACTED: 'extracted',
    });
  });

  it('[P0] should expose every confidence level', () => {
    expect(Confidence).toMatchObject({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' });
  });
});

describe('[P0] createProvenance', () => {
  it('[P0] should build a record with field/value/source/type/confidence + ISO timestamp', () => {
    const record = createProvenance('hourly_rate', 75, 'intake_form', ProvenanceType.EXTRACTED, Confidence.HIGH);
    expect(record).toMatchObject({
      field: 'hourly_rate',
      value: 75,
      source: 'intake_form',
      type: ProvenanceType.EXTRACTED,
      confidence: Confidence.HIGH,
    });
    expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('[P1] should spread context fields onto the record', () => {
    const record = createProvenance(
      'volume',
      100,
      'intake',
      ProvenanceType.EXTRACTED,
      Confidence.HIGH,
      { note: 'midpoint of 50-150 range' },
    );
    expect(record).toHaveProperty('note', 'midpoint of 50-150 range');
  });
});

describe('[P0] trackFallbackChain - confidence based on success path', () => {
  it('[P0] should classify HIGH when first attempt succeeds', () => {
    const record = trackFallbackChain('hourly_rate', [
      { source: 'intake_form', value: 75, success: true },
    ]);
    expect(record.confidence).toBe(Confidence.HIGH);
    expect(record.value).toBe(75);
    expect(record.source).toBe('intake_form');
    expect(record.priority_used).toBe(1);
    expect(record.failed_sources).toEqual([]);
  });

  it('[P0] should classify MEDIUM when later attempt succeeds (some failed)', () => {
    const record = trackFallbackChain('hourly_rate', [
      { source: 'intake_form', value: undefined, success: false },
      { source: 'industry_default', value: 75, success: true },
    ]);
    expect(record.confidence).toBe(Confidence.MEDIUM);
    expect(record.value).toBe(75);
    expect(record.priority_used).toBe(2);
    expect(record.failed_sources).toEqual(['intake_form']);
    expect(record.attempted_sources).toEqual(['intake_form', 'industry_default']);
  });

  it('[P0] should classify LOW when nothing succeeds', () => {
    const record = trackFallbackChain('hourly_rate', [
      { source: 'intake_form', value: undefined, success: false },
      { source: 'industry_default', value: undefined, success: false },
    ]);
    expect(record.confidence).toBe(Confidence.LOW);
    expect(record.source).toBe('unknown');
    expect(record.value).toBeUndefined();
    expect(record.priority_used).toBe(0);
  });
});

describe('[P0] trackDefault / trackClamped / trackExtracted', () => {
  it('[P0] trackDefault should mark LOW confidence with reason', () => {
    const record = trackDefault('hourly_rate', 75, 'intake omitted');
    expect(record.type).toBe(ProvenanceType.DEFAULT);
    expect(record.confidence).toBe(Confidence.LOW);
    expect(record.reason).toBe('intake omitted');
    expect(record.source).toBe('hardcoded_default');
  });

  it('[P0] trackClamped should record direction below_min when clamped up', () => {
    const record = trackClamped('hourly_rate', 5, 10, 10, 500);
    expect(record.type).toBe(ProvenanceType.CLAMPED);
    expect(record.confidence).toBe(Confidence.MEDIUM);
    expect(record.direction).toBe('below_min');
    expect(record.original_value).toBe(5);
    expect(record.clamped_to).toBe(10);
    expect(record.range).toEqual({ min: 10, max: 500 });
  });

  it('[P0] trackClamped should record direction above_max when clamped down', () => {
    const record = trackClamped('hourly_rate', 999, 500, 10, 500);
    expect(record.direction).toBe('above_max');
  });

  it('[P0] trackExtracted should mark HIGH confidence', () => {
    const record = trackExtracted('hourly_rate', 75, 'intake_form');
    expect(record.type).toBe(ProvenanceType.EXTRACTED);
    expect(record.confidence).toBe(Confidence.HIGH);
    expect(record.source).toBe('intake_form');
  });
});

describe('[P0] ProvenanceCollector - accumulator', () => {
  it('[P0] should record + retrieve by field', () => {
    const c = new ProvenanceCollector();
    c.extracted('hourly_rate', 75, 'intake_form');
    expect((c.getField('hourly_rate'))?.value).toBe(75);
    expect(c.export()).toHaveLength(1);
  });

  it('[P0] should keep the latest record per field on overwrite', () => {
    const c = new ProvenanceCollector();
    c.extracted('hourly_rate', 75, 'intake_form');
    c.default('hourly_rate', 65, 'intake re-evaluated');
    expect((c.getField('hourly_rate'))?.value).toBe(65);
    expect((c.getField('hourly_rate'))?.type).toBe(ProvenanceType.DEFAULT);
  });

  it('[P0] should surface low-confidence fields for operator review', () => {
    const c = new ProvenanceCollector();
    c.extracted('hourly_rate', 75, 'intake_form');     // high
    c.default('volume', 100, 'intake omitted');         // low
    c.default('error_rate', 0.05, 'industry default');  // low

    const low = c.getLowConfidenceFields();
    expect(low.map((r: any) => r.field).sort()).toEqual(['error_rate', 'volume']);
  });

  it('[P1] should produce a summary with counts by type / confidence', () => {
    const c = new ProvenanceCollector();
    c.extracted('a', 1, 'src');
    c.extracted('b', 2, 'src');
    c.default('c', 3, 'r');

    const s = c.getSummary();
    expect(s.total_records).toBe(3);
    expect(s.by_type).toMatchObject({ extracted: 2, default: 1 });
    expect(s.by_confidence).toMatchObject({ high: 2, low: 1 });
    expect(s.low_confidence_fields).toEqual(['c']);
  });

  it('[P1] should clear records', () => {
    const c = new ProvenanceCollector();
    c.extracted('a', 1, 'src');
    c.clear();
    expect(c.export()).toHaveLength(0);
    expect(c.getField('a')).toBeUndefined();
  });
});

describe('[P1] global collector singleton', () => {
  it('[P1] should expose a singleton instance via getCollector', () => {
    const a = getCollector();
    const b = getCollector();
    expect(a).toBe(b);
  });

  it('[P1] resetCollector should swap the singleton (no record carryover)', () => {
    const before = getCollector();
    before.extracted('field', 1, 'src');
    expect(before.export()).toHaveLength(1);

    const after = resetCollector();
    expect(after).not.toBe(before);
    expect(after.export()).toHaveLength(0);
    expect(getCollector()).toBe(after);
  });
});
