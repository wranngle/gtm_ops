/* ============================================================
   Agents page — playground + admin panel per ElevenLabs agent.
   Each agent gets:
     - live chat playground via <ConvaiWidget>
     - role / capabilities / surface-binding overview
     - editable local admin controls for prompt, voice, context, and safety
   ============================================================ */

function agentsPageOmitKeys(source, keys) {
  const blocked = new Set(keys);
  const next = {};
  Object.keys(source || {}).forEach(key => {
    if (!blocked.has(key)) next[key] = source[key];
  });
  return next;
}

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
  const defaultAgentKey = React.useMemo(() => {
    if (isAdmin) return visibleAgents[0]?.key;
    return visibleAgents.find(a => a.key === 'intake')?.key || visibleAgents[0]?.key;
  }, [isAdmin, visibleAgents]);
  const resolveVisibleKey = React.useCallback((key) => (
    visibleAgents.some(a => a.key === key) ? key : defaultAgentKey
  ), [defaultAgentKey, visibleAgents]);
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
  const scrollAgentNodeIntoView = React.useCallback((node, options = {}) => {
    if (!node) return;
    if (typeof globalThis.scrollConsoleNodeIntoView === 'function') {
      globalThis.scrollConsoleNodeIntoView(node, options);
      return;
    }
    const scroller = node.closest?.('.scroll') || document.querySelector('main.scroll');
    if (!scroller) return;
    const nodeBox = node.getBoundingClientRect();
    const scrollBox = scroller.getBoundingClientRect();
    const block = options.block || 'start';
    if (block === 'nearest') {
      if (nodeBox.top < scrollBox.top) {
        scroller.scrollTop += nodeBox.top - scrollBox.top - 8;
      } else if (nodeBox.bottom > scrollBox.bottom) {
        scroller.scrollTop += nodeBox.bottom - scrollBox.bottom + 8;
      }
      return;
    }
    scroller.scrollTop += nodeBox.top - scrollBox.top - 12;
  }, []);
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
            scrollAgentNodeIntoView(evalHandoffBannerRef.current, { block: 'start' });
            return;
          }
          scrollAgentNodeIntoView(adminCardRef.current, { block: 'start' });
        });
      }
      if (ctx.extra?.new_agent_intent) {
        setNewAgentPanelOpen(true);
        setAdminPanel('tools');
      }
    };
    applySelection(globalThis.AppContext.get());
    return globalThis.AppContext.subscribe(applySelection);
  }, [resolveVisibleKey, scrollAgentNodeIntoView]);
  const active = globalThis.AGENT_REGISTRY.byKey(activeKey) || visibleAgents[0];
  const [agentDrafts, setAgentDrafts] = React.useState({});
  const activeDraft = React.useMemo(() => {
    if (!active) return null;
    const saved = agentDrafts[active.key];
    return saved || {
      display_name: active.display_name || '',
      role: active.role || '',
      description: active.description || '',
      mode: active.mode || '',
      voice_id: active.voice_id || '',
      model: active.model || '',
      first_message: active.first_message || '',
      system_prompt: active.system_prompt || '',
      settings: { ...(active.settings || {}) },
    };
  }, [active?.key, agentDrafts]);
  const activeView = active && activeDraft
    ? { ...active, ...activeDraft, settings: { ...(active.settings || {}), ...(activeDraft.settings || {}) } }
    : active;
  const activeSurfaceLabel = globalThis.AGENT_REGISTRY.surfaceLabel?.(active.surface) || active.surface || 'console';
  const isReceptionistAgent = active.key === 'intake';
  const publicAgentName = activeView.display_name;
  const publicAgentSubtitle = isAdmin
    ? `${activeView.role} · ${activeView.mode}`
    : isReceptionistAgent
      ? 'AI receptionist · ready'
      : `${activeView.role || 'voice agent'} · ready`;
  const publicSetupLabel = isReceptionistAgent ? 'Receptionist setup' : `${activeView.display_name} wrapper`;
  const publicSetupEyebrow = isReceptionistAgent ? 'phone setup' : 'local wrapper';
  const publicSetupAction = isReceptionistAgent ? 'Edit phone setup' : 'Edit local wrapper';
  const publicSetupSaveLabel = isReceptionistAgent ? 'Save phone setup' : 'Save wrapper';
  const publicGreetingLabel = isReceptionistAgent ? 'Greeting' : 'Opening line';
  const publicPreviewLabel = isReceptionistAgent ? 'Test call' : 'Test session';
  const publicPreviewReady = isReceptionistAgent ? 'Ready to preview greeting' : 'Ready to preview opening line';
  const publicPreviewPlaying = isReceptionistAgent ? 'Playing greeting preview' : 'Playing opening line preview';
  const publicPreviewHelp = isReceptionistAgent ? 'Preview the saved greeting before callers hear it.' : 'Preview the selected agent opening line before a live session.';
  const publicRouteEyebrow = isReceptionistAgent ? 'Your AI receptionist' : 'Local ElevenLabs agent';
  const publicPlayLabel = isReceptionistAgent ? 'Play greeting' : 'Play opening';
  const publicStopLabel = 'Stop preview';
  const activeToolCount = Array.isArray(active.tools) ? active.tools.length : 0;
  const [phoneDrafts, setPhoneDrafts] = React.useState({});
  const [phoneSaveMeta, setPhoneSaveMeta] = React.useState({});
  const [greetingPreviewing, setGreetingPreviewing] = React.useState(false);
  const [greetingPreviewFallback, setGreetingPreviewFallback] = React.useState(false);
  const greetingPreviewTimerRef = React.useRef(null);
  const greetingPreviewStartedAtRef = React.useRef(0);
  const activePhoneDraft = React.useMemo(() => {
    if (!activeView) return null;
    return phoneDrafts[active.key] || {
      greeting: activeView.first_message || '',
      hoursStart: activeView.settings?.hours_start || '07:00',
      hoursEnd: activeView.settings?.hours_end || '19:00',
      handoffName: activeView.settings?.handoff_owner || 'Maria',
      deflectionCap: String(activeView.settings?.deflection_cap || 2),
    };
  }, [active?.key, activeView?.first_message, activeView?.settings, phoneDrafts]);
  const agentTimeLabel = (value) => {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
    if (!match) return value || '--';
    const hours = Number.parseInt(match[1], 10);
    const minutes = match[2];
    if (!Number.isFinite(hours)) return value || '--';
    const suffix = hours >= 12 ? 'p' : 'a';
    const hour12 = hours % 12 || 12;
    return minutes === '00' ? `${hour12}${suffix}` : `${hour12}:${minutes}${suffix}`;
  };
  const normalizeAgentTimeInput = (value, fallback) => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return fallback;
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) {
      return fallback;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };
  const routeFacts = isAdmin
    ? [
      ['surface', activeSurfaceLabel],
      ['route', appCtx.route || 'agents'],
      ['context', `${contextLines} ${contextLines === 1 ? 'line' : 'lines'}`],
      ['admin', adminPanel],
    ]
    : isReceptionistAgent ? [
      ['status', 'Answering now'],
      ['hours', `M-F ${agentTimeLabel(activePhoneDraft?.hoursStart || '07:00')}-${agentTimeLabel(activePhoneDraft?.hoursEnd || '19:00')}`],
      ['handoff', `${activePhoneDraft?.handoffName || 'Maria'} after ${activePhoneDraft?.deflectionCap || '2'} ${(activePhoneDraft?.deflectionCap || '2') === '1' ? 'try' : 'tries'}`],
    ] : [
      ['status', 'Ready for coaching'],
      ['surface', activeSurfaceLabel],
      ['context', `${contextLines} ${contextLines === 1 ? 'line' : 'lines'}`],
    ];
  const publicPreviewSummary = isReceptionistAgent
    ? `${activePhoneDraft?.hoursStart || '07:00'}-${activePhoneDraft?.hoursEnd || '19:00'} · after-hours to ${activePhoneDraft?.handoffName || 'Maria'} after ${activePhoneDraft?.deflectionCap || '2'} tries`
    : `${activeSurfaceLabel} · ${contextLines} ${contextLines === 1 ? 'context line' : 'context lines'} · ${activeToolCount || 0} local ${activeToolCount === 1 ? 'tool' : 'tools'}`;
  const phoneBaseline = React.useMemo(() => ({
    greeting: activeView?.first_message || '',
    hoursStart: activeView?.settings?.hours_start || '07:00',
    hoursEnd: activeView?.settings?.hours_end || '19:00',
    handoffName: activeView?.settings?.handoff_owner || 'Maria',
    deflectionCap: String(activeView?.settings?.deflection_cap || 2),
  }), [
    activeView?.first_message,
    activeView?.settings?.hours_start,
    activeView?.settings?.hours_end,
    activeView?.settings?.handoff_owner,
    activeView?.settings?.deflection_cap,
  ]);
  const phoneSetupDirty = Boolean(activePhoneDraft && (
    String(activePhoneDraft.greeting || '') !== String(phoneBaseline.greeting || '') ||
    normalizeAgentTimeInput(activePhoneDraft.hoursStart, '07:00') !== normalizeAgentTimeInput(phoneBaseline.hoursStart, '07:00') ||
    normalizeAgentTimeInput(activePhoneDraft.hoursEnd, '19:00') !== normalizeAgentTimeInput(phoneBaseline.hoursEnd, '19:00') ||
    String(activePhoneDraft.handoffName || '') !== String(phoneBaseline.handoffName || '') ||
    String(Number(activePhoneDraft.deflectionCap) || 2) !== String(Number(phoneBaseline.deflectionCap) || 2)
  ));
  const activePhoneSaveMeta = active?.key ? phoneSaveMeta[active.key] : null;
  const phoneSetupStatus = phoneSetupDirty
    ? 'unsaved local edits'
    : activePhoneSaveMeta
      ? `saved ${activePhoneSaveMeta.atLabel} · ${activePhoneSaveMeta.summary}`
      : 'current registry settings';
  const phoneSetupStatusState = phoneSetupDirty ? 'dirty' : activePhoneSaveMeta ? 'saved' : 'clean';
  const setPhoneDraftValue = (field, value) => {
    if (!active) return;
    setPhoneDrafts(prev => ({
      ...prev,
      [active.key]: {
        ...(prev[active.key] || activePhoneDraft || {}),
        [field]: value,
      },
    }));
  };
  const savePhoneSetup = () => {
    if (!active || !activePhoneDraft) return;
    setAgentDrafts(prev => {
      const current = prev[active.key] || activeDraft;
      return {
        ...prev,
        [active.key]: {
          ...current,
          first_message: activePhoneDraft.greeting,
          settings: {
            ...(current.settings || {}),
            hours_start: activePhoneDraft.hoursStart,
            hours_end: activePhoneDraft.hoursEnd,
            handoff_owner: activePhoneDraft.handoffName,
            deflection_cap: Number(activePhoneDraft.deflectionCap) || 2,
          },
        },
      };
    });
    const at = new Date();
    setPhoneSaveMeta(prev => ({
      ...prev,
      [active.key]: {
        atLabel: at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        summary: `${activePhoneDraft.hoursStart}-${activePhoneDraft.hoursEnd} · ${activePhoneDraft.handoffName || 'handoff owner'} after ${activePhoneDraft.deflectionCap || '2'} ${String(activePhoneDraft.deflectionCap || '2') === '1' ? 'try' : 'tries'}`,
      },
    }));
  };
  const clearGreetingPreviewTimer = () => {
    if (!greetingPreviewTimerRef.current) return;
    globalThis.clearTimeout(greetingPreviewTimerRef.current);
    greetingPreviewTimerRef.current = null;
  };
  const finishGreetingPreview = (minimumVisibleMs = 900) => {
    const elapsed = Date.now() - (greetingPreviewStartedAtRef.current || 0);
    const remaining = Math.max(0, minimumVisibleMs - elapsed);
    clearGreetingPreviewTimer();
    greetingPreviewTimerRef.current = globalThis.setTimeout(() => {
      greetingPreviewTimerRef.current = null;
      setGreetingPreviewing(false);
      setGreetingPreviewFallback(false);
    }, remaining);
  };
  const stopGreetingPreview = () => {
    clearGreetingPreviewTimer();
    setGreetingPreviewing(false);
    setGreetingPreviewFallback(false);
    try {
      globalThis.speechSynthesis?.cancel?.();
    } catch (_) { /* Browser speech preview is best-effort. */ }
  };
  const playGreetingPreview = () => {
    if (!activePhoneDraft?.greeting) return;
    if (greetingPreviewing) {
      stopGreetingPreview();
      return;
    }
    clearGreetingPreviewTimer();
    greetingPreviewStartedAtRef.current = Date.now();
    setGreetingPreviewing(true);
    setGreetingPreviewFallback(false);
    try {
      if (globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance) {
        globalThis.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(activePhoneDraft.greeting.slice(0, 260));
        utterance.rate = 0.98;
        utterance.pitch = 1.04;
        utterance.onend = () => finishGreetingPreview(900);
        utterance.onerror = () => {
          setGreetingPreviewFallback(true);
          finishGreetingPreview(1800);
        };
        globalThis.speechSynthesis.speak(utterance);
      } else {
        setGreetingPreviewFallback(true);
        greetingPreviewTimerRef.current = globalThis.setTimeout(() => {
          greetingPreviewTimerRef.current = null;
          setGreetingPreviewing(false);
          setGreetingPreviewFallback(false);
        }, 2200);
      }
    } catch (_) {
      setGreetingPreviewFallback(true);
      greetingPreviewTimerRef.current = globalThis.setTimeout(() => {
        greetingPreviewTimerRef.current = null;
        setGreetingPreviewing(false);
        setGreetingPreviewFallback(false);
      }, 2200);
    }
    if (!greetingPreviewTimerRef.current) {
      greetingPreviewTimerRef.current = globalThis.setTimeout(() => {
        greetingPreviewTimerRef.current = null;
        setGreetingPreviewing(false);
        setGreetingPreviewFallback(false);
      }, 10_000);
    }
  };
  React.useEffect(() => () => stopGreetingPreview(), []);
  React.useEffect(() => { stopGreetingPreview(); }, [active.key]);
  const setAgentDraftValue = (field, value) => {
    if (!active) return;
    setAgentDrafts(prev => ({
      ...prev,
      [active.key]: {
        ...(prev[active.key] || activeDraft),
        [field]: value,
      },
    }));
  };
  const setAgentDraftSetting = (field, value) => {
    if (!active) return;
    setAgentDrafts(prev => {
      const current = prev[active.key] || activeDraft;
      return {
        ...prev,
        [active.key]: {
          ...current,
          settings: {
            ...(current.settings || {}),
            [field]: value,
          },
        },
      };
    });
  };
  const resetAgentDraft = () => {
    if (!active) return;
    setAgentDrafts(prev => {
      const next = { ...prev };
      delete next[active.key];
      return next;
    });
    globalThis.toast(`${active.display_name} settings reset`, { sub: 'local draft restored from agents-registry.js', tone: 'neutral' });
  };
  const saveAgentDraft = () => {
    if (!activeView) return;
    globalThis.toast(`${activeView.display_name} settings saved`, { sub: 'local draft retained for this console session', tone: 'accent' });
  };
  const appExtra = appCtx.extra || {};
  React.useEffect(() => {
    if (!appExtra.phone_setup_preview) return;
    const requestedKey = appExtra.selected_agent_key;
    if (requestedKey && active?.key !== requestedKey) return;
    const frame = requestAnimationFrame(() => {
      scrollAgentNodeIntoView(adminCardRef.current, { block: 'start' });
      playGreetingPreview();
      const current = globalThis.AppContext.get();
      const nextExtra = { ...(current.extra || {}) };
      delete nextExtra.phone_setup_preview;
      globalThis.AppContext.set({ extra: nextExtra });
    });
    return () => cancelAnimationFrame(frame);
  }, [appExtra.phone_setup_preview, appExtra.selected_agent_key, active?.key, activePhoneDraft?.greeting, scrollAgentNodeIntoView]);
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
      scrollAgentNodeIntoView(evalHandoffBannerRef.current, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [appExtra.triggered_from, appExtra.selected_eval_run, adminPanel, scrollAgentNodeIntoView]);
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
      setAdminFocusNotice(`${activeView?.display_name || 'Agent'} local admin focused · ${label}`);
    }
    requestAnimationFrame(() => {
      scrollAgentNodeIntoView(adminCardRef.current, { block: 'start' });
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
      scrollAgentNodeIntoView(adminCardRef.current, { block: 'start' });
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
      agentName: activeView.display_name,
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
      scrollAgentNodeIntoView(adminCardRef.current, { block: 'start' });
    });
    globalThis.toast(`${activeView.display_name} · context refreshed`, { sub: 'Visible context packet updated in local admin', tone: 'accent' });
  };
  const dismissNewAgentPanel = () => {
    setNewAgentPanelOpen(false);
    const extra = globalThis.AppContext.get().extra || {};
    globalThis.AppContext.set({
      extra: agentsPageOmitKeys(extra, ['new_agent_intent', 'new_agent_template_key', 'new_agent_panel']),
    });
  };
  if (!active) {
    return (
      <div className="page page--wide page--agents">
        <PageHeader title="Agents" sub="No ElevenLabs agents are wired into this workspace yet."/>
      </div>
    );
  }

  return (
    <div className="page page--wide page--agents" data-screen-label="Agents">
      <h1 id="console-page-title" className="sr-only">Agents</h1>

      <section className="agent-route-strip" aria-label="Selected agent status">
        <div className="agent-route-strip__active">
          <window.ElevenUI.Orb
            size={38}
            state="idle"
            color1={active.avatar_color_1}
            color2={active.avatar_color_2}
            label={`${publicAgentName} selected`}
          />
          <div>
            <div className="eyebrow eyebrow--accent">{isAdmin ? (active.key === 'intake' ? 'Sarah Intake' : 'Voice agent setup') : publicRouteEyebrow}</div>
            <strong>{publicAgentName}</strong>
          </div>
        </div>
        <div className="agent-route-strip__facts" aria-label="Current agent context facts">
          {routeFacts.map(([label, value]) => (
            <span key={label} data-testid={`agent-route-fact-${label}`}>
              <span className="agent-route-strip__fact-label">{label}</span>
              <code className="mono">{value}</code>
            </span>
          ))}
        </div>
        <div className="agent-route-strip__actions">
          <button
            className="btn btn--primary btn--sm"
            aria-label="Open local ElevenLabs workspace settings"
            data-testid="agents-workspace-settings"
            onClick={openWorkspaceAgentSettings}
          ><I3.Cog size={12}/>Local ElevenLabs settings</button>
        </div>
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

      {isAdmin && newAgentPanelOpen && (
        <section
          className="agent-new-setup"
          data-testid="agent-new-setup"
          role="region"
          aria-label="New ElevenLabs agent setup"
        >
          <div className="agent-new-setup__copy">
            <div className="eyebrow eyebrow--accent">new agent setup</div>
            <h2>Build the local wrapper before leaving the console.</h2>
            <p>Set how the receptionist greets callers, when she answers, and who takes over when a job needs a human.</p>
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
        <Card title={isAdmin ? `agents · ${visibleAgents.length}` : `ElevenLabs agents · ${visibleAgents.length}`} className="card--accent agents-picker-card">
          <div className="agents-picker-list vstack" role="list" aria-label="ElevenLabs agents wired into this console">
            {visibleAgents.map(a => {
              const rowName = a.display_name;
              const rowRole = isAdmin
                ? a.role
                : a.key === 'intake'
                  ? 'AI receptionist · answers callers and hands off jobs'
                  : a.role || 'voice agent';
              return (
              <div key={a.key} role="listitem" className="agents-picker-list__item">
                <button
                  type="button"
                  className="agent-row"
                  data-testid="agents-picker-row"
                  data-active={activeKey === a.key}
                  data-agent-key={a.key}
                  onClick={() => setActiveKey(a.key)}
                  aria-pressed={activeKey === a.key}
                  aria-label={`${rowName} ${rowRole} ${globalThis.AGENT_REGISTRY.surfaceLabel?.(a.surface) || a.surface}`}
                >
                  <window.ElevenUI.Orb size={34} color1={a.avatar_color_1} color2={a.avatar_color_2} label={`${rowName} state`}/>
                  <div className="agent-row__copy">
                    <div className="agent-row__name">{rowName}</div>
                    <div className="agent-row__role">{rowRole}</div>
                  </div>
                  <span className="agent-row__surface" data-testid="agent-surface-label">{globalThis.AGENT_REGISTRY.surfaceLabel?.(a.surface) || a.surface}</span>
                </button>
              </div>
              );
            })}
          </div>
        </Card>

        <div className="vstack agents-workbench" style={{minWidth: 0}}>
          <Card title={isAdmin ? `playground · ${activeView.display_name}` : 'Test call preview'} accent="accent" className="agent-playground-card">
            {/* The playground frames the raw ConvAI web component with the
                local ElevenLabs UI primitives (Orb, BarVisualizer, status
                bar) so the operator gets the same visual contract here as
                in the eval lab — not a bare embedded widget. */}
            <div className="el-agent-panel agent-playground-frame">
              <div className="el-agent-panel__head">
                <window.ElevenUI.Orb
                  size={48}
                  state={greetingPreviewing ? 'talking' : 'idle'}
                  color1={active.avatar_color_1}
                  color2={active.avatar_color_2}
                  label={`${publicAgentName} playground state`}
                />
                <div className="agent-playground-frame__identity">
                  <div data-testid="agent-playground-title">{publicAgentName}</div>
                  <div className="mono dim" data-testid="agent-playground-subtitle">{publicAgentSubtitle}</div>
                </div>
                <window.ElevenUI.BarVisualizer
                  active={greetingPreviewing}
                  tone="accent"
                  bars={[.32,.58,.41,.74,.5,.36,.66,.45,.82,.4,.58,.3]}
                />
              </div>
              <div className="el-conversation-bar" role="status" aria-live="polite" data-testid="agent-context-bar">
                <I3.Mic size={14}/>
                {isAdmin ? (
                  <span>
                    Console context packet: <code className="mono">{contextLines} {contextLines === 1 ? 'line' : 'lines'}</code>
                    {' '}from <code className="mono">{appCtx.route || 'agents'}</code>
                  </span>
                ) : (
                  <span>
                    {greetingPreviewing
                      ? greetingPreviewFallback
                        ? `${publicAgentName} visual preview running; browser audio unavailable.`
                        : `${publicAgentName} preview playing locally.`
                      : publicPreviewHelp}
                  </span>
                )}
                {!isAdmin && (
                  <button
                    type="button"
                    className="el-conversation-bar__action"
                    data-testid="agent-playground-play-greeting"
                    aria-pressed={greetingPreviewing}
                    disabled={!activePhoneDraft?.greeting}
                    onClick={playGreetingPreview}
                  >
                    {greetingPreviewing ? <I3.Pause size={11}/> : <I3.Play size={11}/>}
                    {greetingPreviewing ? publicStopLabel : publicPlayLabel}
                  </button>
                )}
                <Badge tone="accent">{greetingPreviewing ? 'playing' : 'ready'}</Badge>
              </div>
              {isAdmin && (
                <div className="agent-admin-quick" aria-label="Local agent admin shortcuts">
                  <div className="agent-admin-quick__head">
                    <div>
                      <div className="eyebrow eyebrow--accent">
                        {publicSetupEyebrow}<span className="sr-only"> local admin</span>
                      </div>
                      <strong>{publicAgentName}</strong>
                      <div className="mono dim" data-testid="agent-local-wrapper-id" style={{fontSize: 10, marginTop: 2}}>
                        wrapper id {active.key}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost btn--xs"
                      data-testid="agent-open-local-admin"
                      aria-controls="agent-local-admin-panel"
                      onClick={() => openAdminSection(adminPanel || 'prompt', 'shortcut')}
                    ><I3.Cog size={11}/>Focus local admin</button>
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
              )}
	            </div>
	            <div className="eval-convai-frame agent-playground-convai" role="region" aria-label={`${publicAgentName} playground chat`} data-testid="agent-playground-convai">
	              <div className="agent-session-strip" aria-label={isAdmin ? 'Active ElevenLabs session packet' : 'Phone test preview'}>
	                <div>
	                  <div className="eyebrow eyebrow--accent">{isAdmin ? 'ElevenLabs session' : publicPreviewLabel}</div>
	                  <strong>{publicAgentName}</strong>
	                </div>
	                <Badge tone="accent">embedded</Badge>
	                {isAdmin ? (
	                  <div className="agent-session-strip__grid">
	                    <span>route <code className="mono">{appCtx.route}</code></span>
	                    <span>context <code className="mono">{contextLines} {contextLines === 1 ? 'line' : 'lines'}</code></span>
	                    <span>tools <code className="mono">{(active.tools || []).length || 3} local</code></span>
	                  </div>
	                ) : (
	                  <div className="agent-session-strip__grid">
	                    {isReceptionistAgent ? (
	                      <>
	                        <span>greeting <code className="mono">ready</code></span>
	                        <span>hours <code className="mono">{activePhoneDraft?.hoursStart || '07:00'}-{activePhoneDraft?.hoursEnd || '19:00'}</code></span>
	                        <span>handoff <code className="mono">{activePhoneDraft?.handoffName || 'Maria'}</code></span>
	                      </>
	                    ) : (
	                      <>
	                        <span>opening <code className="mono">ready</code></span>
	                        <span>context <code className="mono">{contextLines} {contextLines === 1 ? 'line' : 'lines'}</code></span>
	                        <span>tools <code className="mono">{activeToolCount || 0} local</code></span>
	                      </>
	                    )}
	                  </div>
	                )}
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
            {!isAdmin && (
              <div className="agent-admin-quick" aria-label="Local agent admin shortcuts">
                <div className="agent-admin-quick__head">
                  <div>
                    <div className="eyebrow eyebrow--accent">
                      {publicSetupEyebrow}<span className="sr-only"> local admin</span>
                    </div>
                    <strong>{publicAgentName}</strong>
                    <div className="mono dim" data-testid="agent-local-wrapper-id" style={{fontSize: 10, marginTop: 2}}>
                      {isReceptionistAgent ? 'greeting · hours · handoff' : 'opening line · context · tools'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--xs"
                    data-testid="agent-open-local-admin"
                    aria-controls="agent-local-admin-panel"
                    onClick={() => openAdminSection(adminPanel || 'prompt', 'shortcut')}
                  ><I3.Cog size={11}/>{publicSetupAction}</button>
                </div>
              </div>
            )}
          </Card>

	          {isAdmin ? (
	          <div id="agent-local-admin-panel" ref={adminCardRef} className="agent-admin-focus-target" data-testid="agent-local-admin-panel" tabIndex={-1}>
            <Card
              title={<>
                ElevenLabs setup · {activeView.display_name}
                <span className="sr-only"> local admin · {activeView.display_name}</span>
              </>}
              className="agent-admin-card"
            >
              {adminFocusNotice && (
                <div
                  className="agent-admin-focus-status"
                  data-testid="agent-local-admin-focus-status"
                  role="status"
                  aria-live="polite"
                >{adminFocusNotice}</div>
              )}
              <div className="agent-admin-hero">
                <window.ElevenUI.Orb size={76} state="talking" color1={active.avatar_color_1} color2={active.avatar_color_2} label={`${activeView.display_name} admin state`}/>
                <div className="agent-admin-hero__copy">
                  <div className="eyebrow eyebrow--accent">
                    {isAdmin ? (globalThis.AGENT_REGISTRY.surfaceLabel?.(active.surface) || active.surface) : 'AI receptionist'} · {activeView.mode}
                  </div>
                  <h2>{activeView.display_name}</h2>
                  <p>{activeView.description}</p>
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
	                    <label className="field" data-testid="agent-prompt-role">
	                      <span className="field__label">System role</span>
	                      <input
	                        className="input"
	                        data-testid="agent-prompt-role-input"
	                        value={activeView.role}
	                        onChange={(e) => setAgentDraftValue('role', e.target.value)}
	                      />
	                    </label>
	                    <label className="field" data-testid="agent-prompt-name">
	                      <span className="field__label">Agent name</span>
	                      <input
	                        className="input"
	                        data-testid="agent-prompt-name-input"
	                        value={activeView.display_name}
	                        onChange={(e) => setAgentDraftValue('display_name', e.target.value)}
	                      />
	                    </label>
	                    <label className="field" data-testid="agent-prompt-description">
	                      <span className="field__label">Description</span>
	                      <textarea
	                        className="textarea agent-admin-textarea"
	                        data-testid="agent-prompt-description-input"
	                        rows={4}
	                        value={activeView.description}
	                        onChange={(e) => setAgentDraftValue('description', e.target.value)}
	                      />
	                    </label>
	                    <div data-testid="agent-prompt-context-contract">
	                      <div className="eyebrow">Context contract</div>
	                      <div className="agent-admin-block mono">{'{{context}}'} appended to every session</div>
	                    </div>
	                    <label className="field agent-admin-grid__wide" data-testid="agent-prompt-system">
	                      <span className="field__label">System prompt</span>
	                      <textarea
	                        className="textarea agent-admin-json agent-admin-textarea"
	                        data-testid="agent-prompt-system-input"
	                        rows={10}
	                        aria-label={`${activeView.display_name} system prompt`}
	                        value={activeView.system_prompt}
	                        onChange={(e) => setAgentDraftValue('system_prompt', e.target.value)}
	                      />
	                    </label>
	                  </div>
	                )}
	                {adminPanel === 'voice' && (
	                  <div className="agent-admin-grid" data-testid="agent-voice-panel">
	                    <label className="field" data-testid="agent-voice-mode">
	                      <span className="field__label">Voice mode</span>
	                      <input className="input" value={activeView.mode} onChange={(e) => setAgentDraftValue('mode', e.target.value)} />
	                    </label>
	                    <label className="field agent-admin-grid__wide" data-testid="agent-voice-first-message">
	                      <span className="field__label">First message</span>
	                      <textarea
	                        className="textarea agent-admin-textarea"
	                        rows={5}
	                        value={activeView.first_message}
	                        onChange={(e) => setAgentDraftValue('first_message', e.target.value)}
	                      />
	                    </label>
	                    <label className="field" data-testid="agent-voice-id">
	                      <span className="field__label">Voice ID</span>
	                      <input className="input mono" value={activeView.voice_id} onChange={(e) => setAgentDraftValue('voice_id', e.target.value)} />
	                    </label>
	                    <label className="field" data-testid="agent-voice-model">
	                      <span className="field__label">Model</span>
	                      <input className="input mono" value={activeView.model} onChange={(e) => setAgentDraftValue('model', e.target.value)} />
	                    </label>
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
	                      aria-label={`${activeView.display_name} agent context`}
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
                    'proposal_draft_call_id',
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
	                  const settings = activeView.settings || {};
                  const SAFETY_KEYS = [
                    { key: 'latency_target', label: 'Latency target' },
                    { key: 'data_policy',    label: 'Data policy' },
                    { key: 'allowed_modes',  label: 'Allowed modes' },
                    { key: 'escalation',     label: 'Escalation policy' },
                  ];
                  return (
                    <div data-testid="agent-safety-panel">
	                      <div className="agent-admin-grid" data-testid="agent-safety-grid">
	                        {SAFETY_KEYS.map(k => (
	                          <label key={k.key} className="field" data-testid="agent-safety-row" data-safety-key={k.key}>
	                            <span className="field__label">{k.label}</span>
	                            <textarea
	                              className="textarea agent-admin-textarea"
	                              rows={3}
	                              value={settings[k.key] || ''}
	                              onChange={(e) => setAgentDraftSetting(k.key, e.target.value)}
	                            />
	                          </label>
	                        ))}
	                      </div>
	                    </div>
	                  );
                })()}
              </div>

              <div className="divider"/>

              <div className="agent-admin-actions">
                <button className="btn btn--ghost btn--sm" data-testid="agent-reset-settings" onClick={resetAgentDraft}>
                  <I3.Close size={12}/>Reset edits
                </button>
                <button className="btn btn--primary btn--sm" data-testid="agent-save-settings" onClick={saveAgentDraft}>
                  <I3.Doc size={12}/>Save settings
                </button>
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
	          ) : (
	          <div id="agent-local-admin-panel" ref={adminCardRef} className="agent-admin-focus-target" data-testid="agent-local-admin-panel" tabIndex={-1}>
	            <Card title={publicSetupLabel} className="agent-phone-card">
	              {adminFocusNotice && (
	                <div
	                  className="agent-admin-focus-status"
	                  data-testid="agent-local-admin-focus-status"
	                  role="status"
	                  aria-live="polite"
	                >{adminFocusNotice.replace('local admin', publicSetupEyebrow)}</div>
	              )}
	              <div className="phone-setup-grid" data-testid="phone-setup-panel">
	                <label className="field phone-setup-grid__wide" data-testid="phone-setup-greeting">
	                  <span className="field__label">{publicGreetingLabel}</span>
	                  <textarea
	                    className="textarea agent-admin-textarea"
	                    data-testid="phone-setup-greeting-input"
	                    rows={5}
	                    value={activePhoneDraft?.greeting || ''}
	                    onChange={(e) => setPhoneDraftValue('greeting', e.target.value)}
	                  />
	                </label>
	                <div className="phone-setup-hours" data-testid="phone-setup-hours">
	                  <label className="field">
	                    <span className="field__label">Opens</span>
	                    <input
	                      className="input mono"
	                      type="text"
	                      inputMode="numeric"
	                      pattern="[0-2][0-9]:[0-5][0-9]"
	                      placeholder="07:00"
	                      data-testid="phone-setup-hours-start"
	                      value={activePhoneDraft?.hoursStart || '07:00'}
	                      onChange={(e) => setPhoneDraftValue('hoursStart', e.target.value)}
	                      onBlur={() => setPhoneDraftValue('hoursStart', normalizeAgentTimeInput(activePhoneDraft?.hoursStart, '07:00'))}
	                    />
	                  </label>
	                  <label className="field">
	                    <span className="field__label">Closes</span>
	                    <input
	                      className="input mono"
	                      type="text"
	                      inputMode="numeric"
	                      pattern="[0-2][0-9]:[0-5][0-9]"
	                      placeholder="19:00"
	                      data-testid="phone-setup-hours-end"
	                      value={activePhoneDraft?.hoursEnd || '19:00'}
	                      onChange={(e) => setPhoneDraftValue('hoursEnd', e.target.value)}
	                      onBlur={() => setPhoneDraftValue('hoursEnd', normalizeAgentTimeInput(activePhoneDraft?.hoursEnd, '19:00'))}
	                    />
	                  </label>
	                </div>
	                <label className="field" data-testid="phone-setup-handoff-name">
	                  <span className="field__label">After-hours handoff</span>
	                  <input
	                    className="input"
	                    data-testid="phone-setup-handoff-input"
	                    value={activePhoneDraft?.handoffName || 'Maria'}
	                    onChange={(e) => setPhoneDraftValue('handoffName', e.target.value)}
	                  />
	                </label>
	                <label className="field" data-testid="phone-setup-deflections">
	                  <span className="field__label">Try limit</span>
	                  <input
	                    className="input mono"
	                    type="number"
	                    min="1"
	                    max="5"
	                    data-testid="phone-setup-deflection-input"
	                    value={activePhoneDraft?.deflectionCap || '2'}
	                    onChange={(e) => setPhoneDraftValue('deflectionCap', e.target.value)}
	                  />
	                </label>
	                <div className="phone-setup-preview phone-setup-grid__wide" data-active={greetingPreviewing ? 'true' : 'false'} data-preview-mode={greetingPreviewFallback ? 'visual' : greetingPreviewing ? 'audio' : 'idle'} data-testid="phone-setup-preview">
	                  <window.ElevenUI.BarVisualizer
	                    active={greetingPreviewing}
	                    tone="accent"
	                    bars={[.28,.52,.44,.8,.63,.37,.74,.55,.9,.48,.68,.36]}
	                  />
	                  <div>
	                    <div className="eyebrow eyebrow--accent">{publicPreviewLabel}</div>
	                    <strong>{greetingPreviewing ? greetingPreviewFallback ? 'Visual preview running' : publicPreviewPlaying : publicPreviewReady}</strong>
	                    <p>{activePhoneDraft?.hoursStart || '07:00'}-{activePhoneDraft?.hoursEnd || '19:00'} · after-hours to {activePhoneDraft?.handoffName || 'Maria'} after {activePhoneDraft?.deflectionCap || '2'} tries</p>
	                  </div>
	                </div>
	              </div>
	              <div className="divider"/>
	              <div className="agent-admin-actions">
	                <div
	                  className="phone-setup-save-status"
	                  data-testid="phone-setup-save-status"
	                  data-state={phoneSetupStatusState}
	                  role="status"
	                  aria-live="polite"
	                >
	                  <span className="eyebrow eyebrow--accent">{phoneSetupDirty ? 'draft' : activePhoneSaveMeta ? 'saved' : 'ready'}</span>
	                  <span>{phoneSetupStatus}</span>
	                </div>
	                <button
	                  className="btn btn--ghost btn--sm"
	                  data-testid="phone-setup-play-greeting"
	                  aria-pressed={greetingPreviewing}
	                  disabled={!activePhoneDraft?.greeting}
	                  onClick={playGreetingPreview}
	                >
	                  {greetingPreviewing ? <I3.Pause size={12}/> : <I3.Play size={12}/>}
	                  {greetingPreviewing ? publicStopLabel : publicPlayLabel}
	                </button>
	                <button
	                  className="btn btn--primary btn--sm"
	                  data-testid="phone-setup-save"
	                  disabled={!activePhoneDraft}
	                  onClick={savePhoneSetup}
	                ><I3.Doc size={12}/>{publicSetupSaveLabel}</button>
	              </div>
	            </Card>
	          </div>
	          )}
	        </div>
      </div>
    </div>
  );
}

Object.assign(globalThis, { AgentsPage });
