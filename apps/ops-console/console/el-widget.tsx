/* ============================================================
   ElevenLabs ConvAI widget bridge
   - <ConvaiWidget agentKey="sales_coach" /> mounts the official
     <elevenlabs-convai> web component, sized + themed for the app.
   - useAppContext() / setAppContext() let pages publish what is
     selected, so the widget injects it as a dynamic variable.
   - The web component is loaded once from unpkg.
   ============================================================ */

globalThis.AppContext = (function () {
  let state = {
    route: 'home',
    selection: null,
    extra: {},
  };
  const listeners = new Set();
  function get() { return state; }
  function set(patch) {
    state = { ...state, ...patch };
    listeners.forEach(fn => { try { fn(state); } catch (_) {} });
  }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  return { get, set, subscribe };
})();

/* useAppContext — subscribe to global app context. */
globalThis.useAppContext = function useAppContext() {
  const [s, setS] = React.useState(globalThis.AppContext.get());
  React.useEffect(() => {
    setS(globalThis.AppContext.get());
    return globalThis.AppContext.subscribe(setS);
  }, []);
  return s;
};

/* buildAgentContext — serialize current app state for the agent.
   Output is the markdown blob that lands inside the {{context}}
   placeholder in the agent's system prompt. Keep human-readable. */
globalThis.buildAgentContext = function buildAgentContext(ctx) {
  const D = globalThis.GTM || {};
  const lines = [];
  const serializeExtraValue = (value) => {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    try { return JSON.stringify(value); }
    catch (_) { return String(value); }
  };
  const numericScore = (value) => {
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
  };
  const evalRunScore = (run) => (
    numericScore(run?.score?.weighted) ??
    numericScore(run?.score) ??
    numericScore(run?.aggregate_score) ??
    numericScore(run?.weighted)
  );
  const evalRunFailedAxes = (run) => {
    if (Array.isArray(run?.failed_axes)) return run.failed_axes.join(', ') || 'none';
    if (typeof run?.failed_axes === 'string' && run.failed_axes.trim()) return run.failed_axes;
    const axes = Array.isArray(run?.score?.axes)
      ? run.score.axes
      : Array.isArray(run?.axes)
        ? run.axes
        : [];
    return axes
      .filter(axis => axis && axis.pass === false)
      .map(axis => axis.name || axis.id || 'unnamed_axis')
      .join(', ') || 'none';
  };
  lines.push(`active_route: ${ctx.route}`);
  if (ctx.selection) {
    const { type, id } = ctx.selection;
    lines.push(`selection.type: ${type}`);
    lines.push(`selection.id: ${id}`);
    if (type === 'lead') {
      const lead = (D.companies || []).find(c => c.id === id);
      if (lead) {
        lines.push('');
        lines.push('## active_lead');
        lines.push(`name: ${lead.name}`);
        lines.push(`industry: ${lead.industry}`);
        lines.push(`size: ${lead.size}`);
        lines.push(`region: ${lead.region}`);
        lines.push(`stage: ${lead.stage}`);
        lines.push(`score: ${lead.score}/100  intent: ${lead.intent}  ICP: ${lead.icp}`);
        lines.push(`pain: ${lead.pain}`);
        lines.push(`stack: ${(lead.techStack || []).join(', ')}`);
        lines.push(`deal_size: ${lead.dealSize}  current_arr: ${lead.arr}  close_prob: ${lead.closeProb}`);
        lines.push(`next_step: ${lead.nextStep} (${lead.nextStepWhen})`);
      }
    }
    if (type === 'call') {
      const call = (D.calls || []).find(c => c.id === id);
      if (call) {
        lines.push('');
        lines.push('## active_call');
        lines.push(`id: ${call.id}  company: ${call.co}  who: ${call.who}`);
        lines.push(`outcome: ${call.outcome}  score: ${call.score}/10`);
        lines.push(`duration: ${call.duration}  flags: ${call.flags}  deflections: ${call.deflections}`);
      }
    }
    if (type === 'proposal') {
      const p = (D.proposals || []).find(x => x.id === id);
      if (p) {
        lines.push('');
        lines.push('## active_proposal');
        lines.push(`id: ${p.id}  company: ${p.co}  amount: ${p.amount}  stage: ${p.stage}`);
        lines.push(`sections: ${p.accepted}/${p.sections} accepted  blockers: ${(p.blockers || []).join('; ') || 'none'}`);
      }
    }
    if (type === 'eval') {
      const e = (D.evalSuites || []).find(x => x.id === id);
      if (e) {
        lines.push('');
        lines.push('## active_eval_suite');
        lines.push(`name: ${e.name}  pass: ${(e.pass * 100).toFixed(1)}%  delta: ${(e.delta * 100).toFixed(1)}%`);
        lines.push(`runs: ${e.runs}  owner: ${e.owner}  latest: ${e.latest}`);
      }
    }
  }
  if (ctx.extra && Object.keys(ctx.extra).length > 0) {
    lines.push('');
    lines.push('## extra');
    for (const k of Object.keys(ctx.extra)) {
      const value = ctx.extra[k];
      const isEvalRun = k === 'eval_run' && value && typeof value === 'object';
      lines.push(`${k}: ${isEvalRun ? '[see active_eval_run.*]' : serializeExtraValue(value)}`);
      if (isEvalRun) {
        const score = evalRunScore(value);
        lines.push(`active_eval_run.scenario: ${value.scenario_id || value.id || 'unknown'}`);
        lines.push(`active_eval_run.verdict: ${value.verdict || value.status || 'unknown'}`);
        if (score != null) lines.push(`active_eval_run.score: ${Math.round(score * 100)}%`);
        lines.push(`active_eval_run.failed_axes: ${evalRunFailedAxes(value)}`);
      }
    }
  }
  return lines.join('\n') || '(no selection — generic console session)';
};

/* Lazy-load the official ConvAI web component, exactly once. */
let _widgetLoaded = false;
const _convaiConfigErrors = new Map();
let _convaiRuntimeConfigError = null;
function convaiErrorText(args) {
  return args.map(arg => {
    if (typeof arg === 'string') return arg;
    if (arg && typeof arg.message === 'string') return arg.message;
    try { return JSON.stringify(arg); }
    catch (_) { return String(arg); }
  }).join(' ');
}

function recordConvaiConfigError(agentId, message) {
  const detail = { agentId, message };
  if (agentId === '*') _convaiRuntimeConfigError = detail;
  else _convaiConfigErrors.set(agentId, detail);
  globalThis.dispatchEvent(new CustomEvent('gtm:convai-config-error', { detail }));
}

function getConvaiConfigError(agentId) {
  return _convaiConfigErrors.get(agentId)?.message || _convaiRuntimeConfigError?.message || null;
}

function isConvaiRuntimeConfigError(text) {
  return /Cannot read properties of undefined .*languageCode/i.test(text)
    || /languageCode.*undefined/i.test(text)
    || /Response does not contain widget_config/i.test(text);
}

function isConvaiAbortNoise(text) {
  return /Cannot fetch config for agent\s+[a-zA-Z0-9_-]+: signal is aborted/i.test(text)
    || /AbortError/i.test(text);
}

function installConvaiErrorBridge() {
  if (globalThis.__gtmConvaiErrorBridgeInstalled) return;
  globalThis.__gtmConvaiErrorBridgeInstalled = true;
  if (globalThis.navigator && !globalThis.navigator.languageCode) {
    try {
      Object.defineProperty(globalThis.navigator, 'languageCode', {
        configurable: true,
        get: () => String(globalThis.navigator.language || 'en-US').split(/[-_]/)[0] || 'en',
      });
    } catch (_) {}
  }
  if (globalThis.Intl?.Locale && !('languageCode' in globalThis.Intl.Locale.prototype)) {
    try {
      Object.defineProperty(globalThis.Intl.Locale.prototype, 'languageCode', {
        configurable: true,
        get() { return this.language || String(this.baseName || 'en').split(/[-_]/)[0] || 'en'; },
      });
    } catch (_) {}
  }
  const originalError = console.error.bind(console);
  console.error = (...args) => {
    const text = convaiErrorText(args);
    const match = text.match(/Cannot fetch config for agent\s+([a-zA-Z0-9_-]+)/i);
    if (isConvaiAbortNoise(text)) {
      return;
    }
    if (match) {
      recordConvaiConfigError(match[1], text);
      return;
    } else if (isConvaiRuntimeConfigError(text)) {
      recordConvaiConfigError('*', text);
      return;
    }
    originalError(...args);
  };
  const handleRuntimeFailure = (event) => {
    const message = convaiErrorText([
      event.reason || event.error || event.message || 'ElevenLabs widget config did not load.',
    ]);
    if (isConvaiAbortNoise(message)) {
      event.preventDefault?.();
      return;
    }
    if (!isConvaiRuntimeConfigError(message)) return;
    recordConvaiConfigError('*', message);
    event.preventDefault?.();
  };
  globalThis.addEventListener('unhandledrejection', handleRuntimeFailure);
  globalThis.addEventListener('error', handleRuntimeFailure);
}

function loadConvaiWidget() {
  installConvaiErrorBridge();
  if (_widgetLoaded) return;
  _widgetLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed@latest';
  s.async = true;
  s.type = 'text/javascript';
  document.head.append(s);
}

/* Returns true once the elevenlabs-convai custom element has been
   registered by the embed script. Used to drive the fallback UI when
   the script can't load (CSP, corporate network blocking unpkg, etc). */
function isConvaiReady() {
  return globalThis.customElements !== undefined &&
    Boolean(customElements.get('elevenlabs-convai'));
}

function installConvaiEscapeHatchGuard(el) {
  let raf = null;
  let observer = null;
  const scrub = () => {
    const root = el?.shadowRoot;
    if (!root) return false;
    root.querySelectorAll('a[href*="elevenlabs.io"], a[href*="elevenlabs.com"]').forEach(link => {
      if (!link.dataset.gtmOriginalHref) link.dataset.gtmOriginalHref = link.getAttribute('href') || '';
      link.removeAttribute('href');
      link.setAttribute('aria-hidden', 'true');
      link.setAttribute('tabindex', '-1');
      link.dataset.gtmSuppressedExternalLink = 'true';
      const banner = link.closest('p') || link;
      banner.setAttribute('aria-hidden', 'true');
      banner.dataset.gtmSuppressedExternalBanner = 'true';
      banner.style.setProperty('display', 'none', 'important');
    });
    return true;
  };
  const arm = () => {
    if (scrub() && el.shadowRoot && !observer) {
      observer = new MutationObserver(scrub);
      observer.observe(el.shadowRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href'],
      });
      return;
    }
    raf = requestAnimationFrame(arm);
  };
  arm();
  return () => {
    if (raf != null) cancelAnimationFrame(raf);
    observer?.disconnect();
  };
}

/* ConvaiWidget — declarative React wrapper around <elevenlabs-convai>.
   Updates dynamic-variables JSON whenever the app context changes. */
globalThis.ConvaiWidget = function ConvaiWidget({
  agentKey,
  agent_id: agentIdProp,
  surface,
  textOnly,
  expanded,
  variant,
  dismissible,
  actionText,
  startCallText,
  endCallText,
  expandText,
  listeningText,
  speakingText,
  firstMessage,
  prompt,
  voiceId,
  serverLocation,
  markdownLinkAllowedHosts = 'elevenlabs.io,wranngle.com',
  syntaxHighlightTheme,
  widgetAttrs = {},
  height = 560,
  width,
  onMount,
}) {
  const ctx = globalThis.useAppContext();
  const containerRef = React.useRef(null);
  const widgetRef = React.useRef(null);
  const reg = globalThis.AGENT_REGISTRY.byKey(agentKey);
  const widgetDefaults = reg?.widget || {};
  // Per-surface tuning lives in agents-registry.js. Mount sites pass
  // `surface="coach_dock" | "agent_playground" | "pipeline_intake" | "eval_lab"`;
  // explicit props at the call site still win, the surface block only
  // fills in the gaps.
  const surfaceOv = (surface && globalThis.AGENT_REGISTRY.surfaceOverrides?.(agentKey, surface)) || {};
  const agent_id = agentIdProp || (reg && reg.agent_id);
  const effectiveTextOnly = textOnly ?? surfaceOv.textOnly ?? true;
  const effectiveExpanded = expanded ?? surfaceOv.expanded ?? false;
  const effectiveDismissible = dismissible ?? surfaceOv.dismissible;
  const effectiveActionText = actionText ?? surfaceOv.actionText ?? widgetDefaults.actionText;
  const effectiveStartCallText = startCallText ?? surfaceOv.startCallText ?? widgetDefaults.startCallText;
  const effectiveEndCallText = endCallText ?? surfaceOv.endCallText ?? widgetDefaults.endCallText;
  const effectiveExpandText = expandText ?? surfaceOv.expandText ?? widgetDefaults.expandText;
  const effectiveListeningText = listeningText ?? surfaceOv.listeningText ?? widgetDefaults.listeningText;
  const effectiveSpeakingText = speakingText ?? surfaceOv.speakingText ?? widgetDefaults.speakingText;
  const effectiveFirstMessage = firstMessage ?? surfaceOv.firstMessage ?? reg?.first_message;
  const effectivePrompt = prompt ?? reg?.system_prompt;
  const effectiveVoiceId = voiceId ?? reg?.voice_id;
  const effectiveSyntaxHighlightTheme = syntaxHighlightTheme ?? surfaceOv.syntaxHighlightTheme;
  const useDemoWidget = Boolean(globalThis.__GTMOpsUseMockConvai);
  const [ready, setReady] = React.useState(useDemoWidget || isConvaiReady());
  const [unreachable, setUnreachable] = React.useState(false);
  const [configError, setConfigError] = React.useState(() => (
    agent_id ? getConvaiConfigError(agent_id) : null
  ));
  const openLocalAgentAdmin = (triggeredFrom, panel = 'context') => {
    const ctxExtra = globalThis.AppContext?.get?.().extra || {};
    globalThis.AppContext?.set?.({
      extra: {
        ...ctxExtra,
        selected_agent_key: reg?.key || agentKey,
        agent_admin_panel: panel,
        triggered_from: triggeredFrom,
      },
    });
    globalThis.dispatchEvent(new CustomEvent('gtm:route', { detail: { route: 'agents' } }));
  };

  React.useEffect(() => {
    if (useDemoWidget) return;
    loadConvaiWidget();
  }, [useDemoWidget]);

  React.useEffect(() => {
    installConvaiErrorBridge();
    if (!agent_id) return undefined;
    // ALWAYS sync configError to the current agent's cached error (or clear
    // it). The previous version only set on hit, never cleared, so an error
    // for a prior agent stayed sticky across agent-picker switches and
    // misrendered the new agent's widget as a config failure.
    setConfigError(getConvaiConfigError(agent_id));
    const onConfigError = (event) => {
      const detail = event.detail || {};
      if (detail.agentId === agent_id || detail.agentId === '*') {
        setConfigError(detail.message || 'ElevenLabs widget config did not load.');
      }
    };
    globalThis.addEventListener('gtm:convai-config-error', onConfigError);
    return () => globalThis.removeEventListener('gtm:convai-config-error', onConfigError);
  }, [agent_id]);

  /* Poll for the custom-element registration; flip to "unreachable" if
     it's still not registered after 5 seconds — that's the signal a
     network policy (CSP, corporate blocker) prevented unpkg from
     loading the embed script. */
  React.useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;
    const interval = setInterval(() => {
      if (cancelled) return;
      if (isConvaiReady()) { setReady(true); clearInterval(interval); }
    }, 200);
    const timeout = setTimeout(() => {
      if (!cancelled && !isConvaiReady()) setUnreachable(true);
    }, 5000);
    return () => { cancelled = true; clearInterval(interval); clearTimeout(timeout); };
  }, [ready]);

  React.useEffect(() => {
    if (!agent_id || !ready) return undefined;
    if (useDemoWidget) {
      const el = document.createElement('elevenlabs-convai');
      el.classList.add('convai-widget-host', 'convai-widget-host--demo');
      el.setAttribute('agent-id', agent_id);
      if (agentKey) el.dataset.agentKey = agentKey;
      if (reg?.display_name) el.dataset.agentName = reg.display_name;
      if (reg?.role) el.dataset.agentRole = reg.role;
      if (surface) el.dataset.surface = surface;
      el.innerHTML = `
        <div class="convai-demo-card">
          <div class="eyebrow eyebrow--accent">local ConvAI demo</div>
          <strong>${reg?.display_name || 'ElevenLabs agent'}</strong>
          <p>${effectiveFirstMessage || 'Console-local widget mock.'}</p>
        </div>
      `;
      widgetRef.current = el;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        containerRef.current.append(el);
      }
      onMount && onMount(el);
      return () => {
        try { el.remove(); } catch (_) {}
        widgetRef.current = null;
      };
    }
    const el = document.createElement('elevenlabs-convai');
    el.classList.add('convai-widget-host');
    el.setAttribute('agent-id', agent_id);
    if (agentKey) el.dataset.agentKey = agentKey;
    if (reg?.display_name) el.dataset.agentName = reg.display_name;
    if (reg?.role) el.dataset.agentRole = reg.role;
    if (surface) el.dataset.surface = surface;
    const displayVariant = variant || (effectiveExpanded ? 'expanded' : '');
    if (displayVariant) el.setAttribute('variant', displayVariant);
    const attrs = {
      'avatar-orb-color-1': reg && reg.avatar_color_1,
      'avatar-orb-color-2': reg && reg.avatar_color_2,
      'server-location': serverLocation,
      'action-text': effectiveActionText,
      'start-call-text': effectiveStartCallText,
      'end-call-text': effectiveEndCallText,
      'expand-text': effectiveExpandText,
      'listening-text': effectiveListeningText,
      'speaking-text': effectiveSpeakingText,
      'override-first-message': effectiveFirstMessage,
      'override-prompt': effectivePrompt,
      'override-voice-id': effectiveVoiceId,
      'markdown-link-allowed-hosts': markdownLinkAllowedHosts,
      'syntax-highlight-theme': effectiveSyntaxHighlightTheme,
      dismissible: effectiveDismissible === true ? 'true' : undefined,
      ...widgetAttrs,
    };
    for (const [name, value] of Object.entries(attrs)) {
      if (value == null || value === '') continue;
      el.setAttribute(name, String(value));
    }
    // The embed stylesheet can promote the host to a fixed viewport widget;
    // the console wraps it as an in-panel tool instead.
    const applyContainedHostLayout = () => {
      const resolvedWidth = width ? (typeof width === 'number' ? `${width}px` : width) : '100%';
      const resolvedHeight = height ? (typeof height === 'number' ? `${height}px` : height) : '100%';
      for (const [name, value] of Object.entries({
        display: 'block',
        position: 'relative',
        inset: 'auto',
        top: 'auto',
        right: 'auto',
        bottom: 'auto',
        left: 'auto',
        width: resolvedWidth,
        height: resolvedHeight,
        'max-width': '100%',
        'max-height': '100%',
        'z-index': 'auto',
        transform: 'none',
      })) {
        el.style.setProperty(name, value, 'important');
      }
    };
    applyContainedHostLayout();
    const onCall = (event) => {
      if (!event.detail) return;
      event.detail.config = event.detail.config || {};

      let userFinishedTime = 0;
      let textTtfb = null;
      const originalOnModeChange = event.detail.config.onModeChange;
      const originalOnMessage = event.detail.config.onMessage;

      event.detail.config.onModeChange = (modeEvent) => {
        if (modeEvent.mode === 'speaking' && userFinishedTime > 0) {
          const firstAudioLatency = performance.now() - userFinishedTime;
          globalThis.dispatchEvent(new CustomEvent('gtm:convai-latency', { detail: { ttfb: textTtfb || firstAudioLatency, first_audio: firstAudioLatency } }));
          userFinishedTime = 0;
          textTtfb = null;
        }
        if (originalOnModeChange) originalOnModeChange(modeEvent);
      };

      event.detail.config.onMessage = (msgEvent) => {
        if (msgEvent.source === 'user') {
          userFinishedTime = performance.now();
          textTtfb = null;
        } else if (msgEvent.source === 'ai' && userFinishedTime > 0 && !textTtfb) {
          textTtfb = performance.now() - userFinishedTime;
        }
        if (originalOnMessage) originalOnMessage(msgEvent);
      };

      event.detail.config.clientTools = {
        ...event.detail.config.clientTools,
        openConsoleRoute: ({ route }) => {
          if (typeof route === 'string') {
            globalThis.dispatchEvent(new CustomEvent('gtm:route', { detail: { route } }));
          }
        },
        showToast: ({ title, sub, tone }) => {
          globalThis.toast(String(title || 'ElevenLabs agent'), { sub, tone: tone || 'accent' });
        },
      };
    };
    el.addEventListener('elevenlabs-convai:call', onCall);
    widgetRef.current = el;
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.append(el);
    }
    const stopEscapeHatchGuard = installConvaiEscapeHatchGuard(el);
    applyContainedHostLayout();
    const hostLayoutRaf = requestAnimationFrame(applyContainedHostLayout);
    customElements.whenDefined('elevenlabs-convai')
      .then(applyContainedHostLayout)
      .catch(() => {});
    onMount && onMount(el);
    return () => {
      cancelAnimationFrame(hostLayoutRaf);
      stopEscapeHatchGuard();
      el.removeEventListener('elevenlabs-convai:call', onCall);
      try { el.remove(); } catch (_) {}
      widgetRef.current = null;
    };
  }, [
    agent_id, variant, effectiveExpanded, effectiveDismissible, actionText, startCallText,
    endCallText, expandText, listeningText, speakingText, firstMessage,
    prompt, voiceId, effectiveActionText, effectiveStartCallText,
    effectiveEndCallText, effectiveExpandText, effectiveListeningText,
    effectiveSpeakingText, effectiveFirstMessage, effectivePrompt,
    effectiveVoiceId, serverLocation,
    markdownLinkAllowedHosts, effectiveSyntaxHighlightTheme, JSON.stringify(widgetAttrs),
    height, width, ready, agentKey, surface, useDemoWidget,
  ]);

  /* Push dynamic variables + override config every time context changes. */
  React.useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;
    const context = globalThis.buildAgentContext(ctx);
    const dyn = { context };
    el.setAttribute('dynamic-variables', JSON.stringify(dyn));
    if (effectiveTextOnly) {
      el.setAttribute('override-config', JSON.stringify({
        conversation: { text_only: true },
      }));
    }
  }, [ctx, effectiveTextOnly]);

  if (unreachable) {
    return React.createElement('div', {
      className: 'convai-mount convai-mount--unreachable',
      role: 'alert',
      'aria-live': 'polite',
    },
    React.createElement('div', { className: 'convai-fallback' },
      React.createElement('div', { className: 'convai-fallback__title' }, 'ConvAI widget unreachable'),
      React.createElement('div', { className: 'convai-fallback__body' },
        'The ElevenLabs embed script (',
        React.createElement('code', null, 'unpkg.com/@elevenlabs/convai-widget-embed'),
        ') did not load. This is usually a corporate-network or CSP block. ',
        reg ? `${reg.display_name} settings are still available inside the console.` : 'Open the in-console agent admin.'
      ),
      React.createElement('button', {
        className: 'btn btn--primary btn--sm',
        style: { marginTop: 12, display: 'inline-flex' },
        onClick: () => openLocalAgentAdmin('convai-fallback', 'context'),
      }, 'Open local admin')
    )
    );
  }
  if (!ready) {
    return React.createElement('div', { className: 'convai-mount convai-mount--loading', 'aria-busy': 'true' },
      React.createElement('div', { className: 'convai-fallback' },
        React.createElement('div', { className: 'mono dim', style: { fontSize: 11 } },
          'Loading ElevenLabs widget…')
      )
    );
  }
  // The convai-mount holds the imperative <elevenlabs-convai> element
  // (the create-effect calls innerHTML='' on it to swap the embed in/out,
  // so it cannot host React children). When configError is set, render
  // the fallback as a SIBLING overlay positioned over the mount via the
  // .convai-host wrapper — keeps the mount alive for inspection while
  // surfacing the unconfigured-agent recovery affordance.
  return React.createElement('div', { className: 'convai-host' },
    React.createElement('div', { ref: containerRef, className: 'convai-mount' }),
    configError && React.createElement('div', {
      className: 'convai-fallback convai-fallback--overlay',
      role: 'alert',
      'aria-live': 'polite',
      'data-testid': 'convai-config-error',
    },
    React.createElement('div', { className: 'convai-fallback__title' }, 'ElevenLabs config unavailable'),
    React.createElement('div', { className: 'convai-fallback__body' },
      reg ? `${reg.display_name} is wired into the console, but the official widget did not return a ` : 'The official widget did not return a ',
      React.createElement('code', null, 'widget_config'),
      agent_id ? ` for ${agent_id}. ` : '. ',
      'Use the local agent admin while the embed binding is repaired.'
    ),
    React.createElement('button', {
      className: 'btn btn--primary btn--sm',
      style: { marginTop: 12, display: 'inline-flex' },
      onClick: () => openLocalAgentAdmin('convai-config-error', 'context'),
    }, 'Open local admin')
    )
  );
};

/* Floating sales-coach launcher — rendered once at the app root. */
globalThis.SalesCoachLauncher = function SalesCoachLauncher() {
  const [open, setOpen] = React.useState(false);
  const ctx = globalThis.useAppContext();
  const reg = globalThis.AGENT_REGISTRY.byKey('sales_coach');
  const widget = reg?.widget || {};
  const launcherRef = React.useRef(null);
  const closeRef = React.useRef(null);
  const previousFocusRef = React.useRef(null);
  React.useEffect(() => {
    document.documentElement.toggleAttribute('data-coach-open', open);
    return () => document.documentElement.removeAttribute('data-coach-open');
  }, [open]);
  // Esc closes; focus moves into the dock close button on open and
  // returns to the launcher on close — same focus-management pattern
  // as the command palette + topbar popovers + lead-detail panel.
  React.useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    requestAnimationFrame(() => closeRef.current?.focus());
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  React.useEffect(() => {
    if (!open && previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
      try { previousFocusRef.current.focus(); } catch (_) { /* unmounted */ }
      previousFocusRef.current = null;
    }
  }, [open]);
  if (!reg) return null;
  return (
    React.createElement(React.Fragment, null,
      React.createElement('button', {
        ref: launcherRef,
        className: 'coach-launcher',
        title: 'Open Sales Coach',
        'aria-label': 'Open Sales Coach',
        'aria-expanded': open,
        onClick: () => setOpen(o => !o),
      },
      React.createElement('span', { className: 'coach-launcher__orb' }),
      React.createElement('span', { className: 'coach-launcher__label' }, open ? 'Hide coach' : 'Coach')
      ),
      open && React.createElement('div', { className: 'coach-dock', role: 'dialog', 'aria-label': `${reg.display_name} chat` },
        // The dock is intentionally just the ElevenLabs ConvAI widget plus
        // a single floating close affordance — no custom header, no
        // context-strip chrome. The widget already renders its own agent
        // identity, status, and controls; duplicating them here just made
        // the surface louder than the conversation.
        React.createElement('button', {
          ref: closeRef,
          className: 'coach-dock__close',
          onClick: () => setOpen(false),
          'aria-label': 'Close coach',
          type: 'button',
        }, React.createElement(globalThis.Icon.Close, { size: 14 })),
        // Per-surface tuning (textOnly / dismissible / firstMessage /
        // syntaxHighlightTheme) lives in agents-registry.js under
        // sales_coach.surfaces.coach_dock. The dock is the only floating-
        // dismissible voice surface; treating that as a registry value
        // instead of a call-site value keeps the four mount sites
        // (dock, playground, intake, eval) consistent.
        React.createElement(globalThis.ConvaiWidget, {
          agentKey: 'sales_coach',
          surface: 'coach_dock',
          height: '100%',
          width: '100%',
        })
      )
    )
  );
};
