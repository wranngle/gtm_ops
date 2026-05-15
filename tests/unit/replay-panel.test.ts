/**
 * Failure-mode Auto-Replay panel contract.
 *
 * The panel lives in apps/ops-console/console/replay-panel.tsx and
 * reads its trace from apps/ops-console/fixtures/failed-call.jsonl.
 * Round-1 PR #170 shipped the canonical canned-trace fixture shape
 * (?demo=1 auto-play): {kind: meta|turn|pipeline|final}. This panel
 * extends that shape with `counterfactual` + `counterfactual-final`
 * rows so the failed run can be replayed side-by-side against the
 * fallback-policy reconstruction.
 *
 * vitest runs in `environment: 'node'` and the ops-console TSX is
 * served as Babel-standalone in the browser, so this test follows
 * the same convention as simulator-widget.test.ts and
 * console-data.test.ts: assert against source text + fixture data,
 * not a live DOM render. The pure counterfactual.ts module is
 * also exercised directly.
 *
 * Behavior under test:
 *   1. Fixture exists, parses as JSONL, has ≥3 transcript turns,
 *      ≥1 failed pipeline stage, ≥1 counterfactual stage covering
 *      the failed step, and both `final` + `counterfactual-final`
 *      markers.
 *   2. counterfactual.ts aligns the two pipelines by step, marks
 *      the failure boundary, and computes positive savings.
 *   3. ReplayPanel component is wired to that fixture URL and
 *      renders the `counterfactual` label indicator.
 *   4. Replay route is registered in app.tsx + sidebar + index.html.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  alignStages,
  counterfactualSavingsMs,
  firstFailureBoundary,
  parseReplayFixture,
} from '../../apps/ops-console/console/counterfactual.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturePath = resolve(root, 'apps/ops-console/fixtures/failed-call.jsonl');
const panelPath = resolve(root, 'apps/ops-console/console/replay-panel.tsx');
const counterfactualPath = resolve(root, 'apps/ops-console/console/counterfactual.ts');
const appPath = resolve(root, 'apps/ops-console/console/app.tsx');
const shellPath = resolve(root, 'apps/ops-console/console/shell.tsx');
const indexPath = resolve(root, 'apps/ops-console/console/index.html');

describe('failure-mode auto-replay: fixture', () => {
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = parseReplayFixture(raw);

  it('parses as JSONL with meta + final + counterfactual-final', () => {
    expect(parsed.meta.scenario).toMatch(/.+/);
    expect(parsed.final).toBeTruthy();
    expect(parsed.counterfactualFinal).toBeTruthy();
  });

  it('declares the failure stage in meta', () => {
    expect(parsed.meta.failure_stage).toMatch(/.+/);
    expect(parsed.meta.failure_kind).toMatch(/.+/);
  });

  it('has at least 3 transcript turns with required fields', () => {
    expect(parsed.turns.length).toBeGreaterThanOrEqual(3);
    for (const turn of parsed.turns) {
      expect(typeof turn.ts).toBe('number');
      expect(['agent', 'caller']).toContain(turn.role);
      expect(turn.text.length).toBeGreaterThan(0);
    }
  });

  it('actual pipeline has at least one failed stage', () => {
    expect(parsed.actual.length).toBeGreaterThanOrEqual(1);
    const failed = parsed.actual.filter(s => s.status === 'failed');
    expect(failed.length).toBeGreaterThanOrEqual(1);
  });

  it('counterfactual pipeline covers the failed step', () => {
    const failed = parsed.actual.find(s => s.status === 'failed')!;
    const cf = parsed.counterfactual.find(s => s.step === failed.step);
    expect(cf, 'counterfactual should provide a row for the failed step').toBeTruthy();
    expect(cf!.status).toBe('ok');
  });

  it('final marks actual run as failed; counterfactual-final marks generated', () => {
    expect(parsed.final!.proposal).toBe('failed');
    expect(parsed.counterfactualFinal!.proposal).toBe('generated');
    expect(typeof parsed.counterfactualFinal!.proposal_id).toBe('string');
  });
});

describe('failure-mode auto-replay: counterfactual alignment', () => {
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = parseReplayFixture(raw);
  const pairs = alignStages(parsed.actual, parsed.counterfactual);

  it('aligns pairs by ascending step', () => {
    const steps = pairs.map(p => p.step);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it('marks divergent pairs at the failure boundary and beyond', () => {
    const boundary = firstFailureBoundary(pairs);
    expect(boundary).toBeTruthy();
    expect(boundary!.divergent).toBe(true);
    expect(boundary!.actual!.status).toBe('failed');
  });

  it('reports a positive savings ms (counterfactual completes faster)', () => {
    const savings = counterfactualSavingsMs(parsed);
    expect(savings).not.toBeNull();
    expect(savings!).toBeGreaterThan(0);
  });
});

describe('failure-mode auto-replay: panel source', () => {
  const src = readFileSync(panelPath, 'utf8');

  it('declares the ReplayPanel component', () => {
    expect(src).toMatch(/function ReplayPanel\s*\(/);
  });

  it('declares the ReplayPage page component', () => {
    expect(src).toMatch(/function ReplayPage\s*\(/);
  });

  it('reads from the failed-call fixture URL', () => {
    expect(src).toMatch(/fixtures\/failed-call\.jsonl/);
  });

  it('renders transcript bubbles per turn', () => {
    expect(src).toMatch(/data-testid="replay-bubble"/);
    expect(src).toMatch(/visibleTurns\.map/);
  });

  it('renders side-by-side actual vs counterfactual stage columns', () => {
    expect(src).toMatch(/data-testid="replay-stage-actual"/);
    expect(src).toMatch(/data-testid="replay-stage-counterfactual"/);
    expect(src).toMatch(/replay__columns/);
  });

  it('exposes the counterfactual label indicator', () => {
    expect(src).toMatch(/data-testid="counterfactual-label"/);
    expect(src).toMatch(/counterfactual/);
  });

  it('exports ReplayPage and ReplayPanel on window for app.tsx', () => {
    expect(src).toMatch(/window\.ReplayPage\s*=\s*ReplayPage/);
    expect(src).toMatch(/window\.ReplayPanel\s*=\s*ReplayPanel/);
  });
});

describe('failure-mode auto-replay: route + sidebar wiring', () => {
  const appSrc = readFileSync(appPath, 'utf8');
  const shellSrc = readFileSync(shellPath, 'utf8');
  const indexSrc = readFileSync(indexPath, 'utf8');
  const counterfactualSrc = readFileSync(counterfactualPath, 'utf8');

  it('replay is in the ROUTES allow-list', () => {
    const match = appSrc.match(/const ROUTES\s*=\s*\[([^\]]+)\]/);
    expect(match, 'ROUTES constant should be in app.tsx').toBeTruthy();
    expect(match![1]).toMatch(/'replay'/);
  });

  it('app.tsx mounts ReplayPage on the replay route', () => {
    expect(appSrc).toMatch(/route === 'replay'\s*&&\s*<ReplayPage/);
  });

  it('sidebar includes a replay nav item', () => {
    expect(shellSrc).toMatch(/id\s*:\s*'replay'/);
  });

  it('index.html loads replay-panel.tsx before app.tsx', () => {
    const widgetIdx = indexSrc.indexOf('replay-panel.tsx');
    const appIdx = indexSrc.indexOf('app.tsx"');
    expect(widgetIdx).toBeGreaterThan(0);
    expect(appIdx).toBeGreaterThan(widgetIdx);
  });

  it('counterfactual.ts module exists alongside the panel', () => {
    expect(counterfactualSrc).toMatch(/export function parseReplayFixture/);
    expect(counterfactualSrc).toMatch(/export function alignStages/);
  });
});
