/**
 * agents-registry.js#surfaces shape guard.
 *
 * Each agent that mounts on a given console surface (coach_dock,
 * agent_playground, pipeline_intake, eval_lab) must declare a non-empty
 * surface block. Mount sites pass `surface="<key>"` to <ConvaiWidget>;
 * if the registry block is missing, the widget silently falls back to
 * the per-agent `widget` defaults and the per-surface nuance evaporates.
 *
 * This test loads agents-registry.js in a sandbox and asserts:
 *   - SURFACE_KEYS is the expected set
 *   - every (agent × surface) the agent advertises has at least one
 *     non-empty tuning value
 *   - surfaceOverrides() resolves keys it should and returns null for
 *     keys it shouldn't
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

type SurfaceBlock = {
  textOnly?: boolean;
  expanded?: boolean;
  dismissible?: boolean;
  syntaxHighlightTheme?: string;
  firstMessage?: string;
  actionText?: string;
  startCallText?: string;
  endCallText?: string;
  expandText?: string;
  listeningText?: string;
  speakingText?: string;
};
type Agent = {
  key: string;
  agent_id?: string;
  surfaces?: Record<string, SurfaceBlock>;
};
type Registry = {
  agents: Agent[];
  byKey: (k: string) => Agent | undefined;
  surfaceOverrides: (agentKey: string, surfaceKey: string) => SurfaceBlock | null;
  SURFACE_KEYS: string[];
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const registryPath = resolve(root, 'apps', 'ops-console', 'console', 'agents-registry.js');

let REG: Registry;
beforeAll(() => {
  const src = readFileSync(registryPath, 'utf8');
  const ctx: { globalThis: { AGENT_REGISTRY?: Registry } } = { globalThis: {} as { AGENT_REGISTRY?: Registry } };
  // The script writes to globalThis.AGENT_REGISTRY; satisfy that ref shape.
  vm.createContext(ctx);
  vm.runInContext('var globalThis = this;', ctx);
  vm.runInContext(src, ctx);
  if (!ctx.globalThis.AGENT_REGISTRY) throw new Error('agents-registry.js did not assign AGENT_REGISTRY');
  REG = ctx.globalThis.AGENT_REGISTRY;
});

describe('agents-registry surfaces', () => {
  it('declares the four console surface keys', () => {
    expect(REG.SURFACE_KEYS).toEqual(['coach_dock', 'agent_playground', 'pipeline_intake', 'eval_lab']);
  });

  it('every agent that declares a `surfaces` block uses only known surface keys', () => {
    for (const a of REG.agents) {
      if (!a.surfaces) continue;
      for (const k of Object.keys(a.surfaces)) {
        expect(REG.SURFACE_KEYS).toContain(k);
      }
    }
  });

  it('every (agent × surface) override has at least one non-empty tuning value', () => {
    for (const a of REG.agents) {
      if (!a.surfaces) continue;
      for (const [surfaceKey, block] of Object.entries(a.surfaces)) {
        const values = Object.values(block).filter(v => v !== undefined && v !== null && v !== '');
        expect(
          values.length,
          `${a.key} on ${surfaceKey} declared an empty surface block`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('sales_coach is tuned for coach_dock, agent_playground, eval_lab', () => {
    const dock = REG.surfaceOverrides('sales_coach', 'coach_dock');
    expect(dock).not.toBeNull();
    expect(dock!.dismissible).toBe(true);
    expect(dock!.textOnly).toBe(false);
    expect(dock!.expanded).toBe(true);
    expect(dock!.firstMessage).toMatch(/coach is docked/i);

    const playground = REG.surfaceOverrides('sales_coach', 'agent_playground');
    expect(playground).not.toBeNull();
    expect(playground!.textOnly).toBe(true);
    expect(playground!.dismissible).toBe(false);

    const lab = REG.surfaceOverrides('sales_coach', 'eval_lab');
    expect(lab).not.toBeNull();
    expect(lab!.actionText).toBe('Probe regression');
    expect(lab!.startCallText).toBe('Start eval call');
  });

  it('intake (Sarah) is tuned for pipeline_intake, agent_playground, eval_lab', () => {
    const intake = REG.surfaceOverrides('intake', 'pipeline_intake');
    expect(intake).not.toBeNull();
    expect(intake!.textOnly).toBe(false);
    expect(intake!.dismissible).toBe(false);
    expect(intake!.firstMessage).toMatch(/sarah/i);

    const playground = REG.surfaceOverrides('intake', 'agent_playground');
    expect(playground).not.toBeNull();
    expect(playground!.textOnly).toBe(true);

    const lab = REG.surfaceOverrides('intake', 'eval_lab');
    expect(lab).not.toBeNull();
    expect(lab!.actionText).toBe('Probe regression');
  });

  it('coach_dock surface is sales_coach-only — Sarah and dev_test are not docked', () => {
    expect(REG.surfaceOverrides('intake', 'coach_dock')).toBeNull();
    expect(REG.surfaceOverrides('dev_test', 'coach_dock')).toBeNull();
  });

  it('pipeline_intake surface is intake-only — coach is not the inbound qualifier', () => {
    expect(REG.surfaceOverrides('sales_coach', 'pipeline_intake')).toBeNull();
    expect(REG.surfaceOverrides('dev_test', 'pipeline_intake')).toBeNull();
  });

  it('returns null for unknown agent or unknown surface', () => {
    expect(REG.surfaceOverrides('does_not_exist', 'coach_dock')).toBeNull();
    expect(REG.surfaceOverrides('sales_coach', 'does_not_exist')).toBeNull();
  });

  it('coach_dock is the only surface with dismissible:true (it floats over all routes)', () => {
    const dismissibleSurfaces: string[] = [];
    for (const a of REG.agents) {
      if (!a.surfaces) continue;
      for (const [surfaceKey, block] of Object.entries(a.surfaces)) {
        if (block.dismissible === true) dismissibleSurfaces.push(`${a.key}:${surfaceKey}`);
      }
    }
    expect(dismissibleSurfaces).toEqual(['sales_coach:coach_dock']);
  });
});
