/* ============================================================
   Shell — Sidebar, Topbar, Command Palette, shared bits
   Exposes globals via Object.assign(window, {...}) at end.
   ============================================================ */

const { useState, useEffect, useRef, useMemo } = React;
const I = window.Icon;

/* ---------- Toast / notification system ---------- */
const __toastListeners = new Set();
window.toast = function toast(msg, opts = {}) {
  __toastListeners.forEach(fn => fn({ id: Date.now() + Math.random(), msg, ...opts }));
};

function isOpenProposalStage(stage) {
  const s = String(stage || '').trim().toLowerCase();
  return !['signed', 'closed lost', 'closed-lost', 'closed', 'lost'].includes(s);
}

function proposalAmountToThousands(amount) {
  if (typeof amount === 'number' && Number.isFinite(amount)) return amount;
  const match = String(amount || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?\s*([kmb])?/i);
  if (!match) return 0;
  const value = Number.parseFloat(match[0]);
  if (!Number.isFinite(value)) return 0;
  const unit = (match[1] || 'k').toLowerCase();
  if (unit === 'm') return value * 1000;
  if (unit === 'b') return value * 1000000;
  return value;
}

function formatProposalTotal(totalK) {
  if (!Number.isFinite(totalK) || totalK === 0) return '$0K';
  if (Math.abs(totalK) >= 1000) {
    const millions = totalK / 1000;
    return `$${millions.toFixed(Math.abs(millions) >= 10 ? 1 : 2).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')}M`;
  }
  return `$${totalK.toFixed(Math.abs(totalK) >= 100 ? 0 : 1).replace(/\.0$/, '')}K`;
}

function pluralizeCount(n, singular, plural) {
  return `${n} ${n === 1 ? singular : (plural || `${singular}s`)}`;
}

function isConsoleAdmin() {
  try { return new URLSearchParams(globalThis.location.search).has('admin'); }
  catch (_) { return false; }
}

function openSettingsTab(setRoute, tab = 'account', source = 'shell-settings') {
  const validTabs = ['account', 'integrations', 'evals', 'team', 'billing', 'security'];
  const nextTab = validTabs.includes(tab) ? tab : 'account';
  const ctx = globalThis.AppContext?.get?.() || {};
  globalThis.AppContext?.set?.({
    extra: {
      ...(ctx.extra || {}),
      settings_tab: nextTab,
      triggered_from: source,
    },
  });
  setRoute?.('settings');
  globalThis.dispatchEvent(new CustomEvent('gtm:settings-tab', { detail: { tab: nextTab } }));
  globalThis.requestAnimationFrame?.(() => {
    globalThis.dispatchEvent(new CustomEvent('gtm:settings-tab', { detail: { tab: nextTab } }));
  });
}

function shellIsMissedCall(c) {
  const outcome = String(c?.outcome || '').toLowerCase();
  return c?.missed === true || ['voicemail', 'no-answer', 'dropped', 'missed'].includes(outcome);
}

function shellCallOutcomeLabel(c) {
  return String(c?.outcome || c?.service || 'call').replace(/[-_]/g, ' ');
}

function shellCallRiskScore(c) {
  return (Number(c?.flags) || 0) + (Number(c?.deflections) || 0);
}

function shellCallWindowFor(c) {
  if (shellIsMissedCall(c)) return 'missed';
  return shellCallRiskScore(c) > 0 ? 'flagged' : 'all';
}

function buildTopbarNotifications(D) {
  const data = D || {};
  const notifications = [];
  const calls = Array.isArray(data.calls) ? data.calls : [];
  const agents = Array.isArray(data.agents) ? data.agents : [];
  const companies = Array.isArray(data.companies) ? data.companies : [];
  const evalSuites = Array.isArray(data.evalSuites) ? data.evalSuites : [];
  const feed = Array.isArray(data.feed) ? data.feed : [];

  const pausedAgent = agents.find(a => a.status === 'paused');
  if (pausedAgent) {
    const taskBlob = String(pausedAgent.currentTask || '').toLowerCase();
    const matchedCall =
      calls.find(c => c.co_id && taskBlob.includes(String(c.co_id).toLowerCase())) ||
      calls.find(c => c.co && taskBlob.includes(String(c.co).toLowerCase().split(' ')[0])) ||
      calls.slice().sort((a, b) => (Number(b.flags || 0) + Number(b.deflections || 0)) - (Number(a.flags || 0) + Number(a.deflections || 0)))[0];
    notifications.push({
      id: 'paused-agent',
      t: matchedCall?.when || 'now',
      tone: 'critical',
      title: `${pausedAgent.id} paused${matchedCall?.co ? ` on ${matchedCall.co}` : ''}`,
      sub: matchedCall
        ? `${matchedCall.outcome || 'needs review'} · ${pluralizeCount(Number(matchedCall.deflections || 0), 'handoff try', 'handoff tries')}`
        : pausedAgent.currentTask || 'awaiting human review',
      route: 'calls',
      selection: matchedCall?.id ? { type:'call', id: matchedCall.id } : null,
      extra: matchedCall?.id ? { call_workflow:'human-review', call_window:'flagged' } : {},
      act: 'Review call',
    });
  }

  const regressing = evalSuites
    .filter(data.isEvalRegressing || (s => Number(s.delta) < 0 || Number(s.pass) < 0.75))
    .slice()
    .sort((a, b) => {
      const severity = (s) => (Number(s.delta) < 0 ? Math.abs(Number(s.delta)) : 0) + (Number(s.pass) < 0.75 ? (0.75 - Number(s.pass)) : 0);
      return severity(b) - severity(a);
    })[0];
  if (regressing) {
    notifications.push({
      id: 'eval-regression',
      t: regressing.latest || 'recent',
      tone: 'warn',
      title: `${regressing.name} needs review`,
      sub: `${(Number(regressing.pass || 0) * 100).toFixed(1)}% pass · ${Number(regressing.runs || 0).toLocaleString()} runs`,
      route: 'evals',
      selection: { type:'eval', id: regressing.id },
      extra: { suite_filter:'regressions' },
      act: 'Inspect eval',
    });
  }

  const bookedCall = calls.find(c => c.outcome === 'meeting-booked') || calls.find(c => c.score >= 8);
  if (bookedCall) {
    notifications.push({
      id: 'booked-call',
      t: bookedCall.when || 'recent',
      tone: 'accent',
      title: `${bookedCall.co} ${bookedCall.outcome || 'call'} recorded`,
      sub: `${bookedCall.who || 'stakeholder'} · score ${Number(bookedCall.score || 0).toFixed(1)}`,
      route: 'calls',
      selection: { type:'call', id: bookedCall.id },
      extra: { call_workflow:'recap' },
      act: 'Open call',
    });
  }

  const hotLead = companies
    .filter(c => (c.intent === 'high' || Number(c.score) >= 80) && (data.isActivePipelineCompany || (x => !['closed', 'lost'].includes(String(x.stage || '').toLowerCase())))(c))
    .slice()
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
  if (hotLead) {
    notifications.push({
      id: 'hot-lead',
      t: hotLead.lastTouch || 'recent',
      tone: 'accent',
      title: `${hotLead.name} lead score ${hotLead.score}`,
      sub: `${hotLead.stage} · ${hotLead.nextStep || 'review next step'}`,
      route: 'pipeline',
      selection: { type:'lead', id: hotLead.id },
      act: 'Open lead',
    });
  }

  const retryEvent = feed.find(f => /retry|502|error|failed/i.test(`${f.txt || ''}`));
  if (retryEvent) {
    notifications.push({
      id: 'integration-retry',
      t: retryEvent.t || 'recent',
      tone: retryEvent.level === 'err' ? 'critical' : 'warn',
      title: retryEvent.txt.split(' — ')[0] || 'Integration retry',
      sub: retryEvent.txt.split(' — ').slice(1).join(' — ') || 'Open integration health',
      route: 'settings',
      extra: { settings_tab:'integrations' },
      act: 'Open integration',
    });
  }

  return notifications.slice(0, 5);
}

function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const fn = (t) => {
      setItems(xs => [t, ...xs]);
      setTimeout(() => setItems(xs => xs.filter(x => x.id !== t.id)), t.duration || 3200);
    };
    __toastListeners.add(fn);
    return () => __toastListeners.delete(fn);
  }, []);
  return (
    <div className="toast-host">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.tone ? `toast--${t.tone}` : ''}`}>
          <span className={`dot dot--${t.tone === 'critical' ? 'critical' : t.tone === 'warn' ? 'warn' : 'accent'}`} style={{width:6,height:6}}/>
          <div style={{flex:1}}>
            <div className="toast__msg">{t.msg}</div>
            {t.sub && <div className="toast__sub">{t.sub}</div>}
          </div>
          {t.actionLabel && <button className="btn btn--xs" onClick={() => { t.onAction?.(); }}>{t.actionLabel}</button>}
        </div>
      ))}
    </div>
  );
}

/* ---------- Tiny popover (anchored, click-outside-to-close) ----------
   Treats the popover as a non-modal dialog: announces itself as a
   landmark, moves focus to its first focusable child on open, traps
   Tab inside while open, and restores focus to the trigger on close.
   This keeps click-outside-to-close behavior (pure aria-modal would
   block that) while giving keyboard users a sane experience. */
function Popover({ open, onClose, anchorRef, children, align = 'right', width = 320, label, id }) {
  const [pos, setPos] = useState(null);
  const popRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({
      top: r.bottom + 8,
      left: align === 'right' ? Math.max(8, r.right - width) : r.left,
    });
    previousFocusRef.current = document.activeElement;
    function onDoc(e) {
      if (popRef.current && !popRef.current.contains(e.target) && !anchorRef.current.contains(e.target)) onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && popRef.current) {
        const focusables = popRef.current.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="button"]'
        );
        if (focusables.length === 0) { e.preventDefault(); return; }
        const first = focusables.item(0);
        const last = focusables.item(focusables.length - 1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // After the popover renders (pos has been computed and the DOM is in
  // place), move focus to its first focusable child.
  useEffect(() => {
    if (open && pos && popRef.current) {
      const first = popRef.current.querySelector(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="button"]'
      );
      first?.focus();
    }
  }, [open, pos]);

  // Restore focus to the original trigger when the popover closes.
  useEffect(() => {
    if (!open && previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
      try { previousFocusRef.current.focus(); } catch (_) { /* unmounted */ }
      previousFocusRef.current = null;
    }
  }, [open]);

  if (!open || !pos) return null;
  return (
    <div id={id} ref={popRef} className="popover" role="dialog" aria-label={label || 'Popover'}
         style={{ top: pos.top, left: pos.left, width }}>
      {children}
    </div>
  );
}

/* ---------- Sidebar ---------- */
function Sidebar({ route, setRoute, collapsed }) {
  const D = window.GTM;
  const isAdmin = isConsoleAdmin();
  const appCtx = globalThis.useAppContext();
  const counts = {
    pipeline: D.companies.filter(D.isActivePipelineCompany || (c => !['closed','lost'].includes(c.stage))).length,
    calls: D.calls.filter(c => c.flags > 0).length,
    proposals: D.proposals.filter(p => isOpenProposalStage(p.stage)).length,
    // Use the shared regression predicate so the sidebar badge agrees
    // with the EvalsPage filter and regression Stat tile. Previously this was just
    // `s.delta < 0` and undercounted suites whose pass dropped below
    // 0.75 without a recent delta change.
    evals: D.evalSuites.filter(D.isEvalRegressing || (s => s.delta < 0 || s.pass < 0.75)).length,
  };
  const workspaceItems = [
    { id:'home',      label:'Callbacks', icon:I.Home || I.Phone },
    { id:'generate',  label:'Generate',        icon:I.Plus },
    { id:'pipeline',  label:'Pipeline',        icon:I.Pipeline, count: counts.pipeline },
    { id:'calls',     label:'Calls',           icon:I.Phone,    count: counts.calls },
    { id:'proposals', label:'Proposals',       icon:I.Doc,      count: counts.proposals },
    { id:'evals',     label:'Evals',           icon:I.Beaker,   count: counts.evals || null },
    { id:'agents',    label:'Agents',         icon:I.Bot },
    { id:'settings',  label:'Settings',        icon:I.Cog },
  ];
  const visibleAgents = (globalThis.AGENT_REGISTRY?.agents || [])
    .filter(agent => isAdmin || agent.surface !== 'admin-only');
  const activeAgentKey = appCtx?.extra?.selected_agent_key || visibleAgents[0]?.key || null;
  const defaultWorkspaceAgentKey = isAdmin
    ? visibleAgents[0]?.key
    : (visibleAgents.find(agent => agent.key === 'intake')?.key || visibleAgents[0]?.key);
  const Orb = globalThis.ElevenUI?.Orb;
  const openWorkspaceRoute = (id) => {
    if (id === 'agents' && defaultWorkspaceAgentKey) {
      const extra = { ...(globalThis.AppContext.get().extra || {}) };
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
        'phone_setup_preview',
      ].forEach(key => { delete extra[key]; });
      globalThis.AppContext.set({
        extra: {
          ...extra,
          selected_agent_key: defaultWorkspaceAgentKey,
          triggered_from: 'sidebar-agents-route-nav',
        },
      });
    }
    setRoute(id);
  };
  const renderRouteItem = (it) => (
    <button key={it.id}
         type="button"
         className="sb__item"
         data-testid="sidebar-route"
         data-route-id={it.id}
         data-active={route === it.id}
         aria-label={`${it.ariaLabel || it.label}${it.count != null ? ` ${it.count}` : ''}`}
         aria-current={route === it.id ? 'page' : undefined}
         onClick={() => openWorkspaceRoute(it.id)}>
      <it.icon className="sb__icon" size={16} />
      <span className="sb__label">
        {it.label}
        {it.legacyLabel ? <span className="sr-only"> {it.legacyLabel}</span> : null}
      </span>
      {it.count != null && <span className="sb__count">{it.count}</span>}
    </button>
  );
  const openAgent = (agent) => {
    const ctx = globalThis.AppContext.get();
    globalThis.AppContext.set({
      extra: {
        ...(ctx.extra || {}),
        selected_agent_key: agent.key,
        selected_runtime_agent_id: agent.agent_id,
        selected_runtime_agent_name: agent.display_name,
        triggered_from: 'sidebar-agent-nav',
      },
    });
    setRoute('agents');
  };
  const renderAgentItem = (agent) => {
    const surface = globalThis.AGENT_REGISTRY?.surfaceLabel?.(agent.surface) || agent.surface || 'agent';
    const active = route === 'agents' && activeAgentKey === agent.key;
    return (
      <button
        key={agent.key}
        type="button"
        className="sb__item sb__item--agent"
        data-testid="sidebar-agent-route"
        data-agent-key={agent.key}
        data-active={active}
        aria-label={`${agent.display_name} ${surface}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => openAgent(agent)}
      >
        {Orb
          ? <Orb size={18} state={active ? 'talking' : 'idle'} color1={agent.avatar_color_1} color2={agent.avatar_color_2} label={`${agent.display_name} ElevenLabs agent`} />
          : <span className="dot dot--accent" aria-hidden="true" style={{width:10,height:10}}/>}
        <span className="sb__label">
          <span className="sb__agent-name">{agent.display_name}</span>
          <span className="sb__agent-surface mono dim">{surface}</span>
        </span>
      </button>
    );
  };

  return (
    <aside className="sb">
      <div className="sb__brand">
        <div className="sb__logo sb__logo--lasso" aria-hidden="true">
          <img src="../assets/wranngle-lasso.png" alt=""/>
        </div>
        {!collapsed && (
          <div>
            <div className="sb__wordmark-text" aria-label="Wranngle">Wranngle</div>
            <div className="sb__brand-sub" aria-label="gtm_ops console">gtm_ops console</div>
          </div>
        )}
      </div>

      <div className="sb__section">workspace</div>
      <nav className="sb__nav">
        {workspaceItems.map(renderRouteItem)}
      </nav>
      <div className="sb__section">ElevenLabs</div>
      <nav className="sb__nav" aria-label="ElevenLabs agents">
        {visibleAgents.map(renderAgentItem)}
      </nav>

      <button className="sb__footer"
           type="button"
           aria-label="Open My Account settings"
           data-active={route === 'settings'}
           onClick={() => openSettingsTab(setRoute, 'account', 'sidebar-account-footer')}>
        <div className="sb__avatar">RP</div>
        {!collapsed && (
          <div className="sb__user">
            <div className="sb__user-name">Rae Park</div>
            <div className="sb__user-org">gtm_ops · helix · admin</div>
          </div>
        )}
      </button>
    </aside>
  );
}

/* ---------- Topbar ---------- */
function Topbar({ route, setRoute, openPalette, theme, setTheme, collapsed, setCollapsed }) {
  const isAdmin = isConsoleAdmin();
  const labels = {
    home:'Callbacks', generate:'Generate', pipeline:'Pipeline', calls:'Calls',
    proposals:'Proposals', evals:'Evals', agents:'Agents', settings:'Settings',
  };
  const [notifOpen, setNotifOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const notifRef = useRef(null);
  const runRef = useRef(null);
  const proposalRef = useRef(null);
  const D = window.GTM;
  const appCtx = globalThis.useAppContext();
  const calls = Array.isArray(D.calls) ? D.calls : [];
  const runTriggerLabel = route === 'evals'
    ? 'Eval run'
    : route === 'generate'
      ? 'Draft path'
      : route === 'agents'
        ? 'Test agent'
        : isAdmin ? 'New run' : 'Call back';
  const RunTriggerIcon = route === 'evals' ? I.Beaker : route === 'generate' ? I.Doc : route === 'agents' ? I.Bot : I.Phone;
  const proposalRunCall = calls.find(c => c.outcome === 'meeting-booked')
    || calls.find(c => c.outcome === 'qualified')
    || calls[0]
    || null;
  const visibleAgents = (globalThis.AGENT_REGISTRY?.agents || [])
    .filter(agent => isAdmin || agent.surface !== 'admin-only');
  const defaultAgentKey = isAdmin
    ? visibleAgents[0]?.key
    : (visibleAgents.find(agent => agent.key === 'intake')?.key || visibleAgents[0]?.key);
  const activeAgentKey = visibleAgents.some(agent => agent.key === appCtx.extra?.selected_agent_key)
    ? appCtx.extra.selected_agent_key
    : defaultAgentKey;
  const activeAgent = globalThis.AGENT_REGISTRY?.byKey?.(activeAgentKey) || visibleAgents[0] || null;
  const activeAgentName = activeAgent?.display_name || 'ElevenLabs agent';
  const isReceptionistAgent = activeAgent?.key === 'intake';
  const proposalRunSeedLabel = proposalRunCall
    ? `${proposalRunCall.co || proposalRunCall.id} · ${proposalRunCall.id || 'latest call'}`
    : 'No qualified call selected';
  const proposalRunExtra = proposalRunCall ? {
    proposal_seed_source: 'topbar-new-run',
    proposal_seed_call_id: proposalRunCall.id,
    proposal_seed_call_co: proposalRunCall.co,
    proposal_seed_call_who: proposalRunCall.who,
    proposal_seed_call_outcome: proposalRunCall.outcome,
    proposal_seed_call_score: proposalRunCall.score,
    proposal_seed_call_duration: proposalRunCall.duration,
  } : {};

  const notifs = buildTopbarNotifications(D);
  const missedCallback = calls.find(c => shellIsMissedCall(c) && c.returned !== true)
    || calls.find(shellIsMissedCall)
    || null;
  const quoteFollowUpCall = calls.find(c => !shellIsMissedCall(c) && /pricing|quote|follow-up|objection/.test(String(c.outcome || '').toLowerCase()))
    || calls.find(c => !shellIsMissedCall(c) && shellCallRiskScore(c) > 0)
    || missedCallback
    || null;
  const scheduleJobCall = calls.find(c => !shellIsMissedCall(c) && /meeting-booked|qualified|discovery|technical-deep-dive/.test(String(c.outcome || '').toLowerCase()))
    || quoteFollowUpCall
    || missedCallback
    || null;
  const humanHandoffCall = calls
    .filter(c => !shellIsMissedCall(c) && !/no-fit|lost|closed|signed/.test(String(c.outcome || '').toLowerCase()))
    .sort((a, b) => shellCallRiskScore(b) - shellCallRiskScore(a))[0]
    || quoteFollowUpCall
    || missedCallback
    || null;
  const tradeRunActions = [
    {
      icon:I.Phone,
      label:'Call a missed number',
      sub: missedCallback ? `${missedCallback.co} · ${missedCallback.when}` : 'no missed calls waiting',
      route:'calls',
      toast: missedCallback ? 'Callback queue opened' : 'No missed callbacks waiting',
      intent:'missed_callback',
      selection: missedCallback ? { type:'call', id: missedCallback.id } : null,
      extra:{ call_window:'missed', ...(missedCallback ? { call_workflow:'human-review' } : {}) },
    },
    {
      icon:I.Mail,
      label:'Send a quote follow-up',
      sub: quoteFollowUpCall ? `${quoteFollowUpCall.co} · ${shellCallOutcomeLabel(quoteFollowUpCall)}` : 'no quote follow-up candidate',
      route:'calls',
      toast:'Quote follow-up opened',
      intent:'quote_follow_up',
      selection: quoteFollowUpCall ? { type:'call', id: quoteFollowUpCall.id } : null,
      extra:{ call_window:shellCallWindowFor(quoteFollowUpCall), call_workflow:'quote-follow-up' },
    },
    {
      icon:I.Calendar,
      label:'Schedule a job',
      sub: scheduleJobCall ? `${scheduleJobCall.co} · ${shellCallOutcomeLabel(scheduleJobCall)}` : 'no scheduling candidate',
      route:'calls',
      toast:'Scheduling workflow opened',
      intent:'schedule_job',
      selection: scheduleJobCall ? { type:'call', id: scheduleJobCall.id } : null,
      extra:{ call_window:shellCallWindowFor(scheduleJobCall), call_workflow:'schedule-job' },
    },
    {
      icon:I.Cog,
      label:'Escalate to a human',
      sub: humanHandoffCall ? `${humanHandoffCall.co} · ${pluralizeCount(shellCallRiskScore(humanHandoffCall), 'risk signal')}` : 'no human handoff candidate',
      route:'calls',
      toast:'Human handoff opened',
      intent:'human_handoff',
      selection: humanHandoffCall ? { type:'call', id: humanHandoffCall.id } : null,
      extra:{ call_window:shellCallWindowFor(humanHandoffCall), call_workflow:'human-review' },
    },
  ];
  const proposalRunAction = {
    icon:I.Doc,
    label: proposalRunCall ? 'Generate proposal' : 'Open proposal composer',
    sub: proposalRunCall ? `${proposalRunSeedLabel} · review before buyer send` : 'add buyer proof before the draft engine runs',
    route:'generate',
    toast:'Proposal generator opened',
    intent:'proposal_generation',
    extra: proposalRunExtra,
  };
  const evalRunAction = {
    icon:I.Beaker,
    label:'Trigger eval suite',
    sub:'opens harness bridge · Cmd+E',
    route:'evals',
    toast:'Eval harness opened',
    intent:'eval_suite',
    extra:{ evals_bridge_open:true, eval_harness_command_id:'eval-quick' },
  };
  const agentRunActions = activeAgent ? [
    {
      icon:I.Phone,
      label: isReceptionistAgent ? 'Preview greeting' : 'Preview opening',
      sub:`${activeAgentName} · local playback inside Agents`,
      route:'agents',
      intent:'agent_preview',
      extra:{ selected_agent_key: activeAgentKey, phone_setup_preview:true },
    },
    {
      icon:I.Cog,
      label: isReceptionistAgent ? 'Edit phone setup' : 'Edit local wrapper',
      sub:`${activeAgentName} · greeting, context, handoff`,
      route:'agents',
      intent:'agent_local_setup',
      extra:{ selected_agent_key: activeAgentKey, agent_admin_panel:'prompt' },
    },
    {
      icon:I.Bot,
      label:'ElevenLabs settings',
      sub:'local integration wrapper before dashboard escape',
      route:'settings',
      intent:'agent_integration_settings',
      extra:{ settings_tab:'integrations', integration_name:'ElevenLabs' },
    },
  ] : [
    {
      icon:I.Bot,
      label:'Open Agents',
      sub:'no public agents registered',
      route:'agents',
      intent:'agent_route',
      extra:{},
    },
  ];
  const proposalRunPlan = [
    {
      label:'Buyer proof',
      detail: proposalRunCall ? `Carry ${proposalRunCall.id || 'the call'} into the proof composer.` : 'Paste proof or attach source evidence.',
    },
    {
      label:'Draft engine',
      detail:'Extract, enrich, price, risk-check, then render the packet.',
    },
    {
      label:'Artifact review',
      detail:'Open the PDF/source packet locally before approval.',
    },
    {
      label:'Proposals approval',
      detail:'Buyer send stays blocked until operator review clears.',
    },
  ];
  const runActions = route === 'generate' ? [
    proposalRunAction,
  ] : route === 'agents' ? agentRunActions : isAdmin ? [
    ...tradeRunActions,
    { icon:I.Phone, label:'Outbound discovery', sub:'opens lead intake · agent-01 Hunter', route:'pipeline', toast:'Outbound discovery opened', intent:'outbound_discovery', extra:{ pipeline_panel:'new-lead' } },
    { icon:I.Mail,  label:'Multi-thread sequence', sub:'opens high-intent saved view', route:'pipeline', toast:'Multi-thread sequence opened', intent:'multi_thread_sequence', extra:{ pipeline_panel:'filters', pipeline_filter:'high' } },
    proposalRunAction,
    evalRunAction,
    { icon:I.Refresh, label:'Re-score stale leads', sub:'opens pipeline saved views', route:'pipeline', toast:'Lead re-score review opened', intent:'lead_rescore', extra:{ pipeline_panel:'filters', pipeline_filter:'all' } },
  ] : route === 'evals' ? [evalRunAction] : tradeRunActions;
  const openNotification = (n) => {
    // Guard the selection even though notifications are derived from live
    // fixture state. History can still refresh between render and click,
    // and the topbar should never write a stale id into AppContext.
    let selection = n.selection || null;
    if (selection?.type && selection?.id) {
      const D = window.GTM || {};
      const lookup = {
        lead: (D.companies || []).some(c => c.id === selection.id),
        call: (D.calls || []).some(c => c.id === selection.id),
        proposal: (D.proposals || []).some(p => p.id === selection.id),
        eval: (D.evalSuites || []).some(s => s.id === selection.id),
      };
      if (lookup[selection.type] === false) selection = null;
    }
    if (selection || n.extra) {
      window.AppContext.set({
        selection,
        extra: {
          ...(window.AppContext.get().extra || {}),
          ...(n.extra || {}),
          triggered_from: 'topbar-notification',
        },
      });
    }
    if (n.extra?.settings_tab) {
      openSettingsTab(setRoute, n.extra.settings_tab, 'topbar-notification');
      setNotifOpen(false);
      setNotificationsRead(true);
      return;
    }
    setRoute(n.route);
    setNotifOpen(false);
    setNotificationsRead(true);
  };
  const startRun = (o) => {
    const ctx = window.AppContext.get();
    window.AppContext.set({
      selection: o.selection || ctx.selection || null,
      extra: {
        ...(ctx.extra || {}),
        ...(o.extra || {}),
        run_intent: o.intent,
        triggered_from: 'topbar-new-run',
      },
    });
    setRoute(o.route);
    setRunOpen(false);
    setProposalOpen(false);
  };
  const renderProposalRunPlan = (testId = 'proposal-run-plan') => (
    <div className="proposal-run-plan" data-testid={testId}>
      <div className="proposal-run-plan__seed">
        <span className="eyebrow eyebrow--accent">proposal sequence</span>
        <strong>{proposalRunSeedLabel}</strong>
        <p>{proposalRunCall ? 'This starts a review draft from call evidence, not a buyer-send action.' : 'No call evidence is loaded yet; the composer opens empty.'}</p>
      </div>
      <ol className="proposal-run-plan__steps" aria-label="Proposal run review path">
        {proposalRunPlan.map((step, index) => (
          <li key={step.label}>
            <span>{index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <header className="tb">
      <button className="btn btn--ghost btn--icon" onClick={() => setCollapsed(!collapsed)} title="Toggle sidebar" aria-label="Toggle sidebar">
        <I.Menu size={16} />
      </button>
      <span className="tb__crumb--active sr-only">
        {labels[route]}
      </span>
      <span className="tb__route" data-testid="topbar-route-label" aria-hidden="true">
        <span className="tb__route-brand">Wranngle</span>
        <span className="tb__sep tb__sep--brand">/</span>
        <span className="tb__route-product">gtm_ops console</span>
        <span className="tb__sep tb__sep--page">/</span>
        <span className="tb__route-page">{labels[route]}</span>
      </span>
      <button type="button" className="tb__search" onClick={openPalette}
              aria-label="Open command palette">
        <span className="tb__search-icon" aria-hidden="true"><I.Search size={14} /></span>
        <span className="tb__kbd" aria-hidden="true">⌘K</span>
      </button>

      <div className="tb__actions">
        <button ref={notifRef} className="btn btn--ghost btn--icon tb__bell" title="Notifications" aria-label="Notifications"
                aria-haspopup="dialog"
                aria-expanded={notifOpen}
                aria-controls="topbar-notifications-popover"
                onClick={() => {
                  setRunOpen(false);
                  setProposalOpen(false);
                  setNotifOpen(o => !o);
                }}>
          <I.Bell size={16} />
          {!notificationsRead && <span className="tb__bell-dot"/>}
        </button>
        <button className="btn btn--ghost btn--icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Toggle theme"
                aria-label="Toggle color theme">
          {theme === 'dark' ? <I.Sun size={16} /> : <I.Moon size={16} />}
        </button>
        {route === 'generate' && (
          <button
            ref={proposalRef}
            className="btn btn--ghost btn--sm tb__proposal-run-trigger"
            aria-label="Proposal run plan"
            aria-haspopup="dialog"
            aria-controls="topbar-proposal-run-popover"
            aria-expanded={proposalOpen}
            title="Proposal run plan"
            onClick={() => {
              setNotifOpen(false);
              setRunOpen(false);
              setProposalOpen(o => !o);
            }}
          >
            <I.Plus size={12} />
            <span>Proposal plan</span>
          </button>
        )}
        <button
          ref={runRef}
          className="btn btn--primary tb__run-trigger"
          aria-label={runTriggerLabel}
          aria-haspopup="dialog"
          aria-expanded={runOpen}
          aria-controls="topbar-run-popover"
          onClick={() => {
            setNotifOpen(false);
            setProposalOpen(false);
            setRunOpen(o => !o);
          }}
        >
          <RunTriggerIcon size={14} />
          <span className="tb__run-label">{runTriggerLabel}</span>
          <I.ChevronDown className="tb__run-chevron" size={12} style={{marginLeft:2,opacity:.85}}/>
        </button>
      </div>

      <Popover id="topbar-notifications-popover" open={notifOpen} onClose={() => setNotifOpen(false)} anchorRef={notifRef} width={360} label="Notifications">
        <div className="pop__hd">
          <span>Notifications</span>
          <span className="mono dim" style={{fontSize:10}}>{notificationsRead ? '0 new' : `${notifs.length} new`}</span>
        </div>
        <div className="pop__list">
          {notifs.map(n => (
            <button key={n.id} type="button" className="pop__row"
                 data-notification-id={n.id}
                 data-notification-route={n.route}
                 data-selection-type={n.selection?.type || ''}
                 data-selection-id={n.selection?.id || ''}
                 aria-label={`${n.act}: ${n.title}`}
                 onClick={() => openNotification(n)}>
              <span className={`dot dot--${n.tone === 'neutral' ? 'idle' : n.tone}`} style={{width:7,height:7,marginTop:6}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13, fontWeight:600}}>{n.title}</div>
                <div style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>{n.sub}</div>
              </div>
              <span className="mono dim" style={{fontSize:10}}>{n.t}</span>
              <I.ArrowRight size={12} style={{color:'var(--text-3)'}}/>
            </button>
          ))}
        </div>
        <div className="pop__ft">
          <button className="btn btn--ghost btn--xs" onClick={() => { setNotificationsRead(true); setNotifOpen(false); }}>Mark all read</button>
          <button className="btn btn--ghost btn--xs" onClick={() => { openSettingsTab(setRoute, 'integrations', 'topbar-notifications-settings'); setNotifOpen(false); }}>Settings</button>
        </div>
      </Popover>

      <Popover id="topbar-proposal-run-popover" open={proposalOpen} onClose={() => setProposalOpen(false)} anchorRef={proposalRef} width={360} label="Proposal run plan">
        <div className="pop__hd"><span>Proposal run plan</span></div>
        {renderProposalRunPlan()}
        <div className="pop__list">
          <button type="button" className="pop__row"
               data-testid="proposal-run-start"
               onClick={() => startRun(proposalRunAction)}>
            <I.Doc size={14} />
            <div style={{flex:1}}>
              <div style={{fontSize:13, fontWeight:600}}>{proposalRunAction.label}</div>
              <div style={{fontSize:11, color:'var(--text-3)'}}>{proposalRunAction.sub}</div>
            </div>
            <I.ArrowRight size={12} style={{color:'var(--text-3)'}}/>
          </button>
        </div>
      </Popover>

      <Popover id="topbar-run-popover" open={runOpen} onClose={() => setRunOpen(false)} anchorRef={runRef} width={route === 'generate' ? 360 : 300} label={runTriggerLabel}>
        <div className="pop__hd"><span>{runTriggerLabel}</span></div>
        {route === 'generate' && renderProposalRunPlan('topbar-run-proposal-plan')}
        <div className="pop__list">
          {runActions.map(o => (
            <button key={o.label} type="button" className="pop__row"
                 onClick={() => startRun(o)}>
              <o.icon size={14} />
              <div style={{flex:1}}>
                <div style={{fontSize:13, fontWeight:600}}>{o.label}</div>
                <div style={{fontSize:11, color:'var(--text-3)'}}>{o.sub}</div>
              </div>
              <I.ArrowRight size={12} style={{color:'var(--text-3)'}}/>
            </button>
          ))}
        </div>
      </Popover>
    </header>
  );
}

/* ---------- Command Palette ---------- */
function CommandPalette({ open, setOpen, setRoute }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  const items = useMemo(() => {
    const setExtra = (extra) => {
      const ctx = window.AppContext.get();
      window.AppContext.set({
        extra: {
          ...(ctx.extra || {}),
          ...extra,
          triggered_from: 'command-palette',
        },
      });
    };
    const openOutboundRun = () => {
      setExtra({
        pipeline_panel: 'new-lead',
        run_intent: 'outbound_discovery',
      });
      setRoute('pipeline');
    };
    const openRecapDraft = () => {
      // Pick the call that actually needs a recap (highest flags + deflections)
      // rather than hardcoding CALL-2419. The "Draft recap email" action
      // doesn't promise a specific call — it should open the recap composer
      // for whichever call is currently the highest-priority follow-up.
      const calls = (window.GTM?.calls || []);
      const target = [...calls].sort(
        (a, b) => ((Number(b.flags) || 0) + (Number(b.deflections) || 0)) - ((Number(a.flags) || 0) + (Number(a.deflections) || 0))
      )[0] || null;
      if (!target) {
        window.toast('No calls to recap', { sub: 'D.calls is empty', tone: 'warn' });
        return;
      }
      const ctx = window.AppContext.get();
      window.AppContext.set({
        selection: { type: 'call', id: target.id },
        extra: {
          ...(ctx.extra || {}),
          call_workflow: 'recap',
          run_intent: 'recap_draft',
          triggered_from: 'command-palette',
        },
      });
      setRoute('calls');
    };
    const openLeadRescore = () => {
      setExtra({
        pipeline_panel: 'filters',
        pipeline_filter: 'all',
        run_intent: 'lead_rescore',
      });
      setRoute('pipeline');
    };
    const openMissedCallback = () => {
      const target = (window.GTM?.calls || []).find(c => shellIsMissedCall(c) && c.returned !== true)
        || (window.GTM?.calls || []).find(shellIsMissedCall)
        || null;
      if (!target) {
        window.toast('No missed callbacks waiting', { sub: 'Every missed call has been answered', tone: 'healthy' });
        return;
      }
      const ctx = window.AppContext.get();
      window.AppContext.set({
        selection: { type: 'call', id: target.id },
        extra: {
          ...(ctx.extra || {}),
          call_window: 'missed',
          call_workflow: 'human-review',
          run_intent: 'missed_callback',
          triggered_from: 'command-palette',
        },
      });
      setRoute('calls');
    };
    const openPhoneSetup = (extra = {}) => {
      const ctx = window.AppContext.get();
      window.AppContext.set({
        extra: {
          ...(ctx.extra || {}),
          selected_agent_key: 'intake',
          ...extra,
          triggered_from: 'command-palette',
        },
      });
      setRoute('agents');
    };
    const base = [
      { group:'Navigation', icon:I.Phone,    label:'Go to Callbacks', meta:'⏎', do: () => setRoute('home') },
      { group:'Navigation', icon:I.Phone,    label:'Go to Calls',           meta:'⏎', do: () => setRoute('calls') },
      { group:'Navigation', icon:I.Bot,      label:'Go to Agents', meta:'local admin', do: () => setRoute('agents') },
      { group:'Navigation', icon:I.Cog,      label:'Go to Settings',        meta:'⏎', do: () => setRoute('settings') },
      { group:'Actions', icon:I.Phone,   label:'Call back next missed customer', meta:'opens callback', do: openMissedCallback },
      { group:'Actions', icon:I.Mic,     label:"Edit receptionist greeting", meta:'phone setup', do: () => openPhoneSetup() },
      { group:'Actions', icon:I.Play,    label:'Test receptionist',          meta:'play greeting', do: () => openPhoneSetup({ phone_setup_preview: true }) },
      { group:'Actions', icon:I.Cog,     label:'Add after-hours number',     meta:'handoff', do: () => openPhoneSetup({ phone_setup_focus: 'handoff' }) },
      { group:'Navigation', icon:I.Plus,     label:'Go to Generate Proposal', meta:'draft gate', do: () => setRoute('generate') },
      { group:'Navigation', icon:I.Pipeline, label:'Go to Pipeline',        meta:'⏎', do: () => setRoute('pipeline') },
      { group:'Navigation', icon:I.Doc,      label:'Go to Proposals',       meta:'⏎', do: () => setRoute('proposals') },
      { group:'Navigation', icon:I.Beaker,   label:'Go to Evals',           meta:'⏎', do: () => setRoute('evals') },
      { group:'Actions', icon:I.Mic,    label:'Talk to Sales Coach',       meta:'opens dock', do: () => { document.querySelector('.coach-launcher')?.click(); } },
      { group:'Actions', icon:I.Plus,    label:'New outbound run',          meta:'opens intake', do: openOutboundRun },
      { group:'Actions', icon:I.Bolt,    label:'Trigger eval suite',        meta:'run plan', do: () => {
        const ctx = window.AppContext.get();
        window.AppContext.set({
          extra: {
            ...(ctx.extra || {}),
            evals_bridge_open: true,
            eval_harness_command_id: 'eval-quick',
            run_intent: 'eval_suite',
            triggered_from: 'command-palette',
          },
        });
        setRoute('evals');
      } },
      { group:'Actions', icon:I.Mail,    label:'Draft recap email',         meta:'opens recap', do: openRecapDraft },
      { group:'Actions', icon:I.Refresh, label:'Re-score stale leads',      meta:'saved view', do: openLeadRescore },
    ];
    // Derive Jump-to entries from live fixture data instead of hardcoding
    // 3 companies + 2 calls with literal "45m ago"/"flagged ×2" labels —
    // the fixture has 12 companies and 7 calls, and the literal meta
    // strings would silently lie if the fixture state shifted.
    const D = window.GTM || {};
    const normalizedQuery = q.trim().toLowerCase();
    const topCompanies = [...(D.companies || [])]
      .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
      .filter(c => !normalizedQuery || `${c.name} ${c.stage} ${c.id || ''}`.toLowerCase().includes(normalizedQuery))
      .slice(0, normalizedQuery ? 8 : 3)
      .map(c => ({
        group: 'Jump to',
        icon: I.Building,
        label: c.name,
        meta: `co · ${c.stage}`,
        do: () => { setRoute('pipeline'); window.AppContext.set({ selection: { type:'lead', id: c.id } }); },
      }));
    const topCalls = [...(D.calls || [])]
      .sort((a, b) => ((Number(b.flags) || 0) + (Number(b.deflections) || 0)) - ((Number(a.flags) || 0) + (Number(a.deflections) || 0)))
      .filter(c => !normalizedQuery || `${c.id} ${c.co} ${c.who || ''}`.toLowerCase().includes(normalizedQuery))
      .slice(0, normalizedQuery ? 8 : 3)
      .map(c => ({
        group: 'Jump to',
        icon: I.Phone,
        label: `${c.id} · ${c.co}`,
        meta: c.flags > 0 ? `flagged ×${c.flags}` : c.when,
        do: () => { setRoute('calls'); window.AppContext.set({ selection: { type:'call', id: c.id } }); },
      }));
    const topProposals = [...(D.proposals || [])]
      .sort((a, b) => {
        const stageRank = (p) => isOpenProposalStage(p.stage) ? 1 : 0;
        const amount = (p) => proposalAmountToThousands(p.amount);
        return (stageRank(b) - stageRank(a)) || (amount(b) - amount(a));
      })
      .filter(p => !normalizedQuery || `${p.id} ${p.co} ${p.stage}`.toLowerCase().includes(normalizedQuery))
      .slice(0, normalizedQuery ? 8 : 3)
      .map(p => ({
        group: 'Jump to',
        icon: I.Doc,
        label: `${p.id} · ${p.co}`,
        meta: `proposal · ${p.stage}`,
        do: () => {
          setRoute('proposals');
          window.AppContext.set({ selection: { type:'proposal', id: p.id } });
        },
      }));
    base.push(...topCompanies, ...topCalls, ...topProposals);
    if (!q) return base;
    return base.filter(i => i.label.toLowerCase().includes(q.toLowerCase()));
    // `open` belongs in deps so each palette open re-derives the Jump-to
    // entries from the current window.GTM. Without it, an open BEFORE
    // loadData mutates companies (history fetch is async) caches the
    // pre-mutation seed list and the palette serves stale labels for the
    // rest of the session.
  }, [q, open]);

  // Focus management: when the palette opens, save the previously-focused
  // element so we can restore it on close, and move focus into the input.
  // When the palette closes (e.g. via Escape or backdrop click), restore.
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      // Use a microtask so the input is in the DOM before we focus it.
      requestAnimationFrame(() => inputRef.current?.focus());
      setActive(0); setQ('');
    } else if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
      try { previousFocusRef.current.focus(); } catch (_) { /* element may have unmounted */ }
      previousFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); }
      if (!open) return;
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
      if (e.key === 'Enter')     { items[active]?.do?.(); setOpen(false); }
      // Trap Tab inside the dialog so focus cannot escape to the page behind.
      if (e.key === 'Tab') {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) { e.preventDefault(); return; }
        const first = focusables.item(0);
        const last = focusables.item(focusables.length - 1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, setOpen]);

  if (!open) return null;
  const groups = items.reduce((acc, it) => {
    (acc[it.group] = acc[it.group] || []).push(it); return acc;
  }, {});

  let idx = -1;
  return (
    <div className="cp-overlay" onClick={() => setOpen(false)}>
      <div ref={dialogRef} className="cp" role="dialog" aria-modal="true" aria-label="Command palette"
           onClick={e => e.stopPropagation()}>
        <input ref={inputRef} className="cp__input" type="search"
               placeholder="Type a command, lead, or call ID…"
               aria-label="Search commands, leads, or call IDs"
               autoComplete="off"
               autoCorrect="off"
               autoCapitalize="none"
               spellCheck={false}
               data-lpignore="true"
               data-1p-ignore="true"
               data-bwignore="true"
               data-form-type="other"
               value={q} onChange={e => setQ(e.target.value)} />
        <div className="cp__list">
          {Object.entries(groups).map(([g, list]) => (
            <div key={g}>
              <div className="cp__group">{g}</div>
              {list.map(it => {
                idx += 1;
                const isActive = idx === active;
                return (
                  <button key={it.label} type="button" className="cp__row" data-active={isActive}
                       onMouseEnter={() => setActive(idx)}
                       onFocus={() => setActive(idx)}
                       onKeyDown={e => {
                         if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                       }}
                       onClick={() => { it.do?.(); setOpen(false); }}>
                    <span className="cp__row-icon"><it.icon size={14} /></span>
                    <span>{it.label}</span>
                    <span className="cp__row-meta">{it.meta}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {items.length === 0 && <div className="cp__row dim">no matches</div>}
        </div>
        <div className="cp__footer">
          <span><kbd>↑↓</kbd>navigate</span>
          <span><kbd>⏎</kbd>select</span>
          <span><kbd>esc</kbd>close</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Shared widgets ---------- */
function Sparkline({ data, color = 'var(--sunset-500)', fill = true, h = 40, w = 120, label, pointLabels }) {
  const [hovered, setHovered] = useState(null);
  const values = Array.isArray(data)
    ? data.map(value => Number(value)).filter(Number.isFinite)
    : [];
  const labelText = String(label || '');
  const seriesLabel = labelText.split(':')[0].trim() || 'Trend';

  if (values.length === 0) {
    return (
      <span
        className="spark-wrap spark-wrap--empty"
        role="img"
        aria-label={`${seriesLabel}: no trend data available`}
      >
        <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
          <line className="spark-empty-line" x1="0" y1={h / 2} x2={w} y2={h / 2} />
        </svg>
      </span>
    );
  }

  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pointInset = values.length > 1 ? Math.min(8, w / 2) : 0;
  const chartLeft = values.length > 1 ? pointInset : w / 2;
  const chartRight = values.length > 1 ? w - pointInset : w / 2;
  const step = values.length > 1 ? Math.max(0, chartRight - chartLeft) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [
    values.length > 1 ? chartLeft + (i * step) : w / 2,
    h - ((v - min) / span) * (h - 4) - 2,
  ]);
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const area = `${path} L${chartRight},${h} L${chartLeft},${h} Z`;
  const latest = values.at(-1);
  const first = values[0];
  const delta = latest - first;
  const percentLabeled = /(?:%|percent|pct|rate|pass-rate|conversion)/i.test(labelText);
  const isPercentSeries = percentLabeled && values.every(v => Number.isFinite(v) && Math.abs(v) <= 1);
  const rounded = (value, places = 2) => {
    if (!Number.isFinite(value)) return value;
    const factor = 10 ** places;
    const next = Math.round((value + Number.EPSILON) * factor) / factor;
    return Object.is(next, -0) ? 0 : next;
  };
  const compactNumber = (value, places = 1) => {
    const next = rounded(value, places);
    if (!Number.isFinite(next)) return String(value);
    if (Number.isInteger(next)) return String(next);
    return next.toFixed(places).replace(/0+$/, '').replace(/\.$/, '');
  };
  const fmt = (v) => {
    if (isPercentSeries) return `${compactNumber(v * 100, 1)}%`;
    return String(rounded(v, 2));
  };
  const deltaLabel = (value) => {
    if (isPercentSeries) {
      const next = rounded(value * 100, 1);
      return `${next > 0 ? '+' : ''}${compactNumber(next, 1)} pp`;
    }
    const next = rounded(value, 2);
    return `${next > 0 ? '+' : ''}${fmt(next)}`;
  };
  const summary = label || `${seriesLabel}: ${values.length} periods, ${fmt(first)} to ${fmt(latest)}; range ${fmt(min)} to ${fmt(max)}; delta ${deltaLabel(delta)}`;
  const detailedLabels = Array.isArray(pointLabels)
    ? pointLabels
    : [];
  const pointLabel = (i) => {
    const context = detailedLabels[i]
      ? String(detailedLabels[i]).trim()
      : values.length === 1
        ? 'single sample'
        : `point ${i + 1}/${values.length}`;
    const fallbackRecency = detailedLabels[i] ? '' : i === values.length - 1 ? ' · latest' : '';
    const movement = i > 0 ? `${deltaLabel(values[i] - values[i - 1])} vs prior` : 'baseline';
    return `${seriesLabel} · ${context}${fallbackRecency}: ${fmt(values[i])} · ${movement}`;
  };
  const pointLabelValues = values.map((_, i) => pointLabel(i));
  const clampIndex = (i) => Math.max(0, Math.min(values.length - 1, i));
  const tooltipEdge = hovered === 0 ? 'start' : hovered === values.length - 1 ? 'end' : 'middle';
  const inspectPointFromX = (clientX, target) => {
    const rect = target.getBoundingClientRect();
    if (!rect.width || values.length === 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setHovered(clampIndex(Math.round(ratio * (values.length - 1))));
  };
  const onKeyDown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') {
      setHovered(null);
      return;
    }
    if (e.key === 'Home') {
      setHovered(0);
      return;
    }
    if (e.key === 'End') {
      setHovered(values.length - 1);
      return;
    }
    const current = hovered == null ? values.length - 1 : hovered;
    const direction = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1;
    setHovered(clampIndex(current + direction));
  };
  return (
    <span
      className="spark-wrap"
      role="group"
      aria-label={`${summary}. Use arrow keys to inspect each period.`}
      tabIndex={0}
      data-active-index={hovered ?? undefined}
      onPointerMove={(e) => inspectPointFromX(e.clientX, e.currentTarget)}
      onPointerLeave={() => setHovered(null)}
      onMouseLeave={() => setHovered(null)}
      onFocus={() => setHovered(v => v == null ? values.length - 1 : v)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHovered(null); }}
      onKeyDown={onKeyDown}
    >
      <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        {fill && <path d={area} fill={color} opacity="0.15" />}
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
      {hovered != null && (
        <span
          className="spark-crosshair"
          aria-hidden="true"
          style={{ left: `${(pts[hovered][0] / w) * 100}%`, '--spark-color': color }}
        />
      )}
      {pts.map((p, i) => (
        <span
          key={i}
          className="spark-point"
          aria-hidden="true"
          data-point-label={pointLabelValues[i]}
          data-active={hovered === i ? 'true' : 'false'}
          onPointerEnter={() => setHovered(i)}
          style={{ left: `${(p[0] / w) * 100}%`, top: `${(p[1] / h) * 100}%`, '--spark-color': color }}
        />
      ))}
      {hovered != null && (
        <span
          className="spark-tooltip"
          data-testid="sparkline-tooltip"
          data-edge={tooltipEdge}
          role="status"
          aria-live="polite"
          style={{ left: `${(pts[hovered][0] / w) * 100}%`, top: `${Math.max(8, (pts[hovered][1] / h) * 100)}%` }}
        >
          {pointLabelValues[hovered]}
        </span>
      )}
    </span>
  );
}

function statDeltaNumber(delta) {
  if (typeof delta === 'number') return delta;
  if (typeof delta !== 'string') return null;
  const parsed = Number(delta.trim().replace(/%$/, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function statDeltaLabel(delta, unit = 'auto', noun = '') {
  if (delta == null || delta === '') return null;
  const numeric = statDeltaNumber(delta);
  const raw = String(delta).trim().replace(/%$/, '');
  const magnitude = raw.replace(/^\+/, '');
  const signed = numeric == null
    ? raw
    : `${numeric > 0 ? '+' : ''}${magnitude}`;
  if (unit === 'count') {
    const label = noun ? ` ${noun}` : '';
    return `${signed}${label} vs last week`;
  }
  if (unit === 'percent') {
    return `${signed}% vs last week`;
  }
  if (unit === 'points') {
    return `${signed} pts vs last week`;
  }
  const suffix = numeric != null && Math.abs(numeric) < 1 ? '' : '%';
  return `${signed}${suffix} vs last week`;
}

function Stat({ label, value, delta, deltaUnit = 'auto', deltaNoun = '', deltaText: deltaTextOverride, tone, spark, sparkColor, sparkLabels, sparkLabel, accent }) {
  const deltaValue = statDeltaNumber(delta);
  const deltaText = deltaTextOverride || statDeltaLabel(delta, deltaUnit, deltaNoun);
  const dir = deltaValue > 0 ? 'up' : deltaValue < 0 ? 'down' : null;
  const trendColor = sparkColor || (deltaValue > 0
    ? 'var(--healthy)'
    : deltaValue < 0
      ? 'var(--violet-500)'
      : 'var(--sunset-500)');
  return (
    <div className={`stat ${accent ? 'stat--accent' : ''}`}>
      <div className="stat__label">{label}</div>
      <div className={`stat__value ${tone ? `stat__value--${tone}` : ''}`}>{value}</div>
      {deltaText && (
        <div className={`stat__delta ${dir ? `stat__delta--${dir}` : ''}`}>
          {dir === 'up' && <I.ArrowUp size={11} />}
          {dir === 'down' && <I.ArrowDown size={11} />}
          {deltaText}
        </div>
      )}
      {spark && (
        <div className="stat__spark">
          <Sparkline
            data={spark}
            color={trendColor}
            h={28}
            w={80}
            label={sparkLabel || `${label} trend: current ${value}${delta != null ? `, delta ${delta}` : ''}`}
            pointLabels={sparkLabels}
          />
        </div>
      )}
    </div>
  );
}

function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

function PageHeader({ eyebrow, title, sub, actions }) {
  return (
    <header
      className={`ph ${actions ? 'ph--actions-only' : 'ph--hidden'}`}
      data-page-title={title || ''}
      data-page-eyebrow={eyebrow || ''}
      data-page-sub={sub || ''}
    >
      {eyebrow && <span className="sr-only ph__eyebrow">{eyebrow}</span>}
      <h1 id="console-page-title" className="sr-only ph__title">{title}</h1>
      {sub && <p className="sr-only ph__sub">{sub}</p>}
      {actions && <div className="ph__actions">{actions}</div>}
    </header>
  );
}

function Card({ title, action, children, accent, className = '', ...rest }) {
  const accentClass = accent ? `card--${accent}` : '';
  return (
    <div className={`card ${accentClass} ${className}`} {...rest}>
      {(title || action) && (
        <div className="card__hd">
          <div className="card__title">{title}</div>
          {action}
        </div>
      )}
      <div className="card__body">{children}</div>
    </div>
  );
}

/* ConsolePanel — scrolling pipeline log surface used by the Generate page.
   Cap is large (200) so a full sequence trace
   stays visible; older lines are still bounded so a long-running tab
   does not leak unbounded memory. The body is scrollable and snaps to
   the bottom when new lines arrive (unless the user has scrolled up,
   so they can review history without being yanked away). */
const CONSOLE_PANEL_CAP = 200;
function ConsolePanel({ lines, title = 'recent activity' }) {
  const [liveLines, setLiveLines] = React.useState([]);
  const [streamState, setStreamState] = React.useState(() => (window.DEMO_MODE ? 'ready' : 'connecting'));
  const bodyRef = React.useRef(null);
  const stuckToBottomRef = React.useRef(true);
  React.useEffect(() => {
    if (lines) return; // Use provided static lines if available
    setStreamState(window.DEMO_MODE ? 'ready' : 'connecting');
    const append = (txt, level = 'info') => {
      setLiveLines(prev => {
        const next = [...prev, { t: new Date().toLocaleTimeString(), level, txt }];
        return next.slice(-CONSOLE_PANEL_CAP);
      });
    };
    let es = null;
    if (!window.DEMO_MODE && typeof EventSource === 'function') {
      // Live mode: EventSource over /api/stream. Static DEMO_MODE replays
      // synthetic gtm:stream events instead, so do not show a transport
      // failure before the operator has launched a sequence.
      es = new EventSource('/api/stream');
      es.onopen = () => setStreamState('streaming');
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.msg) append(data.msg, data.level);
        } catch (_) { /* ignore malformed payloads */ }
      };
      // Surface transport errors in live mode so the user sees the panel
      // went silent for an actual reason (CSP block, server hangup).
      es.onerror = () => {
        setStreamState('disconnected');
        append('stream.error: EventSource disconnected (will retry on next tick)', 'err');
      };
    }
    // Demo mode + manual fan-out: any code can dispatch
    // window.dispatchEvent(new CustomEvent('gtm:stream', {detail: {msg, level}}))
    // and the panel will append it. Used by GeneratePage in DEMO_MODE.
    const onStream = (e) => {
      const d = e.detail || {};
      if (typeof d.msg === 'string') {
        setStreamState(d.msg.includes('pipeline.complete') ? 'complete' : 'streaming');
        append(d.msg, d.level || 'info');
      } else {
        setStreamState('streaming');
      }
    };
    const onReset = () => {
      setLiveLines([]);
      setStreamState(window.DEMO_MODE ? 'ready' : (es ? 'streaming' : 'connecting'));
    };
    window.addEventListener('gtm:stream', onStream);
    window.addEventListener('gtm:stream-reset', onReset);
    return () => {
      es?.close();
      window.removeEventListener('gtm:stream', onStream);
      window.removeEventListener('gtm:stream-reset', onReset);
    };
  }, [lines]);

  const displayLines = lines || liveLines;

  // Track whether the user is at-bottom; if they scrolled up, don't
  // yank them. If they're at-bottom, auto-scroll on new lines.
  const onBodyScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 12;
    stuckToBottomRef.current = atBottom;
  };
  React.useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (stuckToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [displayLines.length]);

  const lineToText = (l) => `[${l.t}] ${(l.level || 'info').toUpperCase().padEnd(4, ' ')} ${l.txt}`;
  const onCopy = async () => {
    const blob = displayLines.map(lineToText).join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(blob);
        window.toast('Log copied to clipboard', { sub: `${displayLines.length} line${displayLines.length === 1 ? '' : 's'}`, tone: 'accent' });
      } else {
        window.toast('Clipboard unavailable', { sub: 'browser blocked navigator.clipboard', tone: 'warn' });
      }
    } catch (_) {
      window.toast('Could not copy log', { tone: 'critical' });
    }
  };
  const onClear = () => {
    if (lines) return; // static-line mode is read-only
    window.dispatchEvent(new CustomEvent('gtm:stream-reset'));
  };
  const status = lines ? 'static' : streamState === 'ready' ? 'ready' : streamState;
  const statusTone = streamState === 'disconnected'
    ? 'critical'
    : streamState === 'complete'
      ? 'healthy'
      : streamState === 'ready'
        ? 'idle'
        : 'accent';

  return (
    <div className="console-panel">
      <div className="console-panel__hd">
        <span>{title}</span>
        <span className="console-panel__hd-right">
          <span className="console-panel__count" data-testid="console-panel-count">{displayLines.length} line{displayLines.length === 1 ? '' : 's'}</span>
          <button
            type="button"
            className="console-panel__btn"
            data-testid="console-panel-copy"
            aria-label="Copy log to clipboard"
            onClick={onCopy}
            disabled={displayLines.length === 0}
          >Copy</button>
          {!lines && (
            <button
              type="button"
              className="console-panel__btn"
              data-testid="console-panel-clear"
              aria-label="Clear log"
              onClick={onClear}
              disabled={displayLines.length === 0}
            >Clear</button>
          )}
          <span className="console-panel__status"><span className={`dot dot--${statusTone}`} style={{display:'inline-block',marginRight:6,verticalAlign:'middle'}}/>{status}</span>
        </span>
      </div>
      <div
        className="console-panel__body"
        data-testid="console-panel-body"
        ref={bodyRef}
        onScroll={onBodyScroll}
        role="log"
        tabIndex={0}
        aria-label={`${title} output`}
        aria-live="polite"
        aria-relevant="additions"
      >
        {displayLines.map((l, i) => (
          <div key={i} className={`console-panel__line console-panel__line--${l.level || 'info'}`}>
            <span className="cl-meta">{l.t}</span>{' '}
            <span className={`cl-${l.level || 'info'}`}>{(l.level || 'info').toUpperCase().padEnd(4,' ')}</span>{' '}
            <span>{l.txt}</span>
          </div>
        ))}
        <div><span className="cl-prompt">›</span> <span className="cl-cursor"></span></div>
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o.value} className="seg__btn"
                data-active={value === o.value}
                aria-label={o.ariaLabel || undefined}
                onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

Object.assign(window, {
  Sidebar, Topbar, CommandPalette, ToastHost, Popover,
  Sparkline, Stat, Badge, PageHeader, Card, ConsolePanel, Segmented,
  proposalAmountToThousands, formatProposalTotal, isOpenProposalStage,
});
