/* ============================================================
   Failure-mode Auto-Replay — side-by-side counterfactual panel.
   Click "Replay failure" → the failed call's transcript + pipeline
   stream in on the LEFT, and the counterfactual reconstruction
   (what would have happened under the fallback policy) streams in
   on the RIGHT, with a `counterfactual` label indicator.

   Source trace: apps/ops-console/fixtures/failed-call.jsonl
   Schema reused from round-1 PR #170 (?demo=1 local trace),
   augmented with `counterfactual` + `counterfactual-final` rows.
   Pure logic lives in counterfactual.ts so it is unit-testable
   without a DOM render (same convention as simulator-page.tsx).
   ============================================================ */

const REPLAY_FIXTURE_URL = '../fixtures/failed-call.jsonl';
const REPLAY_TURN_DELAY_MS = 1200;
const REPLAY_STAGE_DELAY_MS = 500;

function parseReplayFixtureSrc(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const meta = {};
  const turns = [];
  const actual = [];
  const counterfactual = [];
  let final = null;
  let counterfactualFinal = null;
  for (const line of lines) {
    let row;
    try { row = JSON.parse(line); } catch (_) { continue; }
    if (row.kind === 'meta') Object.assign(meta, row);
    else if (row.kind === 'turn') turns.push(row);
    else if (row.kind === 'pipeline') actual.push(row);
    else if (row.kind === 'counterfactual') counterfactual.push(row);
    else if (row.kind === 'final') final = row;
    else if (row.kind === 'counterfactual-final') counterfactualFinal = row;
  }
  return { meta, turns, actual, counterfactual, final, counterfactualFinal };
}

function alignReplayStages(actual, counterfactual) {
  const steps = new Set<any>();
  for (const s of actual) steps.add(s.step);
  for (const s of counterfactual) steps.add(s.step);
  return [...steps].sort((a, b) => a - b).map(step => {
    const a = actual.find(s => s.step === step) || null;
    const c = counterfactual.find(s => s.step === step) || null;
    const divergent =
      (!!a && a.status === 'failed') ||
      (!a && !!c) ||
      (!!a && !!c && a.status !== c.status);
    return { step, stage: (a?.stage || c?.stage) || '', actual: a, counterfactual: c, divergent };
  });
}

function ReplayPanel({ fixturePath = REPLAY_FIXTURE_URL }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [turnIdx, setTurnIdx] = React.useState(-1);
  const [stageIdx, setStageIdx] = React.useState(-1);
  const [phase, setPhase] = React.useState('idle');
  // phase: idle → loading → playing-turns → playing-stages → done

  React.useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    fetch(fixturePath)
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`failed trace source returned HTTP ${r.status}`)))
      .then(text => {
        if (cancelled) return;
        setData(parseReplayFixtureSrc(text));
        setPhase('idle');
      })
      .catch(e => { if (!cancelled) { setError(e?.message || String(e)); setPhase('error'); } });
    return () => { cancelled = true; };
  }, [fixturePath]);

  const start = React.useCallback(() => {
    if (!data || phase === 'playing-turns' || phase === 'playing-stages') return;
    setTurnIdx(-1);
    setStageIdx(-1);
    setPhase('playing-turns');
  }, [data, phase]);

  React.useEffect(() => {
    if (phase !== 'playing-turns' || !data) return undefined;
    const next = turnIdx + 1;
    if (next >= data.turns.length) {
      setPhase('playing-stages');
      return undefined;
    }
    const id = setTimeout(() => setTurnIdx(next), REPLAY_TURN_DELAY_MS);
    return () => clearTimeout(id);
  }, [phase, turnIdx, data]);

  const pairs = data ? alignReplayStages(data.actual, data.counterfactual) : [];

  React.useEffect(() => {
    if (phase !== 'playing-stages' || !data) return undefined;
    const next = stageIdx + 1;
    if (next >= pairs.length) {
      setPhase('done');
      return undefined;
    }
    const id = setTimeout(() => setStageIdx(next), REPLAY_STAGE_DELAY_MS);
    return () => clearTimeout(id);
  }, [phase, stageIdx, data, pairs.length]);

  if (phase === 'error') {
    return <div className="replay replay--error" role="alert">Local trace failed to load: {error}</div>;
  }
  if (!data) {
    return <div className="replay replay--loading">Loading failed trace…</div>;
  }

  const visibleTurns = data.turns.slice(0, turnIdx + 1);
  const visiblePairs = pairs.slice(0, stageIdx + 1);
  const savingsMs = data.final && data.counterfactualFinal
    ? data.final.total_ms - data.counterfactualFinal.total_ms
    : null;
  const showSummary = phase === 'done';

  return (
    <div className="replay" data-phase={phase} data-testid="replay-panel">
      <header className="replay__head">
        <div>
          <div className="replay__title">Failure-mode auto-replay</div>
          <div className="replay__meta">
            {data.meta.scenario} · caller {data.meta.caller} · failure at stage <code>{data.meta.failure_stage}</code> ({data.meta.failure_kind})
          </div>
        </div>
        <button
          type="button"
          className="replay__start btn btn--primary"
          onClick={start}
          disabled={phase === 'playing-turns' || phase === 'playing-stages'}
          data-testid="replay-start">
          {phase === 'idle' ? 'Replay failure' : phase === 'done' ? 'Replay again' : 'Replaying…'}
        </button>
      </header>

      <section className="replay__transcript" aria-label="Transcript">
        {visibleTurns.map((t, i) => (
          <div key={i} className="replay__bubble" data-role={t.role} data-testid="replay-bubble">
            <div className="replay__bubble-role">{t.role}</div>
            <div className="replay__bubble-text">{t.text}</div>
            {t.tool && <div className="replay__bubble-tool">tool: {t.tool}</div>}
            <div className="replay__bubble-ts">{t.ts.toFixed(1)}s</div>
          </div>
        ))}
      </section>

      <section className="replay__columns" aria-label="Side-by-side pipeline">
        <div className="replay__col replay__col--actual">
          <div className="replay__col-head">
            <span className="replay__col-label">actual</span>
            <span className="replay__col-sub">what happened</span>
          </div>
          {visiblePairs.map(p => (
            <div
              key={`a-${p.step}`}
              className="replay__stage"
              data-testid="replay-stage-actual"
              data-status={p.actual?.status || 'missing'}
              data-divergent={p.divergent ? 'true' : 'false'}>
              <span className="replay__stage-num">{p.step}</span>
              <span className="replay__stage-name">{p.stage}</span>
              <span className="replay__stage-summary">{p.actual?.summary || '—'}</span>
              <span className="replay__stage-ms">{p.actual ? `${p.actual.ms}ms` : '—'}</span>
            </div>
          ))}
        </div>

        <div className="replay__col replay__col--cf">
          <div className="replay__col-head">
            <span className="replay__col-label replay__col-label--cf" data-testid="counterfactual-label">counterfactual</span>
            <span className="replay__col-sub">what would have happened</span>
          </div>
          {visiblePairs.map(p => (
            <div
              key={`c-${p.step}`}
              className="replay__stage replay__stage--cf"
              data-testid="replay-stage-counterfactual"
              data-status={p.counterfactual?.status || 'missing'}
              data-divergent={p.divergent ? 'true' : 'false'}>
              <span className="replay__stage-num">{p.step}</span>
              <span className="replay__stage-name">{p.stage}</span>
              <span className="replay__stage-summary">{p.counterfactual?.summary || '—'}</span>
              <span className="replay__stage-ms">{p.counterfactual ? `${p.counterfactual.ms}ms` : '—'}</span>
            </div>
          ))}
        </div>
      </section>

      {showSummary && (
        <div className="replay__summary" data-testid="replay-summary" role="status">
          <div className="replay__summary-actual">
            actual: <strong>{data.final?.proposal}</strong>
            {data.final?.reason && <> · {data.final.reason}</>}
            · {data.final?.total_ms}ms
          </div>
          <div className="replay__summary-cf">
            counterfactual: <strong>{data.counterfactualFinal?.proposal}</strong>
            · {data.counterfactualFinal?.proposal_id}
            · {data.counterfactualFinal?.total_ms}ms
          </div>
          {savingsMs !== null && (
            <div className="replay__summary-savings" data-testid="replay-savings">
              would-have-saved {savingsMs}ms under fallback policy
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReplayPage({ setRoute }) {
  return (
    <div className="page page--replay">
      <PageHeader
        eyebrow="workspace · replay"
        title="Failure-mode replay"
        sub="Pick a failed call and watch the actual run alongside the counterfactual under the fallback policy."
      />
      <ReplayPanel/>
    </div>
  );
}

window.ReplayPage = ReplayPage;
window.ReplayPanel = ReplayPanel;
