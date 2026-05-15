/* ============================================================
   Live Call Simulator — deterministic canned-trace replay.
   Click "Start simulation" → agent/caller turns reveal one at a
   time on a fixed cadence, then the 8-step proposal pipeline
   replays underneath, ending with `proposal: generated`.

   Fixture: apps/ops-console/fixtures/canned-call.jsonl
   Schema reused from round-1 PR #170 (transcript turns with
   {ts, role, text} + pipeline stage rows + final marker).
   Pinned to /api/simulator-fixture so the static console can
   ship the JSONL alongside the bundle.
   ============================================================ */

const SIMULATOR_FIXTURE_URL = 'fixtures/canned-call.jsonl';
const SIMULATOR_TURN_DELAY_MS = 1500;
const SIMULATOR_PIPELINE_DELAY_MS = 600;

function parseSimulatorFixture(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const meta = {};
  const turns = [];
  const pipeline = [];
  let final = null;
  for (const line of lines) {
    let row;
    try { row = JSON.parse(line); } catch (_) { continue; }
    if (row.kind === 'meta') Object.assign(meta, row);
    else if (row.kind === 'turn') turns.push(row);
    else if (row.kind === 'pipeline') pipeline.push(row);
    else if (row.kind === 'final') final = row;
  }
  return { meta, turns, pipeline, final };
}

function CallSimulator({ fixturePath = SIMULATOR_FIXTURE_URL }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [turnIdx, setTurnIdx] = React.useState(-1);
  const [pipelineIdx, setPipelineIdx] = React.useState(-1);
  const [phase, setPhase] = React.useState('idle');
  // phase: idle → loading → playing-turns → playing-pipeline → done

  React.useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    fetch(fixturePath)
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`fixture ${r.status}`)))
      .then(text => {
        if (cancelled) return;
        setData(parseSimulatorFixture(text));
        setPhase('idle');
      })
      .catch(e => { if (!cancelled) { setError(String(e)); setPhase('error'); } });
    return () => { cancelled = true; };
  }, [fixturePath]);

  const start = React.useCallback(() => {
    if (!data || phase === 'playing-turns' || phase === 'playing-pipeline') return;
    setTurnIdx(-1);
    setPipelineIdx(-1);
    setPhase('playing-turns');
  }, [data, phase]);

  React.useEffect(() => {
    if (phase !== 'playing-turns' || !data) return undefined;
    const next = turnIdx + 1;
    if (next >= data.turns.length) {
      setPhase('playing-pipeline');
      return undefined;
    }
    const id = setTimeout(() => setTurnIdx(next), SIMULATOR_TURN_DELAY_MS);
    return () => clearTimeout(id);
  }, [phase, turnIdx, data]);

  React.useEffect(() => {
    if (phase !== 'playing-pipeline' || !data) return undefined;
    const next = pipelineIdx + 1;
    if (next >= data.pipeline.length) {
      setPhase('done');
      return undefined;
    }
    const id = setTimeout(() => setPipelineIdx(next), SIMULATOR_PIPELINE_DELAY_MS);
    return () => clearTimeout(id);
  }, [phase, pipelineIdx, data]);

  if (phase === 'error') {
    return <div className="sim sim--error" role="alert">Fixture failed to load: {error}</div>;
  }
  if (!data) {
    return <div className="sim sim--loading">Loading canned trace…</div>;
  }

  const visibleTurns = data.turns.slice(0, turnIdx + 1);
  const visiblePipeline = data.pipeline.slice(0, pipelineIdx + 1);
  const proposalReady = phase === 'done' && data.final?.proposal === 'generated';

  return (
    <div className="sim" data-phase={phase} data-testid="call-simulator">
      <header className="sim__head">
        <div className="sim__title">Live call simulator</div>
        <div className="sim__meta">
          {data.meta.scenario} · caller {data.meta.caller} · tier {data.meta.tier}
        </div>
        <button
          type="button"
          className="sim__start btn btn--primary"
          onClick={start}
          disabled={phase === 'playing-turns' || phase === 'playing-pipeline'}
          data-testid="sim-start">
          {phase === 'idle' ? 'Start simulation' : phase === 'done' ? 'Replay' : 'Playing…'}
        </button>
      </header>

      <section className="sim__transcript" aria-label="Transcript">
        {visibleTurns.map((t, i) => (
          <div key={i} className="sim__bubble" data-role={t.role} data-testid="sim-bubble">
            <div className="sim__bubble-role">{t.role}</div>
            <div className="sim__bubble-text">{t.text}</div>
            {t.tool && <div className="sim__bubble-tool">tool: {t.tool}</div>}
            <div className="sim__bubble-ts">{t.ts.toFixed(1)}s</div>
          </div>
        ))}
      </section>

      <section className="sim__pipeline" aria-label="Proposal pipeline">
        {visiblePipeline.map((p, i) => (
          <div key={i} className="sim__stage" data-testid="sim-stage">
            <span className="sim__stage-num">{p.step}</span>
            <span className="sim__stage-name">{p.stage}</span>
            <span className="sim__stage-summary">{p.summary}</span>
            <span className="sim__stage-ms">{p.ms}ms</span>
          </div>
        ))}
      </section>

      {proposalReady && (
        <div className="sim__done" data-testid="sim-proposal-generated" role="status">
          proposal: generated · {data.final.proposal_id} · total {data.final.total_ms}ms
        </div>
      )}
    </div>
  );
}

function SimulatorPage({ setRoute }) {
  return (
    <div className="page page--simulator">
      <PageHeader
        eyebrow="workspace · simulator"
        title="Simulator"
        sub="Deterministic canned trace — click Start to watch a full call drive a proposal end-to-end."
      />
      <CallSimulator/>
    </div>
  );
}

window.SimulatorPage = SimulatorPage;
window.CallSimulator = CallSimulator;
