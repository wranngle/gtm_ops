/**
 * apps/ops-console/console/data.js shape + range guard. The file
 * defines the synthetic GTM dataset (companies, calls, eval suites,
 * proposals, sparks) that drives Mission Control / Pipeline / Calls
 * in DEMO_MODE. A bad value here ships silently to every preview
 * deploy — the React UI just renders NaN%, $undefinedK, etc.
 *
 * This test loads data.js in a sandbox and asserts:
 *   - numeric ranges (scores, probabilities, ratios)
 *   - cross-reference integrity (call.co_id → company.id)
 *   - currency / format invariants
 *   - PII discipline (no real-domain emails, no phone-shaped values)
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataPath = resolve(root, 'apps', 'ops-console', 'console', 'data.js');

type GtmDataset = {
  companies: Array<{
    id: string; name: string; score: number; icp: number;
    closeProb: number; dealSize: string; intent: string;
  }>;
  calls: Array<{
    id: string; co_id: string; score: number; sentiment: number;
    talkRatio: number; flags: number; deflections: number;
  }>;
  evalSuites: Array<{ id: string; pass: number; runs: number }>;
  proposals: Array<{ id: string; co: string; amount: string; sections: number; accepted: number }>;
  sparks: Record<string, number[]>;
  agents: Array<{ id: string; success: number }>;
};

let GTM: GtmDataset;
beforeAll(() => {
  const src = readFileSync(dataPath, 'utf8');
  const ctx: { window: { GTM?: GtmDataset } } = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  if (!ctx.window.GTM) throw new Error('data.js did not assign window.GTM');
  GTM = ctx.window.GTM;
});

describe('console/data.js shape + range guard', () => {
  it('declares non-empty top-level collections', () => {
    expect(GTM.companies.length).toBeGreaterThan(5);
    expect(GTM.calls.length).toBeGreaterThan(2);
    expect(GTM.evalSuites.length).toBeGreaterThan(2);
    expect(GTM.proposals.length).toBeGreaterThan(0);
    expect(Object.keys(GTM.sparks).length).toBeGreaterThan(2);
  });

  it('every company has score ∈ [0,100], icp + closeProb ∈ [0,1], well-formed dealSize', () => {
    for (const c of GTM.companies) {
      expect(c.score, `${c.id} score`).toBeGreaterThanOrEqual(0);
      expect(c.score, `${c.id} score`).toBeLessThanOrEqual(100);
      expect(c.icp, `${c.id} icp`).toBeGreaterThanOrEqual(0);
      expect(c.icp, `${c.id} icp`).toBeLessThanOrEqual(1);
      expect(c.closeProb, `${c.id} closeProb`).toBeGreaterThanOrEqual(0);
      expect(c.closeProb, `${c.id} closeProb`).toBeLessThanOrEqual(1);
      expect(c.dealSize, `${c.id} dealSize`).toMatch(/^\$[\d.]+[KM]?$/);
      expect(['high', 'med', 'low']).toContain(c.intent);
    }
  });

  it('every call has score ∈ [0,10], sentiment ∈ [-1,1], talkRatio ∈ [0,1]', () => {
    for (const c of GTM.calls) {
      expect(c.score, `${c.id} score`).toBeGreaterThanOrEqual(0);
      expect(c.score, `${c.id} score`).toBeLessThanOrEqual(10);
      expect(c.sentiment, `${c.id} sentiment`).toBeGreaterThanOrEqual(-1);
      expect(c.sentiment, `${c.id} sentiment`).toBeLessThanOrEqual(1);
      expect(c.talkRatio, `${c.id} talkRatio`).toBeGreaterThanOrEqual(0);
      expect(c.talkRatio, `${c.id} talkRatio`).toBeLessThanOrEqual(1);
    }
  });

  it('every call.co_id references an existing company.id', () => {
    const ids = new Set(GTM.companies.map((c) => c.id));
    for (const call of GTM.calls) {
      expect(ids.has(call.co_id), `call ${call.id} → company ${call.co_id} (orphan)`).toBe(true);
    }
  });

  it('every eval suite has pass ∈ [0,1] and a positive run count', () => {
    for (const s of GTM.evalSuites) {
      expect(s.pass, `${s.id} pass`).toBeGreaterThanOrEqual(0);
      expect(s.pass, `${s.id} pass`).toBeLessThanOrEqual(1);
      expect(s.runs, `${s.id} runs`).toBeGreaterThan(0);
    }
  });

  it('every proposal has accepted ≤ sections', () => {
    for (const p of GTM.proposals) {
      expect(p.accepted, `${p.id} accepted`).toBeLessThanOrEqual(p.sections);
      expect(p.amount, `${p.id} amount`).toMatch(/^\$[\d.]+[KM]?$/);
    }
  });

  it('every sparkline is an array of numbers', () => {
    for (const [k, arr] of Object.entries(GTM.sparks)) {
      expect(Array.isArray(arr), `sparks.${k}`).toBe(true);
      expect(arr.length, `sparks.${k} length`).toBeGreaterThan(0);
      for (const v of arr) expect(typeof v, `sparks.${k} value`).toBe('number');
    }
  });

  it('contains no real-domain emails or US-shaped phone numbers', () => {
    const src = readFileSync(dataPath, 'utf8');
    expect(src).not.toMatch(/@(?:gmail|yahoo|outlook|hotmail|protonmail|icloud)\.com/i);
    expect(src).not.toMatch(/\b[2-9]\d{2}[-. ][2-9]\d{2}[-. ]\d{4}\b/);
  });
});
