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
  goal_alignment?: string;
  first_message?: string;
  system_prompt?: string;
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

// =============================================================================
// Prompt-content guards — these assert the GTM-motion anchors that the
// agent prompts MUST keep, so a future "make this prompt more generic"
// edit can't silently remove the bleed-cost framing, the four-artifact
// arc, or the IntakeSchema-feeding capture priorities. el-widget.tsx
// forwards these strings to the ElevenLabs embed at runtime, so a
// regression here ships to production.
// =============================================================================

describe('agents-registry prompt content (GTM motion anchors)', () => {
  it('every agent has a goal_alignment field', () => {
    for (const a of REG.agents) {
      expect(
        a.goal_alignment,
        `${a.key} is missing a goal_alignment field — operators reading the registry need to see where the agent sits in the GTM motion`,
      ).toBeTruthy();
    }
  });

  describe('sales_coach', () => {
    it('system_prompt names bleed cost as the persuasion lever', () => {
      const sc = REG.byKey('sales_coach');
      expect(sc?.system_prompt).toMatch(/bleed/i);
      expect(sc?.system_prompt).toMatch(/missed[- ]call/i);
    });

    it('system_prompt references the four-artifact arc (audit + plan + proposal)', () => {
      const sc = REG.byKey('sales_coach');
      expect(sc?.system_prompt).toMatch(/audit/i);
      expect(sc?.system_prompt).toMatch(/project plan/i);
      expect(sc?.system_prompt).toMatch(/proposal/i);
    });

    it('system_prompt forbids pitching a generic "AI assistant"', () => {
      const sc = REG.byKey('sales_coach');
      expect(sc?.system_prompt).toMatch(/voice receptionist|service business/i);
    });

    it('system_prompt asserts coach is NOT Sarah (separation of operator vs prospect)', () => {
      const sc = REG.byKey('sales_coach');
      expect(sc?.system_prompt).toMatch(/not\s+(?:the\s+)?(inbound|sarah)/i);
    });

    it('eval_lab surface has its own firstMessage (not falling back to default)', () => {
      const lab = REG.surfaceOverrides('sales_coach', 'eval_lab');
      expect(lab?.firstMessage, 'sales_coach.eval_lab.firstMessage was missing — fell back to operator-facing text in eval mode').toBeTruthy();
      expect(lab?.firstMessage).toMatch(/eval mode|graded|case study/i);
    });
  });

  describe('intake (Sarah)', () => {
    it('system_prompt explicitly states Sarah IS the product (live demo == live receptionist)', () => {
      const sarah = REG.byKey('intake');
      expect(sarah?.system_prompt).toMatch(/product|live demo/i);
      expect(sarah?.system_prompt).toMatch(/voice receptionist/i);
    });

    it('system_prompt prioritizes IntakeSchema-feeding capture (volume + ticket value)', () => {
      const sarah = REG.byKey('intake');
      expect(sarah?.system_prompt).toMatch(/volume/i);
      expect(sarah?.system_prompt).toMatch(/ticket value|bleed/i);
    });

    it('system_prompt forbids Sarah from quoting pricing herself', () => {
      const sarah = REG.byKey('intake');
      expect(sarah?.system_prompt).toMatch(/never quote pricing|do not quote/i);
    });

    it('system_prompt names the speed-to-lead SLA (5-minute window)', () => {
      const sarah = REG.byKey('intake');
      expect(sarah?.system_prompt).toMatch(/5[- ]minute|speed[- ]to[- ]lead/i);
    });

    it('system_prompt scopes to the service-business vertical (HVAC/plumbing/etc.)', () => {
      const sarah = REG.byKey('intake');
      expect(sarah?.system_prompt).toMatch(/HVAC/);
      expect(sarah?.system_prompt).toMatch(/plumbing/i);
    });

    it('eval_lab surface has its own firstMessage acknowledging graded mode', () => {
      const lab = REG.surfaceOverrides('intake', 'eval_lab');
      expect(lab?.firstMessage).toMatch(/eval mode|graded|case study/i);
    });
  });

  describe('every operator-facing agent prompt', () => {
    it('ends with the {{context}} dynamic-variable injection', () => {
      for (const key of ['sales_coach', 'intake']) {
        const a = REG.byKey(key);
        expect(
          a?.system_prompt?.trim().endsWith('{{context}}'),
          `${key}.system_prompt must end with {{context}} — the runtime injects the live console state at that anchor`,
        ).toBe(true);
      }
    });

    it('references the operator console context as the source of truth', () => {
      for (const key of ['sales_coach', 'intake']) {
        const a = REG.byKey(key);
        expect(a?.system_prompt).toMatch(/context/i);
        expect(a?.system_prompt).toMatch(/never invent|do not infer|do not overwrite/i);
      }
    });
  });
});
