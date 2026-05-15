/* ============================================================
   Root App — routing + Tweaks
   ============================================================ */

const { useState: useS, useEffect: useE } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "density": "comfortable",
  "accentColor": "#ff5f00",
  "showConsole": true,
  "sidebarCollapsed": false,
  "fontDisplay": "Outfit",
  "showLiveDot": true
}/*EDITMODE-END*/;

const ROUTES = ['home', 'generate', 'pipeline', 'calls', 'proposals', 'evals', 'agents', 'simulator', 'settings'];

function readHistoryMetadata(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function stageFromHistoryStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return 'proposal';
  if (s === 'failed') return 'qualifying';
  if (s === 'running' || s === 'queued') return 'discovery';
  return 'discovery';
}

function nextStepFromHistoryStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return 'Review generated proposal';
  if (s === 'failed') return 'Repair failed generation';
  if (s === 'running' || s === 'queued') return 'Generation in progress';
  return 'Review intake context';
}

function routeFromLocation() {
  try {
    const url = new URL(window.location.href);
    const queryRoute = url.searchParams.get('route');
    const hashRoute = url.hash.replace(/^#\/?/, '');
    const next = queryRoute || hashRoute || 'home';
    return ROUTES.includes(next) ? next : 'home';
  } catch (_) {
    return 'home';
  }
}

function App() {
  const scrollRef = React.useRef(null);
  const [route, setRoute] = useS(() => {
    const initialRoute = routeFromLocation();
    window.AppContext.set({ route: initialRoute });
    return initialRoute;
  });
  const [paletteOpen, setPaletteOpen] = useS(false);
  const [tw, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const [dataLoaded, setDataLoaded] = useS(0);
  const setConsoleRoute = React.useCallback((next) => {
    if (typeof next === 'function') {
      setRoute(prev => {
        const resolved = next(prev);
        const safeRoute = ROUTES.includes(resolved) ? resolved : 'home';
        window.AppContext.set({ route: safeRoute });
        return safeRoute;
      });
      return;
    }
    const safeRoute = ROUTES.includes(next) ? next : 'home';
    window.AppContext.set({ route: safeRoute });
    setRoute(safeRoute);
  }, []);

  // Publish route changes to the global AppContext so the ConvAI widget
  // can pick them up as dynamic variables.
  useE(() => {
    document.documentElement.setAttribute('data-console-route', route);
    window.AppContext.set({ route });
    try {
      const url = new URL(window.location.href);
      if (route === 'home') url.searchParams.delete('route');
      else url.searchParams.set('route', route);
      const next = `${url.pathname}${url.search}${url.hash}`;
      if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.pushState({ route }, '', next);
      }
    } catch (_) { /* URL API unavailable */ }
  }, [route]);

  React.useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [route]);

  useE(() => {
    const onPop = () => setConsoleRoute(routeFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setConsoleRoute]);

  useE(() => {
    const onRoute = (event) => {
      const next = event.detail?.route;
      if (typeof next === 'string') setConsoleRoute(next);
    };
    window.addEventListener('gtm:route', onRoute);
    return () => window.removeEventListener('gtm:route', onRoute);
  }, [setConsoleRoute]);

  // Apply tweaks to the document
  useE(() => {
    document.documentElement.setAttribute('data-theme', tw.theme);
    document.documentElement.style.setProperty('--sunset-500', tw.accentColor);
    document.documentElement.style.setProperty('--font-display', `'${tw.fontDisplay}', system-ui, sans-serif`);
  }, [tw.theme, tw.accentColor, tw.fontDisplay]);

  // Fetch real backend data. Important: when the API returns an empty
  // array (fresh deploy, no historic runs yet) we PRESERVE the synthetic
  // fallback fixtures from data.js — overwriting with [] would leave the
  // entire UI looking broken (empty kanban, blank proposals, no hot leads)
  // and a brand-new visitor would conclude the app itself is broken.
  // window.GTM._isDemoFallback signals to consumers (banner, etc.) that
  // they're looking at demo data, not real history.
  useE(() => {
    async function loadData() {
      try {
        // Cache-bust on demand so the Mission Control "Refresh" button
        // (which dispatches `gtm:refresh-data`) actually re-fetches
        // history instead of being served the existing 304/304-equivalent.
        const cacheBuster = window.GTM._lastRefreshAt ? `?_=${window.GTM._lastRefreshAt}` : '';
        const histRes = await fetch(`/api/history${cacheBuster}`);
        if (!histRes.ok) return;
        const history = await histRes.json();
        if (!Array.isArray(history) || history.length === 0) {
          window.GTM._isDemoFallback = true;
          setDataLoaded(n => n + 1);
          return;
        }
        window.GTM._isDemoFallback = false;
        window.GTM.companies = history.map(h => {
          const metadata = readHistoryMetadata(h.metadata);
          return ({
            id: h.slug || h.id,
            name: metadata.client_name || h.client_slug,
            industry: metadata.process_name || 'Generated proposal',
            size: '-',
            region: '-',
            stage: stageFromHistoryStatus(h.status),
            score: h.audit_score || 0,
            owner: 'system',
            icp: h.status === 'completed' ? 0.82 : 0.5,
            intent: h.status === 'completed' ? 'high' : h.status === 'failed' ? 'low' : 'med',
            pain: h.project_name || 'N/A',
            url: '#',
            techStack: [],
            lastTouch: new Date(h.timestamp).toLocaleDateString(),
            nextStep: nextStepFromHistoryStatus(h.status),
            nextStepWhen: h.status === 'completed' ? 'ready now' : '-',
            arr: `$${h.monthly_bleed || 0}K`,
            dealSize: `$${((h.total_price || 0) / 1000).toFixed(1)}K`,
            closeProb: h.status === 'completed' ? 0.72 : h.status === 'failed' ? 0.15 : 0.5,
            artifacts: h.artifacts || []
          });
        });
        // Preserve the curated data.js seeds as a baseline so the Banyan /
        // Verdant / Arcadia / Thornfield demo proposals stay visible
        // alongside any history-derived entries. History entries with the
        // same id win (real run state takes priority); entries with a new
        // id append after the seeds. Without this merge, the runtime
        // overwrite was silently dropping the curated proposals AND
        // displaying ugly slugs like "acme-hvac" as the company name.
        const seedProposals = Array.isArray(window.GTM._seedProposals)
          ? window.GTM._seedProposals
          : (window.GTM._seedProposals = window.GTM.proposals.slice());
        // Humanize a kebab-case slug (`harbor-property-mgmt`) into a
        // proper Title-Case display name when metadata.client_name is
        // missing. Production history entries can ship without
        // client_name; rendering the raw slug as the company looks
        // unfinished and contradicts the brand.
        const humanizeSlug = (s) => String(s || '')
          .split(/[-_]+/)
          .filter(Boolean)
          .map(w => w[0].toUpperCase() + w.slice(1))
          .join(' ');
        const historyProposals = history.map(h => {
          const metadata = readHistoryMetadata(h.metadata);
          return ({
            id: h.slug || h.id,
            co: metadata.client_name || humanizeSlug(h.client_slug) || h.client_slug,
            owner: 'system',
            stage: h.status === 'completed' ? 'signed' : (h.status === 'failed' ? 'closed lost' : 'drafting'),
            amount: `$${((h.total_price || 0) / 1000).toFixed(1)}K`,
            sections: 5,
            accepted: h.status === 'completed' ? 5 : 2,
            sent: new Date(h.timestamp).toLocaleDateString(),
            viewed: 'today',
            blockers: h.risk_score > 3 ? ['High risk score'] : [],
            artifacts: h.artifacts || [],
            executionId: h.id,
            projectName: h.project_name || metadata.process_name || 'Generated proposal',
            riskScore: h.risk_score,
            auditScore: h.audit_score,
          });
        });
        const historyIds = new Set(historyProposals.map(p => p.id));
        const preservedSeeds = seedProposals.filter(p => !historyIds.has(p.id));
        window.GTM.proposals = [...preservedSeeds, ...historyProposals];
        setDataLoaded(n => n + 1);
      } catch (err) {
        console.error("Failed to load history", err);
      }
    }
    loadData();
    // Listen for explicit refresh requests from anywhere in the app
    // (Mission Control "Refresh" button, future inline refresh
    // affordances). The handler stamps a timestamp on window.GTM so the
    // fetch becomes cache-busted, then re-runs the same loader.
    function onRefresh() {
      window.GTM._lastRefreshAt = Date.now();
      loadData();
    }
    window.addEventListener('gtm:refresh-data', onRefresh);
    return () => window.removeEventListener('gtm:refresh-data', onRefresh);
  }, []);

  const collapsed = tw.sidebarCollapsed;
  const setCollapsed = (v) => setTweak('sidebarCollapsed', v);

  return (
    <>
      <div className="app" data-collapsed={collapsed} data-route={route}>
        <Sidebar route={route} setRoute={setConsoleRoute} collapsed={collapsed}/>
        <div className="main">
          <Topbar route={route} setRoute={setConsoleRoute} openPalette={()=>setPaletteOpen(true)}
                  theme={tw.theme} setTheme={(v) => setTweak('theme', v)}
                  collapsed={collapsed} setCollapsed={setCollapsed}/>
          <main ref={scrollRef} className="scroll" key={route} aria-labelledby="console-page-title">
            {route === 'home' && <HomePage setRoute={setConsoleRoute}/>}
            {route === 'generate' && <GeneratePage setRoute={setConsoleRoute}/>}
            {route === 'pipeline' && <PipelinePage setRoute={setConsoleRoute}/>}
            {route === 'calls' && <CallsPage setRoute={setConsoleRoute}/>}
            {route === 'evals' && <EvalsPage setRoute={setConsoleRoute}/>}
            {route === 'proposals' && <ProposalsPage setRoute={setConsoleRoute}/>}
            {route === 'agents' && <AgentsPage setRoute={setConsoleRoute}/>}
            {route === 'simulator' && <SimulatorPage setRoute={setConsoleRoute}/>}
            {route === 'settings' && <SettingsPage setRoute={setConsoleRoute}/>}
          </main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} setRoute={setConsoleRoute}/>
      <window.ToastHost/>
      <window.SalesCoachLauncher/>

      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="Appearance">
          <window.TweakRadio label="Theme" value={tw.theme}
            options={['dark','light']}
            onChange={(v) => setTweak('theme', v)}/>
          <window.TweakColor label="Accent" value={tw.accentColor}
            onChange={(v) => setTweak('accentColor', v)}/>
          <window.TweakSelect label="Display font" value={tw.fontDisplay}
            options={['Outfit','Bricolage Grotesque','JetBrains Mono','Inter']}
            onChange={(v) => setTweak('fontDisplay', v)}/>
        </window.TweakSection>
        <window.TweakSection label="Layout">
          <window.TweakToggle label="Collapse sidebar" value={tw.sidebarCollapsed}
            onChange={(v) => setTweak('sidebarCollapsed', v)}/>
          <window.TweakToggle label="Pulsing live dot" value={tw.showLiveDot}
            onChange={(v) => setTweak('showLiveDot', v)}/>
        </window.TweakSection>
      </window.TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
