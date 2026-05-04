/* ============================================================
   Agents page — playground + admin panel per ElevenLabs agent.
   Each agent gets:
     - live chat playground via <ConvaiWidget>
     - role / capabilities / surface-binding overview
     - links to ElevenLabs dashboard for deep edits
   ============================================================ */

function AgentsPage({ setRoute }) {
  // Admin mode shows admin-only agents (e.g. internal QA bots). Off by default
  // so public visitors only see operator-facing agents. Toggle via ?admin=1.
  const isAdmin = React.useMemo(() => {
    try { return new URLSearchParams(globalThis.location.search).has('admin'); }
    catch { return false; }
  }, []);
  const visibleAgents = React.useMemo(
    () => globalThis.AGENT_REGISTRY.agents.filter(a => isAdmin || a.surface !== 'admin-only'),
    [isAdmin],
  );
  const [activeKey, setActiveKey] = React.useState(visibleAgents[0]?.key);
  const active = globalThis.AGENT_REGISTRY.byKey(activeKey) || visibleAgents[0];
  if (!active) {
    return (
      <div className="page" style={{ padding: '22px 24px' }}>
        <PageHeader title="Agents" sub="No agents are wired into this workspace yet."/>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 'none', padding: '22px 24px 0' }}>
      <PageHeader
        eyebrow={`${visibleAgents.length} agents wired · ElevenLabs ConvAI${isAdmin ? ' · admin' : ''}`}
        title="Agents"
        sub="Each agent is a real ElevenLabs ConvAI agent. Use the playground to talk to it; the admin panel summarizes its binding inside the GTM app."
        actions={<>
          <button className="btn btn--ghost btn--sm" onClick={() => setRoute('settings')}><I3.Cog size={12}/>Workspace settings</button>
          <a className="btn btn--primary btn--sm" href="https://elevenlabs.io/app/conversational-ai/agents" target="_blank" rel="noopener noreferrer"><I3.ArrowUpRight size={12}/>Open in ElevenLabs</a>
        </>}
      />

      <div className="agents-grid">
        <Card title={`agents · ${visibleAgents.length}`} className="card--accent">
          <div className="vstack" style={{gap: 0}}>
            {visibleAgents.map(a => (
              <div key={a.key}
                onClick={() => setActiveKey(a.key)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveKey(a.key); } }}
                role="button"
                tabIndex={0}
                aria-pressed={activeKey === a.key}
                style={{
                  padding: '12px 8px', borderBottom: '1px dashed var(--border)',
                  display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12, alignItems: 'center', cursor: 'pointer',
                  borderLeft: activeKey === a.key ? '2px solid var(--sunset-500)' : '2px solid transparent',
                  paddingLeft: activeKey === a.key ? 10 : 8,
                }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: `radial-gradient(circle at 30% 30%, ${a.avatar_color_1}, ${a.avatar_color_2})`,
                }} aria-hidden="true"/>
                <div>
                  <div style={{fontSize: 13, fontWeight: 600}}>{a.display_name}</div>
                  <div className="mono" style={{fontSize: 10, color: 'var(--text-3)'}}>{a.role}</div>
                </div>
                <span className="mono" style={{fontSize: 10, color: 'var(--text-3)'}}>{a.surface}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="vstack" style={{gap: 18, minWidth: 0}}>
          <Card title={`playground · ${active.display_name}`} accent="accent" action={
            <span className="mono dim" style={{fontSize: 10}}>agent_id · {active.agent_id.slice(0, 22)}…</span>
          }>
            <div style={{height: 520, display: 'flex', flexDirection: 'column', minHeight: 0}}>
              <window.ConvaiWidget
                agentKey={active.key}
                textOnly={true}
                expanded={true}
                height="100%"
                width="100%"
              />
            </div>
          </Card>

          <Card title={`admin · ${active.key}`}>
            <div style={{display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14, fontSize: 13}}>
              <div className="eyebrow">Display name</div>
              <div>{active.display_name}</div>
              <div className="eyebrow">Role</div>
              <div>{active.role}</div>
              <div className="eyebrow">Mode</div>
              <div className="mono">{active.mode}</div>
              <div className="eyebrow">Surface binding</div>
              <div className="mono">{active.surface}</div>
              <div className="eyebrow">Agent ID</div>
              <div className="mono" style={{wordBreak: 'break-all'}}>{active.agent_id}</div>
              <div className="eyebrow">Description</div>
              <div>{active.description}</div>
              <div className="eyebrow">Capabilities</div>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                {active.capabilities.map(c => <Badge key={c} tone="accent">{c}</Badge>)}
              </div>
            </div>

            <div className="divider"/>

            <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
              <a className="btn btn--ghost btn--sm" href={`https://elevenlabs.io/app/conversational-ai/agents/${active.agent_id}`} target="_blank" rel="noopener noreferrer">
                <I3.Cog size={12}/>Edit prompt + voice
              </a>
              <a className="btn btn--ghost btn--sm" href={`https://elevenlabs.io/app/conversational-ai/history?agent_id=${active.agent_id}`} target="_blank" rel="noopener noreferrer">
                <I3.Doc size={12}/>Conversations
              </a>
              <button className="btn btn--primary btn--sm" onClick={() => {
                globalThis.AppContext.set({ extra: { triggered_from: 'agents-page', agent_key: active.key } });
                globalThis.toast(`${active.display_name} · context refreshed`, { sub: 'dynamic_variables synced from app state', tone: 'accent' });
              }}>
                <I3.Refresh size={12}/>Refresh context
              </button>
            </div>
          </Card>

          <Card title="how the context dump works">
            <div style={{fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)'}}>
              <p style={{marginBottom: 8}}>Every ConvAI session opened from inside this app passes a <code className="mono">context_dump</code> dynamic variable to the agent. The agent's system prompt ends with a <code className="mono">{'{{context_dump}}'}</code> placeholder that gets replaced server-side.</p>
              <p style={{marginBottom: 8}}>The dump is rebuilt live from <code className="mono">window.AppContext</code> as you click through the app — selecting a lead, a call, or a proposal updates what the agent sees in real time.</p>
              <p style={{marginBottom: 0}}>The current dump for this session:</p>
            </div>
            <pre className="mono" style={{fontSize: 11, marginTop: 10, padding: 10, background: 'var(--bg-inset)', borderRadius: 'var(--r-md)', maxHeight: 240, overflow: 'auto', color: 'var(--text-2)'}}>
              {globalThis.buildContextDump(globalThis.useAppContext())}
            </pre>
          </Card>
        </div>
      </div>
    </div>
  );
}

Object.assign(globalThis, { AgentsPage });
