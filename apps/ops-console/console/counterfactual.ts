/* ============================================================
   Failure-mode auto-replay — counterfactual reconstruction.
   Pure logic, no React. Consumed by replay-panel.tsx and by
   tests/unit/replay-panel.test.ts.

   Fixture schema reuses round-1 PR #170 (?demo=1 canned trace)
   shape: {kind: meta|turn|pipeline|final} rows, augmented with
   {kind: counterfactual} rows that mirror pipeline rows and a
   {kind: counterfactual-final} marker. The actual run rows mark
   the failure with status: "failed"; counterfactual rows fill in
   what the pipeline would have produced under a fallback policy.
   ============================================================ */

export type ReplayRowKind =
  | 'meta'
  | 'turn'
  | 'pipeline'
  | 'counterfactual'
  | 'final'
  | 'counterfactual-final';

export type ReplayStatus = 'ok' | 'failed';

export interface ReplayMeta {
  kind: 'meta';
  scenario: string;
  co_id?: string;
  caller?: string;
  tier?: string;
  fixture_id?: string;
  failure_stage?: string;
  failure_kind?: string;
}

export interface ReplayTurn {
  kind: 'turn';
  ts: number;
  role: 'agent' | 'caller';
  text: string;
  tool?: string;
}

export interface ReplayStage {
  kind: 'pipeline' | 'counterfactual';
  step: number;
  stage: string;
  ms: number;
  status: ReplayStatus;
  summary: string;
}

export interface ReplayFinal {
  kind: 'final';
  proposal: 'failed' | 'generated';
  reason?: string;
  total_ms: number;
  note?: string;
}

export interface ReplayCounterfactualFinal {
  kind: 'counterfactual-final';
  proposal: 'generated';
  proposal_id: string;
  total_ms: number;
  note?: string;
}

export interface ParsedReplay {
  meta: ReplayMeta;
  turns: ReplayTurn[];
  actual: ReplayStage[];
  counterfactual: ReplayStage[];
  final: ReplayFinal | null;
  counterfactualFinal: ReplayCounterfactualFinal | null;
}

export interface StagePair {
  step: number;
  stage: string;
  actual: ReplayStage | null;
  counterfactual: ReplayStage | null;
  divergent: boolean;
}

export function parseReplayFixture(text: string): ParsedReplay {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let meta: ReplayMeta = { kind: 'meta', scenario: 'unknown' };
  const turns: ReplayTurn[] = [];
  const actual: ReplayStage[] = [];
  const counterfactual: ReplayStage[] = [];
  let final: ReplayFinal | null = null;
  let counterfactualFinal: ReplayCounterfactualFinal | null = null;
  for (const line of lines) {
    let row: { kind?: ReplayRowKind } & Record<string, unknown>;
    try { row = JSON.parse(line); } catch (_) { continue; }
    if (row.kind === 'meta') meta = { ...meta, ...(row as unknown as ReplayMeta) };
    else if (row.kind === 'turn') turns.push(row as unknown as ReplayTurn);
    else if (row.kind === 'pipeline') actual.push(row as unknown as ReplayStage);
    else if (row.kind === 'counterfactual') counterfactual.push(row as unknown as ReplayStage);
    else if (row.kind === 'final') final = row as unknown as ReplayFinal;
    else if (row.kind === 'counterfactual-final') counterfactualFinal = row as unknown as ReplayCounterfactualFinal;
  }
  return { meta, turns, actual, counterfactual, final, counterfactualFinal };
}

/**
 * Zip the actual pipeline against the counterfactual pipeline by step.
 * A pair is `divergent` if either side has a failed status or only one
 * side has a row at that step. The first divergent pair is the failure
 * boundary; everything before it should match.
 */
export function alignStages(actual: ReplayStage[], counterfactual: ReplayStage[]): StagePair[] {
  const steps = new Set<number>();
  for (const s of actual) steps.add(s.step);
  for (const s of counterfactual) steps.add(s.step);
  const ordered = [...steps].sort((a, b) => a - b);
  return ordered.map(step => {
    const a = actual.find(s => s.step === step) || null;
    const c = counterfactual.find(s => s.step === step) || null;
    const stage = (a?.stage || c?.stage) ?? '';
    const divergent =
      (!!a && a.status === 'failed') ||
      (!!a && !c && a.status === 'failed') ||
      (!a && !!c) ||
      (!!a && !!c && a.status !== c.status);
    return { step, stage, actual: a, counterfactual: c, divergent };
  });
}

/**
 * Find the first stage where the actual run failed. Returns null if no
 * failure is recorded (e.g. healthy trace fed into the panel by mistake).
 */
export function firstFailureBoundary(pairs: StagePair[]): StagePair | null {
  return pairs.find(p => p.actual?.status === 'failed') || null;
}

/**
 * Total ms saved (or lost) by the counterfactual relative to the actual
 * run. Positive means the counterfactual would have been faster.
 */
export function counterfactualSavingsMs(parsed: ParsedReplay): number | null {
  if (!parsed.final || !parsed.counterfactualFinal) return null;
  return parsed.final.total_ms - parsed.counterfactualFinal.total_ms;
}
