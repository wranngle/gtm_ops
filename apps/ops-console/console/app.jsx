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

function App() {
  const [route, setRoute] = useS('home');
  const [paletteOpen, setPaletteOpen] = useS(false);
  const [tw, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const [dataLoaded, setDataLoaded] = useS(0);

  // Publish route changes to the global AppContext so the ConvAI widget
  // can pick them up as dynamic variables.
  useE(() => {
    window.AppContext.set({ route });
  }, [route]);

  // Apply tweaks to the document
  useE(() => {
    document.documentElement.setAttribute('data-theme', tw.theme);
    document.documentElement.style.setProperty('--sunset-500', tw.accentColor);
    document.documentElement.style.setProperty('--font-display', `'${tw.fontDisplay}', system-ui, sans-serif`);
  }, [tw.theme, tw.accentColor, tw.fontDisplay]);

  // Fetch real backend data
  useE(() => {
    async function loadData() {
      try {
        const histRes = await fetch('/api/history');
        if (histRes.ok) {
          const history = await histRes.json();
          window.GTM.companies = history.map(h => ({
            id: h.slug || h.id,
            name: h.client_slug,
            industry: 'Unspecified',
            size: '-',
            region: '-',
            stage: h.status === 'completed' ? 'closing' : (h.status === 'failed' ? 'qualifying' : 'discovery'),
            score: h.audit_score || 0,
            owner: 'system',
            icp: 0.5,
            intent: h.status === 'completed' ? 'high' : 'med',
            pain: h.project_name || 'N/A',
            url: '#',
            techStack: [],
            lastTouch: new Date(h.timestamp).toLocaleDateString(),
            nextStep: 'Generated proposal',
            nextStepWhen: '-',
            arr: `$${h.monthly_bleed || 0}K`,
            dealSize: `$${((h.total_price || 0) / 1000).toFixed(1)}K`,
            closeProb: 0.5,
            artifacts: h.artifacts || []
          }));
          window.GTM.proposals = history.map(h => ({
            id: h.slug || h.id,
            co: h.client_slug,
            owner: 'system',
            stage: h.status === 'completed' ? 'signed' : (h.status === 'failed' ? 'closed lost' : 'drafting'),
            amount: `$${((h.total_price || 0) / 1000).toFixed(1)}K`,
            sections: 5,
            accepted: h.status === 'completed' ? 5 : 2,
            sent: new Date(h.timestamp).toLocaleDateString(),
            viewed: 'today',
            blockers: h.risk_score > 3 ? ['High risk score'] : []
          }));
          setDataLoaded(n => n + 1);
        }
      } catch (err) {
        console.error("Failed to load history", err);
      }
    }
    loadData();
  }, []);

  const collapsed = tw.sidebarCollapsed;
  const setCollapsed = (v) => setTweak('sidebarCollapsed', v);

  return (
    <>
      <div className="app" data-collapsed={collapsed}>
        <Sidebar route={route} setRoute={setRoute} collapsed={collapsed}/>
        <div className="main">
          <Topbar route={route} openPalette={()=>setPaletteOpen(true)}
                  theme={tw.theme} setTheme={(v) => setTweak('theme', v)}
                  collapsed={collapsed} setCollapsed={setCollapsed}/>
          <div className="scroll" key={route}>
            {route === 'home' && <HomePage setRoute={setRoute}/>}
            {route === 'generate' && <GeneratePage setRoute={setRoute}/>}
            {route === 'pipeline' && <PipelinePage setRoute={setRoute}/>}
            {route === 'calls' && <CallsPage/>}
            {route === 'evals' && <EvalsPage/>}
            {route === 'proposals' && <ProposalsPage setRoute={setRoute}/>}
            {route === 'agents' && <AgentsPage setRoute={setRoute}/>}
            {route === 'settings' && <SettingsPage setRoute={setRoute}/>}
          </div>
        </div>
      </div>

      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} setRoute={setRoute}/>
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
