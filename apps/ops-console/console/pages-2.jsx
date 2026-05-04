/* ============================================================
   Pages: Evals, Proposals, Settings
   ============================================================ */

const I3 = window.Icon;

/* ------------------------------------------------------------ */
/* EVALS */
/* ------------------------------------------------------------ */
function EvalsPage() {
  const D = window.GTM;
  const [activeId, setActiveId] = useState('discovery-q1');
  const active = D.evalSuites.find(s => s.id === activeId);

  return (
    <div className="page">
      <PageHeader
        title="Evals"
        sub="Every conversation is graded by a panel of judge models. Drill into a regression to see what changed."
        actions={<>
          <a className="btn btn--ghost btn--sm" href="../eval-runs/" target="_blank" rel="noopener noreferrer"><I3.Doc size={12}/>Eval runs ↗</a>
          <a className="btn btn--ghost btn--sm" href="../evaluation/" target="_blank" rel="noopener noreferrer"><I3.Beaker size={12}/>Eval dashboard ↗</a>
          <button className="btn btn--ghost btn--sm" onClick={() => window.toast('Re-running 6 suites', { sub:'~7 min · output streams to console', tone:'accent' })}><I3.Refresh size={12}/>Re-run all</button>
          <button className="btn btn--primary btn--sm" onClick={() => window.toast('New suite scaffolded', { sub:'edit prompts in eval policy →' })}><I3.Plus size={12}/>New suite</button>
        </>}
      />

      <div className="stats" style={{marginBottom:18}}>
        <Stat label="Suites" value="6" />
        <Stat label="Total runs · 24h" value="7,690" delta={12} spark={D.sparks.calls} sparkColor="var(--violet-500)" />
        <Stat label="Avg pass rate" value="84.7%" delta={2.4} tone="healthy" spark={D.sparks.evalPass} sparkColor="var(--healthy)" accent />
        <Stat label="Regressions" value="1" tone="critical" />
        <Stat label="Cost · 24h" value="$142.18" delta={-8} />
      </div>

      <div className="split split--2">
        {/* Suites table */}
        <Card title="suites" action={<button className="btn btn--ghost btn--xs" onClick={() => window.toast('Suites filtered', { sub:'showing 4 of 6' })}><I3.Filter size={10}/>filter</button>}>
          <div className="vstack" style={{gap:0}}>
            {D.evalSuites.map(s => (
              <div key={s.id} onClick={()=>setActiveId(s.id)}
                   style={{padding:'12px 4px', borderBottom:'1px dashed var(--border)', display:'grid', gridTemplateColumns:'1fr 90px 80px 60px', gap:14, alignItems:'center', cursor:'pointer', borderLeft: activeId === s.id ? '2px solid var(--sunset-500)' : '2px solid transparent', paddingLeft: activeId === s.id ? 10 : 4}}>
                <div>
                  <div style={{fontSize:13, fontWeight:600, marginBottom:2}}>{s.name}</div>
                  <div className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{s.runs.toLocaleString()} runs · last {s.latest} · {s.owner}</div>
                </div>
                <div>
                  <div className="progress" style={{marginBottom:4}}>
                    <div className={`progress__fill progress__fill--${s.pass >= 0.85 ? 'healthy' : s.pass >= 0.75 ? 'accent' : 'warn'}`} style={{width:`${s.pass*100}%`}}/>
                  </div>
                  <div className="mono num" style={{fontSize:11, color:'var(--text-2)'}}>{(s.pass*100).toFixed(1)}%</div>
                </div>
                <div className={`mono num ${s.delta > 0 ? 'cl-ok' : s.delta < 0 ? 'cl-err' : 'dim'}`} style={{fontSize:12, fontWeight:600, textAlign:'right'}}>
                  {s.delta > 0 ? '▲' : s.delta < 0 ? '▼' : '·'} {(Math.abs(s.delta)*100).toFixed(1)}%
                </div>
                <button className="btn btn--ghost btn--icon" aria-label={`Re-run ${s.name}`} onClick={(e)=>{e.stopPropagation(); window.toast(`Re-running ${s.name}`, { sub:`${s.runs} cases · ~90s`, tone:'accent' });}}><I3.Play size={12}/></button>
              </div>
            ))}
          </div>
        </Card>

        {/* Suite detail */}
        <div className="vstack" style={{gap:18}}>
          <Card title={`detail · ${active.id}`} accent={active.delta < 0 ? 'violet' : 'accent'}>
            <div style={{fontSize:15, fontWeight:600, marginBottom:8}}>{active.name}</div>
            <div className="mono" style={{fontSize:11, color:'var(--text-3)', marginBottom:14}}>
              owner: {active.owner} · last: {active.latest}
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18}}>
              <div>
                <div className="eyebrow">Pass rate</div>
                <div style={{fontFamily:'var(--font-display)', fontSize:32, fontWeight:800, color: 'var(--healthy-fg)'}}>{(active.pass*100).toFixed(1)}%</div>
              </div>
              <div>
                <div className="eyebrow">Δ vs prev</div>
                <div style={{fontFamily:'var(--font-display)', fontSize:32, fontWeight:800, color: active.delta > 0 ? 'var(--healthy)' : active.delta < 0 ? 'var(--violet-500)' : 'var(--text-2)'}}>
                  {active.delta > 0 ? '+' : ''}{(active.delta*100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="eyebrow" style={{marginBottom:6}}>14-day trend</div>
            <Sparkline data={[.81,.82,.83,.82,.84,.85,.83,.86,.84,.87,.85,.88,.86,active.pass]} h={56} w={300} fill={true}/>
          </Card>

          <Card title="latest failures · 3 of 28">
            <div className="vstack" style={{gap:10}}>
              {[
                { id:'run-7882', case:'Pricing pushback · enterprise', why:'Conceded 12% on first ask · violates negotiation policy', sev:'high' },
                { id:'run-7847', case:'Multi-thread · 4-stakeholder map', why:'Failed to identify economic buyer; mapped to user buyer', sev:'med' },
                { id:'run-7821', case:'Compliance · PHI in transcript', why:'Quoted patient identifier in summary email', sev:'high' },
              ].map(f => (
                <div key={f.id} style={{padding:'10px 12px', background:'var(--bg-inset)', borderRadius:'var(--r-md)', borderLeft:`2px solid var(--${f.sev === 'high' ? 'violet-500' : 'sunset-300'})`}}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                    <span className="mono" style={{fontSize:11, fontWeight:600, color: f.sev === 'high' ? 'var(--violet-fg)' : 'var(--accent-fg)'}}>{f.id}</span>
                    <Badge tone={f.sev === 'high' ? 'critical' : 'warn'}>{f.sev}</Badge>
                  </div>
                  <div style={{fontSize:13, fontWeight:600, marginBottom:2}}>{f.case}</div>
                  <div style={{fontSize:12, color:'var(--text-2)'}}>{f.why}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="judge panel">
            <div className="vstack" style={{gap:8}}>
              {[
                { name:'judge-precision', model:'haiku-4.5', agree:0.94 },
                { name:'judge-tone',      model:'haiku-4.5', agree:0.91 },
                { name:'judge-policy',    model:'sonnet-4.5', agree:0.97 },
              ].map(j => (
                <div key={j.name} style={{display:'grid', gridTemplateColumns:'1fr auto 60px', gap:12, alignItems:'center', fontSize:12}}>
                  <div>
                    <div className="mono" style={{fontSize:12, fontWeight:600}}>{j.name}</div>
                    <div className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{j.model}</div>
                  </div>
                  <div className="progress" style={{width:80}}>
                    <div className="progress__fill progress__fill--healthy" style={{width:`${j.agree*100}%`}}/>
                  </div>
                  <div className="mono num" style={{fontSize:12, textAlign:'right'}}>{(j.agree*100).toFixed(0)}%</div>
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
/* PROPOSALS */
/* ------------------------------------------------------------ */
function ProposalsPage({ setRoute }) {
  const D = window.GTM;
  const [activeId, setActiveId] = useState('PR-2041');
  const [filter, setFilter] = useState('all');
  const active = D.proposals.find(p => p.id === activeId) || D.proposals[0];
  const filtered = D.proposals.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'mine') return p.owner === 'agent-02';
    if (filter === 'open') return p.stage !== 'signed';
    return true;
  });

  // Publish active proposal so the sales coach can copilot it.
  useEffect(() => {
    window.AppContext.set({ selection: { type:'proposal', id: activeId }});
    return () => { window.AppContext.set({ selection: null }); };
  }, [activeId]);

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${filtered.length} active · $${D.proposals.reduce((s,p) => s + parseInt((p.amount||'0').replace(/\D/g,'')), 0)}K total`}
        title="Proposals"
        sub="Each proposal is auto-assembled from call signals, scoped, and tracked through redlines."
        actions={<>
          <Segmented value={filter} onChange={setFilter} options={[
            { value:'all', label:'All' },
            { value:'mine', label:'Mine' },
            { value:'open', label:'Open' },
          ]} />
          <button className="btn btn--primary btn--sm" onClick={() => setRoute('generate')}><I3.Plus size={12}/>Generate proposal</button>
        </>}
      />

      <div className="split split--2">
        <Card title={`active proposals · ${filtered.length}`} className="card--accent">
          <div className="vstack" style={{gap:0}}>
            {filtered.map(p => (
              <div key={p.id}
                   role="button"
                   tabIndex={0}
                   aria-pressed={activeId === p.id}
                   onClick={()=>setActiveId(p.id)}
                   onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveId(p.id); } }}
                   style={{padding:'14px 4px', borderBottom:'1px dashed var(--border)', display:'grid', gridTemplateColumns:'1fr auto', gap:12, cursor:'pointer', borderLeft: activeId === p.id ? '2px solid var(--sunset-500)' : '2px solid transparent', paddingLeft: activeId === p.id ? 10 : 4}}>
                <div>
                  <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                    <span className="mono" style={{fontSize:11, color:'var(--accent-fg)', fontWeight:600}}>{p.id}</span>
                    <Badge tone={p.stage === 'signed' ? 'healthy' : p.stage === 'legal' || p.stage === 'redlines' ? 'warn' : 'accent'}>{p.stage}</Badge>
                    {p.blockers.length > 0 && <Badge tone="critical">{p.blockers.length} blocker{p.blockers.length > 1 ? 's' : ''}</Badge>}
                  </div>
                  <div style={{fontSize:14, fontWeight:600, marginBottom:2}}>{p.co}</div>
                  <div className="mono" style={{fontSize:11, color:'var(--text-3)'}}>
                    sent {p.sent} · viewed {p.viewed} · {p.accepted}/{p.sections} sections accepted
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="mono num" style={{fontSize:18, fontWeight:700, fontFamily:'var(--font-display)'}}>{p.amount}</div>
                  <div className="eyebrow">value</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="vstack" style={{gap:18}}>
          <Card title={`detail · ${active.id}`} accent={active.blockers.length > 0 ? 'violet' : 'accent'}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14}}>
              <div>
                <div style={{fontSize:18, fontWeight:700, fontFamily:'var(--font-display)'}}>{active.co}</div>
                <div className="mono" style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>{active.id} · owner {active.owner}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:'var(--font-display)', fontSize:32, fontWeight:800, color:'var(--accent-fg)'}}>{active.amount}</div>
                <div className="eyebrow">annual</div>
              </div>
            </div>

            <div className="eyebrow" style={{marginBottom:8}}>Section progress · {active.accepted}/{active.sections}</div>
            <div style={{display:'flex', gap:4, marginBottom:18}}>
              {Array.from({length:active.sections}).map((_,i)=>(
                <div key={i} style={{flex:1, height:8, borderRadius:2, background: i < active.accepted ? 'var(--healthy)' : 'var(--bg-inset)', border: '1px solid var(--border)'}}/>
              ))}
            </div>

            {active.blockers.length > 0 && (
              <>
                <div className="eyebrow eyebrow--accent" style={{marginBottom:8}}>Blockers · {active.blockers.length}</div>
                <div className="vstack" style={{gap:6, marginBottom:14}}>
                  {active.blockers.map((b,i)=>(
                    <div key={i} style={{padding:10, background:'rgba(207,60,105,.08)', borderLeft:'2px solid var(--violet-500)', borderRadius:'var(--r-md)', fontSize:13}}>
                      {b}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{display:'flex', gap:8, marginTop:14}}>
              <button className="btn btn--ghost btn--sm" style={{flex:1}} onClick={() => window.toast(`${active.co} · ${active.title}`, { sub:'opened in viewer' })}><I3.Eye size={12}/>Open</button>
              <button className="btn btn--ghost btn--sm" style={{flex:1}} onClick={() => window.toast(`Re-sent to ${active.contact}`, { sub:'tracking pixel attached', tone:'accent' })}><I3.Mail size={12}/>Re-send</button>
              <button className="btn btn--primary btn--sm" style={{flex:1}} onClick={() => window.toast('Drafting v3 with blockers addressed', { sub:`${active.blockers?.length || 2} items · agent-02`, tone:'accent' })}>Address blockers</button>
            </div>
          </Card>

          <Card title="proposal sections">
            <div className="vstack" style={{gap:0}}>
              {[
                { n:'Executive summary',  status:'accepted', who:'Priya' },
                { n:'Scope of work · Phase 1', status:'accepted', who:'Priya' },
                { n:'Scope · Phase 2 · Recon engine', status:'accepted', who:'Marcus' },
                { n:'Implementation timeline', status:'accepted', who:'Marcus' },
                { n:'Pricing · banded', status:'accepted', who:'Marcus' },
                { n:'Liability cap', status:'redline', who:'Reena' },
                { n:'Auto-renewal terms', status:'redline', who:'Reena' },
              ].map((s,i)=>(
                <div key={i} style={{display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:10, alignItems:'center', padding:'8px 0', borderBottom:'1px dashed var(--border)'}}>
                  <div style={{width:18,height:18,borderRadius:'50%', background: s.status === 'accepted' ? 'var(--healthy)' : 'var(--bg-inset)', border: s.status === 'redline' ? '2px solid var(--violet-500)' : 'none', display:'grid', placeItems:'center', fontSize:10, color:'white'}}>
                    {s.status === 'accepted' && '✓'}
                  </div>
                  <div style={{fontSize:13}}>{s.n}</div>
                  <span className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{s.who}</span>
                  <Badge tone={s.status === 'accepted' ? 'healthy' : 'critical'}>{s.status}</Badge>
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
/* SETTINGS */
/* ------------------------------------------------------------ */
function SettingsPage({ setRoute }) {
  const [tab, setTab] = useState('integrations');
  const tabs = [
    { id:'integrations', label:'Integrations' },
    { id:'evals',     label:'Eval policy' },
    { id:'team',      label:'Team' },
    { id:'billing',   label:'Billing' },
    { id:'security',  label:'Security' },
  ];
  const tabRefs = useRef({});

  // ARIA tabs pattern (manual activation): roving tabindex so only the
  // selected tab is in the document tab order, ArrowLeft/Right + Home/End
  // move focus and selection across tabs. Enter/Space were already handled.
  function onTabKeyDown(e, idx) {
    let nextIdx = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIdx = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = tabs.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    const nextId = tabs[nextIdx].id;
    setTab(nextId);
    requestAnimationFrame(() => tabRefs.current[nextId]?.focus());
  }

  return (
    <div className="page">
      <PageHeader eyebrow="workspace · helix" title="Settings"
        sub="The controls behind the autonomy."
        actions={
          <button className="btn btn--ghost btn--sm" onClick={() => setRoute && setRoute('agents')}>
            <I3.Bot size={12}/>Manage agents →
          </button>
        }/>

      <div className="settings-grid">
        <div className="settings-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
          {tabs.map((t, idx) => (
            <div key={t.id}
                 ref={(el) => { tabRefs.current[t.id] = el; }}
                 id={`settings-tab-${t.id}`}
                 className="settings-nav__item"
                 role="tab"
                 tabIndex={tab === t.id ? 0 : -1}
                 aria-selected={tab === t.id}
                 aria-controls={`settings-panel-${t.id}`}
                 data-active={tab === t.id}
                 onClick={()=>setTab(t.id)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(t.id); return; }
                   onTabKeyDown(e, idx);
                 }}>
              {t.label}
            </div>
          ))}
        </div>

        <div role="tabpanel"
             id={`settings-panel-${tab}`}
             aria-labelledby={`settings-tab-${tab}`}
             tabIndex={0}>
          {tab === 'integrations' && <IntegrationsSettings/>}
          {tab === 'evals' && <EvalPolicySettings/>}
          {tab === 'team' && <TeamSettings/>}
          {tab === 'billing' && <BillingSettings/>}
          {tab === 'security' && <SecuritySettings/>}
        </div>
      </div>
    </div>
  );
}

function AgentsSettings() {
  const [aggressive, setAggressive] = useState(true);
  const [autoCall, setAutoCall] = useState(false);
  return (
    <Card title="agent · hunter" className="card--accent" action={<Badge tone="healthy"><span className="dot dot--accent" style={{width:5,height:5}}/>active</Badge>}>
      <div className="field">
        <div className="field__label">Display name</div>
        <input className="input" defaultValue="Hunter" />
      </div>
      <div className="field">
        <div className="field__label">Role</div>
        <select className="select" defaultValue="outbound-discovery">
          <option value="outbound-discovery">Outbound + Discovery</option>
          <option>Inbound qualification</option>
          <option>Multi-thread engagement</option>
        </select>
      </div>
      <div className="field">
        <div className="field__label">Model</div>
        <select className="select" defaultValue="claude-sonnet-4.5">
          <option>claude-sonnet-4.5</option>
          <option>claude-haiku-4.5</option>
          <option>claude-opus-4.1</option>
        </select>
        <div className="field__hint">Sonnet recommended for discovery; Haiku for high-volume sequencing.</div>
      </div>
      <div className="field">
        <div className="field__label">System prompt · 4,127 chars</div>
        <textarea className="textarea" rows={5} defaultValue="You are Hunter, a senior SDR. Prioritize quantifying pain over feature pitching. Always close with a named next step and a named stakeholder. Refuse to discuss pricing on the first call unless the prospect explicitly asks twice — defer to the proposal." />
      </div>

      <div className="divider"/>

      <div className="field" style={{display:'grid', gridTemplateColumns:'1fr auto', gap:12, marginBottom:14}}>
        <div>
          <div style={{fontSize:13, fontWeight:600}}>Aggressive multi-thread</div>
          <div className="field__hint">Reach 3+ stakeholders before the discovery call. May reduce reply rate by ~6% but doubles deal size.</div>
        </div>
        <div className="switch" data-on={aggressive} onClick={()=>setAggressive(!aggressive)}/>
      </div>
      <div className="field" style={{display:'grid', gridTemplateColumns:'1fr auto', gap:12, marginBottom:14}}>
        <div>
          <div style={{fontSize:13, fontWeight:600}}>Auto-place outbound calls</div>
          <div className="field__hint">Allow agent to dial without human approval. Recommended off until trust score &gt;90%.</div>
        </div>
        <div className="switch" data-on={autoCall} onClick={()=>setAutoCall(!autoCall)}/>
      </div>

      <div className="divider"/>

      <div className="field">
        <div className="field__label">Daily task budget</div>
        <input className="input" type="text" defaultValue="120 tasks · $35 spend cap" />
      </div>

      <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:18}}>
        <button className="btn btn--ghost btn--sm" onClick={() => window.toast('Changes discarded')}>Discard</button>
        <button className="btn btn--primary btn--sm" onClick={() => window.toast('Settings saved', { sub:'agent policy v14 · live', tone:'accent' })}>Save changes</button>
      </div>
    </Card>
  );
}

function IntegrationsSettings() {
  const conns = [
    { name:'Salesforce', status:'connected', sub:'helix.my.salesforce.com · OAuth · 4d ago', icon:'SF' },
    { name:'Gong',       status:'connected', sub:'streaming · 47 calls · 24h', icon:'G' },
    { name:'Slack',      status:'connected', sub:'#gtm-ops · 14 channels watched', icon:'#' },
    { name:'Outreach',   status:'syncing',   sub:'sequence sync paused · 502 retry 3/5', icon:'O' },
    { name:'HubSpot',    status:'disabled',  sub:'available · click to connect', icon:'H' },
    { name:'Snowflake',  status:'connected', sub:'warehouse: HELIX_GTM · read+write · ANALYST role', icon:'❄' },
  ];
  return (
    <Card title="integrations · 5 of 6 connected">
      <div className="vstack" style={{gap:10}}>
        {conns.map(c => (
          <div key={c.name} style={{display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:14, alignItems:'center', padding:'12px 14px', background:'var(--bg-inset)', borderRadius:'var(--r-md)', border:'1px solid var(--border)'}}>
            <div style={{width:36, height:36, background:'var(--bg-elev)', border:'1px solid var(--border)', borderRadius:8, display:'grid', placeItems:'center', fontFamily:'var(--font-display)', fontWeight:700, fontSize:14, color:'var(--accent-fg)'}}>{c.icon}</div>
            <div>
              <div style={{fontSize:13, fontWeight:600}}>{c.name}</div>
              <div className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{c.sub}</div>
            </div>
            <Badge tone={c.status === 'connected' ? 'healthy' : c.status === 'syncing' ? 'warn' : 'neutral'}>{c.status}</Badge>
            <button className="btn btn--ghost btn--sm" onClick={() => window.toast(c.status === 'disabled' ? `Connecting ${c.name}…` : `${c.name} configuration opened`, { sub: c.status === 'disabled' ? 'oauth window will open' : 'mappings · field sync · webhooks', tone: c.status === 'disabled' ? 'accent' : undefined })}>{c.status === 'disabled' ? 'Connect' : 'Configure'}</button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EvalPolicySettings() {
  return (
    <Card title="eval · policy">
      <EvalPolicyForm/>
    </Card>
  );
}

function EvalPolicyForm() {
  const [freq, setFreq] = useState('hourly');
  return (
    <>
      <div className="field">
        <div className="field__label">Run frequency</div>
        <Segmented value={freq} onChange={setFreq} options={[
          { value:'realtime', label:'Real-time' }, { value:'hourly', label:'Hourly' }, { value:'daily', label:'Daily' },
        ]}/>
      </div>
      <div className="field">
        <div className="field__label">Regression threshold</div>
        <input className="input" defaultValue="-2.0% (alert) · -5.0% (auto-pause agent)"/>
      </div>
      <div className="field">
        <div className="field__label">Judge consensus required</div>
        <input className="input" defaultValue="2 of 3 judges must agree" type="text"/>
        <div className="field__hint">Higher consensus reduces false positives but increases cost ~1.6×.</div>
      </div>
      <div className="field">
        <div className="field__label">Failure → pager</div>
        <input className="input" defaultValue="#gtm-ops · pagerduty: gtm-oncall"/>
      </div>
      <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:14}}>
        <button className="btn btn--ghost btn--sm" onClick={() => window.toast('Policy reverted')}>Revert</button>
        <button className="btn btn--primary btn--sm" onClick={() => window.toast('Eval policy saved', { sub:`frequency · ${freq}`, tone:'accent' })}>Save policy</button>
      </div>
    </>
  );
}

function TeamSettings() {
  const team = [
    { name:'Rae Park',     role:'Admin',    email:'rae@helix.io',     last:'now' },
    { name:'Jordan Liu',   role:'Operator', email:'jordan@helix.io',  last:'14m ago' },
    { name:'Sam Okafor',   role:'Operator', email:'sam@helix.io',     last:'1h ago' },
    { name:'Maya Cohen',   role:'Reviewer', email:'maya@helix.io',    last:'yesterday' },
  ];
  return (
    <Card title={`team · ${team.length} members`} action={<button className="btn btn--primary btn--sm" onClick={() => window.toast('Invite link copied', { sub:'expires in 7 days', tone:'accent' })}><I3.Plus size={12}/>Invite</button>}>
      <table className="tbl">
        <thead><tr><th>Member</th><th>Role</th><th>Last active</th><th></th></tr></thead>
        <tbody>
          {team.map(m => (
            <tr key={m.email}>
              <td><div style={{fontWeight:600}}>{m.name}</div><div className="mono dim" style={{fontSize:11}}>{m.email}</div></td>
              <td><Badge tone={m.role === 'Admin' ? 'accent' : 'neutral'}>{m.role}</Badge></td>
              <td className="mono dim" style={{fontSize:11}}>{m.last}</td>
              <td style={{textAlign:'right'}}><button className="btn btn--ghost btn--xs" onClick={() => window.toast(`Manage ${m.name}`, { sub:`role · ${m.role} · last ${m.last}` })}>manage</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function BillingSettings() {
  return (
    <div className="vstack" style={{gap:18}}>
      <Card title="plan" className="card--accent">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
          <div>
            <div className="eyebrow eyebrow--accent">growth · annual</div>
            <div style={{fontFamily:'var(--font-display)', fontSize:36, fontWeight:800}}>$2,400 <span style={{fontSize:14, color:'var(--text-2)', fontWeight:500}}>/ mo</span></div>
            <div className="mono" style={{fontSize:11, color:'var(--text-3)', marginTop:4}}>renews · 2026-09-14 · 3 seats incl.</div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={() => window.toast('Plan picker opened', { sub:'Scale → Enterprise comparison' })}>Change plan</button>
        </div>
      </Card>
      <Card title="usage · current cycle">
        <div className="vstack" style={{gap:14}}>
          {[
            { name:'Agent tasks', used:7842, cap:12000, unit:'' },
            { name:'Eval runs',   used:7690, cap:10000, unit:'' },
            { name:'Calls transcribed', used:142, cap:300, unit:'h' },
            { name:'API tokens', used:28.4, cap:50, unit:'M' },
          ].map(u => (
            <div key={u.name}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                <span style={{fontSize:13}}>{u.name}</span>
                <span className="mono num" style={{fontSize:12}}>{u.used.toLocaleString()}{u.unit} / {u.cap.toLocaleString()}{u.unit}</span>
              </div>
              <div className="progress"><div className="progress__fill progress__fill--accent" style={{width:`${(u.used/u.cap)*100}%`}}/></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SecuritySettings() {
  return (
    <div className="vstack" style={{gap:18}}>
      <Card title="auth">
        <div className="vstack" style={{gap:12}}>
          {[
            { l:'SSO · Okta', s:'enforced', tone:'healthy' },
            { l:'2FA · all members', s:'enforced', tone:'healthy' },
            { l:'IP allowlist', s:'4 ranges', tone:'accent' },
            { l:'Session timeout', s:'8h', tone:'neutral' },
          ].map(r=>(
            <div key={r.l} style={{display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px dashed var(--border)'}}>
              <span>{r.l}</span>
              <Badge tone={r.tone}>{r.s}</Badge>
            </div>
          ))}
        </div>
      </Card>
      <Card title="audit log · last 5">
        <div className="vstack" style={{gap:0}}>
          {[
            { t:'14:39', who:'rae@helix.io',    act:'updated agent.hunter system prompt' },
            { t:'13:12', who:'agent-02',        act:'sent proposal PR-2041 → priya@banyan.health' },
            { t:'11:48', who:'jordan@helix.io', act:'paused agent-03 · manual review' },
            { t:'09:02', who:'system',          act:'rotated salesforce oauth token' },
            { t:'yest',  who:'maya@helix.io',   act:'exported call CALL-2417 transcript' },
          ].map((e,i)=>(
            <div key={i} style={{display:'grid', gridTemplateColumns:'60px 140px 1fr', gap:12, padding:'8px 0', borderBottom:'1px dashed var(--border)', fontSize:12}}>
              <span className="mono dim">{e.t}</span>
              <span className="mono" style={{color:'var(--accent-fg)'}}>{e.who}</span>
              <span>{e.act}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function GeneratePage({ setRoute }) {
  const [inputText, setInputText] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleGenerate = async () => {
    if (!inputText) return window.toast('Input required', { tone: 'critical' });
    setIsGenerating(true);
    window.toast('Sequence Initializing...', { tone: 'accent' });
    try {
      await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputText })
      });
      // The EventSource in ConsolePanel will pick up the stream
    } catch (e) {
      window.toast('Generation failed', { tone: 'critical' });
      setIsGenerating(false);
    }
  };

  const autoSample = async () => {
    try {
      const res = await fetch('/fixtures/sample.json');
      const data = await res.json();
      if (data && data.text) setInputText(data.text);
    } catch (e) {
      setInputText("CLIENT: Acme HVAC Services\n\nCONTEXT: Regional HVAC contractor (~30 employees, residential + light commercial). 22% of after-hours calls go to voicemail; 40% of those callers do not call back the next day.\n\nGOAL: Voice agent that answers after-hours, gathers caller details (name, address, urgency, problem class), and SMS-routes urgency-tagged dispatches to the on-call tech.\n\nSTACK: HouseCallPro for dispatch, Twilio for inbound SMS, Outlook 365 calendars. No current AI surface.\n\nBUDGET SIGNAL: Comparable peers spending $1.5–2.5k/mo on dispatch tooling. Owner has approved 1 quarter pilot if ROI math holds (target payback < 6 months).\n\nCOMPLIANCE: No PHI. Standard call-recording disclosure required (TX two-party).\n\nDEMO ASK: Generate proposal + SOW + AI risk report.");
    }
  };

  return (
    <div className="page">
      <PageHeader title="Generate Proposal" sub="Initialize a new sequence." />
      <div className="split split--2">
        <Card title="Input Data">
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Paste raw text here..."
            style={{ width: '100%', height: 300, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'none', marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--ghost" onClick={autoSample}>Auto-Sample</button>
            <button className="btn btn--primary" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? 'Generating...' : 'Initialize Sequence'}
            </button>
          </div>
        </Card>
        <div className="vstack" style={{ gap: 18 }}>
          <window.ConsolePanel title="live · pipeline.stream" lines={null} useLiveStream={true} />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { EvalsPage, ProposalsPage, SettingsPage, GeneratePage });
