/* ============================================================
   Funnel page — booking-to-revenue funnel chart.
   Five canonical stages (call → qualified → booked → proposal →
   contract) with per-stage count, percent-of-top, and dropoff vs
   the previous stage. Reuses the card / eyebrow / mono.num
   typography from the round-1 pipeline-velocity widget (PR #172)
   so the two surfaces feel like the same family of metric.
   ============================================================ */

const FUNNEL_STAGE_ORDER = ['call', 'qualified', 'booked', 'proposal', 'contract'];

/* Pure: takes the fixture stages array, returns a per-stage row
   annotated with percent-of-top (`pct`) and dropoff-from-previous
   (`drop`). Both expressed as 0..1 ratios, plus pre-formatted "%"
   strings for direct render. Kept framework-free so the test can
   eval the funnel math without spinning up React/JSDOM. */
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
      id: String(s?.id || ''),
      label: String(s?.label || s?.id || ''),
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

/* Pure: end-to-end "call → contract" conversion. Surfaced in the
   header chip so an operator sees the headline number before
   reading the per-stage bars. */
function computeFunnelOverall(stages) {
  const list = Array.isArray(stages) ? stages : [];
  if (list.length < 2) return { ratio: 0, percent: '0.0%', top: 0, bottom: 0 };
  const top = Number(list[0]?.count) || 0;
  const bottom = Number(list[list.length - 1]?.count) || 0;
  const ratio = top > 0 ? bottom / top : 0;
  return { ratio, percent: `${(ratio * 100).toFixed(1)}%`, top, bottom };
}

function FunnelChart({ stages }) {
  const rows = React.useMemo(() => computeFunnelRows(stages), [stages]);
  const overall = React.useMemo(() => computeFunnelOverall(stages), [stages]);
  if (rows.length === 0) {
    return (
      <div className="card" data-testid="funnel-chart-empty" style={{padding:'18px 22px'}}>
        <div className="mono dim">no funnel data</div>
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
      style={{padding:'18px 22px'}}
    >
      <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:18, marginBottom:14}}>
        <div>
          <div className="eyebrow eyebrow--accent">booking → revenue · last 30d</div>
          <div className="mono" style={{fontSize:13, color:'var(--text-2)', marginTop:2}}>
            five-stage funnel · percent dropoff at each handoff · fixture-driven in DEMO_MODE
          </div>
        </div>
        <div className="badge badge--healthy" data-testid="funnel-overall-chip" data-funnel-overall-percent={overall.percent}>
          {overall.percent} call → contract
        </div>
      </div>
      <div className="funnel-chart__rows" data-testid="funnel-rows" style={{display:'grid', gap:10}}>
        {rows.map((row, idx) => (
          <div
            key={row.id}
            className="funnel-row"
            data-testid={`funnel-row-${row.id}`}
            data-stage-id={row.id}
            data-stage-index={idx}
            data-stage-count={row.count}
            data-stage-pct={row.pct.toFixed(4)}
            data-stage-drop={row.drop.toFixed(4)}
            style={{display:'grid', gridTemplateColumns:'160px 1fr auto auto', gap:14, alignItems:'center'}}
          >
            <div>
              <div className="mono" style={{fontSize:12, fontWeight:600}}>{row.label}</div>
              <div className="mono dim" style={{fontSize:10, marginTop:2}}>{row.sublabel}</div>
            </div>
            <div
              className="funnel-row__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(row.pct * 100)}
              aria-label={`${row.label}: ${row.pctText} of top of funnel`}
              style={{position:'relative', height:18, background:'var(--bg-inset, rgba(255,255,255,0.04))', borderRadius:'var(--r-sm, 4px)', overflow:'hidden'}}
            >
              <div
                className="funnel-row__bar-fill"
                data-testid={`funnel-bar-fill-${row.id}`}
                style={{width:`${(row.pct * 100).toFixed(2)}%`, height:'100%', background:'var(--sunset-500, #ff5f00)', transition:'width 220ms ease-out'}}
              />
            </div>
            <div className="mono num" style={{fontSize:14, fontWeight:700, textAlign:'right', minWidth:64}} data-testid={`funnel-count-${row.id}`}>
              {row.count.toLocaleString('en-US')}
            </div>
            <div
              className={`mono num ${idx === 0 ? 'dim' : (row.drop >= 0.5 ? 'warn' : 'accent')}`}
              data-testid={`funnel-drop-${row.id}`}
              style={{fontSize:12, fontWeight:600, textAlign:'right', minWidth:64}}
            >
              {row.dropText}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelPage({ setRoute }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);

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
        if (cancelled) return;
        setError(String(err?.message || err));
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const stages = data?.stages || [];
  return (
    <div className="page page--funnel" data-testid="funnel-page" style={{padding:'24px 28px', display:'grid', gap:18}}>
      <header style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:16}}>
        <div>
          <h1 id="console-page-title" className="page__title" style={{margin:0, fontSize:22, fontWeight:700}}>
            Funnel
          </h1>
          <div className="mono dim" style={{fontSize:12, marginTop:4}}>
            call → qualified → booked → proposal → contract · five-stage booking-to-revenue conversion
          </div>
        </div>
      </header>
      {error && (
        <div className="card card--warn" data-testid="funnel-error" style={{padding:'12px 16px'}}>
          <div className="mono">funnel load failed: {error}</div>
        </div>
      )}
      <FunnelChart stages={stages}/>
    </div>
  );
}

Object.assign(globalThis, { FunnelChart, FunnelPage, computeFunnelRows, computeFunnelOverall, FUNNEL_STAGE_ORDER });
