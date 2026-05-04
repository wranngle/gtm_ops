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

/* ---------- Tiny popover (anchored, click-outside-to-close) ---------- */
function Popover({ open, onClose, anchorRef, children, align = 'right', width = 320 }) {
  const [pos, setPos] = useState(null);
  const popRef = useRef(null);
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({
      top: r.bottom + 8,
      left: align === 'right' ? Math.max(8, r.right - width) : r.left,
    });
    function onDoc(e) {
      if (popRef.current && !popRef.current.contains(e.target) && !anchorRef.current.contains(e.target)) onClose();
    }
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!open || !pos) return null;
  return (
    <div ref={popRef} className="popover" style={{ top: pos.top, left: pos.left, width }}>
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
    { id:'settings',  label:'Settings',        icon:I.Cog },
  ];
  const agents = [
    { id:'agent-01', label:'Hunter',  icon:I.Bot, status:'active' },
    { id:'agent-02', label:'Closer',  icon:I.Bot, status:'active' },
    { id:'agent-03', label:'Watcher', icon:I.Bot, status:'paused' },
  ];

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
      <nav className="sb__nav">
        {agents.map(a => (
          <div key={a.id} className="sb__item">
            <a.icon className="sb__icon" size={16} />
            <span className="sb__label">{a.label}</span>
            <span className={`dot dot--${a.status === 'active' ? 'accent' : 'idle'}`} />
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
    home:'Mission Control', pipeline:'Pipeline', calls:'Calls',
    proposals:'Proposals', evals:'Evals', settings:'Settings',
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
      <button className="btn btn--ghost btn--icon" onClick={() => setCollapsed(!collapsed)} title="Toggle sidebar">
        <I.Menu size={16} />
      </button>
      <div className="tb__crumbs">
        <span className="tb__crumb">helix</span>
        <span className="tb__sep">/</span>
        <span className="tb__crumb">production</span>
        <span className="tb__sep">/</span>
        <span className="tb__crumb tb__crumb--active">{labels[route]}</span>
      </div>

      <div className="tb__search" onClick={openPalette}>
        <span className="tb__search-icon"><I.Search size={14} /></span>
        <input readOnly placeholder="Search leads, calls, proposals…" />
        <span className="tb__kbd">⌘K</span>
      </div>

      <div className="tb__actions">
        <button ref={notifRef} className="btn btn--ghost btn--icon tb__bell" title="Notifications"
                onClick={() => setNotifOpen(o => !o)}>
          <I.Bell size={16} />
          <span className="tb__bell-dot"/>
        </button>
        <button className="btn btn--ghost btn--icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Toggle theme">
          {theme === 'dark' ? <I.Sun size={16} /> : <I.Moon size={16} />}
        </button>
        <button ref={runRef} className="btn btn--primary" onClick={() => setRunOpen(o => !o)}>
          <I.Plus size={14} /> New run <I.ChevronDown size={12} style={{marginLeft:2,opacity:.85}}/>
        </button>
      </div>

      <Popover open={notifOpen} onClose={() => setNotifOpen(false)} anchorRef={notifRef} width={360}>
        <div className="pop__hd">
          <span>Notifications</span>
          <span className="mono dim" style={{fontSize:10}}>{notifs.length} new</span>
        </div>
        <div className="pop__list">
          {notifs.map(n => (
            <div key={n.id} className="pop__row" onClick={() => { window.toast(n.title, { sub: n.sub, tone: n.tone }); setNotifOpen(false); }}>
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

      <Popover open={runOpen} onClose={() => setRunOpen(false)} anchorRef={runRef} width={300}>
        <div className="pop__hd"><span>Start a run</span></div>
        <div className="pop__list">
          {[
            { icon:I.Phone, label:'Outbound discovery', sub:'agent-01 · Hunter', tone:'accent' },
            { icon:I.Mail,  label:'Multi-thread sequence', sub:'3+ stakeholders', tone:'accent' },
            { icon:I.Doc,   label:'Generate proposal', sub:'from a closed call', tone:'accent' },
            { icon:I.Beaker,label:'Trigger eval suite', sub:'all 6 suites · ⌘E', tone:'accent' },
            { icon:I.Refresh, label:'Re-score stale leads', sub:'24 candidates', tone:'accent' },
          ].map(o => (
            <div key={o.label} className="pop__row" onClick={() => { window.toast(`${o.label} queued`, { sub: o.sub, tone: 'accent' }); setRunOpen(false); }}>
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

  const items = useMemo(() => {
    const base = [
      { group:'Navigation', icon:I.Home,     label:'Go to Mission Control', meta:'⏎', do: () => setRoute('home') },
      { group:'Navigation', icon:I.Pipeline, label:'Go to Pipeline',        meta:'⏎', do: () => setRoute('pipeline') },
      { group:'Navigation', icon:I.Phone,    label:'Go to Calls',           meta:'⏎', do: () => setRoute('calls') },
      { group:'Navigation', icon:I.Doc,      label:'Go to Proposals',       meta:'⏎', do: () => setRoute('proposals') },
      { group:'Navigation', icon:I.Beaker,   label:'Go to Evals',           meta:'⏎', do: () => setRoute('evals') },
      { group:'Actions', icon:I.Plus,    label:'New outbound run',          meta:'agent-01' },
      { group:'Actions', icon:I.Bolt,    label:'Trigger eval suite',        meta:'⌘E' },
      { group:'Actions', icon:I.Mail,    label:'Draft recap email',         meta:'agent-01' },
      { group:'Actions', icon:I.Refresh, label:'Re-score stale leads',      meta:'24 candidates' },
      { group:'Jump to', icon:I.Building, label:'Banyan Health',            meta:'co · proposal' },
      { group:'Jump to', icon:I.Building, label:'Helix Robotics',           meta:'co · qualifying' },
      { group:'Jump to', icon:I.Building, label:'Arcadia Insurance',        meta:'co · proposal' },
      { group:'Jump to', icon:I.Phone,    label:'CALL-2419 · Banyan',       meta:'45m ago' },
      { group:'Jump to', icon:I.Phone,    label:'CALL-2417 · Arcadia',      meta:'flagged ×2' },
    ];
    if (!q) return base;
    return base.filter(i => i.label.toLowerCase().includes(q.toLowerCase()));
  }, [q]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    setActive(0); setQ('');
  }, [open]);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); }
      if (!open) return;
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
      if (e.key === 'Enter')     { items[active]?.do?.(); setOpen(false); }
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
      <div className="cp" onClick={e => e.stopPropagation()}>
        <input ref={inputRef} className="cp__input" placeholder="Type a command, lead, or call ID…"
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
