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
  React.useEffect(() => globalThis.AppContext.subscribe(setS), []);
  return s;
};

/* buildContextDump — serialize current app state for the agent.
   Output is the markdown blob that lands inside the {{context_dump}}
   placeholder in the agent's system prompt. Keep human-readable. */
globalThis.buildContextDump = function buildContextDump(ctx) {
  const D = globalThis.GTM || {};
  const lines = [];
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
    for (const k of Object.keys(ctx.extra)) lines.push(`${k}: ${ctx.extra[k]}`);
  }
  return lines.join('\n') || '(no selection — generic console session)';
};

/* Lazy-load the official ConvAI web component, exactly once. */
let _widgetLoaded = false;
function loadConvaiWidget() {
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
  return typeof globalThis.customElements !== 'undefined' &&
    !!customElements.get('elevenlabs-convai');
}

/* ConvaiWidget — declarative React wrapper around <elevenlabs-convai>.
   Updates dynamic-variables JSON whenever the app context changes. */
globalThis.ConvaiWidget = function ConvaiWidget({
  agentKey,
  agent_id: agentIdProp,
  textOnly = true,
  expanded = false,
  variant,
  height = 560,
  width,
  onMount,
}) {
  const ctx = globalThis.useAppContext();
  const containerRef = React.useRef(null);
  const widgetRef = React.useRef(null);
  const reg = globalThis.AGENT_REGISTRY.byKey(agentKey);
  const agent_id = agentIdProp || (reg && reg.agent_id);
  const [ready, setReady] = React.useState(isConvaiReady());
  const [unreachable, setUnreachable] = React.useState(false);

  React.useEffect(() => { loadConvaiWidget(); }, []);

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
    if (!agent_id || !ready) return;
    const el = document.createElement('elevenlabs-convai');
    el.setAttribute('agent-id', agent_id);
    if (variant) el.setAttribute('variant', variant);
    if (expanded) el.setAttribute('expanded', '');
    el.style.display = 'block';
    if (width) el.style.width = typeof width === 'number' ? `${width}px` : width;
    if (height) el.style.height = typeof height === 'number' ? `${height}px` : height;
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
  }, [agent_id, variant, expanded, height, width, ready]);

  /* Push dynamic variables + override config every time context changes. */
  React.useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;
    const dump = globalThis.buildContextDump(ctx);
    const dyn = { context_dump: dump };
    el.setAttribute('dynamic-variables', JSON.stringify(dyn));
    if (textOnly) {
      el.setAttribute('override-config', JSON.stringify({
        conversation: { text_only: true },
      }));
    }
  }, [ctx, textOnly]);

  if (unreachable) {
    const fallbackHref = agent_id
      ? `https://elevenlabs.io/app/conversational-ai/agents/${agent_id}`
      : 'https://elevenlabs.io/app/conversational-ai/agents';
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
          reg ? `You can still talk to ${reg.display_name} directly on ElevenLabs:` : 'Open the agent on ElevenLabs:'
        ),
        React.createElement('a', {
          className: 'btn btn--primary btn--sm',
          href: fallbackHref,
          target: '_blank',
          rel: 'noopener noreferrer',
          style: { marginTop: 12, display: 'inline-flex' },
        }, 'Open on ElevenLabs ↗')
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
  return React.createElement('div', { ref: containerRef, className: 'convai-mount' });
};

/* Floating sales-coach launcher — rendered once at the app root. */
globalThis.SalesCoachLauncher = function SalesCoachLauncher() {
  const [open, setOpen] = React.useState(false);
  const ctx = globalThis.useAppContext();
  const reg = globalThis.AGENT_REGISTRY.byKey('sales_coach');
  const launcherRef = React.useRef(null);
  const closeRef = React.useRef(null);
  const previousFocusRef = React.useRef(null);
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
      open && React.createElement('div', { className: 'coach-dock', role: 'dialog', 'aria-label': 'Sales Coach chat' },
        React.createElement('div', { className: 'coach-dock__hd' },
          React.createElement('span', null, 'Sales Coach'),
          React.createElement('span', { className: 'mono dim', style: { fontSize: 10 } },
            ctx.selection ? `${ctx.selection.type} · ${ctx.selection.id}` : 'no selection'),
          React.createElement('button', { ref: closeRef, className: 'btn btn--ghost btn--icon', onClick: () => setOpen(false), 'aria-label': 'Close coach' },
            React.createElement(globalThis.Icon.Close, { size: 14 }))
        ),
        React.createElement('div', { className: 'coach-dock__body' },
          React.createElement(globalThis.ConvaiWidget, {
            agentKey: 'sales_coach',
            textOnly: true,
            expanded: true,
            height: '100%',
            width: '100%',
          })
        )
      )
    )
  );
};
