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
function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const fn = (t) => {
      setItems(xs => [...xs, t]);
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
function Popover({ open, onClose, anchorRef, children, align = 'right', width = 320, label }) {
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
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
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
    <div ref={popRef} className="popover" role="dialog" aria-label={label || 'Popover'}
         style={{ top: pos.top, left: pos.left, width }}>
      {children}
    </div>
  );
}

/* ---------- Sidebar ---------- */
function Sidebar({ route, setRoute, collapsed }) {
  const D = window.GTM;
  const counts = {
    pipeline: D.companies.filter(c => !['closed','lost'].includes(c.stage)).length,
    calls: D.calls.filter(c => c.flags > 0).length,
    proposals: D.proposals.filter(p => p.stage !== 'signed').length,
    evals: D.evalSuites.filter(s => s.delta < 0).length,
  };
  const items = [
    { id:'home',      label:'Mission Control', icon:I.Home },
    { id:'generate',  label:'Generate',        icon:I.Plus },
    { id:'pipeline',  label:'Pipeline',        icon:I.Pipeline, count: counts.pipeline },
    { id:'calls',     label:'Calls',           icon:I.Phone,    count: counts.calls },
    { id:'proposals', label:'Proposals',       icon:I.Doc,      count: counts.proposals },
    { id:'evals',     label:'Evals',           icon:I.Beaker,   count: counts.evals || null },
    { id:'agents',    label:'Agents',          icon:I.Bot },
    { id:'settings',  label:'Settings',        icon:I.Cog },
  ];
  const agents = (window.AGENT_REGISTRY?.agents || []).map(a => ({
    id: a.key,
    label: a.display_name,
    surface: a.surface,
    color1: a.avatar_color_1,
    color2: a.avatar_color_2,
  }));

  return (
    <aside className="sb">
      <div className="sb__brand">
        <div className="sb__logo">g</div>
        {!collapsed && (
          <div>
            <div className="sb__brand-text">gtm_ops</div>
            <div className="sb__brand-sub">console · v3.4</div>
          </div>
        )}
      </div>

      <div className="sb__section">workspace</div>
      <nav className="sb__nav">
        {items.map(it => (
          <div key={it.id}
               className="sb__item"
               data-active={route === it.id}
               onClick={() => setRoute(it.id)}>
            <it.icon className="sb__icon" size={16} />
            <span className="sb__label">{it.label}</span>
            {it.count != null && <span className="sb__count">{it.count}</span>}
          </div>
        ))}
      </nav>

      <div className="sb__section">agents</div>
      <nav className="sb__nav" aria-label="ElevenLabs agents">
        {agents.map(a => (
          <div key={a.id}
               className="sb__item"
               role="button"
               tabIndex={0}
               onClick={() => setRoute('agents')}
               onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRoute('agents'); } }}>
            <span className="sb__icon sb__agent-orb" aria-hidden="true"
                  style={{background: `radial-gradient(circle at 30% 30%, ${a.color1}, ${a.color2})`, width: 16, height: 16, borderRadius: '50%'}}/>
            <span className="sb__label">{a.label}</span>
            <span className="mono dim" style={{fontSize: 9}}>{a.surface}</span>
          </div>
        ))}
      </nav>

      <div className="sb__footer">
        <div className="sb__avatar">RP</div>
        {!collapsed && (
          <div className="sb__user">
            <div className="sb__user-name">Rae Park</div>
            <div className="sb__user-org">helix · admin</div>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ---------- Topbar ---------- */
function Topbar({ route, openPalette, theme, setTheme, collapsed, setCollapsed }) {
  const labels = {
    home:'Mission Control', generate:'Generate', pipeline:'Pipeline', calls:'Calls',
    proposals:'Proposals', evals:'Evals', agents:'Agents', settings:'Settings',
  };
  const [notifOpen, setNotifOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const notifRef = useRef(null);
  const runRef = useRef(null);
  const D = window.GTM;

  const notifs = [
    { id:1, t:'2m', tone:'critical', title:'agent-03 paused on Arcadia', sub:'pricing objection · 3 deflections', act:'Review' },
    { id:2, t:'14m', tone:'warn', title:'eval.compliance regressed -3.2%', sub:'run #2104 · PHI quoted in summary', act:'Inspect' },
    { id:3, t:'45m', tone:'accent', title:'Banyan procurement booked', sub:'Marcus, CFO · 3:30pm Thursday', act:'Open' },
    { id:4, t:'1h',  tone:'accent', title:'Helix lead score 78 → 84', sub:'intent surge · pricing page ×3' },
    { id:5, t:'2h',  tone:'neutral', title:'Outreach sync · 502 retry 3/5', sub:'sequence sync paused' },
  ];

  return (
    <header className="tb">
      <button className="btn btn--ghost btn--icon" onClick={() => setCollapsed(!collapsed)} title="Toggle sidebar" aria-label="Toggle sidebar">
        <I.Menu size={16} />
      </button>
      <div className="tb__crumbs">
        <span className="tb__crumb">helix</span>
        <span className="tb__sep">/</span>
        <span className="tb__crumb">production</span>
        <span className="tb__sep">/</span>
        <span className="tb__crumb tb__crumb--active">{labels[route]}</span>
      </div>

      <button type="button" className="tb__search" onClick={openPalette}
              aria-label="Open command palette to search leads, calls, proposals">
        <span className="tb__search-icon" aria-hidden="true"><I.Search size={14} /></span>
        <span className="tb__search-placeholder">Search leads, calls, proposals…</span>
        <span className="tb__kbd" aria-hidden="true">⌘K</span>
      </button>

      <div className="tb__actions">
        <button ref={notifRef} className="btn btn--ghost btn--icon tb__bell" title="Notifications" aria-label="Notifications"
                onClick={() => setNotifOpen(o => !o)}>
          <I.Bell size={16} />
          <span className="tb__bell-dot"/>
        </button>
        <button className="btn btn--ghost btn--icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Toggle theme"
                aria-label="Toggle color theme">
          {theme === 'dark' ? <I.Sun size={16} /> : <I.Moon size={16} />}
        </button>
        <button ref={runRef} className="btn btn--primary" onClick={() => setRunOpen(o => !o)}>
          <I.Plus size={14} /> New run <I.ChevronDown size={12} style={{marginLeft:2,opacity:.85}}/>
        </button>
      </div>

      <Popover open={notifOpen} onClose={() => setNotifOpen(false)} anchorRef={notifRef} width={360} label="Notifications">
        <div className="pop__hd">
          <span>Notifications</span>
          <span className="mono dim" style={{fontSize:10}}>{notifs.length} new</span>
        </div>
        <div className="pop__list">
          {notifs.map(n => (
            <div key={n.id} className="pop__row" role="button" tabIndex={0}
                 onClick={() => { window.toast(n.title, { sub: n.sub, tone: n.tone }); setNotifOpen(false); }}
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.toast(n.title, { sub: n.sub, tone: n.tone }); setNotifOpen(false); } }}>
              <span className={`dot dot--${n.tone === 'neutral' ? 'idle' : n.tone}`} style={{width:7,height:7,marginTop:6}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13, fontWeight:600}}>{n.title}</div>
                <div style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>{n.sub}</div>
              </div>
              <span className="mono dim" style={{fontSize:10}}>{n.t}</span>
            </div>
          ))}
        </div>
        <div className="pop__ft">
          <button className="btn btn--ghost btn--xs" onClick={() => { window.toast('All notifications marked read'); setNotifOpen(false); }}>Mark all read</button>
          <button className="btn btn--ghost btn--xs" onClick={() => { window.toast('Notification settings opened'); setNotifOpen(false); }}>Settings</button>
        </div>
      </Popover>

      <Popover open={runOpen} onClose={() => setRunOpen(false)} anchorRef={runRef} width={300} label="Start a run">
        <div className="pop__hd"><span>Start a run</span></div>
        <div className="pop__list">
          {[
            { icon:I.Phone, label:'Outbound discovery', sub:'agent-01 · Hunter', tone:'accent' },
            { icon:I.Mail,  label:'Multi-thread sequence', sub:'3+ stakeholders', tone:'accent' },
            { icon:I.Doc,   label:'Generate proposal', sub:'from a closed call', tone:'accent' },
            { icon:I.Beaker,label:'Trigger eval suite', sub:'all 6 suites · ⌘E', tone:'accent' },
            { icon:I.Refresh, label:'Re-score stale leads', sub:'24 candidates', tone:'accent' },
          ].map(o => (
            <div key={o.label} className="pop__row" role="button" tabIndex={0}
                 onClick={() => { window.toast(`${o.label} queued`, { sub: o.sub, tone: 'accent' }); setRunOpen(false); }}
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.toast(`${o.label} queued`, { sub: o.sub, tone: 'accent' }); setRunOpen(false); } }}>
              <o.icon size={14} />
              <div style={{flex:1}}>
                <div style={{fontSize:13, fontWeight:600}}>{o.label}</div>
                <div style={{fontSize:11, color:'var(--text-3)'}}>{o.sub}</div>
              </div>
              <I.ArrowRight size={12} style={{color:'var(--text-3)'}}/>
            </div>
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
    const base = [
      { group:'Navigation', icon:I.Home,     label:'Go to Mission Control', meta:'⏎', do: () => setRoute('home') },
      { group:'Navigation', icon:I.Pipeline, label:'Go to Pipeline',        meta:'⏎', do: () => setRoute('pipeline') },
      { group:'Navigation', icon:I.Phone,    label:'Go to Calls',           meta:'⏎', do: () => setRoute('calls') },
      { group:'Navigation', icon:I.Doc,      label:'Go to Proposals',       meta:'⏎', do: () => setRoute('proposals') },
      { group:'Navigation', icon:I.Beaker,   label:'Go to Evals',           meta:'⏎', do: () => setRoute('evals') },
      { group:'Navigation', icon:I.Bot,      label:'Go to Agents',          meta:'⏎', do: () => setRoute('agents') },
      { group:'Navigation', icon:I.Cog,      label:'Go to Settings',        meta:'⏎', do: () => setRoute('settings') },
      { group:'Actions', icon:I.Mic,    label:'Talk to Sales Coach',       meta:'opens dock', do: () => { document.querySelector('.coach-launcher')?.click(); } },
      { group:'Actions', icon:I.Plus,    label:'New outbound run',          meta:'agent-01', do: () => window.toast('Outbound run queued', { sub:'agent-01 · 12 candidates · Hunter pass', tone:'accent' }) },
      { group:'Actions', icon:I.Bolt,    label:'Trigger eval suite',        meta:'⌘E', do: () => { setRoute('evals'); window.toast('Eval suite queued', { tone:'accent' }); } },
      { group:'Actions', icon:I.Mail,    label:'Draft recap email',         meta:'agent-01', do: () => window.toast('Recap email drafted', { sub:'review before sending →', tone:'accent' }) },
      { group:'Actions', icon:I.Refresh, label:'Re-score stale leads',      meta:'24 candidates', do: () => window.toast('Re-scoring queued', { sub:'24 leads · ~3 min', tone:'accent' }) },
      { group:'Jump to', icon:I.Building, label:'Banyan Health',            meta:'co · proposal', do: () => { setRoute('pipeline'); window.AppContext.set({ selection: { type:'lead', id:'banyan' }}); } },
      { group:'Jump to', icon:I.Building, label:'Helix Robotics',           meta:'co · qualifying', do: () => { setRoute('pipeline'); window.AppContext.set({ selection: { type:'lead', id:'helix' }}); } },
      { group:'Jump to', icon:I.Building, label:'Arcadia Insurance',        meta:'co · proposal', do: () => { setRoute('pipeline'); window.AppContext.set({ selection: { type:'lead', id:'arcadia' }}); } },
      { group:'Jump to', icon:I.Phone,    label:'CALL-2419 · Banyan',       meta:'45m ago', do: () => { setRoute('calls'); window.AppContext.set({ selection: { type:'call', id:'CALL-2419' }}); } },
      { group:'Jump to', icon:I.Phone,    label:'CALL-2417 · Arcadia',      meta:'flagged ×2', do: () => { setRoute('calls'); window.AppContext.set({ selection: { type:'call', id:'CALL-2417' }}); } },
    ];
    if (!q) return base;
    return base.filter(i => i.label.toLowerCase().includes(q.toLowerCase()));
  }, [q]);

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
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
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
        <input ref={inputRef} className="cp__input" placeholder="Type a command, lead, or call ID…"
               aria-label="Search commands, leads, or call IDs"
               value={q} onChange={e => setQ(e.target.value)} />
        <div className="cp__list">
          {Object.entries(groups).map(([g, list]) => (
            <div key={g}>
              <div className="cp__group">{g}</div>
              {list.map(it => {
                idx += 1;
                const isActive = idx === active;
                return (
                  <div key={it.label} className="cp__row" data-active={isActive}
                       onMouseEnter={() => setActive(idx)}
                       onClick={() => { it.do?.(); setOpen(false); }}>
                    <span className="cp__row-icon"><it.icon size={14} /></span>
                    <span>{it.label}</span>
                    <span className="cp__row-meta">{it.meta}</span>
                  </div>
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
function Sparkline({ data, color = 'var(--sunset-500)', fill = true, h = 40, w = 120 }) {
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / span) * (h - 4) - 2]);
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {fill && <path d={area} fill={color} opacity="0.15" />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function Stat({ label, value, delta, tone, spark, sparkColor, accent }) {
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : null;
  return (
    <div className={`stat ${accent ? 'stat--accent' : ''}`}>
      <div className="stat__label">{label}</div>
      <div className={`stat__value ${tone ? `stat__value--${tone}` : ''}`}>{value}</div>
      {delta != null && (
        <div className={`stat__delta ${dir ? `stat__delta--${dir}` : ''}`}>
          {dir === 'up' && <I.ArrowUp size={11} />}
          {dir === 'down' && <I.ArrowDown size={11} />}
          {delta > 0 ? '+' : ''}{delta}{typeof delta === 'number' && Math.abs(delta) < 1 ? '' : '%'} vs last week
        </div>
      )}
      {spark && (
        <div className="stat__spark">
          <Sparkline data={spark} color={sparkColor || 'var(--sunset-500)'} h={28} w={80} />
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
    <div className="ph">
      <div>
        {eyebrow && <div className="ph__eyebrow">{eyebrow}</div>}
        <div className="ph__title">{title}</div>
        {sub && <div className="ph__sub">{sub}</div>}
      </div>
      {actions && <div className="ph__actions">{actions}</div>}
    </div>
  );
}

function Card({ title, action, children, accent, className = '' }) {
  const accentClass = accent ? `card--${accent}` : '';
  return (
    <div className={`card ${accentClass} ${className}`}>
      {(title || action) && (
        <div className="card__hd">
          <div className="card__title">
            <span className="card__title-bracket">[</span>{title}<span className="card__title-bracket">]</span>
          </div>
          {action}
        </div>
      )}
      <div className="card__body">{children}</div>
    </div>
  );
}

function ConsolePanel({ lines, title = 'live · agent.feed' }) {
  const [liveLines, setLiveLines] = React.useState([]);
  React.useEffect(() => {
    if (lines) return; // Use provided static lines if available
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.msg) {
        setLiveLines(prev => {
          const newLines = [...prev, { t: new Date().toLocaleTimeString(), level: 'info', txt: data.msg }];
          return newLines.slice(-20); // Keep last 20
        });
      }
    };
    return () => es.close();
  }, [lines]);

  const displayLines = lines || liveLines;

  return (
    <div className="console-panel">
      <div className="console-panel__hd">
        <span>{title}</span>
        <span><span className="dot dot--accent" style={{display:'inline-block',marginRight:6,verticalAlign:'middle'}}/>streaming</span>
      </div>
      {displayLines.map((l, i) => (
        <div key={i}>
          <span className="cl-meta">{l.t}</span>{' '}
          <span className={`cl-${l.level || 'info'}`}>{(l.level || 'info').toUpperCase().padEnd(4,' ')}</span>{' '}
          <span>{l.txt}</span>
        </div>
      ))}
      <div><span className="cl-prompt">›</span> <span className="cl-cursor"></span></div>
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o.value} className="seg__btn"
                data-active={value === o.value}
                onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

Object.assign(window, {
  Sidebar, Topbar, CommandPalette, ToastHost, Popover,
  Sparkline, Stat, Badge, PageHeader, Card, ConsolePanel, Segmented,
});
