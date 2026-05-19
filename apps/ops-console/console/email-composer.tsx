/* ============================================================
   AI follow-up email composer — preview pane in ops-console.

   Loads a `gtm-ops.call-trace.v1` fixture (sibling shape to the
   round-1 PR #173 trace export), feeds it through
   `buildEmailPrompt` + `mockLlmCompose` (see email-prompt.ts),
   and renders subject + body + customer name in a side-by-side
   trace / preview layout.

   The LLM client is mocked today — `mockLlmCompose` is a pure
   function — but the prompt builder is real; swapping in a fetch
   to /api/llm is a one-line change in email-prompt.ts.
   ============================================================ */

const EMAIL_COMPOSER_FIXTURE_URL = 'fixtures/call-trace-followup.json';

function EmailComposer({ fixturePath = EMAIL_COMPOSER_FIXTURE_URL }) {
  const [trace, setTrace] = React.useState(null);
  const [composed, setComposed] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [phase, setPhase] = React.useState('loading');
  // phase: loading | ready | composing | done | error

  React.useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    fetch(fixturePath)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`fixture ${r.status}`)))
      .then(json => {
        if (cancelled) return;
        setTrace(json);
        setPhase('ready');
      })
      .catch(e => { if (!cancelled) { setError(String(e)); setPhase('error'); } });
    return () => { cancelled = true; };
  }, [fixturePath]);

  const compose = React.useCallback(() => {
    if (!trace) return;
    setPhase('composing');
    // mockLlmCompose is synchronous; wrap in a microtask so the
    // `composing` phase actually paints (useful for the spinner
    // affordance and matches what a real fetch would do).
    Promise.resolve().then(() => {
      const result = window.composeFollowupEmail(trace);
      setComposed(result);
      setPhase('done');
    });
  }, [trace]);

  // Auto-compose on first load so the preview is populated by
  // default — the operator clicks "Recompose" to re-run the mock.
  React.useEffect(() => {
    if (phase === 'ready' && trace && !composed) compose();
  }, [phase, trace, composed, compose]);

  if (phase === 'error') {
    return <div className="emailc emailc--error" role="alert">Fixture failed to load: {error}</div>;
  }
  if (!trace) {
    return <div className="emailc emailc--loading">Loading call trace…</div>;
  }

  const customerName = trace.participant || 'Unknown caller';

  return (
    <div className="emailc" data-phase={phase} data-testid="email-composer">
      <header className="emailc__head">
        <div className="emailc__title">AI follow-up email composer</div>
        <div className="emailc__meta">
          <span data-testid="emailc-customer-name">{customerName}</span>
          <span className="emailc__meta-sep">·</span>
          <span>{trace.company}</span>
          <span className="emailc__meta-sep">·</span>
          <span>call {trace.call_id}</span>
        </div>
        <button
          type="button"
          className="emailc__compose btn btn--primary"
          onClick={compose}
          disabled={phase === 'composing'}
          data-testid="emailc-compose">
          {phase === 'composing' ? 'Composing…' : composed ? 'Recompose' : 'Compose follow-up'}
        </button>
      </header>

      <div className="emailc__grid">
        <section className="emailc__source" aria-label="Source call trace">
          <h3 className="emailc__section-title">Source call</h3>
          <dl className="emailc__facts">
            <div className="emailc__row"><dt>Customer</dt><dd data-testid="emailc-source-customer">{customerName}</dd></div>
            <div className="emailc__row"><dt>Company</dt><dd>{trace.company}</dd></div>
            <div className="emailc__row"><dt>Outcome</dt><dd>{trace.outcome}</dd></div>
            <div className="emailc__row"><dt>Sentiment</dt><dd>{trace.sentiment}</dd></div>
            <div className="emailc__row"><dt>Duration</dt><dd>{trace.duration}</dd></div>
            <div className="emailc__row"><dt>To</dt><dd>{(trace.crm_context || {}).primary_contact_email || '—'}</dd></div>
          </dl>
          <h4 className="emailc__section-subtitle">Transcript</h4>
          <ol className="emailc__transcript">
            {(trace.transcript || []).map((t, i) => (
              <li key={i} className="emailc__line" data-role={t.role}>
                <span className="emailc__line-role">{t.role}</span>
                <span className="emailc__line-text">{t.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="emailc__preview" aria-label="Email preview">
          <h3 className="emailc__section-title">Preview</h3>
          {!composed && phase !== 'composing' && (
            <div className="emailc__empty">Click <em>Compose follow-up</em> to draft.</div>
          )}
          {phase === 'composing' && (
            <div className="emailc__empty" data-testid="emailc-composing">Calling LLM (mock)…</div>
          )}
          {composed && (
            <article className="emailc__email" data-testid="emailc-preview">
              <header className="emailc__email-head">
                <div className="emailc__email-field">
                  <span className="emailc__email-label">To</span>
                  <span className="emailc__email-value">{composed.to || '(no email on file)'}</span>
                </div>
                <div className="emailc__email-field">
                  <span className="emailc__email-label">Customer</span>
                  <span className="emailc__email-value" data-testid="emailc-preview-customer">{composed.customer_name}</span>
                </div>
                <div className="emailc__email-field">
                  <span className="emailc__email-label">Subject</span>
                  <span className="emailc__email-value emailc__email-subject" data-testid="emailc-preview-subject">{composed.subject}</span>
                </div>
              </header>
              <pre className="emailc__email-body" data-testid="emailc-preview-body">{composed.body}</pre>
              <footer className="emailc__email-foot">
                <span>composed {composed.composed_at}</span>
                <span>schema {composed.schema}</span>
              </footer>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}

function EmailComposerPage({ setRoute }) {
  return (
    <div className="page page--email-composer">
      <PageHeader
        eyebrow="workspace · follow-up"
        title="AI follow-up email composer"
        sub="Post-call email drafted from the call trace + CRM context. Preview before sending."
      />
      <EmailComposer/>
    </div>
  );
}

window.EmailComposer = EmailComposer;
window.EmailComposerPage = EmailComposerPage;
