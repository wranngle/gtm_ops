/* ============================================================
   Vertical Switcher widget — pick plumber | hvac | electrician.
   Swapping the active vertical re-renders the displayed system
   prompt, proposal template, voice id, and intake fields without
   leaking state across presets (each preset is read fresh from
   window.VERTICAL_PRESETS, never mutated in place).

   Active id is persisted via window.persistVerticalId so a refresh
   keeps the operator's choice; the chip in the header reuses the
   round-1 PR #171 badge--healthy / badge--neutral pattern.
   ============================================================ */

function VerticalSwitcher({ initialId, onChange }: { initialId?: any; onChange?: any } = {}) {
  const presets = window.VERTICAL_PRESETS || [];
  const defaultId = initialId || window.readPersistedVerticalId?.() || window.DEFAULT_VERTICAL_ID;
  const [active, setActive] = React.useState(defaultId);
  const preset = window.getVerticalPreset(active);

  const select = React.useCallback((id) => {
    if (id === active) return;
    setActive(id);
    window.persistVerticalId?.(id);
    if (typeof onChange === 'function') onChange(window.getVerticalPreset(id));
  }, [active, onChange]);

  if (!preset) {
    return <div className="vert vert--error" role="alert">No vertical presets registered.</div>;
  }

  return (
    <div className="vert" data-active-vertical={preset.id} data-testid="vertical-switcher">
      <header className="vert__head">
        <div className="vert__title">Active vertical</div>
        <span
          className="badge badge--healthy"
          data-testid="vertical-active-chip"
          data-vertical-id={preset.id}
        >{preset.label}</span>
      </header>

      <div className="vert__tabs" role="tablist" aria-label="Vertical preset">
        {presets.map(p => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={p.id === active}
            className={`vert__tab ${p.id === active ? 'vert__tab--active' : ''}`}
            onClick={() => select(p.id)}
            data-testid={`vertical-tab-${p.id}`}>
            {p.label}
          </button>
        ))}
      </div>

      <dl className="vert__facts">
        <div className="vert__row">
          <dt>Voice id</dt>
          <dd className="mono" data-testid="vertical-voice-id">{preset.voice_id}</dd>
        </div>
        <div className="vert__row">
          <dt>Proposal template</dt>
          <dd className="mono" data-testid="vertical-template">{preset.proposal_template}</dd>
        </div>
        <div className="vert__row">
          <dt>Default tier</dt>
          <dd className="mono">{preset.default_tier}</dd>
        </div>
        <div className="vert__row">
          <dt>Intake fields</dt>
          <dd className="mono">{preset.intake_fields.join(', ')}</dd>
        </div>
      </dl>

      <section className="vert__prompt" aria-label="System prompt">
        <div className="vert__prompt-label">System prompt</div>
        <pre className="vert__prompt-body mono" data-testid="vertical-system-prompt">{preset.system_prompt}</pre>
      </section>
    </div>
  );
}

function VerticalsPage({ setRoute }) {
  return (
    <div className="page page--verticals">
      <PageHeader title="Verticals"/>
      <VerticalSwitcher/>
    </div>
  );
}

window.VerticalSwitcher = VerticalSwitcher;
window.VerticalsPage = VerticalsPage;
