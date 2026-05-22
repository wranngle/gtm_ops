/**
 * Unit tests for the booking-to-revenue funnel chart.
 *
 * The ops-console is a static-HTML React app served via Babel
 * standalone — vitest runs in node, so we can't render the TSX.
 * Instead we (a) text-scan the source to assert the page contract
 * (component names, data-testids, route+sidebar wiring, fixture
 * binding) and (b) extract the pure helpers (`computeFunnelRows`,
 * `computeFunnelOverall`) via a sandboxed Function() eval so the
 * funnel math is exercised without booting React.
 *
 * The eval-the-helpers technique mirrors the established
 * `console-data.test.ts` / `coach-launcher-position.test.ts`
 * pattern: read the source as text, derive what we need.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const widgetPath = resolve(root, 'apps', 'ops-console', 'console', 'funnel-page.tsx');
const fixturePath = resolve(root, 'apps', 'ops-console', 'fixtures', 'funnel.json');
const appPath = resolve(root, 'apps', 'ops-console', 'console', 'app.tsx');
const shellPath = resolve(root, 'apps', 'ops-console', 'console', 'shell.tsx');
const indexPath = resolve(root, 'apps', 'ops-console', 'console', 'index.html');

const widgetSrc = readFileSync(widgetPath, 'utf8');

/* Extract the pure helpers (`computeFunnelRows`,
   `computeFunnelOverall`, `buildFunnelStageReview`,
   `resolveFunnelStageSelection`) from the TSX source, wrap them in a
   sandboxed scope that stubs React, and return them as live
   functions the test can call. */
function loadPureHelpers() {
  const rowsMatch = widgetSrc.match(/function computeFunnelRows\([\s\S]*?\n\}\n/);
  const overallMatch = widgetSrc.match(/function computeFunnelOverall\([\s\S]*?\n\}\n/);
  const reviewMatch = widgetSrc.match(/function buildFunnelStageReview\([\s\S]*?\n\}\n/);
  const selectionMatch = widgetSrc.match(/function resolveFunnelStageSelection\([\s\S]*?\n\}\n(?=\nfunction FunnelChart)/);
  if (!rowsMatch || !overallMatch || !reviewMatch || !selectionMatch) {
    throw new Error('funnel helper source not found — did the function shape change?');
  }
  const factory = new Function(`
    ${rowsMatch[0]}
    ${overallMatch[0]}
    ${reviewMatch[0]}
    ${selectionMatch[0]}
    return { computeFunnelRows, computeFunnelOverall, buildFunnelStageReview, resolveFunnelStageSelection };
  `);
  return factory();
}

describe('funnel fixture: shape', () => {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

  it('declares the five canonical stages in order', () => {
    expect(Array.isArray(fixture.stages)).toBe(true);
    expect(fixture.stages.map((s: any) => s.id)).toEqual([
      'call', 'qualified', 'booked', 'proposal', 'contract',
    ]);
  });

  it('every stage has count + label', () => {
    for (const s of fixture.stages) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.label).toBe('string');
      expect(s.label.length).toBeGreaterThan(0);
      expect(typeof s.count).toBe('number');
      expect(s.count).toBeGreaterThanOrEqual(0);
    }
  });

  it('counts are monotonically non-increasing top-to-bottom (real funnels never gain volume)', () => {
    for (let i = 1; i < fixture.stages.length; i += 1) {
      expect(fixture.stages[i].count).toBeLessThanOrEqual(fixture.stages[i - 1].count);
    }
  });

  it('windowed range and timestamp present', () => {
    expect(typeof fixture.window).toBe('string');
    expect(fixture.window.length).toBeGreaterThan(0);
    expect(typeof fixture.generated_at).toBe('string');
    expect(fixture.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('computeFunnelRows: math', () => {
  const { computeFunnelRows } = loadPureHelpers();

  it('empty input → empty array', () => {
    expect(computeFunnelRows([])).toEqual([]);
    expect(computeFunnelRows(null)).toEqual([]);
    expect(computeFunnelRows(undefined)).toEqual([]);
  });

  it('first row has pct=1 and drop=0', () => {
    const rows = computeFunnelRows([
      { id: 'a', label: 'A', count: 100 },
      { id: 'b', label: 'B', count: 60 },
    ]);
    expect(rows[0].pct).toBe(1);
    expect(rows[0].drop).toBe(0);
    expect(rows[0].pctText).toBe('100.0%');
    expect(rows[0].dropText).toBe('—');
  });

  it('per-stage pct is count / top-of-funnel', () => {
    const rows = computeFunnelRows([
      { id: 'a', label: 'A', count: 1000 },
      { id: 'b', label: 'B', count: 500 },
      { id: 'c', label: 'C', count: 100 },
    ]);
    expect(rows[1].pct).toBeCloseTo(0.5, 6);
    expect(rows[2].pct).toBeCloseTo(0.1, 6);
    expect(rows[1].pctText).toBe('50.0%');
    expect(rows[2].pctText).toBe('10.0%');
  });

  it('drop is the percent-lost-from-previous-stage, not from top', () => {
    // 1000 → 500 = 50% drop; 500 → 100 = 80% drop (not 90%).
    const rows = computeFunnelRows([
      { id: 'a', label: 'A', count: 1000 },
      { id: 'b', label: 'B', count: 500 },
      { id: 'c', label: 'C', count: 100 },
    ]);
    expect(rows[1].drop).toBeCloseTo(0.5, 6);
    expect(rows[2].drop).toBeCloseTo(0.8, 6);
    expect(rows[1].dropText).toBe('-50.0%');
    expect(rows[2].dropText).toBe('-80.0%');
  });

  it('handles zero top-of-funnel without dividing by zero', () => {
    const rows = computeFunnelRows([
      { id: 'a', label: 'A', count: 0 },
      { id: 'b', label: 'B', count: 0 },
    ]);
    expect(rows[0].pct).toBe(0);
    expect(rows[1].pct).toBe(0);
    expect(rows[1].drop).toBe(0);
  });

  it('coerces non-numeric / missing counts to 0', () => {
    const rows = computeFunnelRows([
      { id: 'a', label: 'A', count: 100 },
      { id: 'b', label: 'B' /* count missing */ },
      { id: 'c', label: 'C', count: 'oops' as any },
    ]);
    expect(rows[1].count).toBe(0);
    expect(rows[2].count).toBe(0);
    expect(rows[1].drop).toBeCloseTo(1, 6);
  });

  it('exposes pct, drop, and id on every row for the DOM contract', () => {
    const rows = computeFunnelRows([
      { id: 'a', label: 'A', count: 10 },
      { id: 'b', label: 'B', count: 5 },
    ]);
    for (const row of rows) {
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('pct');
      expect(row).toHaveProperty('drop');
      expect(row).toHaveProperty('pctText');
      expect(row).toHaveProperty('dropText');
      expect(row).toHaveProperty('count');
    }
  });

  it('matches expected math on the shipped fixture', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const rows = computeFunnelRows(fixture.stages);
    // 480 → 312 = -35% drop. 312 → 168 ≈ -46.2%. 168 → 84 = -50%. 84 → 31 ≈ -63.1%.
    expect(rows[1].dropText).toBe('-35.0%');
    expect(rows[2].dropText).toBe('-46.2%');
    expect(rows[3].dropText).toBe('-50.0%');
    expect(rows[4].dropText).toBe('-63.1%');
  });
});

describe('computeFunnelOverall: math', () => {
  const { computeFunnelOverall } = loadPureHelpers();

  it('empty input → zero ratio', () => {
    expect(computeFunnelOverall([])).toEqual({ ratio: 0, percent: '0.0%', top: 0, bottom: 0 });
  });

  it('single-stage input → zero ratio (no funnel to compute)', () => {
    const out = computeFunnelOverall([{ id: 'a', count: 100 }]);
    expect(out.ratio).toBe(0);
    expect(out.percent).toBe('0.0%');
  });

  it('ratio is bottom / top, not bottom / sum', () => {
    const out = computeFunnelOverall([
      { id: 'a', count: 1000 },
      { id: 'b', count: 500 },
      { id: 'c', count: 100 },
    ]);
    expect(out.ratio).toBeCloseTo(0.1, 6);
    expect(out.percent).toBe('10.0%');
    expect(out.top).toBe(1000);
    expect(out.bottom).toBe(100);
  });

  it('matches shipped fixture: 31 / 480 ≈ 6.5%', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const out = computeFunnelOverall(fixture.stages);
    expect(out.top).toBe(480);
    expect(out.bottom).toBe(31);
    expect(out.ratio).toBeCloseTo(31 / 480, 6);
    expect(out.percent).toBe('6.5%');
  });
});

describe('buildFunnelStageReview: stage drill-in contract', () => {
  const { computeFunnelRows, buildFunnelStageReview, resolveFunnelStageSelection } = loadPureHelpers();
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const rows = computeFunnelRows(fixture.stages);

  it('computes loss from the prior handoff, not from the top of funnel', () => {
    const proposal = rows.find((row: any) => row.id === 'proposal');
    const review = buildFunnelStageReview(proposal, rows);
    expect(review.handoffLabel).toBe('Booked → Proposal sent');
    expect(review.lost).toBe(84);
    expect(review.lossLabel).toMatch(/84 booked did not reach proposal sent/i);
  });

  it('routes each stage review to the console surface with the relevant evidence', () => {
    expect(buildFunnelStageReview(rows.find((row: any) => row.id === 'call'), rows).route).toBe('calls');
    expect(buildFunnelStageReview(rows.find((row: any) => row.id === 'booked'), rows).route).toBe('calls');
    expect(buildFunnelStageReview(rows.find((row: any) => row.id === 'qualified'), rows).route).toBe('pipeline');
    expect(buildFunnelStageReview(rows.find((row: any) => row.id === 'proposal'), rows).route).toBe('proposals');
    expect(buildFunnelStageReview(rows.find((row: any) => row.id === 'contract'), rows).route).toBe('proposals');
  });

  it('resolves a concrete console record before routing, not just a destination page', () => {
    const data = {
      calls: [
        {id: 'CALL-1', outcome: 'qualified', flags: 0, deflections: 1},
        {id: 'CALL-2', outcome: 'meeting-booked', flags: 0, deflections: 0},
        {id: 'CALL-3', outcome: 'pricing-objection', flags: 2, deflections: 3},
      ],
      companies: [
        {id: 'lead-discovery', stage: 'discovery'},
        {id: 'lead-qualified', stage: 'qualifying'},
      ],
      proposals: [
        {id: 'PR-open', stage: 'redlines'},
        {id: 'PR-signed', stage: 'signed'},
      ],
    };
    const reviewFor = (id: string) => buildFunnelStageReview(rows.find((row: any) => row.id === id), rows);
    const rowFor = (id: string) => rows.find((row: any) => row.id === id);

    expect(resolveFunnelStageSelection(rowFor('call'), reviewFor('call'), data)).toEqual({type: 'call', id: 'CALL-3'});
    expect(resolveFunnelStageSelection(rowFor('booked'), reviewFor('booked'), data)).toEqual({type: 'call', id: 'CALL-2'});
    expect(resolveFunnelStageSelection(rowFor('qualified'), reviewFor('qualified'), data)).toEqual({type: 'lead', id: 'lead-qualified'});
    expect(resolveFunnelStageSelection(rowFor('proposal'), reviewFor('proposal'), data)).toEqual({type: 'proposal', id: 'PR-open'});
    expect(resolveFunnelStageSelection(rowFor('contract'), reviewFor('contract'), data)).toEqual({type: 'proposal', id: 'PR-signed'});
  });
});

describe('widget source: page contract', () => {
  it('declares FunnelChart and FunnelPage components', () => {
    expect(widgetSrc).toMatch(/function\s+FunnelChart\s*\(/);
    expect(widgetSrc).toMatch(/function\s+FunnelStageReview\s*\(/);
    expect(widgetSrc).toMatch(/function\s+FunnelPage\s*\(/);
  });

  it('reads from the funnel fixture URL (DEMO_MODE rewrites /api/funnel → fixtures/funnel.json)', () => {
    expect(widgetSrc).toMatch(/\/api\/funnel/);
  });

  it('renders one row per canonical stage with stable data-testids', () => {
    expect(widgetSrc).toMatch(/data-testid={`funnel-row-\$\{row\.id\}`}/);
    expect(widgetSrc).toMatch(/data-testid={`funnel-count-\$\{row\.id\}`}/);
    expect(widgetSrc).toMatch(/data-testid={`funnel-drop-\$\{row\.id\}`}/);
  });

  it('stage rows are real controls that open the local review panel', () => {
    expect(widgetSrc).toMatch(/<button[\s\S]{0,240}className="funnel-row"/);
    expect(widgetSrc).toMatch(/aria-controls="funnel-stage-review"/);
    expect(widgetSrc).toMatch(/data-testid="funnel-stage-review"/);
    expect(widgetSrc).toMatch(/data-testid="funnel-stage-action"/);
  });

  it('surfaces the headline call→contract conversion chip', () => {
    expect(widgetSrc).toMatch(/data-testid="funnel-overall-chip"/);
    expect(widgetSrc).toMatch(/call → contract/);
  });

  it('frames funnel data as a console review panel, not a demo download', () => {
    expect(widgetSrc).toMatch(/Sourced from current console data/);
    expect(widgetSrc).not.toMatch(/fixture-driven|DEMO_MODE|canned/i);
  });

  it('uses the canonical page wrapper without inline route padding', () => {
    expect(widgetSrc).toMatch(/className="page page--funnel"/);
    expect(widgetSrc).toMatch(/data-testid="funnel-page"/);
    expect(widgetSrc).not.toMatch(/data-testid="funnel-page"[\s\S]{0,180}style=/);
  });

  it('declares the canonical FUNNEL_STAGE_ORDER constant matching the fixture', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const match = widgetSrc.match(/const FUNNEL_STAGE_ORDER\s*=\s*\[([^\]]+)\]/);
    expect(match).toBeTruthy();
    const order = match![1]
      .split(',')
      .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    expect(order).toEqual(fixture.stages.map((s: any) => s.id));
  });

  it('progressbar role + aria-valuenow present (accessibility contract)', () => {
    expect(widgetSrc).toMatch(/role="progressbar"/);
    expect(widgetSrc).toMatch(/aria-valuenow=/);
    expect(widgetSrc).toMatch(/aria-valuemin=\{0\}/);
    expect(widgetSrc).toMatch(/aria-valuemax=\{100\}/);
  });

  it('publishes the page + helpers on globalThis for app.tsx', () => {
    expect(widgetSrc).toMatch(/Object\.assign\(globalThis,\s*\{[^}]*FunnelPage[^}]*\}\)/);
    expect(widgetSrc).toMatch(/Object\.assign\(globalThis,\s*\{[^}]*FunnelChart[^}]*\}\)/);
    expect(widgetSrc).toMatch(/Object\.assign\(globalThis,\s*\{[^}]*buildFunnelStageReview[^}]*\}\)/);
  });
});

describe('route + sidebar wiring', () => {
  const appSrc = readFileSync(appPath, 'utf8');
  const shellSrc = readFileSync(shellPath, 'utf8');
  const indexSrc = readFileSync(indexPath, 'utf8');

  it("'funnel' is in the ROUTES allow-list", () => {
    const match = appSrc.match(/const ROUTES\s*=\s*\[([^\]]+)\]/);
    expect(match).toBeTruthy();
    expect(match![1]).toMatch(/['"]funnel['"]/);
  });

  it('app.tsx mounts FunnelPage on the funnel route', () => {
    expect(appSrc).toMatch(/route === 'funnel'\s*&&\s*<FunnelPage/);
  });

  it('sidebar includes a funnel nav item', () => {
    expect(shellSrc).toMatch(/id\s*:\s*'funnel'/);
    expect(shellSrc).toMatch(/label\s*:\s*'Funnel'/);
  });

  it('topbar labels include funnel', () => {
    expect(shellSrc).toMatch(/funnel\s*:\s*'Funnel'/);
  });

  it('index.html loads funnel-page.tsx before app.tsx', () => {
    const funnelIdx = indexSrc.indexOf('funnel-page.tsx');
    const appIdx = indexSrc.indexOf('app.tsx"');
    expect(funnelIdx).toBeGreaterThan(0);
    expect(appIdx).toBeGreaterThan(funnelIdx);
  });
});
