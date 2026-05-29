/* ============================================================
   Follow-up email composer - local draft review surface.

   Loads a call-trace review packet, composes a deterministic local
   draft through email-prompt.ts, and requires operator approval before
   exposing a queued-send receipt. This route is intentionally not a
   fake one-click send surface.
   ============================================================ */

const EMAIL_COMPOSER_FIXTURE_URL = '../fixtures/call-trace-followup.json';

function localTraceLoadError(response) {
  const status = response?.status || 'unknown';
  return `source call trace returned HTTP ${status}`;
}

function EmailComposer({ fixturePath = EMAIL_COMPOSER_FIXTURE_URL }) {
  const [trace, setTrace] = React.useState(null);
  const [composed, setComposed] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [phase, setPhase] = React.useState('loading');
  const [reviewState, setReviewState] = React.useState('draft');
  const [sendReceipt, setSendReceipt] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    setError(null);
    fetch(fixturePath)
      .then(response => {
        if (!response.ok) throw new Error(localTraceLoadError(response));
        return response.json();
      })
      .then(json => {
        if (cancelled) return;
        setTrace(json);
        setPhase('ready');
      })
      .catch(reason => {
        if (cancelled) return;
        setError(reason?.message || String(reason));
        setPhase('error');
      });
    return () => { cancelled = true; };
  }, [fixturePath]);

  const compose = React.useCallback(() => {
    if (!trace) return;
    setPhase('composing');
    setReviewState('draft');
    setSendReceipt(null);
    Promise.resolve().then(() => {
      const result = window.composeFollowupEmail(trace);
      setComposed(result);
      setPhase('done');
    });
  }, [trace]);

  React.useEffect(() => {
    if (phase === 'ready' && trace && !composed) compose();
  }, [phase, trace, composed, compose]);

  const approveDraft = () => {
    if (!composed) return;
    setReviewState('approved');
  };

  const queueSend = () => {
    if (!composed || reviewState !== 'approved') return;
    setReviewState('queued');
    setSendReceipt({
      id: `email_${composed.source_call_id || 'trace'}_${Date.now()}`,
      callId: composed.source_call_id || 'source call',
      to: composed.to || 'recipient pending',
    });
  };

  if (phase === 'error') {
    return (
      <div className="emailc emailc--error" role="alert">
        <strong>Source call trace failed to load.</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (!trace) {
    return <div className="emailc emailc--loading">Loading source call trace...</div>;
  }

  const customerName = trace.participant || 'Unknown caller';
  const crm = trace.crm_context || {};
  const reviewCopy = reviewState === 'queued'
    ? 'Send queued'
    : reviewState === 'approved'
      ? 'Approved locally'
      : 'Draft requires review';
  const reviewDetail = reviewState === 'queued'
    ? `${sendReceipt?.callId || trace.call_id} queued for ${sendReceipt?.to || composed?.to || 'recipient pending'}`
    : reviewState === 'approved'
      ? 'Queue send is now available for the reviewed local draft.'
      : 'Approve the local draft before queueing any buyer email.';

  return (
    <div className="emailc" data-phase={phase} data-testid="email-composer">
      <header className="emailc__head">
        <div className="emailc__title">Follow-up draft review</div>
        <div className="emailc__meta" aria-label="Source trace summary">
          <div className="emailc__meta-item">
            <span>source</span>
            <strong>source {trace.call_id}</strong>
          </div>
          <div className="emailc__meta-item">
            <span>buyer</span>
            <strong data-testid="emailc-customer-name">{customerName}</strong>
          </div>
          <div className="emailc__meta-item">
            <span>state</span>
            <strong>local draft</strong>
          </div>
        </div>
        <button
          type="button"
          className="emailc__compose btn btn--primary"
          onClick={compose}
          disabled={phase === 'composing'}
          data-testid="emailc-compose"
        >
          {phase === 'composing' ? 'Composing...' : composed ? 'Recompose draft' : 'Compose draft'}
        </button>
      </header>

      <div className="emailc__review" data-state={reviewState} data-testid="emailc-review-gate">
        <div>
          <span className="emailc__review-label">review gate</span>
          <strong>{reviewCopy}</strong>
          <div className="muted">{reviewDetail}</div>
        </div>
        <div className="emailc__draft-actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            data-testid="emailc-approve"
            disabled={!composed || reviewState === 'queued'}
            onClick={approveDraft}
          >
            Approve locally
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            data-testid="emailc-queue-send"
            disabled={!composed || reviewState !== 'approved'}
            onClick={queueSend}
          >
            Queue send
          </button>
        </div>
      </div>

      {sendReceipt && (
        <div className="emailc__receipt" data-testid="emailc-send-receipt">
          <strong>Send queued</strong>
          <span>{sendReceipt.callId} to {sendReceipt.to}</span>
          <span className="mono">{sendReceipt.id}</span>
        </div>
      )}

      <div className="emailc__grid">
        <section className="emailc__source" aria-label="Source call trace">
          <h3 className="emailc__section-title">Source call</h3>
          <dl className="emailc__facts">
            <div className="emailc__row"><dt>Customer</dt><dd data-testid="emailc-source-customer">{customerName}</dd></div>
            <div className="emailc__row"><dt>Company</dt><dd>{trace.company}</dd></div>
            <div className="emailc__row"><dt>Outcome</dt><dd>{trace.outcome}</dd></div>
            <div className="emailc__row"><dt>Sentiment</dt><dd>{trace.sentiment}</dd></div>
            <div className="emailc__row"><dt>Duration</dt><dd>{trace.duration}</dd></div>
            <div className="emailc__row"><dt>To</dt><dd>{crm.primary_contact_email || '-'}</dd></div>
          </dl>
          <h4 className="emailc__section-subtitle">Transcript</h4>
          <ol className="emailc__transcript">
            {(trace.transcript || []).map((turn, index) => (
              <li key={index} className="emailc__line" data-role={turn.role}>
                <span className="emailc__line-role">{turn.role}</span>
                <span className="emailc__line-text">{turn.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="emailc__preview" aria-label="Email preview">
          <h3 className="emailc__section-title">Preview</h3>
          {!composed && phase !== 'composing' && (
            <div className="emailc__empty">Compose a local draft from the source call trace.</div>
          )}
          {phase === 'composing' && (
            <div className="emailc__empty" data-testid="emailc-composing">Composing local draft...</div>
          )}
          {composed && (
            <article className="emailc__email" data-testid="emailc-preview">
              <header className="emailc__email-head">
                <div className="emailc__email-field">
                  <span className="emailc__email-label">Status</span>
                  <span className="emailc__email-value">local draft from source {composed.source_call_id}</span>
                </div>
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
                <span>schema {composed.schema}</span>
                <span>source {composed.source_trace_schema}</span>
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
      <PageHeader title="Follow-up Email"/>
      <EmailComposer/>
    </div>
  );
}

window.EmailComposer = EmailComposer;
window.EmailComposerPage = EmailComposerPage;
