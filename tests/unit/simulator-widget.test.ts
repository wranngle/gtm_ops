/**
 * Live Call Simulator widget contract. The widget lives in
 * apps/ops-console/console/simulator-page.tsx and reads its trace
 * from apps/ops-console/fixtures/canned-call.jsonl. Round-1 PR #170
 * shipped a sibling auto-play for the Generate page; this widget
 * reuses that fixture shape (turns with {ts, role, text} + pipeline
 * stages + final marker).
 *
 * vitest runs in `environment: 'node'` and the ops-console TSX is
 * served as Babel-standalone in the browser, so this test follows
 * the same convention as coach-launcher-position.test.ts and
 * console-data.test.ts: assert against source text + fixture data,
 * not a live DOM render.
 *
 * Behavior under test:
 *   1. Fixture exists, parses as JSONL, has ≥3 transcript turns,
 *      ≥1 pipeline stage, and a final `proposal: generated` marker.
 *   2. CallSimulator component is wired to that fixture URL.
 *   3. Final-state UI exposes a `proposal: generated` indicator.
 *   4. Simulator route is registered in app.tsx and sidebar.
 *   5. Widget mounts via index.html script tag.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturePath = resolve(root, 'apps/ops-console/fixtures/canned-call.jsonl');
const widgetPath = resolve(root, 'apps/ops-console/console/simulator-page.tsx');
const appPath = resolve(root, 'apps/ops-console/console/app.tsx');
const shellPath = resolve(root, 'apps/ops-console/console/shell.tsx');
const indexPath = resolve(root, 'apps/ops-console/console/index.html');

describe('live call simulator: fixture', () => {
  const raw = readFileSync(fixturePath, 'utf8');
  const rows = raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l) as Record<string, unknown>);

  it('parses as JSONL with at least one meta + final row', () => {
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.find(r => r.kind === 'meta')).toBeTruthy();
    expect(rows.find(r => r.kind === 'final')).toBeTruthy();
  });

  it('has at least 3 transcript turns with required fields', () => {
    const turns = rows.filter(r => r.kind === 'turn');
    expect(turns.length).toBeGreaterThanOrEqual(3);
    for (const turn of turns) {
      expect(typeof turn.ts).toBe('number');
      expect(['agent', 'caller']).toContain(turn.role);
      expect(typeof turn.text).toBe('string');
      expect((turn.text as string).length).toBeGreaterThan(0);
    }
  });

  it('has at least one pipeline stage and an ascending step sequence', () => {
    const stages = rows.filter(r => r.kind === 'pipeline');
    expect(stages.length).toBeGreaterThanOrEqual(1);
    const steps = stages.map(s => s.step as number);
    const sorted = [...steps].sort((a, b) => a - b);
    expect(steps).toEqual(sorted);
  });

  it('final row marks proposal: generated', () => {
    const final = rows.find(r => r.kind === 'final')!;
    expect(final.proposal).toBe('generated');
    expect(typeof final.proposal_id).toBe('string');
  });
});

describe('live call simulator: widget source', () => {
  const src = readFileSync(widgetPath, 'utf8');

  it('declares the CallSimulator component', () => {
    expect(src).toMatch(/function CallSimulator\s*\(/);
  });

  it('declares the SimulatorPage page component', () => {
    expect(src).toMatch(/function SimulatorPage\s*\(/);
  });

  it('reads from the canned-call fixture URL', () => {
    expect(src).toMatch(/fixtures\/canned-call\.jsonl/);
  });

  it('renders transcript bubbles per turn', () => {
    expect(src).toMatch(/data-testid="sim-bubble"/);
    expect(src).toMatch(/visibleTurns\.map/);
  });

  it('renders pipeline stages', () => {
    expect(src).toMatch(/data-testid="sim-stage"/);
  });

  it('exposes the proposal: generated indicator in the final state', () => {
    expect(src).toMatch(/data-testid="sim-proposal-generated"/);
    expect(src).toMatch(/proposal: generated/);
  });

  it('exports SimulatorPage and CallSimulator on window for app.tsx', () => {
    expect(src).toMatch(/window\.SimulatorPage\s*=\s*SimulatorPage/);
    expect(src).toMatch(/window\.CallSimulator\s*=\s*CallSimulator/);
  });
});

describe('live call simulator: route + sidebar wiring', () => {
  const appSrc = readFileSync(appPath, 'utf8');
  const shellSrc = readFileSync(shellPath, 'utf8');
  const indexSrc = readFileSync(indexPath, 'utf8');

  it('simulator is in the ROUTES allow-list', () => {
    const match = appSrc.match(/const ROUTES\s*=\s*\[([^\]]+)\]/);
    expect(match, 'ROUTES constant should be in app.tsx').toBeTruthy();
    expect(match![1]).toMatch(/'simulator'/);
  });

  it('app.tsx mounts SimulatorPage on the simulator route', () => {
    expect(appSrc).toMatch(/route === 'simulator'\s*&&\s*<SimulatorPage/);
  });

  it('sidebar includes a simulator nav item', () => {
    expect(shellSrc).toMatch(/id\s*:\s*'simulator'/);
  });

  it('index.html loads simulator-page.tsx before app.tsx', () => {
    const widgetIdx = indexSrc.indexOf('simulator-page.tsx');
    const appIdx = indexSrc.indexOf('app.tsx"');
    expect(widgetIdx).toBeGreaterThan(0);
    expect(appIdx).toBeGreaterThan(widgetIdx);
  });
});
