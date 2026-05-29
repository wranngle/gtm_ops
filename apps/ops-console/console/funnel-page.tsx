/* ============================================================
   Funnel page — booking-to-revenue local review surface.
   ============================================================ */

const FUNNEL_STAGE_ORDER = ['call', 'qualified', 'booked', 'proposal', 'contract'];
const IFunnel = globalThis.Icon;

function computeFunnelRows(stages) {
  const list = Array.isArray(stages) ? stages : [];
  if (list.length === 0) return [];
  const top = Number(list[0]?.count) || 0;
  let prev = top;
  return list.map((s, idx) => {
    const count = Number(s?.count) || 0;
    const pct = top > 0 ? count / top : 0;
    const drop = idx === 0 ? 0 : (prev > 0 ? 1 - (count / prev) : 0);
    const row = {
      id: String(s?.id || FUNNEL_STAGE_ORDER[idx] || `stage-${idx + 1}`),
      label: String(s?.label || s?.id || `Stage ${idx + 1}`),
      sublabel: String(s?.sublabel || ''),
      count,
      pct,
      drop,
      pctText: `${(pct * 100).toFixed(1)}%`,
      dropText: idx === 0 ? '—' : `-${(drop * 100).toFixed(1)}%`,
    };
    prev = count;
    return row;
  });
}

function computeFunnelOverall(stages) {
  const list = Array.isArray(stages) ? stages : [];
  if (list.length < 2) return { ratio: 0, percent: '0.0%', top: 0, bottom: 0 };
  const top = Number(list[0]?.count) || 0;
  const bottom = Number(list[list.length - 1]?.count) || 0;
  const ratio = top > 0 ? bottom / top : 0;
  return { ratio, percent: `${(ratio * 100).toFixed(1)}%`, top, bottom };
}

function buildFunnelStageReview(row, rows) {
  const actionByStage = {
    call: {
      route: 'calls',
      actionLabel: 'Review call scorecards',
      owner: 'Calls',
      nextStep: 'Inspect scored calls, coaching notes, and trace packets before qualification handoff.',
      selectionType: 'call',
      intent: { call_window: 'all' },
    },
    qualified: {
      route: 'pipeline',
      actionLabel: 'Review qualified pipeline',
      owner: 'Pipeline',
      nextStep: 'Audit qualified accounts that stalled before a booked discovery or demo.',
      selectionType: 'lead',
      intent: { pipeline_filter: 'all' },
    },
    booked: {
      route: 'calls',
      actionLabel: 'Review booked calls',
      owner: 'Calls',
      nextStep: 'Compare discovery transcripts with calendar outcomes and follow-up readiness.',
      selectionType: 'call',
      intent: { call_window: 'all' },
    },
    proposal: {
      route: 'proposals',
      actionLabel: 'Review proposal packets',
      owner: 'Proposals',
      nextStep: 'Open proposal review packets and blocker lists before buyer send.',
      selectionType: 'proposal',
      intent: { proposal_filter: 'open' },
    },
    contract: {
      route: 'proposals',
      actionLabel: 'Review signed proposals',
      owner: 'Proposals',
      nextStep: 'Inspect accepted sections, closed-won packets, and kickoff readiness.',
      selectionType: 'proposal',
      intent: { proposal_filter: 'signed' },
    },
  };
  const fallback = {
    route: 'pipeline',
    actionLabel: 'Review pipeline',
    owner: 'Pipeline',
    nextStep: 'Inspect the related pipeline records for this funnel stage.',
    selectionType: 'lead',
    intent: { pipeline_filter: 'all' },
  };
  const list = Array.isArray(rows) ? rows : [];
  const index = list.findIndex(r => r?.id === row?.id);
  const previous = index > 0 ? list[index - 1] : null;
  const lost = previous ? Math.max(0, (Number(previous.count) || 0) - (Number(row.count) || 0)) : 0;
  const action = actionByStage[row?.id] || fallback;
  return {
    ...action,
    handoffLabel: previous ? `${previous.label} → ${row.label}` : 'Top of funnel',
    lossLabel: previous
      ? `${lost.toLocaleString('en-US')} ${previous.label.toLowerCase()} did not reach ${row.label.toLowerCase()}`
      : `${row.count.toLocaleString('en-US')} records entered the funnel window`,
    lost,
    previousLabel: previous?.label || '',
  };
}

function resolveFunnelStageSelection(row, review, data) {
  const D = data || globalThis.GTM || {};
  const stageId = String(row?.id || '');
  if (review?.selectionType === 'call') {
    const calls = Array.isArray(D.calls) ? D.calls : [];
    const selected = stageId === 'booked'
      ? calls.find(c => c.outcome === 'meeting-booked') || calls[0]
      : calls.slice().sort((a, b) => ((Number(b.flags) || 0) + (Number(b.deflections) || 0)) - ((Number(a.flags) || 0) + (Number(a.deflections) || 0)))[0];
    return selected?.id ? { type: 'call', id: selected.id } : null;
  }
  if (review?.selectionType === 'proposal') {
    const proposals = Array.isArray(D.proposals) ? D.proposals : [];
    const signed = p => String(p?.stage || '').toLowerCase() === 'signed';
    const selected = stageId === 'contract'
      ? proposals.find(signed) || proposals[0]
      : proposals.find(p => !signed(p)) || proposals[0];
    return selected?.id ? { type: 'proposal', id: selected.id } : null;
  }
  if (review?.selectionType === 'lead') {
    const companies = Array.isArray(D.companies) ? D.companies : [];
    const selected = companies.find(c => c.stage === 'qualifying')
      || companies.find(c => c.stage === 'discovery')
      || companies[0];
    return selected?.id ? { type: 'lead', id: selected.id } : null;
  }
  return null;
}

function openFunnelStageEvidence(row, review, setRoute, data) {
  if (!row || !review) return;
  const selection = resolveFunnelStageSelection(row, review, data || globalThis.GTM);
  const ctx = globalThis.AppContext?.get?.() || {};
  globalThis.AppContext?.set?.({
    selection: selection || ctx.selection || null,
    extra: {
      ...(ctx.extra || {}),
      ...(review.intent || {}),
      triggered_from: 'funnel-stage-review',
      funnel_stage_id: row.id,
      funnel_stage_label: row.label,
      funnel_handoff_label: review.handoffLabel,
    },
  });
  setRoute?.(review.route);
}

function FunnelChart({ stages, windowLabel, selectedStageId, onSelectStage }) {
  const rows = React.useMemo(() => computeFunnelRows(stages), [stages]);
  const overall = React.useMemo(() => computeFunnelOverall(stages), [stages]);
  const timeWindow = String(windowLabel || 'last 30 days').replaceAll('_', ' ');

  if (rows.length === 0) {
    return (
      <div className="card funnel-chart funnel-chart--empty" data-testid="funnel-chart-empty">
        <div className="mono dim">No funnel data loaded.</div>
      </div>
    );
  }

  return (
    <div
      className="card funnel-chart"
      data-testid="funnel-chart"
      data-funnel-overall-ratio={overall.ratio.toFixed(4)}
      data-funnel-top={overall.top}
      data-funnel-bottom={overall.bottom}
      data-funnel-stages={rows.map(r => r.id).join(',')}
    >
      <div className="funnel-chart__head">
        <div className="funnel-chart__copy">
          <div className="eyebrow eyebrow--accent">booking → revenue · {timeWindow}</div>
          <div className="mono funnel-chart__sub">
            Sourced from current console data · percent dropoff at each handoff
          </div>
        </div>
        <div className="badge badge--healthy" data-testid="funnel-overall-chip" data-funnel-overall-percent={overall.percent}>
          {overall.percent} call → contract
        </div>
      </div>

      <div className="funnel-chart__rows" data-testid="funnel-rows">
        {rows.map((row, idx) => {
          const selected = selectedStageId === row.id;
          const previous = idx > 0 ? rows[idx - 1] : null;
          return (
          <button
            key={row.id}
            type="button"
            className="funnel-row"
            aria-controls="funnel-stage-review"
            aria-pressed={selected}
            aria-label={`${row.label}: ${row.count.toLocaleString('en-US')} records, ${row.pctText} of calls, ${idx === 0 ? 'top of funnel' : `${row.dropText} from ${previous.label}`}. Open stage review.`}
            data-testid={`funnel-row-${row.id}`}
            data-stage-id={row.id}
            data-stage-index={idx}
            data-stage-count={row.count}
            data-stage-pct={row.pct.toFixed(4)}
            data-stage-drop={row.drop.toFixed(4)}
            data-active={selected}
            onClick={() => onSelectStage?.(row.id)}
          >
            <div className="funnel-row__label">
              <div className="mono funnel-row__label-main">{row.label}</div>
              <div className="mono dim funnel-row__label-sub">{row.sublabel}</div>
            </div>
            <div
              className="funnel-row__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(row.pct * 100)}
              aria-label={`${row.label}: ${row.pctText} of top of funnel`}
            >
              <div
                className="funnel-row__bar-fill"
                data-testid={`funnel-bar-fill-${row.id}`}
                style={{ width: `${(row.pct * 100).toFixed(2)}%` }}
              />
            </div>
            <div className="mono num funnel-row__count" data-testid={`funnel-count-${row.id}`}>
              {row.count.toLocaleString('en-US')}
            </div>
            <div
              className={`mono num funnel-row__drop ${idx === 0 ? 'dim' : (row.drop >= 0.5 ? 'warn' : 'accent')}`}
              data-testid={`funnel-drop-${row.id}`}
            >
              {row.dropText}
            </div>
          </button>
          );
        })}
      </div>
    </div>
  );
}

function FunnelStageReview({ row, rows, setRoute }) {
  const review = React.useMemo(() => row ? buildFunnelStageReview(row, rows) : null, [row, rows]);
  if (!row || !review) return null;
  const openEvidence = () => openFunnelStageEvidence(row, review, setRoute, globalThis.GTM);
  return (
    <aside
      id="funnel-stage-review"
      className="card funnel-stage-review"
      data-testid="funnel-stage-review"
      data-stage-id={row.id}
      aria-label={`${row.label} funnel stage review`}
    >
      <div className="funnel-stage-review__head">
        <div>
          <h2>{row.label}</h2>
          <p>{review.handoffLabel}</p>
        </div>
        <span className="badge badge--accent">{review.owner}</span>
      </div>
      <div className="funnel-stage-review__facts" aria-label="Selected funnel stage facts">
        <div>
          <span>records</span>
          <strong>{row.count.toLocaleString('en-US')}</strong>
        </div>
        <div>
          <span>of calls</span>
          <strong>{row.pctText}</strong>
        </div>
        <div>
          <span>handoff drop</span>
          <strong>{row.dropText}</strong>
        </div>
      </div>
      <div className="funnel-stage-review__loss" data-testid="funnel-stage-loss">
        {review.lossLabel}
      </div>
      <p className="funnel-stage-review__next">{review.nextStep}</p>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        data-testid="funnel-stage-action"
        data-selection-type={review.selectionType}
        onClick={openEvidence}
      >
        {review.actionLabel} <IFunnel.ArrowRight size={12}/>
      </button>
    </aside>
  );
}

function FunnelPage({ setRoute }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [selectedStageId, setSelectedStageId] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/funnel');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        if (cancelled) return;
        const stages = Array.isArray(payload?.stages) ? payload.stages : [];
        setData({ window: payload?.window || 'last_30_days', stages });
      } catch (err) {
        if (!cancelled) setError(String(err?.message || err));
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const stages = data?.stages || [];
  const rows = React.useMemo(() => computeFunnelRows(stages), [stages]);
  const defaultStageId = React.useMemo(() => {
    if (rows.length === 0) return null;
    return [...rows].slice(1).sort((a, b) => b.drop - a.drop)[0]?.id || rows[0].id;
  }, [rows]);
  const activeStageId = rows.some(row => row.id === selectedStageId) ? selectedStageId : defaultStageId;
  const activeStage = rows.find(row => row.id === activeStageId) || null;
  const activeStageReview = React.useMemo(
    () => activeStage ? buildFunnelStageReview(activeStage, rows) : null,
    [activeStage, rows],
  );
  return (
    <div className="page page--funnel" data-testid="funnel-page">
      <PageHeader
        title="Funnel"
        actions={(
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            data-testid="funnel-header-review-action"
            data-stage-id={activeStage?.id || ''}
            disabled={!activeStageReview}
            onClick={() => openFunnelStageEvidence(activeStage, activeStageReview, setRoute, globalThis.GTM)}
          >
            {activeStageReview?.actionLabel || 'Review funnel evidence'} <IFunnel.ArrowRight size={12}/>
          </button>
        )}
      />
      {error && (
        <div className="card card--warn funnel-error" data-testid="funnel-error" role="alert">
          <div className="mono">Funnel load failed: {error}</div>
        </div>
      )}
      <div className="funnel-inspection">
        <FunnelChart
          stages={stages}
          windowLabel={data?.window}
          selectedStageId={activeStageId}
          onSelectStage={setSelectedStageId}
        />
        <FunnelStageReview row={activeStage} rows={rows} setRoute={setRoute}/>
      </div>
    </div>
  );
}

Object.assign(globalThis, { FunnelChart, FunnelStageReview, FunnelPage, computeFunnelRows, computeFunnelOverall, buildFunnelStageReview, resolveFunnelStageSelection, openFunnelStageEvidence, FUNNEL_STAGE_ORDER });
