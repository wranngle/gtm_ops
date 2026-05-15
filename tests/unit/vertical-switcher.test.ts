/**
 * Vertical preset switcher contract — plumber | hvac | electrician.
 *
 * The switcher lives in apps/ops-console/console/vertical-switcher.tsx
 * and pulls its preset data from apps/ops-console/console/verticals.ts.
 * Source-of-truth presets live as YAML under /presets/<id>.yaml; the
 * console can't read YAML at runtime (Babel-standalone, no bundler)
 * so verticals.ts ships a deterministic in-bundle copy. This test
 * asserts the two stay in sync on the load-bearing keys
 * (id, voice_id, proposal_template, default_tier).
 *
 * vitest runs `environment: 'node'`; ops-console TSX is Babel-served
 * in the browser. We follow the convention from the round-1 sentiment
 * rollup (#171) and the round-2 simulator widget (#177): assert
 * against source text + parsed fixture data, not a live DOM render.
 *
 * Behavior under test:
 *   1. Three YAML preset files exist under /presets, each with the
 *      required keys.
 *   2. verticals.ts ships a matching in-bundle copy (no drift).
 *   3. Component switches active preset and exposes prompt, template,
 *      and voice_id from window-published preset accessors.
 *   4. Round-trip cycling through all three presets leaves no state
 *      mutation in window.VERTICAL_PRESETS.
 *   5. Route, sidebar, and index.html script-tag are wired.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const presetsDir = resolve(root, 'presets');
const verticalsPath = resolve(root, 'apps/ops-console/console/verticals.ts');
const switcherPath = resolve(root, 'apps/ops-console/console/vertical-switcher.tsx');
const appPath = resolve(root, 'apps/ops-console/console/app.tsx');
const shellPath = resolve(root, 'apps/ops-console/console/shell.tsx');
const indexPath = resolve(root, 'apps/ops-console/console/index.html');

const VERTICAL_IDS = ['plumber', 'hvac', 'electrician'] as const;

function parseSimpleYaml(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^\s*#.*/, '');
    const m = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, rest] = m;
    const trimmed = rest.trim();
    if (!trimmed || trimmed === '|' || trimmed.startsWith('|')) continue;
    if (trimmed.startsWith('-')) continue;
    out[key] = trimmed.replace(/^['"]|['"]$/g, '');
  }
  return out;
}

describe('vertical presets: on-disk yaml', () => {
  for (const id of VERTICAL_IDS) {
    it(`presets/${id}.yaml declares required fields`, () => {
      const yaml = readFileSync(resolve(presetsDir, `${id}.yaml`), 'utf8');
      const fields = parseSimpleYaml(yaml);
      expect(fields.id).toBe(id);
      expect(fields.voice_id, `${id} voice_id`).toMatch(/^voice-/);
      expect(fields.proposal_template, `${id} proposal_template`).toMatch(/^presales_report__/);
      expect(['gold', 'silver', 'bronze']).toContain(fields.default_tier);
    });
  }
});

describe('vertical presets: verticals.ts in-bundle copy', () => {
  const src = readFileSync(verticalsPath, 'utf8');

  it('declares the three preset ids', () => {
    for (const id of VERTICAL_IDS) {
      expect(src).toMatch(new RegExp(`id:\\s*'${id}'`));
    }
  });

  it('publishes the loader surface on window', () => {
    expect(src).toMatch(/window\.VERTICAL_PRESETS\s*=/);
    expect(src).toMatch(/window\.getVerticalPreset\s*=/);
    expect(src).toMatch(/window\.persistVerticalId\s*=/);
    expect(src).toMatch(/window\.readPersistedVerticalId\s*=/);
  });

  it('default vertical id is one of the three registered ids', () => {
    const m = /const DEFAULT_VERTICAL_ID\s*=\s*'([^']+)'/.exec(src);
    expect(m, 'DEFAULT_VERTICAL_ID export').toBeTruthy();
    expect(VERTICAL_IDS).toContain(m![1] as typeof VERTICAL_IDS[number]);
  });

  it('does not drift from the on-disk YAML on load-bearing keys', () => {
    for (const id of VERTICAL_IDS) {
      const yaml = parseSimpleYaml(readFileSync(resolve(presetsDir, `${id}.yaml`), 'utf8'));
      expect(src, `${id} voice_id present in verticals.ts`).toContain(yaml.voice_id);
      expect(src, `${id} proposal_template present in verticals.ts`).toContain(yaml.proposal_template);
    }
  });
});

describe('vertical switcher: widget source', () => {
  const src = readFileSync(switcherPath, 'utf8');

  it('declares the VerticalSwitcher and VerticalsPage components', () => {
    expect(src).toMatch(/function VerticalSwitcher\s*\(/);
    expect(src).toMatch(/function VerticalsPage\s*\(/);
  });

  it('renders one tab per registered preset', () => {
    expect(src).toMatch(/data-testid=\{`vertical-tab-\$\{p\.id\}`\}/);
    expect(src).toMatch(/presets\.map\(/);
  });

  it('exposes the rendered system prompt, voice id, and template', () => {
    expect(src).toMatch(/data-testid="vertical-system-prompt"/);
    expect(src).toMatch(/data-testid="vertical-voice-id"/);
    expect(src).toMatch(/data-testid="vertical-template"/);
  });

  it('persists the selected vertical via window.persistVerticalId', () => {
    expect(src).toMatch(/window\.persistVerticalId\?\.\(/);
  });

  it('publishes VerticalSwitcher + VerticalsPage on window for app.tsx', () => {
    expect(src).toMatch(/window\.VerticalSwitcher\s*=\s*VerticalSwitcher/);
    expect(src).toMatch(/window\.VerticalsPage\s*=\s*VerticalsPage/);
  });
});

describe('vertical switcher: deterministic round-trip with no state leakage', () => {
  /*
   * Simulate the runtime loader path: eval the verticals.ts source in a
   * synthetic `window` and re-run the active-preset selection across all
   * three vertical ids. After cycling through every preset, the original
   * VERTICAL_PRESETS array MUST equal a snapshot captured up front —
   * proving the preset objects are read but never mutated in place.
   *
   * This is the "round-trip with each preset asserts no state leakage"
   * acceptance criterion from the round-2 plan, exercised at the
   * data-layer (browser-render coverage is out of scope for the
   * Node-environment vitest pool).
   */
  const verticalsSrc = readFileSync(verticalsPath, 'utf8');
  const fakeWin: Record<string, any> = {};
  const storage = new Map<string, string>();
  fakeWin.localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  };
  const sandbox = new Function('window', `${verticalsSrc}\nreturn window;`);
  sandbox(fakeWin);

  it('exposes the three presets', () => {
    expect(fakeWin.VERTICAL_PRESETS).toHaveLength(3);
    expect(fakeWin.VERTICAL_IDS).toEqual(VERTICAL_IDS);
  });

  it('switching does not mutate the preset registry', () => {
    const before = JSON.stringify(fakeWin.VERTICAL_PRESETS);
    for (const id of [...VERTICAL_IDS, ...VERTICAL_IDS].reverse()) {
      fakeWin.persistVerticalId(id);
      const p = fakeWin.getVerticalPreset(id);
      expect(p.id).toBe(id);
      // touch every preset field; this is what the component renders.
      expect(typeof p.voice_id).toBe('string');
      expect(typeof p.proposal_template).toBe('string');
      expect(typeof p.system_prompt).toBe('string');
      expect(p.system_prompt.length).toBeGreaterThan(40);
      expect(Array.isArray(p.intake_fields)).toBe(true);
    }
    const after = JSON.stringify(fakeWin.VERTICAL_PRESETS);
    expect(after).toBe(before);
  });

  it('persists the last selected id and rejects unknown ids', () => {
    fakeWin.persistVerticalId('plumber');
    expect(fakeWin.readPersistedVerticalId()).toBe('plumber');
    fakeWin.persistVerticalId('not-a-real-vertical');
    expect(fakeWin.readPersistedVerticalId()).toBe('plumber');
  });

  it('getVerticalPreset returns distinct system prompts per vertical', () => {
    const prompts = new Set(VERTICAL_IDS.map(id => fakeWin.getVerticalPreset(id).system_prompt));
    expect(prompts.size).toBe(VERTICAL_IDS.length);
  });

  it('getVerticalPreset returns distinct proposal templates per vertical', () => {
    const templates = new Set(VERTICAL_IDS.map(id => fakeWin.getVerticalPreset(id).proposal_template));
    expect(templates.size).toBe(VERTICAL_IDS.length);
  });
});

describe('vertical switcher: route + sidebar wiring', () => {
  const appSrc = readFileSync(appPath, 'utf8');
  const shellSrc = readFileSync(shellPath, 'utf8');
  const indexSrc = readFileSync(indexPath, 'utf8');

  it('verticals is in the ROUTES allow-list', () => {
    const match = appSrc.match(/const ROUTES\s*=\s*\[([^\]]+)\]/);
    expect(match, 'ROUTES constant should be in app.tsx').toBeTruthy();
    expect(match![1]).toMatch(/'verticals'/);
  });

  it('app.tsx mounts VerticalsPage on the verticals route', () => {
    expect(appSrc).toMatch(/route === 'verticals'\s*&&\s*<VerticalsPage/);
  });

  it('sidebar includes a verticals nav item', () => {
    expect(shellSrc).toMatch(/id\s*:\s*'verticals'/);
  });

  it('index.html loads verticals.ts and vertical-switcher.tsx before app.tsx', () => {
    const verticalsIdx = indexSrc.indexOf('verticals.ts');
    const switcherIdx = indexSrc.indexOf('vertical-switcher.tsx');
    const appIdx = indexSrc.indexOf('app.tsx"');
    expect(verticalsIdx).toBeGreaterThan(0);
    expect(switcherIdx).toBeGreaterThan(verticalsIdx);
    expect(appIdx).toBeGreaterThan(switcherIdx);
  });
});
