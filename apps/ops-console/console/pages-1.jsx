/* ============================================================
   Pages: Home (Mission Control), Pipeline, Calls
   ============================================================ */

const I2 = window.Icon;

/* ------------------------------------------------------------ */
/* MISSION CONTROL (home) */
/* ------------------------------------------------------------ */
function HomePage({ setRoute }) {
  const D = window.GTM;
  const { stats, sparks, feed, agents, companies, evalSuites } = D;
  const liveCalls = D.calls.slice(0, 3);
  const hotLeads = [...companies].sort((a, b) => b.score - a.score).slice(0, 5);
  const [range, setRange] = useState('today');

  return (
    <div className="page">
      <PageHeader
        title="Mission Control"
        sub="Three agents. Forty-seven open tasks. One thing wants your attention."
        actions={<>
          <Segmented value={range} onChange={(v) => { setRange(v); window.toast(`Range · ${v}`, { sub:'mission control re-scoped' }); }} options={[
            { value:'today', label:'Today' },
            { value:'week', label:'7d' },
            { value:'month', label:'30d' },
          ]} />
          <button className="btn btn--ghost" onClick={() => window.toast('Dashboard refreshed', { sub:'feeds resynced · 3 agents reconnected' })}><I2.Refresh size={14}/>Refresh</button>
          <button className="btn" onClick={() => window.toast('Eval suites queued', { sub:'all 6 suites · ~7 min', tone:'accent' })}><I2.Bolt size={14}/>Run all evals</button>
        </>}
      />

      {/* Attention banner */}
      <div className="card card--violet" style={{marginBottom:18, padding:'14px 18px', display:'flex',alignItems:'center',gap:14}}>
        <span className="dot dot--critical"/>
        <div style={{flex:1}}>
          <div style={{fontWeight:700, fontSize:14}}>
            agent-03 paused on Arcadia call · pricing objection (3 deflections)
          </div>
          <div style={{fontSize:12, color:'var(--text-2)', marginTop:2}}>
            Awaiting human review · CALL-2417 · $520K proposal at risk
          </div>
        </div>
        <button className="btn btn--xs" onClick={() => window.toast('Snoozed 1 hour', { sub:'agent-03 will retry pricing objection', tone:'warn' })}>Snooze 1h</button>
        <button className="btn btn--primary btn--sm" onClick={()=>setRoute('calls')}>Review now <I2.ArrowRight size={12}/></button>
      </div>

      {/* Stats row */}
      <div className="stats" style={{marginBottom:18}}>
        <Stat label="Pipeline" value={stats.pipeline} delta={stats.pipelineDelta}
              spark={sparks.pipeline} accent />
        <Stat label="Calls today" value={stats.callsToday} delta={stats.callsTodayDelta}
              spark={sparks.calls} sparkColor="var(--violet-500)" />
        <Stat label="Qualified · 7d" value={stats.qualifiedThisWeek} delta={stats.qualifiedThisWeekDelta}
              tone="healthy" />
        <Stat label="Avg call score" value={stats.avgScore.toFixed(1)} delta={stats.avgScoreDelta}
              spark={sparks.score} sparkColor="var(--healthy)" />
        <Stat label="Eval pass rate" value={`${(stats.evalPassRate*100).toFixed(1)}%`}
              delta={`+${(stats.evalPassRateDelta*100).toFixed(1)}`}
              spark={sparks.evalPass} sparkColor="var(--sunset-300)" />
      </div>

      <div className="split split--2" style={{marginBottom:18}}>
        {/* Agents column */}
        <div>
          <Card title="agents · in flight" action={<button className="btn btn--xs btn--ghost" onClick={()=>setRoute('settings')}>configure →</button>}>
            <div className="vstack" style={{gap:14}}>
              {agents.map(a => (
                <div key={a.id} style={{display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:14, alignItems:'center', paddingBottom:14, borderBottom:'1px dashed var(--border)'}}>
                  <div style={{width:36, height:36, borderRadius:9, background:'var(--bg-inset)', display:'grid',placeItems:'center', border:'1px solid var(--border)'}}>
                    <I2.Bot size={18}/>
                  </div>
                  <div>
                    <div style={{fontWeight:600, fontSize:14, display:'flex', alignItems:'center', gap:8}}>
                      {a.name}
                      <span className={`badge badge--${a.status === 'active' ? 'healthy' : 'warn'}`}>
                        <span className={`dot dot--${a.status === 'active' ? 'accent' : 'warn'}`} style={{width:5,height:5}}/>
                        {a.status}
                      </span>
                    </div>
                    <div className="mono" style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>
                      {a.role}
                    </div>
                    <div style={{fontSize:12, color:'var(--text-2)', marginTop:6}}>
                      {a.currentTask}
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="mono num" style={{fontSize:18, fontWeight:700}}>{a.tasks}</div>
                    <div className="eyebrow">tasks</div>
                  </div>
                  <div style={{textAlign:'right', minWidth:60}}>
                    <div className="mono num" style={{fontSize:18, fontWeight:700, color: 'var(--healthy-fg)'}}>{(a.success*100).toFixed(0)}%</div>
                    <div className="eyebrow">success</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{marginTop:14, display:'flex', gap:8}}>
              <button className="btn btn--ghost btn--sm" style={{flex:1}} onClick={() => window.toast('All agents resumed', { sub:'queue active · throttled 80%' })}><I2.Play size={12}/>Resume all</button>
              <button className="btn btn--ghost btn--sm" style={{flex:1}} onClick={() => window.toast('Queue paused', { sub:'in-flight tasks will finish', tone:'warn' })}><I2.Pause size={12}/>Pause queue</button>
              <button className="btn btn--ghost btn--sm" style={{flex:1}} onClick={()=>setRoute('settings')}><I2.Sparkle size={12}/>New agent</button>
            </div>
          </Card>

          <div style={{marginTop:18}}>
            <Card title="hot leads · top 5 by score" action={<a className="mono" style={{fontSize:11, color:'var(--accent-fg)'}} onClick={()=>setRoute('pipeline')}>see all 24 →</a>}>
              <div className="vstack" style={{gap:0}}>
                {hotLeads.map(c => (
                  <div key={c.id} style={{display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:14, alignItems:'center', padding:'10px 0', borderBottom:'1px dashed var(--border)'}}>
                    <div>
                      <div style={{fontSize:13, fontWeight:600}}>{c.name}</div>
                      <div className="mono" style={{fontSize:11, color:'var(--text-3)', marginTop:1}}>{c.industry} · {c.size} ppl</div>
                    </div>
                    <Badge tone={c.intent === 'high' ? 'accent' : c.intent === 'med' ? 'warn' : 'neutral'}>{c.intent} intent</Badge>
                    <div style={{width:80}}>
                      <div className="progress"><div className={`progress__fill progress__fill--${c.score >= 80 ? 'healthy' : c.score >= 70 ? 'accent' : 'warn'}`} style={{width:`${c.score}%`}}/></div>
                      <div className="mono num" style={{fontSize:10, color:'var(--text-3)', textAlign:'right', marginTop:2}}>{c.score}/100</div>
                    </div>
                    <button className="btn btn--ghost btn--icon" aria-label={`Open ${c.name} in pipeline`} onClick={()=>setRoute('pipeline')}><I2.ArrowRight size={12}/></button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Console column */}
        <div className="vstack" style={{gap:18}}>
          <ConsolePanel lines={feed.slice(0,8)} title="live · agent.feed" />

          <Card title="next 24h · scheduled">
            <div className="timeline">
              {[
                { t:'in 12m', who:'agent-01', what:'Discovery call · Helix Robotics', kind:'active' },
                { t:'15:00', who:'agent-02', what:'Send recap → Banyan procurement', kind:'queue' },
                { t:'16:00', who:'agent-01', what:'Tech fit call · Kestrel Bio', kind:'queue' },
                { t:'tmrw 09:00', who:'cs-handoff', what:'Thornfield kickoff brief', kind:'queue' },
                { t:'tmrw 14:00', who:'agent-02', what:'Pricing committee · Verdant', kind:'queue' },
              ].map((s,i)=>(
                <div key={i} className={`tl-step ${s.kind === 'active' ? 'tl-step--active' : ''}`}>
                  <div className="tl-step__bullet">{i+1}</div>
                  <div className="tl-step__body">
                    <div className="tl-step__title">{s.what}</div>
                    <div className="tl-step__sub">{s.t} · {s.who}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="evals · regressions watch">
            <div className="vstack" style={{gap:10}}>
              {evalSuites.slice(0,4).map(s => (
                <div key={s.id} style={{display:'grid', gridTemplateColumns:'1fr auto 60px', gap:10, alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:12, fontWeight:600}}>{s.name}</div>
                    <div className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{s.runs.toLocaleString()} runs · {s.latest}</div>
                  </div>
                  <div className="mono num" style={{fontSize:13, fontWeight:700, color: s.pass >= 0.85 ? 'var(--healthy)' : s.pass >= 0.75 ? 'var(--sunset-300)' : 'var(--violet-500)'}}>
                    {(s.pass*100).toFixed(1)}%
                  </div>
                  <div className={`mono num ${s.delta > 0 ? 'cl-ok' : s.delta < 0 ? 'cl-err' : 'dim'}`} style={{fontSize:11, textAlign:'right'}}>
                    {s.delta > 0 ? '▲' : s.delta < 0 ? '▼' : '·'} {(Math.abs(s.delta)*100).toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* PIPELINE */
/* ------------------------------------------------------------ */
function PipelinePage({ setRoute }) {
  const D = window.GTM;
  const [view, setView] = useState('kanban'); // kanban | table
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');

  // Publish the selection to AppContext so the sales coach + intake agents
  // see it as a dynamic variable.
  useEffect(() => {
    window.AppContext.set({ selection: selected ? { type:'lead', id: selected } : null });
  }, [selected]);

  const filtered = D.companies.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'mine') return c.owner === 'agent-01';
    if (filter === 'high') return c.intent === 'high';
    return true;
  });

  return (
    <div className="page">
      <PageHeader
        title="Pipeline"
        sub="Drag to advance. Cards re-score on every signal."
        actions={<>
          <Segmented value={filter} onChange={setFilter} options={[
            { value:'all', label:'All' },
            { value:'mine', label:'Mine' },
            { value:'high', label:'High intent' },
          ]} />
          <Segmented value={view} onChange={setView} options={[
            { value:'kanban', label:'Board' },
            { value:'table', label:'Table' },
          ]} />
          <button className="btn btn--ghost btn--sm" onClick={() => window.toast('Filter editor opened', { sub:'12 saved views available' })}><I2.Filter size={12}/>Filters</button>
          <button className="btn btn--primary btn--sm" onClick={() => window.toast('New lead form ready', { sub:'agent-01 will enrich from domain', tone:'accent' })}><I2.Plus size={12}/>Add lead</button>
        </>}
      />

      {view === 'kanban' && <PipelineKanban companies={filtered} stages={D.stages} onSelect={setSelected} selected={selected}/>}
      {view === 'table' && <PipelineTable companies={filtered} onSelect={setSelected} selected={selected}/>}

      {selected && <LeadDetail company={D.companies.find(c=>c.id===selected)} onClose={()=>setSelected(null)} setRoute={setRoute}/>}
      {selected && <IntakeAgentPanel company={D.companies.find(c=>c.id===selected)} />}
    </div>
  );
}

function PipelineKanban({ companies, stages, onSelect, selected }) {
  return (
    <div className="pipe">
      {stages.map(stage => {
        const cards = companies.filter(c => c.stage === stage.id);
        const sum = cards.reduce((acc, c) => {
          const n = parseFloat(c.dealSize.replace(/[^\d.]/g, ''));
          return acc + n;
        }, 0);
        return (
          <div key={stage.id} className="pipe__col">
            <div className="pipe__col-hd">
              <div className="pipe__col-title">
                <span className={`dot dot--${stage.accent === 'sunset' ? 'accent' : stage.accent === 'violet' ? 'critical' : stage.accent === 'healthy' ? 'healthy' : 'idle'}`}/>
                {stage.label}
              </div>
              <div className="pipe__col-cnt">{cards.length} · ${sum}K</div>
            </div>
            <div className="pipe__col-body">
              {cards.map(c => (
                <div key={c.id} className="pipe__card" onClick={() => onSelect(c.id)}
                     style={{borderColor: selected === c.id ? 'var(--sunset-500)' : undefined}}>
                  <div className="pipe__card-co">
                    <span>{c.name}</span>
                    <span className="mono num" style={{fontSize:11, color:'var(--text-3)'}}>{c.score}</span>
                  </div>
                  <div className="pipe__card-pain">{c.pain}</div>
                  <div className="pipe__card-meta">
                    <span>{c.dealSize} · {c.region.split(',')[0]}</span>
                    <span style={{display:'flex', alignItems:'center', gap:4}}>
                      <span className={`dot dot--${c.intent === 'high' ? 'accent' : c.intent === 'med' ? 'warn' : 'idle'}`} style={{width:5,height:5}}/>
                      {c.lastTouch}
                    </span>
                  </div>
                </div>
              ))}
              {cards.length === 0 && <div className="dim mono" style={{fontSize:11, padding:'14px 6px', textAlign:'center'}}>— empty —</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PipelineTable({ companies, onSelect, selected }) {
  return (
    <div className="card" style={{padding:0, overflow:'hidden'}}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Company</th>
            <th>Stage</th>
            <th>Score</th>
            <th>Intent</th>
            <th className="num">Deal</th>
            <th>Owner</th>
            <th>Next step</th>
            <th>Last touch</th>
          </tr>
        </thead>
        <tbody>
          {companies.map(c => (
            <tr key={c.id} data-selected={selected === c.id} onClick={() => onSelect(c.id)}>
              <td>
                <div style={{fontWeight:600}}>{c.name}</div>
                <div className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{c.industry}</div>
              </td>
              <td><Badge tone={c.stage === 'closed' ? 'healthy' : c.stage === 'lost' ? 'neutral' : c.stage === 'proposal' ? 'accent' : 'warn'}>{c.stage}</Badge></td>
              <td>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <div className="progress" style={{width:60}}><div className={`progress__fill progress__fill--${c.score >= 80 ? 'healthy' : 'accent'}`} style={{width:`${c.score}%`}}/></div>
                  <span className="mono num" style={{fontSize:12}}>{c.score}</span>
                </div>
              </td>
              <td>
                <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
                  <span className={`dot dot--${c.intent === 'high' ? 'accent' : c.intent === 'med' ? 'warn' : 'idle'}`} style={{width:6,height:6}}/>
                  <span className="mono" style={{fontSize:11, textTransform:'uppercase', letterSpacing:'.06em'}}>{c.intent}</span>
                </span>
              </td>
              <td className="num mono">{c.dealSize}</td>
              <td className="mono" style={{fontSize:11}}>{c.owner}</td>
              <td style={{fontSize:12}}>
                <div>{c.nextStep}</div>
                <div className="mono dim" style={{fontSize:10}}>{c.nextStepWhen}</div>
              </td>
              <td className="mono dim" style={{fontSize:11}}>{c.lastTouch}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadDetail({ company: c, onClose, setRoute }) {
  // Treat the side panel as a non-modal dialog: announce it as a region,
  // move focus to the close button on open so keyboard users know it
  // appeared, restore focus to the previously-focused card on close,
  // and let Escape close it. We do NOT trap Tab since the panel sits
  // alongside the kanban — operators want to keep navigating both.
  const closeRef = useRef(null);
  const previousFocusRef = useRef(null);
  useEffect(() => {
    if (!c) return;
    previousFocusRef.current = document.activeElement;
    requestAnimationFrame(() => closeRef.current?.focus());
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        try { previousFocusRef.current.focus(); } catch (_) { /* unmounted */ }
        previousFocusRef.current = null;
      }
    };
  }, [c?.id]);
  if (!c) return null;
  return (
    <div role="dialog" aria-label={`Lead detail · ${c.name}`}
         style={{position:'fixed', right:18, top:74, bottom:18, width:420, background:'var(--bg-elev)', border:'1px solid var(--border-strong)', borderRadius:'var(--r-lg)', boxShadow:'var(--shadow-lg)', zIndex:50, display:'flex', flexDirection:'column', overflow:'hidden'}}>
      <div style={{padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <div className="eyebrow eyebrow--accent">{c.industry}</div>
          <div style={{fontSize:18, fontWeight:700, fontFamily:'var(--font-display)', marginTop:2}}>{c.name}</div>
        </div>
        <button ref={closeRef} className="btn btn--ghost btn--icon" aria-label="Close lead detail" onClick={onClose}><I2.Close size={14}/></button>
      </div>
      <div className="scroll" style={{flex:1, padding:18}}>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16}}>
          <div><div className="eyebrow">Score</div><div className="mono num" style={{fontSize:24, fontWeight:700, color: 'var(--healthy-fg)'}}>{c.score}</div></div>
          <div><div className="eyebrow">Close prob</div><div className="mono num" style={{fontSize:24, fontWeight:700}}>{(c.closeProb*100).toFixed(0)}%</div></div>
          <div><div className="eyebrow">Deal size</div><div className="mono num" style={{fontSize:18, fontWeight:600}}>{c.dealSize}</div></div>
          <div><div className="eyebrow">ARR · current</div><div className="mono num" style={{fontSize:18, fontWeight:600}}>{c.arr}</div></div>
        </div>

        <div className="eyebrow eyebrow--accent" style={{marginBottom:6}}>The pain</div>
        <div style={{fontSize:13, lineHeight:1.55, padding:12, background:'var(--bg-inset)', borderRadius:'var(--r-md)', borderLeft:'2px solid var(--sunset-500)', marginBottom:16}}>
          {c.pain}
        </div>

        <div className="eyebrow" style={{marginBottom:6}}>Stack</div>
        <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:16}}>
          {c.techStack.map(t => <span key={t} className="badge badge--neutral">{t}</span>)}
        </div>

        <div className="eyebrow" style={{marginBottom:6}}>Next step</div>
        <div style={{fontSize:13, marginBottom:4}}>{c.nextStep}</div>
        <div className="mono dim" style={{fontSize:11, marginBottom:16}}>{c.nextStepWhen} · owner {c.owner}</div>

        <div className="eyebrow" style={{marginBottom:6}}>Recent activity</div>
        <div className="timeline">
          {[
            { t:'45m', who:'agent-02', what:'Call completed · score 8.7', kind:'done' },
            { t:'2h', who:'agent-02', what:'Recap email sent → procurement', kind:'done' },
            { t:'5h', who:'system', what:'Intent surge · pricing page ×3', kind:'done' },
            { t:'1d', who:'agent-02', what:'Proposal v2 dispatched', kind:'done' },
            { t:'now', who:'agent-02', what:'Awaiting redlines', kind:'active' },
          ].map((s,i)=>(
            <div key={i} className={`tl-step tl-step--${s.kind}`}>
              <div className="tl-step__bullet">{s.kind==='done' ? '✓' : '·'}</div>
              <div className="tl-step__body">
                <div className="tl-step__title">{s.what}</div>
                <div className="tl-step__sub">{s.t} · {s.who}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{padding:12, borderTop:'1px solid var(--border)', display:'flex', gap:8}}>
        {c.artifacts && c.artifacts.find(a => a.type === 'json') && (
          <button className="btn btn--ghost btn--sm" style={{flex:1}} onClick={() => window.open(c.artifacts.find(a => a.type === 'json').webPath || '#', '_blank')}><I2.Doc size={12}/>JSON Schema</button>
        )}
        <button className="btn btn--ghost btn--sm" style={{flex:1}} onClick={()=>setRoute('calls')}><I2.Phone size={12}/>Calls</button>
        <button className="btn btn--primary btn--sm" style={{flex:1}} onClick={() => { window.toast(`Opening proposal`, { tone:'accent' }); setRoute('proposals'); onClose(); }}>Proposals <I2.ArrowRight size={12}/></button>
      </div>
    </div>
  );
}

function IntakeAgentPanel({ company }) {
  const reg = window.AGENT_REGISTRY?.byKey('intake');
  if (!reg) return null;
  const [open, setOpen] = useState(false);
  return (
    <div style={{position:'fixed', right:454, top:74, bottom:18, width:380, background:'var(--bg-elev)', border:'1px solid var(--border-strong)', borderRadius:'var(--r-lg)', boxShadow:'var(--shadow-lg)', zIndex:49, display:'flex', flexDirection:'column', overflow:'hidden'}} role="region" aria-label="Intake agent panel">
      <div style={{padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10}}>
        <span aria-hidden="true" style={{width:28, height:28, borderRadius:'50%', background:`radial-gradient(circle at 30% 30%, ${reg.avatar_color_1}, ${reg.avatar_color_2})`}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:13, fontWeight:700}}>{reg.display_name}</div>
          <div className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{reg.role} · loaded with {company?.name || 'no lead'}</div>
        </div>
        <button className="btn btn--ghost btn--xs" onClick={()=>setOpen(o=>!o)} aria-expanded={open}>
          {open ? 'Collapse' : 'Talk to Sarah'}
        </button>
      </div>
      {open && (
        <div style={{flex:1, padding:0, minHeight:0, display:'flex', flexDirection:'column'}}>
          <window.ConvaiWidget agentKey="intake" textOnly={true} expanded={true} height="100%" width="100%"/>
        </div>
      )}
      {!open && (
        <div style={{padding:'14px 18px', fontSize:12, color:'var(--text-2)', lineHeight:1.5}}>
          Click <strong>Talk to Sarah</strong> to qualify this lead with the live ElevenLabs intake agent. She sees the selected company as ground truth and can book the discovery call.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ */
/* CALLS */
/* ------------------------------------------------------------ */
function CallsPage() {
  const D = window.GTM;
  const [activeId, setActiveId] = useState('CALL-2419');
  const active = D.calls.find(c => c.id === activeId);

  // Publish active call to AppContext for the sales coach.
  useEffect(() => {
    window.AppContext.set({ selection: { type:'call', id: activeId }});
    return () => { window.AppContext.set({ selection: null }); };
  }, [activeId]);

  return (
    <div className="calls-page page" style={{maxWidth:'none', padding:'22px 24px 22px'}}>
      <PageHeader
        title="Calls"
        sub="Live transcripts, scored on a seven-axis rubric. Click a line to add a coaching note."
        actions={<>
          <button className="btn btn--ghost btn--sm" onClick={() => window.toast('Filtered to this week', { sub:'7 calls · 1 flagged' })}><I2.Filter size={12}/>This week</button>
          <button className="btn btn--ghost btn--sm" onClick={() => window.toast('Coaching mode on', { sub:'click any line to leave a note', tone:'accent' })}><I2.Mic size={12}/>Coaching mode</button>
        </>}
      />

      <div className="calls-grid">
        {/* Call list */}
        <Card title="recent · sorted by recency" className="card--accent calls-grid__list" >
          <div className="vstack" style={{gap:6}}>
            {D.calls.map(c => (
              <div key={c.id}
                   role="button"
                   tabIndex={0}
                   aria-pressed={activeId === c.id}
                   onClick={()=>setActiveId(c.id)}
                   onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveId(c.id); } }}
                   style={{padding:10, borderRadius:8, cursor:'pointer', border:'1px solid', borderColor: activeId === c.id ? 'var(--sunset-500)' : 'transparent', background: activeId === c.id ? 'var(--bg-selected)' : 'transparent'}}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                  <span className="mono" style={{fontSize:11, color:'var(--accent-fg)', fontWeight:600}}>{c.id}</span>
                  <span className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{c.when}</span>
                </div>
                <div style={{fontSize:13, fontWeight:600, marginBottom:2}}>{c.co}</div>
                <div className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{c.who}</div>
                <div style={{display:'flex', gap:6, marginTop:6, alignItems:'center'}}>
                  <Badge tone={c.score >= 8 ? 'healthy' : c.score >= 7 ? 'accent' : c.score >= 5 ? 'warn' : 'critical'}>
                    {c.score.toFixed(1)}
                  </Badge>
                  <span className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{c.duration}</span>
                  {c.flags > 0 && <span className="badge badge--critical" style={{marginLeft:'auto'}}><I2.Flag size={9}/>{c.flags}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Transcript */}
        <Card title={`${active.id} · ${active.co} · ${active.who}`}
              className="calls-grid__transcript"
              action={<div style={{display:'flex', gap:6, alignItems:'center'}}>
                <span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{active.duration}</span>
                <button className="btn btn--ghost btn--xs" onClick={() => window.toast('Audio playback started', { sub:`${active.id} · ${active.duration}` })}><I2.Play size={10}/>play</button>
                <button className="btn btn--ghost btn--xs" onClick={() => window.toast('Recap email drafted', { sub:'review before sending →', tone:'accent' })}><I2.Mail size={10}/>recap</button>
              </div>}>
          <div className="trans calls-grid__trans-scroll" aria-label="Call transcript">
            {D.transcriptBanyan.map((l,i) => (
              <div key={i}
                   className="trans__line"
                   data-flag={!!l.flag}
                   role="button"
                   tabIndex={0}
                   aria-label={`Add coaching note at ${l.t}`}
                   onClick={() => window.toast(`Coaching note · ${l.t}`, { sub:`${l.who.toUpperCase()}: ${l.txt.slice(0,60)}…`, tone:'accent' })}
                   onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.toast(`Coaching note · ${l.t}`, { sub:`${l.who.toUpperCase()}: ${l.txt.slice(0,60)}…`, tone:'accent' }); } }}
                   style={{cursor:'pointer'}}>
                <span className="trans__time">{l.t}</span>
                <span className={`trans__who trans__who--${l.who}`}>
                  {l.who === 'agent' ? 'AGENT' : l.who === 'caller' ? 'PRIYA' : 'SYS'}
                </span>
                <span className="trans__txt">{l.txt}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Scorecard + actions */}
        <div className="vstack calls-grid__side">
          <Card title="scorecard · 7 axes" accent="accent">
            <div style={{textAlign:'center', marginBottom:14, paddingBottom:14, borderBottom:'1px solid var(--border)'}}>
              <div className="eyebrow">overall</div>
              <div style={{fontFamily:'var(--font-display)', fontSize:48, fontWeight:800, color: 'var(--healthy-fg)', lineHeight:1}}>
                {active.score.toFixed(1)}
              </div>
              <div className="mono" style={{fontSize:10, color:'var(--text-3)'}}>vs team avg 7.6</div>
            </div>
            {D.callScores.map(s => (
              <div key={s.axis} className="axis">
                <div>
                  <div className="axis__name">{s.axis}</div>
                  <div className="axis__detail">{s.detail}</div>
                </div>
                <div style={{width:50}}>
                  <div className="progress"><div className={`progress__fill progress__fill--${s.score >= 8 ? 'healthy' : s.score >= 7 ? 'accent' : 'warn'}`} style={{width:`${s.score*10}%`}}/></div>
                </div>
                <div className="num mono" style={{textAlign:'right', fontWeight:600}}>{s.score.toFixed(1)}</div>
                <div className="axis__weight">{s.weight}%</div>
              </div>
            ))}
          </Card>

          <Card title="signals" >
            <div className="vstack" style={{gap:6, fontSize:12}}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span className="muted">Talk ratio</span>
                <span className="mono num">{(active.talkRatio*100).toFixed(0)}% rep</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span className="muted">Sentiment</span>
                <span className="mono num cl-ok">+{(active.sentiment*100).toFixed(0)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span className="muted">Deflections</span>
                <span className="mono num">{active.deflections}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span className="muted">Outcome</span>
                <Badge tone="accent">{active.outcome}</Badge>
              </div>
            </div>
          </Card>

          <Card title="suggested next">
            <div className="vstack" style={{gap:8}}>
              <button className="btn btn--primary btn--sm" style={{width:'100%', justifyContent:'flex-start'}} onClick={() => window.toast('Recap sent to procurement', { sub:'priya@banyan.health · cc marcus', tone:'accent' })}><I2.Mail size={12}/>Send recap to procurement</button>
              <button className="btn btn--sm" style={{width:'100%', justifyContent:'flex-start'}} onClick={() => window.toast('Security review booked', { sub:'Thursday 3:30pm · 30 min' })}><I2.Calendar size={12}/>Book security review</button>
              <button className="btn btn--ghost btn--sm" style={{width:'100%', justifyContent:'flex-start'}} onClick={() => window.toast('Proposal v3 generating', { sub:'~2 min · agent-02 · diff vs v2 incl.', tone:'accent' })}><I2.Doc size={12}/>Generate proposal v3</button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HomePage, PipelinePage, CallsPage });
