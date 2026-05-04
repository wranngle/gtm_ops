/* Inline SVG icon set — stroke-based, 16/20px, currentColor */
window.Icon = (function () {
  const make = (path, opts={}) => function Icon(props={}) {
    const size = props.size || 16;
    const stroke = props.stroke || 1.7;
    return React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 24 24',
      fill: opts.fill ? 'currentColor' : 'none',
      stroke: 'currentColor', strokeWidth: stroke,
      strokeLinecap: 'round', strokeLinejoin: 'round',
      style: props.style, className: props.className,
    }, React.createElement('g', { dangerouslySetInnerHTML: { __html: path } }));
  };

  return {
    Home:        make('<path d="M3 11l9-8 9 8M5 9v12h14V9"/>'),
    Pipeline:    make('<rect x="3" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>'),
    Phone:       make('<path d="M5 4h4l2 5-2 1a11 11 0 005 5l1-2 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>'),
    Beaker:      make('<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/><path d="M7.5 13h9"/>'),
    Doc:         make('<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
    Cog:         make('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.4 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.4-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.4-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.4h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.4l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.4 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
    Search:      make('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    Bell:        make('<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>'),
    Plus:        make('<path d="M12 5v14M5 12h14"/>'),
    Filter:      make('<path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z"/>'),
    ArrowRight:  make('<path d="M5 12h14M13 5l7 7-7 7"/>'),
    ArrowUpRight:make('<path d="M7 17L17 7M7 7h10v10"/>'),
    ArrowUp:     make('<path d="M12 19V5M5 12l7-7 7 7"/>'),
    ArrowDown:   make('<path d="M12 5v14M5 12l7 7 7-7"/>'),
    Bolt:        make('<path d="M13 2L3 14h7l-1 8 11-14h-7l1-6z"/>'),
    Pulse:       make('<path d="M3 12h4l3-9 4 18 3-9h4"/>'),
    Sparkle:     make('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/>'),
    Bot:         make('<rect x="4" y="8" width="16" height="12" rx="3"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/><path d="M12 4v4M8 4h8"/>'),
    Folder:      make('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>'),
    Building:    make('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>'),
    Check:       make('<path d="M5 13l4 4L19 7"/>'),
    Close:       make('<path d="M6 6l12 12M18 6L6 18"/>'),
    Chevron:     make('<path d="M9 6l6 6-6 6"/>'),
    ChevronDown: make('<path d="M6 9l6 6 6-6"/>'),
    Menu:        make('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    Mic:         make('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 19v3M8 22h8"/>'),
    Play:        make('<path d="M6 4l14 8-14 8z" fill="currentColor"/>'),
    Pause:       make('<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>'),
    Sun:         make('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>'),
    Moon:        make('<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>'),
    Flag:        make('<path d="M4 21V4h12l-2 4 2 4H4"/>'),
    User:        make('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'),
    Eye:         make('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    Calendar:    make('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>'),
    Mail:        make('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/>'),
    Slack:       make('<rect x="3" y="10" width="11" height="4" rx="2"/><rect x="10" y="3" width="4" height="11" rx="2"/><rect x="10" y="10" width="11" height="4" rx="2"/><rect x="10" y="10" width="4" height="11" rx="2"/>'),
    Lock:        make('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'),
    Trash:       make('<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/>'),
    Refresh:     make('<path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5"/>'),
    Github:      make('<path d="M12 2a10 10 0 00-3 19.5c.5 0 .7-.2.7-.5v-2c-3 .7-3.6-1.4-3.6-1.4-.5-1.2-1.2-1.5-1.2-1.5-1-.7.1-.7.1-.7 1 .1 1.6 1 1.6 1 1 1.6 2.5 1.2 3 .9.1-.7.4-1.2.7-1.4-2.2-.3-4.5-1.1-4.5-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 015 0c2-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.5 5 .4.3.7.9.7 1.8v2.6c0 .3.2.6.7.5A10 10 0 0012 2z" fill="currentColor"/>'),
    Salesforce:  make('<path d="M7 14a3 3 0 113 3M9 8a4 4 0 017 1 3 3 0 013 3 3 3 0 01-3 3M5 12a3 3 0 014-3"/>'),
    Globe:       make('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>'),
    Database:    make('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
    Bracket:     make('<path d="M8 4H4v16h4M16 4h4v16h-4"/>'),
    Diamond:     make('<path d="M6 3h12l3 6-9 12L3 9z"/>'),
  };
})();
