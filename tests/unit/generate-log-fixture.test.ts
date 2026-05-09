/**
 * Coverage check for the per-step Generate-page log fixture.
 *
 * The Generate page (apps/ops-console/console/pages-2.jsx) tags every entry in
 * its DEMO_STREAM with a `stepId`. The log feed below the sequence rail reads
 * apps/ops-console/fixtures/generate-logs.json and reveals entries up through
 * the active stepId as replayDemoSequence advances. If a stepId in
 * DEMO_STREAM has zero fixture entries, the feed silently goes empty for that
 * step — so this test asserts every stepId has at least one fixture entry.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturePath = resolve(root, 'apps/ops-console/fixtures/generate-logs.json');
const pagesPath = resolve(root, 'apps/ops-console/console/pages-2.jsx');

type LogEntry = { stepId: string; ts_ms: number; level: string; source?: string; message: string };
type Fixture = { version?: number; entries: LogEntry[] };

function extractDemoStreamStepIds(): string[] {
  const src = readFileSync(pagesPath, 'utf8');
  const start = src.indexOf('const DEMO_STREAM = [');
  if (start < 0) throw new Error('DEMO_STREAM literal not found in pages-2.jsx');
  const end = src.indexOf('];', start);
  if (end < 0) throw new Error('DEMO_STREAM literal end not found');
  const block = src.slice(start, end);
  const ids: string[] = [];
  const re = /stepId:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) ids.push(m[1]);
  return ids;
}

describe('generate-logs fixture', () => {
  it('parses with expected envelope shape', () => {
    const fixture: Fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    expect(Array.isArray(fixture.entries)).toBe(true);
    expect(fixture.entries.length).toBeGreaterThan(0);
    for (const entry of fixture.entries) {
      expect(typeof entry.stepId).toBe('string');
      expect(entry.stepId.length).toBeGreaterThan(0);
      expect(typeof entry.ts_ms).toBe('number');
      expect(['info', 'warn', 'error']).toContain(entry.level);
      expect(typeof entry.message).toBe('string');
      expect(entry.message.length).toBeGreaterThan(0);
    }
  });

  it('covers every stepId emitted by DEMO_STREAM at least once', () => {
    const fixture: Fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const stepIds = extractDemoStreamStepIds();
    expect(stepIds.length).toBe(11);
    const counts = new Map<string, number>();
    for (const e of fixture.entries) counts.set(e.stepId, (counts.get(e.stepId) || 0) + 1);
    for (const id of stepIds) {
      expect(counts.get(id) ?? 0, `stepId "${id}" missing from generate-logs fixture`).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not contain stepIds outside the DEMO_STREAM contract', () => {
    const fixture: Fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const stepIds = new Set(extractDemoStreamStepIds());
    const orphans = [...new Set(fixture.entries.map(e => e.stepId))].filter(id => !stepIds.has(id));
    expect(orphans, `unexpected stepId(s) in fixture: ${orphans.join(', ')}`).toEqual([]);
  });

  it('keeps entries within a stepId monotonically ordered by ts_ms', () => {
    const fixture: Fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const byStep = new Map<string, number[]>();
    for (const e of fixture.entries) {
      const arr = byStep.get(e.stepId) || [];
      arr.push(e.ts_ms);
      byStep.set(e.stepId, arr);
    }
    for (const [stepId, timestamps] of byStep) {
      const sorted = [...timestamps].sort((a, b) => a - b);
      expect(timestamps, `ts_ms within stepId "${stepId}" should be ascending`).toEqual(sorted);
    }
  });
});
