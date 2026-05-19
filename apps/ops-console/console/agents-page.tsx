/* ============================================================
   Agents page — playground + admin panel per ElevenLabs agent.
   Each agent gets:
     - live chat playground via <ConvaiWidget>
     - role / capabilities / surface-binding overview
     - one explicit ElevenLabs dashboard escape hatch for deep edits
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
  const resolveVisibleKey = React.useCallback((key) => (
    visibleAgents.some(a => a.key === key) ? key : visibleAgents[0]?.key
  ), [visibleAgents]);
  const [activeKey, setActiveKey] = React.useState(() => resolveVisibleKey(
    globalThis.AppContext.get().extra?.selected_agent_key,
  ));
  // Mirror activeKey back into AppContext so the sidebar agent rows can
  // highlight the playground's currently-active agent. Without this, the
  // sidebar only updated when an external handoff (mission control,
  // command palette) wrote selected_agent_key — clicking a different
  // agent in the in-page picker left the sidebar pointing at the prior.
  React.useEffect(() => {
    if (!activeKey) return;
    const ctx = globalThis.AppContext.get();
    if (ctx?.extra?.selected_agent_key === activeKey) return;
    globalThis.AppContext.set({
      extra: { ...(ctx.extra || {}), selected_agent_key: activeKey },
    });
  }, [activeKey]);
  const [adminPanel, setAdminPanel] = React.useState('prompt');
  const [contextSync, setContextSync] = React.useState(null);
  const [adminFocusNotice, setAdminFocusNotice] = React.useState(null);
  const [newAgentPanelOpen, setNewAgentPanelOpen] = React.useState(Boolean(
    globalThis.AppContext.get().extra?.new_agent_intent,
  ));
  const appCtx = globalThis.useAppContext();
  const context = globalThis.buildAgentContext(appCtx);
  const contextLines = context.split('\n').filter(Boolean).length;
  const adminCardRef = React.useRef(null);
  const evalHandoffBannerRef = React.useRef(null);
  const evalHandoffRef = React.useRef(null);
  React.useEffect(() => {
    const applySelection = (ctx) => {
      const nextKey = resolveVisibleKey(ctx.extra?.selected_agent_key);
      if (nextKey) setActiveKey(nextKey);
      if (['prompt', 'voice', 'tools', 'context', 'history', 'safety'].includes(ctx.extra?.agent_admin_panel)) {
        const isEvalAgentHandoff = ctx.extra?.triggered_from === 'eval-agent-admin';
        if (ctx.extra?.triggered_from !== 'agents-page') {
          setContextSync(null);
        }
        setAdminPanel(ctx.extra.agent_admin_panel);
        requestAnimationFrame(() => {
          if (isEvalAgentHandoff) {
            globalThis.scrollConsoleNodeIntoView?.(evalHandoffBannerRef.current, { block: 'start' });
            return;
          }
          globalThis.scrollConsoleNodeIntoView?.(adminCardRef.current, { block: 'start' });
        });
      }
      if (ctx.extra?.new_agent_intent) {
        setNewAgentPanelOpen(true);
        setAdminPanel('tools');
      }
    };
    applySelection(globalThis.AppContext.get());
    return globalThis.AppContext.subscribe(applySelection);
  }, [resolveVisibleKey]);
  const active = globalThis.AGENT_REGISTRY.byKey(activeKey) || visibleAgents[0];
  const appExtra = appCtx.extra || {};
  const agentSurfaceLabel = (agent) => {
    if (!agent) return 'local';
    if (agent.key === 'sales_coach') return 'all pages';
    if (agent.key === 'intake') return 'pipeline lead';
    return String(agent.surface || 'local').replace(/[-_]/g, ' ');
  };
  const agentDisplayLabel = (agent) => (
    String(agent?.display_name || agent?.label || 'Agent').replace(' · ', ' ')
  );
  const agentRoleLabel = (agent) => {
    if (!agent) return 'ElevenLabs agent';
    if (agent.key === 'sales_coach') return 'Deal coaching agent';
    if (agent.key === 'intake') return 'AI receptionist · answers callers and hands off jobs';
    return agent.role || 'ElevenLabs agent';
  };
  const agentWrapperTitle = (agent) => (
    agent?.key === 'intake'
      ? 'Your AI receptionist'
      : 'Local ElevenLabs agent'
  );
  const setupDefaultsFor = (agent) => ({
    greeting: agent?.first_message || '',
    opens: agent?.key === 'intake' ? '07:00' : '09:00',
    closes: agent?.key === 'intake' ? '19:00' : '17:00',
    handoff: agent?.key === 'intake' ? 'Maria' : 'Rae',
    deflections: agent?.key === 'intake' ? '2' : '1',
    savedAt: null,
  });
  const [setupByAgent, setSetupByAgent] = React.useState(() => {
    const seed = {};
    for (const agent of visibleAgents) seed[agent.key] = setupDefaultsFor(agent);
    return seed;
  });
  const [previewState, setPreviewState] = React.useState({ agentKey: null, active: false, mode: 'idle' });
  const [setupSaveState, setSetupSaveState] = React.useState('clean');
  const previewTimerRef = React.useRef(null);
  const setup = setupByAgent[active?.key] || setupDefaultsFor(active);
  const activeLabel = agentDisplayLabel(active);
  const updateSetup = (patch) => {
    if (!active?.key) return;
    setSetupByAgent(prev => ({
      ...prev,
      [active.key]: { ...(prev[active.key] || setupDefaultsFor(active)), ...patch },
    }));
    setSetupSaveState('dirty');
  };
  const normalizeTimeValue = (value, fallback) => {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) return fallback;
    const hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return fallback;
    }
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };
  const compactTime = (value) => {
    const [hRaw, mRaw] = String(value || '00:00').split(':');
    let h = Number(hRaw);
    const m = Number(mRaw || 0);
    const suffix = h >= 12 ? 'p' : 'a';
    h = h % 12 || 12;
    return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''}${suffix}`;
  };
  const setupHoursLabel = `M-F ${compactTime(setup.opens)}-${compactTime(setup.closes)}`;
  const setupSessionHoursLabel = `${setup.opens}-${setup.closes}`;
  const setupHandoffLabel = `${setup.handoff || 'operator'} after ${setup.deflections || '1'} ${String(setup.deflections) === '1' ? 'try' : 'tries'}`;
  const wrapperSummary = active?.key === 'intake'
    ? 'greeting · hours · handoff'
    : 'opening line · context · tools';
  const previewLabel = active?.key === 'sales_coach' ? 'opening' : 'greeting';
  const isPreviewingActiveAgent = Boolean(active?.key && previewState.active && previewState.agentKey === active.key);
  const stopGreetingPreview = React.useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    try { globalThis.speechSynthesis?.cancel?.(); } catch (_) {}
    setPreviewState({ agentKey: null, active: false, mode: 'idle' });
  }, []);
  React.useEffect(() => stopGreetingPreview, [active?.key, stopGreetingPreview]);
  const playGreetingPreview = () => {
    if (previewState.active && previewState.agentKey === active.key) {
      stopGreetingPreview();
      return;
    }
    stopGreetingPreview();
    const text = setup.greeting || active.first_message || `${activeLabel} is ready.`;
    const visualFallback = (mode = 'visual') => {
      setPreviewState({ agentKey: active.key, active: true, mode });
      previewTimerRef.current = setTimeout(() => {
        setPreviewState({ agentKey: null, active: false, mode: 'idle' });
        previewTimerRef.current = null;
      }, 6000);
    };
    try {
      if (typeof globalThis.SpeechSynthesisUtterance !== 'function' || !globalThis.speechSynthesis?.speak) {
        visualFallback('visual');
        return;
      }
      const utterance = new globalThis.SpeechSynthesisUtterance(text);
      utterance.rate = active.key === 'intake' ? 0.96 : 1;
      utterance.pitch = 1;
      utterance.onend = () => setPreviewState({ agentKey: null, active: false, mode: 'idle' });
      utterance.onerror = () => visualFallback('visual');
      setPreviewState({ agentKey: active.key, active: true, mode: 'audio' });
      globalThis.speechSynthesis.speak(utterance);
    } catch (_) {
      visualFallback('visual');
    }
  };
  const savePhoneSetup = () => {
    if (!active?.key) return;
    const savedAt = new Date();
    setSetupByAgent(prev => ({
      ...prev,
      [active.key]: { ...(prev[active.key] || setupDefaultsFor(active)), savedAt: savedAt.toISOString() },
    }));
    setSetupSaveState('saved');
  };
  React.useEffect(() => {
    const handlePreview = () => playGreetingPreview();
    const handleSetupFocus = () => {
      requestAnimationFrame(() => {
        globalThis.scrollConsoleNodeIntoView?.(adminCardRef.current, { block: 'nearest' });
        const input = globalThis.document?.querySelector?.('[data-testid="phone-setup-greeting-input"]');
        input?.focus?.({ preventScroll: true });
      });
    };
    globalThis.addEventListener('gtm:agent-preview', handlePreview);
    globalThis.addEventListener('gtm:agent-setup-focus', handleSetupFocus);
    return () => {
      globalThis.removeEventListener('gtm:agent-preview', handlePreview);
      globalThis.removeEventListener('gtm:agent-setup-focus', handleSetupFocus);
    };
  }, [active?.key, previewState.active, previewState.agentKey, setup.greeting, setup.opens, setup.closes, setup.handoff, setup.deflections]);
  const clearEvalHandoffExtra = (extra = {}) => {
    const next = { ...extra };
    [
      'eval_admin_return_route',
      'eval_run',
      'selected_eval_suite',
      'selected_eval_suite_id',
      'selected_eval_context',
      'selected_eval_run',
      'selected_eval_verdict',
      'selected_eval_score',
      'eval_failed_axes',
      'eval_evidence_path',
      'agent_admin_panel',
    ].forEach(key => { delete next[key]; });
    return next;
  };
  const evalContextHandoff = appExtra.triggered_from === 'eval-agent-admin'
    ? {
        context: appExtra.selected_eval_context || appExtra.selected_eval_suite || appCtx.selection?.id || 'selected eval context',
        scenario: appExtra.selected_eval_run || appExtra.eval_run?.scenario_id || 'selected run',
        verdict: appExtra.selected_eval_verdict || appExtra.eval_run?.verdict || 'unknown',
        score: appExtra.selected_eval_score || 'score unavailable',
        failedAxes: appExtra.eval_failed_axes || 'none',
        evidencePath: appExtra.eval_evidence_path || appExtra.eval_run?.result_path || '../fixtures/eval-runs.json',
      }
    : null;
  React.useEffect(() => {
    if (!evalContextHandoff || adminPanel !== 'context') return undefined;
    const frame = requestAnimationFrame(() => {
      globalThis.scrollConsoleNodeIntoView?.(evalHandoffBannerRef.current, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [appExtra.triggered_from, appExtra.selected_eval_run, adminPanel]);
  const openAdminSection = (id, source = 'tab') => {
    const nextPanel = id || 'prompt';
    setAdminPanel(nextPanel);
    if (source === 'shortcut') {
      const label = {
        prompt: 'Prompt',
        voice: 'Voice',
        tools: 'Tools',
        context: 'Context',
        history: 'History',
        safety: 'Safety',
      }[nextPanel] || 'Admin';
      setAdminFocusNotice(`${activeLabel} local admin focused · ${label}`);
    }
    requestAnimationFrame(() => {
      globalThis.scrollConsoleNodeIntoView?.(adminCardRef.current, { block: 'nearest' });
      if (source === 'shortcut') adminCardRef.current?.focus?.({ preventScroll: true });
    });
  };
  const returnToEvalRun = () => {
    const ctx = globalThis.AppContext.get();
    globalThis.AppContext.set({
      selection: ctx.selection?.type === 'eval' ? ctx.selection : appCtx.selection,
      extra: {
        ...clearEvalHandoffExtra(ctx.extra || {}),
        triggered_from: 'agents-return-to-eval',
      },
    });
    setRoute?.('evals');
  };
  const openWorkspaceAgentSettings = () => {
    globalThis.AppContext.set({
      extra: {
        ...(globalThis.AppContext.get().extra || {}),
        settings_tab: 'integrations',
        integration_name: 'ElevenLabs',
        triggered_from: 'agents-workspace-settings',
      },
    });
    globalThis.dispatchEvent(new CustomEvent('gtm:settings-tab', { detail: { tab: 'integrations' } }));
    setRoute('settings');
  };
  const chooseNewAgentTemplate = (key, panel = 'prompt') => {
    const next = resolveVisibleKey(key);
    if (next) setActiveKey(next);
    setAdminPanel(panel);
    globalThis.AppContext.set({
      extra: {
        ...(globalThis.AppContext.get().extra || {}),
        new_agent_template_key: next,
        new_agent_panel: panel,
        triggered_from: 'agents-new-agent-template',
      },
    });
    requestAnimationFrame(() => {
      globalThis.scrollConsoleNodeIntoView?.(adminCardRef.current, { block: 'nearest' });
    });
  };
  // Clear the per-agent context snapshot when the active agent changes,
  // so a snapshot taken under Sales Coach never leaks into Sarah's admin
  // panel — that would render Sarah's identity with Sales Coach's dump.
  React.useEffect(() => { setContextSync(null); }, [active.key]);
  const refreshActiveContext = () => {
    const at = new Date();
    const current = globalThis.AppContext.get();
    const selection = current.selection
      ? `${current.selection.type || 'selection'} · ${current.selection.id || 'unknown'}`
      : 'none';
    // Also snapshot the dump string itself so the rendered <pre> below
    // displays the EXACT context that was sealed at sync time. Previously
    // the panel snapshotted route/selection/lines/atLabel but the <pre>
    // below kept rendering the LIVE context — so navigating after a
    // sync left the "synced N lines at TIME" sticker describing a
    // different blob than what was on screen.
    setContextSync({
      agentKey: active.key,
      agentName: activeLabel,
      route: current.route || appCtx.route || 'agents',
      selection,
      lines: contextLines,
      text: context,
      atLabel: at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });
    setAdminPanel('context');
    globalThis.AppContext.set({
      extra: {
        ...(current.extra || {}),
        triggered_from: 'agents-page',
        agent_key: active.key,
        context_synced_agent: active.key,
        context_synced_at: at.toISOString(),
      },
    });
    requestAnimationFrame(() => {
      globalThis.scrollConsoleNodeIntoView?.(adminCardRef.current, { block: 'nearest' });
    });
    globalThis.toast(`${activeLabel} · context refreshed`, { sub: 'Visible context packet updated in local admin', tone: 'accent' });
  };
  const dismissNewAgentPanel = () => {
    setNewAgentPanelOpen(false);
    const extra = globalThis.AppContext.get().extra || {};
    const { new_agent_intent, new_agent_template_key, new_agent_panel, ...rest } = extra;
    globalThis.AppContext.set({ extra: rest });
  };
  if (!active) {
    return (
      <div className="page page--wide">
        <PageHeader title="Agents" sub="No agents are wired into this workspace yet."/>
      </div>
    );
  }

  return (
    <div className="page page--wide page--agents">
      <h1 id="console-page-title" className="sr-only">Agents</h1>

      <section className="agent-route-strip" aria-label="Selected ElevenLabs agent">
        <div className="agent-route-strip__identity">
          <window.ElevenUI.Orb
            size={42}
            state={isPreviewingActiveAgent ? 'talking' : 'idle'}
            color1={active.avatar_color_1}
            color2={active.avatar_color_2}
            label={`${activeLabel} selected agent`}
          />
          <div>
            <div className="eyebrow eyebrow--accent">{visibleAgents.length} agents wired · ElevenLabs ConvAI{isAdmin ? ' · admin' : ''}</div>
            <div className="agent-route-strip__active">
              <span>{agentWrapperTitle(active)}</span>
              <strong>{activeLabel}</strong>
            </div>
          </div>
        </div>
        <div className="agent-route-strip__facts" aria-label="Local agent setup facts">
          <span>
            <span className="agent-route-strip__fact-label">status</span>
            <code className="mono" data-testid="agent-route-fact-status">
              {active.key === 'intake' ? 'Answering now' : 'Ready for coaching'}
            </code>
          </span>
          <span>
            <span className="agent-route-strip__fact-label">{active.key === 'intake' ? 'hours' : 'surface'}</span>
            <code className="mono" data-testid={active.key === 'intake' ? 'agent-route-fact-hours' : 'agent-route-fact-surface'}>
              {active.key === 'intake' ? setupHoursLabel : agentSurfaceLabel(active)}
            </code>
          </span>
          <span>
            <span className="agent-route-strip__fact-label">{active.key === 'intake' ? 'handoff' : 'wrapper'}</span>
            <code className="mono" data-testid="agent-route-fact-handoff">
              {active.key === 'intake' ? setupHandoffLabel : wrapperSummary}
            </code>
          </span>
        </div>
        <button
          className="btn btn--primary btn--sm"
          data-testid="agents-workspace-settings"
          aria-label="ElevenLabs workspace settings"
          onClick={openWorkspaceAgentSettings}
        ><I3.Cog size={12}/>ElevenLabs settings</button>
      </section>

      {evalContextHandoff && (
        <section
          ref={evalHandoffBannerRef}
          className="agent-eval-handoff agent-eval-handoff--banner"
          data-testid="agent-eval-handoff-banner"
          role="region"
          aria-label="Eval run admin handoff"
        >
          <div>
            <div className="eyebrow eyebrow--accent">eval run context</div>
            <strong>{evalContextHandoff.scenario}</strong>
            <p>
              {evalContextHandoff.verdict} · {evalContextHandoff.score} · failed axes: {evalContextHandoff.failedAxes}
            </p>
          </div>
          <div className="agent-eval-handoff__meta">
            <span>review context <code className="mono">{evalContextHandoff.context}</code></span>
            <span>run evidence <code className="mono">{evalContextHandoff.evidencePath}</code></span>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            data-testid="agent-return-to-eval-run-top"
            onClick={returnToEvalRun}
          ><I3.Beaker size={12}/>Back to Evals</button>
        </section>
      )}

      {newAgentPanelOpen && (
        <section
          className="agent-new-setup"
          data-testid="agent-new-setup"
          role="region"
          aria-label="New ElevenLabs agent setup"
        >
          <div className="agent-new-setup__copy">
            <div className="eyebrow eyebrow--accent">new agent setup</div>
            <h2>Build the local wrapper before leaving the console.</h2>
            <p>Define the route surface, allowed client tools, context contract, and safety boundary here. The dashboard link remains the only external escape hatch for deep ElevenLabs edits.</p>
          </div>
          <div className="agent-new-setup__steps" aria-label="Local agent setup checklist">
            {[
              ['01', 'Surface', 'sidebar route, launcher, or eval lab'],
              ['02', 'Tools', 'openConsoleRoute, showToast, syncContextDump'],
              ['03', 'Context', '{{context}} dynamic variable and data boundary'],
            ].map(([n, label, sub]) => (
              <div key={n} className="agent-new-setup__step">
                <span className="mono">{n}</span>
                <strong>{label}</strong>
                <p>{sub}</p>
              </div>
            ))}
          </div>
          <div className="agent-new-setup__actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              data-testid="agent-new-setup-tools"
              onClick={() => chooseNewAgentTemplate('sales_coach', 'tools')}
            ><I3.Cog size={12}/>Use Sales Coach wrapper</button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              data-testid="agent-new-setup-intake"
              onClick={() => chooseNewAgentTemplate('intake', 'context')}
            ><I3.Bot size={12}/>Use Sarah wrapper</button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              data-testid="agent-new-setup-settings"
              onClick={openWorkspaceAgentSettings}
            ><I3.Cog size={12}/>Workspace integration</button>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label="Dismiss new agent setup"
              onClick={dismissNewAgentPanel}
            ><I3.Close size={14}/></button>
          </div>
        </section>
      )}

      <div className="agents-grid">
        <Card title={`agents · ${visibleAgents.length}`} className="card--accent agents-picker-card">
          <div className="vstack agent-picker-list" role="list" aria-label="ElevenLabs agents wired into this console" style={{gap: 0}}>
            {visibleAgents.map(a => (
              <div key={a.key} role="listitem">
              <button
                type="button"
                className="agent-row"
                data-testid="agents-picker-row"
                data-active={activeKey === a.key}
                data-agent-key={a.key}
                onClick={() => setActiveKey(a.key)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveKey(a.key); } }}
                aria-pressed={activeKey === a.key}
                aria-label={`${agentDisplayLabel(a)} ${agentRoleLabel(a)} ${agentSurfaceLabel(a)}`}
                style={{
                  padding: '12px 8px', borderBottom: '1px dashed var(--border)',
                  display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12, alignItems: 'center', cursor: 'pointer',
                  borderLeft: activeKey === a.key ? '2px solid var(--sunset-500)' : '2px solid transparent',
                  paddingLeft: activeKey === a.key ? 10 : 8,
                }}>
                <window.ElevenUI.Orb size={34} color1={a.avatar_color_1} color2={a.avatar_color_2} label={`${agentDisplayLabel(a)} state`}/>
                <div>
                  <div className="agent-row__name" style={{fontSize: 13, fontWeight: 600}}>{agentDisplayLabel(a)}</div>
                  <div className="agent-row__role mono" style={{fontSize: 10, color: 'var(--text-3)'}}>{agentRoleLabel(a)}</div>
                </div>
                <span className="mono" data-testid="agent-surface-label" style={{fontSize: 10, color: 'var(--text-3)'}}>{agentSurfaceLabel(a)}</span>
              </button>
              </div>
            ))}
          </div>
        </Card>

        <div className="vstack" style={{gap: 18, minWidth: 0}}>
          <Card title={`playground · ${activeLabel}`} accent="accent" className="agent-playground-card">
            {/* The playground frames the raw ConvAI web component with the
                local ElevenLabs UI primitives (Orb, BarVisualizer, status
                bar) so the operator gets the same visual contract here as
                in the eval lab — not a bare embedded widget. */}
            <div className="el-agent-panel agent-playground-frame">
              <div className="el-agent-panel__head">
                <window.ElevenUI.Orb
                  size={48}
                  state={isPreviewingActiveAgent ? 'talking' : 'idle'}
                  color1={active.avatar_color_1}
                  color2={active.avatar_color_2}
                  label={`${activeLabel} playground state`}
                />
                <div>
                  <div style={{fontWeight: 700, fontSize: 14}} data-testid="agent-playground-title">{activeLabel}</div>
                  <div className="agent-playground-frame__identity mono dim" data-testid="agent-playground-subtitle" style={{fontSize: 10}}>
                    {agentRoleLabel(active)} · {active.mode}
                  </div>
                </div>
                <window.ElevenUI.BarVisualizer
                  active={isPreviewingActiveAgent}
                  tone="accent"
                  bars={[.32,.58,.41,.74,.5,.36,.66,.45,.82,.4,.58,.3]}
                />
              </div>
              <div className="el-conversation-bar" role="status" aria-live="polite" data-testid="agent-context-bar">
                <I3.Mic size={14}/>
                <span>
                  {isPreviewingActiveAgent
                    ? `${activeLabel} ${previewState.mode === 'audio' ? 'preview playing locally.' : 'visual preview running; browser audio unavailable.'}`
                    : <>Preview the saved greeting before callers hear it. Context packet: <code className="mono">{contextLines} {contextLines === 1 ? 'line' : 'lines'}</code>{' '}from <code className="mono">{appCtx.route || 'agents'}</code>.</>}
                </span>
                <Badge tone="accent">ready</Badge>
                <button
                  type="button"
                  className="btn btn--ghost btn--xs"
                  data-testid="agent-playground-play-greeting"
                  aria-pressed={isPreviewingActiveAgent}
                  onClick={playGreetingPreview}
                >{isPreviewingActiveAgent ? 'Stop preview' : `Play ${previewLabel}`}</button>
              </div>
              <div className="agent-admin-quick" aria-label="Local agent admin shortcuts">
                <div className="agent-admin-quick__head">
                  <div>
                    <div className="eyebrow eyebrow--accent">local admin</div>
                    <strong>{active.key}</strong>
                    <code className="mono agent-local-wrapper-id" data-testid="agent-local-wrapper-id">{wrapperSummary}</code>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--xs"
                    data-testid="agent-open-local-admin"
                    onClick={() => openAdminSection(adminPanel || 'prompt', 'shortcut')}
                  ><I3.Cog size={11}/>Open local admin</button>
                </div>
                <div className="agent-admin-quick__buttons">
                  {[
                    { id:'prompt', label:'Prompt' },
                    { id:'tools', label:'Tools' },
                    { id:'context', label:'Context' },
                    { id:'safety', label:'Safety' },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="agent-admin-quick__button"
                      aria-pressed={adminPanel === t.id}
                      data-active={adminPanel === t.id}
                      onClick={() => openAdminSection(t.id)}
                    >{t.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="eval-convai-frame agent-playground-convai" role="region" aria-label={`${activeLabel} playground chat`} data-testid="agent-playground-convai">
              <div className="agent-session-strip" aria-label="Active ElevenLabs session packet">
                <div>
                  <div className="eyebrow eyebrow--accent">ElevenLabs session</div>
                  <strong>{activeLabel}</strong>
                </div>
                <Badge tone="accent">embedded</Badge>
                <div className="agent-session-strip__grid">
                  <span>route <code className="mono">{appCtx.route}</code></span>
                  <span>context <code className="mono">{contextLines} {contextLines === 1 ? 'line' : 'lines'}</code></span>
                  <span>tools <code className="mono">{(active.tools || []).length || 3} local</code></span>
                  <span>{active.key === 'intake' ? 'hours' : 'wrapper'} <code className="mono">{active.key === 'intake' ? setupSessionHoursLabel : wrapperSummary}</code></span>
                  <span>{active.key === 'intake' ? 'handoff' : 'surface'} <code className="mono">{active.key === 'intake' ? setupHandoffLabel : agentSurfaceLabel(active)}</code></span>
                </div>
              </div>
              {/* surface="agent_playground" pulls textOnly + expanded +
                  dismissible + theme + the playground-specific
                  firstMessage out of agents-registry.js#surfaces, where
                  the per-agent `widget` labels still apply. Generic
                  overrides at this call site historically flattened every
                  agent's tuned voice into "Talk to X / Start agent
                  session" and broke the ElevenLabs widget contract. */}
              {/* key forces a clean remount on agent switch so each agent
                  gets its own ConvaiWidget instance with its own ready/
                  configError state — without it, prop changes alone left
                  the previous agent's effect cleanup racing with the new
                  effect's append, leaving the convai-mount empty after
                  the picker click. */}
              <window.ConvaiWidget
                key={active.key}
                agentKey={active.key}
                surface="agent_playground"
                height="100%"
                width="100%"
              />
            </div>
          </Card>

          <div className="agent-admin-focus-target" tabIndex={-1}>
            <Card
              title={active.key === 'intake' ? 'Receptionist setup' : `${activeLabel} wrapper`}
              className="agent-local-admin-card"
              action={<Badge tone={setupSaveState === 'dirty' ? 'warn' : setupSaveState === 'saved' ? 'healthy' : 'neutral'}>{setupSaveState === 'dirty' ? 'unsaved' : setupSaveState === 'saved' ? 'saved' : 'current'}</Badge>}
            >
              <section
                className="phone-setup-panel"
                data-testid="agent-local-admin-panel"
                aria-label={`${activeLabel} local setup`}
              >
                <div className="phone-setup-panel__fields" data-testid="phone-setup-panel">
                  <label className="field" data-testid="phone-setup-greeting">
                    <span className="field__label">{active.key === 'sales_coach' ? 'Opening line' : 'Greeting'}</span>
                    <textarea
                      className="input phone-setup-panel__greeting"
                      data-testid="phone-setup-greeting-input"
                      value={setup.greeting}
                      onChange={(e) => updateSetup({ greeting: e.target.value })}
                    />
                  </label>
                  <div className="phone-setup-panel__row">
                    <label className="field">
                      <span className="field__label">Opens</span>
                      <input
                        className="input"
                        type="text"
                        inputMode="numeric"
                        data-testid="phone-setup-hours-start"
                        value={setup.opens}
                        onChange={(e) => updateSetup({ opens: e.target.value })}
                        onBlur={(e) => updateSetup({ opens: normalizeTimeValue(e.target.value, '07:00') })}
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">Closes</span>
                      <input
                        className="input"
                        type="text"
                        inputMode="numeric"
                        data-testid="phone-setup-hours-end"
                        value={setup.closes}
                        onChange={(e) => updateSetup({ closes: e.target.value })}
                        onBlur={(e) => updateSetup({ closes: normalizeTimeValue(e.target.value, '19:00') })}
                      />
                    </label>
                  </div>
                  <div className="phone-setup-panel__row">
                    <label className="field">
                      <span className="field__label">After-hours handoff</span>
                      <input
                        className="input"
                        type="text"
                        data-testid="phone-setup-handoff-input"
                        value={setup.handoff}
                        onChange={(e) => updateSetup({ handoff: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">Deflection cap</span>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        max="9"
                        data-testid="phone-setup-deflection-input"
                        value={setup.deflections}
                        onChange={(e) => updateSetup({ deflections: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
                <div
                  className="phone-setup-preview"
                  data-testid="phone-setup-preview"
                  data-active={isPreviewingActiveAgent ? 'true' : 'false'}
                  data-preview-mode={previewState.mode}
                >
                  <div>
                    <div className="eyebrow eyebrow--accent">local preview</div>
                    <strong>{activeLabel}</strong>
                    <p>{setup.opens}-{setup.closes} · after-hours to {setupHandoffLabel}</p>
                  </div>
                  <div className="phone-setup-preview__sample">
                    {isPreviewingActiveAgent
                      ? (previewState.mode === 'audio' ? 'Audio preview playing locally.' : 'Visual preview running.')
                      : setup.greeting}
                  </div>
                  <div className="phone-setup-preview__actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-pressed={isPreviewingActiveAgent}
                      onClick={playGreetingPreview}
                    ><I3.Mic size={12}/>{isPreviewingActiveAgent ? 'Stop preview' : `Preview ${previewLabel}`}</button>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      data-testid="phone-setup-save"
                      onClick={savePhoneSetup}
                    ><I3.Cog size={12}/>Save local wrapper</button>
                  </div>
                  <div className="phone-setup-save-status" data-testid="phone-setup-save-status" data-state={setupSaveState}>
                    {setupSaveState === 'dirty'
                      ? 'Unsaved local edits. Save before trusting the next test call.'
                      : setupSaveState === 'saved'
                        ? `Saved · ${setup.opens}-${setup.closes} · ${setupHandoffLabel}`
                        : 'Current registry settings. Edit locally before opening the external dashboard.'}
                  </div>
                </div>
              </section>
            </Card>
          </div>

          <div ref={adminCardRef} className="agent-admin-focus-target" tabIndex={-1}>
            <Card title={`admin · ${active.key}`} className="agent-admin-card">
              {adminFocusNotice && (
                <div
                  className="agent-admin-focus-status"
                  data-testid="agent-local-admin-focus-status"
                  role="status"
                  aria-live="polite"
                >{adminFocusNotice}</div>
              )}
              <div className="agent-admin-hero">
                <window.ElevenUI.Orb size={76} state="talking" color1={active.avatar_color_1} color2={active.avatar_color_2} label={`${activeLabel} admin state`}/>
                <div className="agent-admin-hero__copy">
                  <div className="eyebrow eyebrow--accent">{active.surface} · {active.mode}</div>
                  <h2>{activeLabel}</h2>
                  <p>{active.description}</p>
                  <div className="agent-admin-caps">
                    {active.capabilities.map(c => <Badge key={c} tone="accent">{c}</Badge>)}
                  </div>
                </div>
                <window.ElevenUI.BarVisualizer active={true} tone="accent" bars={[.28,.52,.44,.8,.63,.37,.74,.55,.9,.48,.68,.36]}/>
              </div>

              <div className="agent-admin-tabs" role="tablist" aria-label="Agent administration sections">
                {[
                  { id:'prompt', label:'Prompt' },
                  { id:'voice', label:'Voice' },
                  { id:'tools', label:'Tools' },
                  { id:'context', label:'Context' },
                  { id:'history', label:'History' },
                  { id:'safety', label:'Safety' },
                ].map(t => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={adminPanel === t.id}
                    data-active={adminPanel === t.id}
                    className="agent-admin-tab"
                    onClick={() => setAdminPanel(t.id)}
                  >{t.label}</button>
                ))}
              </div>

              <div className="agent-admin-panel" role="tabpanel">
                {adminPanel === 'prompt' && (
                  <div className="agent-admin-grid" data-testid="agent-prompt-panel">
                    <div data-testid="agent-prompt-role">
                      <div className="eyebrow">System role</div>
                      <div className="agent-admin-block">{active.role || '—'}</div>
                    </div>
                    <div data-testid="agent-prompt-description">
                      <div className="eyebrow">Description</div>
                      <div className="agent-admin-block" style={{fontSize:13}}>
                        {active.description || <span className="muted">No description on this agent.</span>}
                      </div>
                    </div>
                    <div data-testid="agent-prompt-context-contract">
                      <div className="eyebrow">Context contract</div>
                      <div className="agent-admin-block mono">{'{{context}}'} appended to every session</div>
                    </div>
                    <div data-testid="agent-prompt-system">
                      <div className="eyebrow">System prompt</div>
                      {active.system_prompt ? (
                        <pre
                          className="mono agent-admin-json"
                          tabIndex={0}
                          role="region"
                          aria-label={`${activeLabel} system prompt`}
                          style={{whiteSpace:'pre-wrap', maxHeight:240, overflow:'auto'}}
                        >{active.system_prompt}</pre>
                      ) : (
                        <div className="agent-admin-block muted">
                          No system_prompt on this agent — the widget will run against the prompt configured in the ElevenLabs dashboard.
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {adminPanel === 'voice' && (
                  <div className="agent-admin-grid" data-testid="agent-voice-panel">
                    <div data-testid="agent-voice-mode">
                      <div className="eyebrow">Voice mode</div>
                      <div className="agent-admin-block">{active.mode || '—'}</div>
                    </div>
                    <div data-testid="agent-voice-first-message">
                      <div className="eyebrow">First message</div>
                      <div className="agent-admin-block" style={{whiteSpace:'pre-wrap'}}>
                        {active.first_message || (
                          <span className="muted">No first_message set on this agent — the widget will fall back to ElevenLabs defaults.</span>
                        )}
                      </div>
                    </div>
                    <div data-testid="agent-voice-id">
                      <div className="eyebrow">Voice ID</div>
                      <div className="agent-admin-block mono" style={{fontSize:11}}>{active.voice_id || '—'}</div>
                    </div>
                    <div data-testid="agent-voice-model">
                      <div className="eyebrow">Model</div>
                      <div className="agent-admin-block mono" style={{fontSize:11}}>{active.model || '—'}</div>
                    </div>
                  </div>
                )}
                {adminPanel === 'tools' && (
                  Array.isArray(active.tools) && active.tools.length > 0 ? (
                    <div className="agent-admin-grid" data-testid="agent-tools-list">
                      {active.tools.map(tool => (
                        <div key={tool.name} data-testid="agent-tool-row" data-tool-name={tool.name}>
                          <div className="eyebrow">Client tool</div>
                          <div className="agent-admin-block mono">{tool.name}</div>
                          <div className="muted" style={{fontSize:12, marginTop:6}}>{tool.purpose}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="muted" data-testid="agent-tools-empty" style={{fontSize:13, padding:'8px 0'}}>
                      No client tools declared for this agent. Add a <code className="mono">tools</code> block in <code className="mono">agents-registry.js</code> to surface the per-agent client-tool surface here. Generic fallback removed — claiming this agent uses <code className="mono">openConsoleRoute</code> / <code className="mono">showToast</code> / <code className="mono">syncContextDump</code> when it doesn't lied to the operator.
                    </div>
                  )
                )}
                {adminPanel === 'context' && (
                  <div className="agent-context-panel">
                    {evalContextHandoff && (
                      <section
                        ref={evalHandoffRef}
                        className="agent-eval-handoff"
                        data-testid="agent-eval-handoff"
                        role="region"
                        aria-label="Eval run context handoff"
                      >
                        <div>
                          <div className="eyebrow eyebrow--accent">eval run context</div>
                          <strong>{evalContextHandoff.scenario}</strong>
                          <p>
                            {evalContextHandoff.verdict} · {evalContextHandoff.score} · failed axes: {evalContextHandoff.failedAxes}
                          </p>
                        </div>
                        <div className="agent-eval-handoff__meta">
                          <span>review context <code className="mono">{evalContextHandoff.context}</code></span>
                          <span>run evidence <code className="mono">{evalContextHandoff.evidencePath}</code></span>
                        </div>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          data-testid="agent-return-to-eval-run"
                          onClick={returnToEvalRun}
                        ><I3.Beaker size={12}/>Back to Evals</button>
                      </section>
                    )}
                    {contextSync && (
                      <div className="agent-context-sync" data-testid="agent-context-sync" role="status">
                        <div>
                          <div className="eyebrow eyebrow--accent">context sync</div>
                          <strong>{contextSync.agentName} refreshed inside the console</strong>
                          <p>No dashboard handoff. The next ConvAI session gets this local context packet.</p>
                        </div>
                        <div className="agent-context-sync__facts">
                          <span>route <code className="mono">{contextSync.route}</code></span>
                          <span>selection <code className="mono">{contextSync.selection}</code></span>
                          <span>context <code className="mono">{contextSync.lines} {contextSync.lines === 1 ? 'line' : 'lines'}</code></span>
                          <span>synced <code className="mono">{contextSync.atLabel}</code></span>
                        </div>
                      </div>
                    )}
                    <pre
                      className="mono agent-admin-json"
                      tabIndex={0}
                      role="region"
                      aria-label={`${activeLabel} agent context`}
                      data-testid="agent-context"
                      data-source={contextSync ? 'synced' : 'live'}
                    >{contextSync ? contextSync.text : context}</pre>
                  </div>
                )}
                {adminPanel === 'history' && (() => {
                  // Real session history derived from the live AppContext
                  // — what this agent would actually see as dynamic
                  // variables right now. The hardcoded 4-row list lied:
                  // identical content for Sales Coach / Sarah / dev_test
                  // regardless of which agent was active or what the
                  // operator had been doing.
                  const fmt = (v) => {
                    if (v == null) return '—';
                    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
                    try { return JSON.stringify(v); } catch (_) { return String(v); }
                  };
                  const rows = [];
                  if (appCtx.route) {
                    rows.push({ key: 'active route', value: appCtx.route });
                  }
                  if (appCtx.selection) {
                    rows.push({
                      key: 'selection',
                      value: `${appCtx.selection.type || '?'} · ${appCtx.selection.id || '?'}`,
                    });
                  }
                  const extras = appCtx.extra || {};
                  // Surface the keys that matter for this agent's binding.
                  const surfaceKeys = [
                    'triggered_from',
                    'selected_agent_key',
                    'selected_runtime_agent_id',
                    'selected_runtime_agent_name',
                    'selected_eval_run',
                    'selected_eval_suite',
                    'selected_eval_verdict',
                    'selected_eval_score',
                    'eval_failed_axes',
                    'address_blockers_proposal_id',
                    'proposal_v3_call_id',
                  ];
                  for (const k of surfaceKeys) {
                    if (extras[k] != null && extras[k] !== '' && extras[k] !== 'none') {
                      rows.push({ key: k.replace(/_/g, ' '), value: fmt(extras[k]) });
                    }
                  }
                  return (
                    <div data-testid="agent-history-panel">
                      {rows.length === 0 ? (
                        <div className="muted" data-testid="agent-history-empty" style={{padding: '8px 0', fontSize: 12}}>
                          No session activity yet · interact with the app (select a lead, sync an eval run, address blockers) and the agent's bound dynamic variables will populate here.
                        </div>
                      ) : (
                        <div className="agent-admin-grid" data-testid="agent-history-grid">
                          {rows.map(r => (
                            <div key={r.key} data-testid="agent-history-row">
                              <div className="eyebrow">{r.key}</div>
                              <div className="agent-admin-block mono" style={{fontSize: 11}}>{r.value}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {adminPanel === 'safety' && (() => {
                  // Pull real safety settings off the registry. Each
                  // agent has a `settings` block with latency_target,
                  // data_policy, allowed_modes, escalation. The previous
                  // 2-row hardcoded panel showed the same generic copy
                  // for every agent regardless of what the registry
                  // actually declared.
                  const settings = active.settings || {};
                  const SAFETY_KEYS = [
                    { key: 'latency_target', label: 'Latency target' },
                    { key: 'data_policy',    label: 'Data policy' },
                    { key: 'allowed_modes',  label: 'Allowed modes' },
                    { key: 'escalation',     label: 'Escalation policy' },
                  ];
                  const hasAny = SAFETY_KEYS.some(k => settings[k.key]);
                  return (
                    <div data-testid="agent-safety-panel">
                      {hasAny ? (
                        <div className="agent-admin-grid" data-testid="agent-safety-grid">
                          {SAFETY_KEYS.map(k => (
                            settings[k.key] ? (
                              <div key={k.key} data-testid="agent-safety-row" data-safety-key={k.key}>
                                <div className="eyebrow">{k.label}</div>
                                <div className="agent-admin-block" style={{fontSize:13}}>{settings[k.key]}</div>
                              </div>
                            ) : null
                          ))}
                        </div>
                      ) : (
                        <div className="muted" data-testid="agent-safety-empty" style={{padding:'8px 0', fontSize:12}}>
                          No safety settings declared for this agent. Add a `settings` block in <code className="mono">agents-registry.js</code> to surface latency targets, data policy, allowed modes, and escalation here.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="divider"/>

              <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
                <button className="btn btn--ghost btn--sm" onClick={() => setAdminPanel('tools')}>
                  <I3.Cog size={12}/>Tools
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => setAdminPanel('history')}>
                  <I3.Doc size={12}/>Session history
                </button>
                <button className="btn btn--primary btn--sm" data-testid="agent-refresh-context" onClick={refreshActiveContext}>
                  <I3.Refresh size={12}/>Refresh context
                </button>
              </div>
            </Card>
          </div>

          <Card title="how context works">
            <div style={{fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)'}}>
              <p style={{marginBottom: 8}}>Every ConvAI session opened from inside this app passes a <code className="mono">context</code> dynamic variable to the agent. The agent's system prompt ends with a <code className="mono">{'{{context}}'}</code> placeholder that gets replaced server-side.</p>
              <p style={{marginBottom: 8}}>The context is rebuilt live from <code className="mono">window.AppContext</code> as you click through the app — selecting a lead, a call, or a proposal updates what the agent sees in real time.</p>
              <p style={{marginBottom: 0}}>The current context for this session:</p>
            </div>
            <pre className="mono" style={{fontSize: 11, marginTop: 10, padding: 10, background: 'var(--bg-inset)', borderRadius: 'var(--r-md)', maxHeight: 240, overflow: 'auto', color: 'var(--text-2)'}}>
              {context}
            </pre>
          </Card>
        </div>
      </div>
    </div>
  );
}

Object.assign(globalThis, { AgentsPage });
