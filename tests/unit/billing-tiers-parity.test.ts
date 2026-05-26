import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/*
 * Locks the BillingSettings "Change plan" tier list inside apps/ops-console/console/pages-2.tsx
 * to the canonical gtm_ops offerings published on wranngle.com. The fixture at
 * tests/unit/fixtures/wranngle-com-offerings.json is a hand-snapshotted copy of
 * the gtm_ops tier items from wranngle_com/client/src/data/offerings.ts and must
 * be refreshed whenever marketing changes pricing/naming there. We do not import
 * across repos — see the fixture's _refresh field.
 *
 * pages-2.tsx is loaded in the browser via <script type="text/babel"> so it has
 * no ESM exports. We extract the GTM_OPS_TIERS literal as text, parse the load-
 * bearing fields per-tier with a regex, and assert id + offeringId + name + price
 * + cta + badge match the fixture.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PAGES_2_PATH = path.join(REPO_ROOT, 'apps', 'ops-console', 'console', 'pages-2.tsx');
const FIXTURE_PATH = path.join(REPO_ROOT, 'tests', 'unit', 'fixtures', 'wranngle-com-offerings.json');

interface CanonicalTier {
  id: string;
  name: string;
  price: string;
  priceCadence: string;
  cta: string;
  badge: string | null;
  monthly: number;
  annualMonthly: number;
}

interface ConsoleTier {
  id: string;
  offeringId: string;
  name: string;
  cta: string;
  badge: string | null;
  monthly: number;
  annualMonthly: number;
}

function loadCanonical(): CanonicalTier[] {
  const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as {tiers: CanonicalTier[]};
  return raw.tiers;
}

function extractConsoleTiers(): ConsoleTier[] {
  const src = fs.readFileSync(PAGES_2_PATH, 'utf8');
  const arrayMatch = src.match(/const GTM_OPS_TIERS\s*=\s*\[([\s\S]*?)\n\];/);
  if (!arrayMatch) throw new Error('GTM_OPS_TIERS literal not found in pages-2.tsx');
  const body = arrayMatch[1];
  // Split into per-tier blocks (objects begin with `  {` at column 2)
  const blocks = body.split(/\n  \},?\n/).map(b => b.trim()).filter(b => b.startsWith('{'));
  const readField = (block: string, field: string): string | null => {
    const m = block.match(new RegExp(`\\b${field}\\s*:\\s*('([^']*)'|null|(-?\\d+(?:\\.\\d+)?))`));
    if (!m) return null;
    if (m[2] !== undefined) return m[2];
    if (m[0].endsWith('null')) return null;
    return m[3] ?? null;
  };
  return blocks.map(block => {
    const id = readField(block, 'id');
    const offeringId = readField(block, 'offeringId');
    const name = readField(block, 'name');
    const cta = readField(block, 'cta');
    const monthly = readField(block, 'monthly');
    const annualMonthly = readField(block, 'annualMonthly');
    const badgeRaw = block.match(/\bbadge\s*:\s*('([^']*)'|null)/);
    const badge = badgeRaw ? (badgeRaw[2] !== undefined ? badgeRaw[2] : null) : null;
    if (!id || !offeringId || !name || !cta || monthly == null || annualMonthly == null) {
      throw new Error(`Console tier block missing required field. Block: ${block.slice(0, 120)}`);
    }
    return {
      id,
      offeringId,
      name,
      cta,
      badge,
      monthly: Number(monthly),
      annualMonthly: Number(annualMonthly),
    };
  });
}

describe('BillingSettings tiers match wranngle.com offerings', () => {
  const canonical = loadCanonical();
  const console = extractConsoleTiers();

  it('exposes the same number of tiers (3: Trial, Plus, Pro)', () => {
    expect(console).toHaveLength(canonical.length);
    expect(canonical).toHaveLength(3);
  });

  it('each console tier carries the canonical wranngle.com offeringId', () => {
    const consoleOfferingIds = console.map(t => t.offeringId);
    const canonicalIds = canonical.map(t => t.id);
    expect(consoleOfferingIds).toEqual(canonicalIds);
  });

  it('per-tier display name, monthly price, badge, and cta match canonical', () => {
    for (let i = 0; i < canonical.length; i++) {
      const c = canonical[i];
      const k = console[i];
      expect(k.offeringId, `tier ${i} offeringId`).toBe(c.id);
      expect(k.name, `${c.id} name`).toBe(c.name);
      expect(k.monthly, `${c.id} monthly`).toBe(c.monthly);
      expect(k.annualMonthly, `${c.id} annualMonthly`).toBe(c.annualMonthly);
      expect(k.cta, `${c.id} cta`).toBe(c.cta);
      expect(k.badge, `${c.id} badge`).toBe(c.badge);
    }
  });

  it('canonical headline price (string) matches the console monthly (number)', () => {
    for (const c of canonical) {
      expect(Number(c.price), `${c.id} fixture price stringly equals monthly`).toBe(c.monthly);
    }
  });
});
