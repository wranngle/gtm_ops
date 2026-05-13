/* ============================================================
   Pages: Home, Pipeline, Calls
   ============================================================ */

const I2 = window.Icon;

function pageProposalAmountToThousands(amount) {
  if (typeof window.proposalAmountToThousands === 'function') {
    return window.proposalAmountToThousands(amount);
  }
  if (typeof amount === 'number' && Number.isFinite(amount)) return amount;
  const match = String(amount || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?\s*([kmb])?/i);
  if (!match) return 0;
  const value = Number.parseFloat(match[0]);
  if (!Number.isFinite(value)) return 0;
  const unit = (match[1] || 'k').toLowerCase();
  if (unit === 'm') return value * 1000;
  if (unit === 'b') return value * 1000000;
  return value;
}

function pageFormatProposalTotal(totalK) {
  if (typeof window.formatProposalTotal === 'function') {
    return window.formatProposalTotal(totalK);
  }
  if (!Number.isFinite(totalK) || totalK === 0) return '$0K';
  if (Math.abs(totalK) >= 1000) {
    const millions = totalK / 1000;
    return `$${millions.toFixed(Math.abs(millions) >= 10 ? 1 : 2).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')}M`;
  }
  return `$${totalK.toFixed(Math.abs(totalK) >= 100 ? 0 : 1).replace(/\.0$/, '')}K`;
}

function pageKnownMetaValue(value) {
  const text = String(value ?? '').trim();
  return text && !['-', '—', 'n/a', 'na', 'none', 'unknown'].includes(text.toLowerCase())
    ? text
    : '';
}

function pageJoinMeta(parts, fallback = 'Awaiting enrichment') {
  const known = parts.map(pageKnownMetaValue).filter(Boolean);
  return known.length ? known.join(' · ') : fallback;
}

function pageCompanySizeLabel(size) {
  const text = pageKnownMetaValue(size);
  if (!text) return '';
  return /(?:people|employees|headcount|ppl)$/i.test(text) ? text : `${text} ppl`;
}

function pageCompanySummary(c) {
  return pageJoinMeta([c?.industry, pageCompanySizeLabel(c?.size)]);
}

function pageDealLocationSummary(c) {
  const region = pageKnownMetaValue(c?.region).split(',')[0];
  return pageJoinMeta([c?.dealSize, region], pageKnownMetaValue(c?.dealSize) || 'Deal size pending');
}

function pageRelativeHours(when) {
  const text = String(when || '').trim().toLowerCase();
  if (!text || ['now', 'today'].includes(text)) return 0;
  const match = text.match(/(\d+(?:\.\d+)?)\s*([mhdw])/i);
  if (match) {
    const value = Number.parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'm') return value / 60;
    if (unit === 'h') return value;
    if (unit === 'd') return value * 24;
    if (unit === 'w') return value * 24 * 7;
  }
  if (/yesterday/.test(text)) return 24;
  if (/tomorrow|mon|tue|wed|thu|fri|sat|sun/.test(text)) return Number.POSITIVE_INFINITY;
  return Number.POSITIVE_INFINITY;
}

function pageIsMissedCall(c) {
  const outcome = String(c?.outcome || '').toLowerCase();
  return c?.missed === true || ['voicemail', 'no-answer', 'dropped', 'missed'].includes(outcome);
}

function humanCallOutcome(c) {
  const outcome = String(c?.outcome || 'missed').toLowerCase();
  if (outcome === 'voicemail') return 'left a voicemail';
  if (outcome === 'no-answer' || outcome === 'missed') return 'we missed the call';
  if (outcome === 'dropped') return 'call dropped';
  return outcome.replace(/[-_]/g, ' ');
}

function pageAttentionLabel(item, callbackLabel, reviewLabel) {
  return item?.isMissed ? callbackLabel : reviewLabel;
}

function page1OmitKeys(source, keys) {
  const blocked = new Set(keys);
  const next = {};
  Object.keys(source || {}).forEach(key => {
    if (!blocked.has(key)) next[key] = source[key];
  });
  return next;
}

/* ------------------------------------------------------------ */
/* TODAY (home) */
/* ------------------------------------------------------------ */
function HomePage({ setRoute }) {
  const D = window.GTM;
  const { stats, sparks, agents, companies } = D;
  const isAdmin = (() => {
    try { return new URLSearchParams(globalThis.location.search).has('admin'); }
    catch (_) { return false; }
  })();
  const hotLeads = [...companies].sort((a, b) => b.score - a.score).slice(0, 5);
  const [range, setRange] = useState('today');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState(() => Date.now());
  const buildSparkLabels = (series, cadence = 'point') => {
    const points = Array.isArray(series) ? series : [];
    const total = Math.max(1, points.length);
    const unit = String(cadence || 'point')
      .trim()
      .replace(/[-_]/g, ' ');
    return points.map((_, i) => {
      const marker = i === total - 1
        ? 'latest'
        : `${total - i - 1} ${unit}${(total - i - 1) === 1 ? '' : 's'} ago`;
      return `${unit} · ${marker}`;
    });
  };
  const triggerRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    window.dispatchEvent(new CustomEvent('gtm:refresh-data'));
    // The data loader in app.tsx is async; give it a moment, then settle
    // and stamp the new "as of" timestamp. We don't have a Promise we can
    // await for the in-app event, so the stamp shows up after the visual
    // spinner gives the operator feedback.
    setTimeout(() => {
      setLastRefreshAt(Date.now());
      setRefreshing(false);
      window.toast('Dashboard refreshed', {
        sub: `feeds resynced · as of ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}`,
        tone: 'accent',
      });
    }, 320);
  };
  // Snooze the attention banner for real — track an expiration timestamp
  // (ms since epoch) per banner id. Banner is hidden while now() < expiry.
  // Previously "Snooze 1h" only fired a toast and the banner stayed, which
  // contradicted the verb and made the affordance feel fake.
  const [snoozedBanners, setSnoozedBanners] = useState({});
  // Derive the attention surface from live fixture state instead of the
  // previous hardcoded "agent-03 paused on Arcadia call · pricing objection
  // (3 deflections)" strings + hardcoded CALL-2417 review handoff. The banner
  // surfaces whichever agent is currently paused and the call that's blocking
  // them — flip either upstream and the
  // banner now updates instead of lying.
  const attentionItem = (() => {
    const pausedAgent = (agents || []).find(a => a.status === 'paused');
    if (!pausedAgent) return null;
    const taskBlob = String(pausedAgent.currentTask || '').toLowerCase();
    const callList = (D.calls || []);
    const matchedCall =
      callList.find(c => c.co_id && taskBlob.includes(String(c.co_id).toLowerCase())) ||
      callList.find(c => c.co && taskBlob.includes(String(c.co).toLowerCase().split(' ')[0])) ||
      callList.slice().sort((a, b) => (Number(b.flags || 0) + Number(b.deflections || 0)) - (Number(a.flags || 0) + Number(a.deflections || 0)))[0];
    const companyName = matchedCall?.co || '';
    return {
      agentId: pausedAgent.id,
      agentName: pausedAgent.name,
      callId: matchedCall?.id,
      callOutcome: matchedCall?.outcome || 'unknown',
      callDeflections: Number(matchedCall?.deflections || 0),
      callFlags: Number(matchedCall?.flags || 0),
      callWho: matchedCall?.who || '',
      isMissed: matchedCall ? pageIsMissedCall(matchedCall) : false,
      companyName,
      bannerId: `${pausedAgent.id}-${matchedCall?.id || 'no-call'}-attention`,
    };
  })();
  const ATTENTION_BANNER_ID = attentionItem?.bannerId || 'no-attention';
  const snoozeExpiry = snoozedBanners[ATTENTION_BANNER_ID];
  const isAttentionSnoozed = typeof snoozeExpiry === 'number' && snoozeExpiry > Date.now();
  const snoozeAttention = (durationMs, label) => {
    if (!attentionItem) return;
    const until = Date.now() + durationMs;
    setSnoozedBanners(s => ({ ...s, [ATTENTION_BANNER_ID]: until }));
    window.toast(`${pageAttentionLabel(attentionItem, 'Callback', 'Handoff')} snoozed · ${label}`, {
      sub: pageAttentionLabel(
        attentionItem,
        `We'll text the customer back while you decide · until ${new Date(until).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`,
        `${attentionItem.agentId} review is parked until ${new Date(until).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`
      ),
      tone: 'warn',
    });
  };
  const unsnoozeAttention = () => {
    setSnoozedBanners(s => {
      return page1OmitKeys(s, [ATTENTION_BANNER_ID]);
    });
    window.toast(`${pageAttentionLabel(attentionItem, 'Callback', 'Handoff')} restored`, {
      sub: pageAttentionLabel(attentionItem, 'customer is back in the callback queue', 'call review is back in the human queue'),
      tone: 'accent',
    });
  };
  // Re-render once when the snooze expires so the banner reappears
  // automatically without the operator clicking anything.
  useEffect(() => {
    if (!isAttentionSnoozed) return undefined;
    const remaining = Math.max(0, snoozeExpiry - Date.now());
    const t = setTimeout(() => {
      setSnoozedBanners(s => {
        if (s[ATTENTION_BANNER_ID] === snoozeExpiry) {
          return page1OmitKeys(s, [ATTENTION_BANNER_ID]);
        }
        return s;
      });
    }, remaining + 50);
    return () => clearTimeout(t);
  }, [snoozeExpiry, isAttentionSnoozed]);

  // Derive the PageHeader sub from concrete operator work, not from an
  // abstract AI ops cockpit. The first screen should explain the day:
  // callbacks owed, missed calls, customers waiting, and whether a human
  // handoff is waiting.
  const pluralize = (n, singular, plural) => `${n} ${n === 1 ? singular : (plural || `${singular}s`)}`;
  const attentionCount = (attentionItem && !isAttentionSnoozed) ? 1 : 0;
  const callList = D.calls || [];
  const missedCalls = callList
    .filter(pageIsMissedCall)
    .slice()
    .sort((a, b) => pageRelativeHours(a.when) - pageRelativeHours(b.when));
  const callbacksOwed = missedCalls.filter(c => c.returned !== true);
  const missedToday = missedCalls.filter(c => pageRelativeHours(c.when) <= 24);
  const missedWeek = missedCalls.filter(c => pageRelativeHours(c.when) <= 24 * 7);
  const missedMonth = missedCalls.filter(c => pageRelativeHours(c.when) <= 24 * 30);
  const recentCalls = callList.filter(c => pageRelativeHours(c.when) <= 24);
  const returnedWithinOneHour = missedCalls.filter(c => c.returned === true && Number(c.returnedAfterMinutes || 9999) <= 60).length;
  const returnedMissed = missedCalls.filter(c => c.returned === true);
  const callbacksDueCount = callbacksOwed.length;
  const recoveryCases = [
    ...callbacksOwed.map(c => {
      return {
        id: c.id,
        type: 'call',
        title: `${c.co} · ${String(c.service || c.outcome || 'missed call').replace(/[-_]/g, ' ')}`,
        meta: `${c.when} · ${c.who} · ${String(c.outcome || 'missed').replace(/[-_]/g, ' ')}`,
        wait: c.when || 'now',
        tone: pageRelativeHours(c.when) > 1 ? 'warn' : 'accent',
      };
    }),
  ].slice(0, 6);
  const missionSub = [
    `${pluralize(callbacksDueCount, 'callback')} owed`,
    `${pluralize(missedToday.length, 'missed call')} today`,
    `${pluralize(callbacksDueCount, 'customer')} waiting`,
    attentionCount === 0 ? 'judgment clear' : `${pluralize(attentionCount, 'call')} needs your judgment`,
  ].join(' · ');
  const commandFacts = [
    { label: 'callbacks', value: callbacksDueCount.toLocaleString(), tone: callbacksDueCount > 0 ? 'warn' : 'healthy' },
    { label: 'missed today', value: missedToday.length.toLocaleString(), tone: missedToday.length > 0 ? 'warn' : 'healthy' },
    { label: 'waiting', value: callbacksDueCount.toLocaleString(), tone: callbacksDueCount > 0 ? 'warn' : 'healthy' },
    { label: 'returned', value: returnedMissed.length.toLocaleString(), tone: returnedMissed.length > 0 ? 'healthy' : 'neutral' },
    { label: 'returned <1h', value: `${returnedWithinOneHour}/${returnedMissed.length || missedCalls.length}`, tone: returnedWithinOneHour > 0 ? 'healthy' : 'neutral' },
  ];
  const alignSparkLatest = (series, currentValue) => {
    const base = Array.isArray(series) && series.length > 0 ? series : [currentValue];
    const current = Number(currentValue);
    if (!Number.isFinite(current)) return base;
    const latest = Number(base[base.length - 1]);
    if (!Number.isFinite(latest)) return base.map((value, index) => index === base.length - 1 ? current : Number(value) || 0);
    if (latest === current) return base;
    if (latest === 0) return base.map(() => current);
    const scale = current / latest;
    const next = base.map(value => {
      const scaled = Math.round((Number(value) || 0) * scale);
      return Math.max(0, scaled);
    });
    next[next.length - 1] = current;
    return next;
  };
  const alignRatioSparkLatest = (series, currentValue) => {
    const base = Array.isArray(series) && series.length > 0 ? series : [currentValue];
    const current = Number(currentValue);
    if (!Number.isFinite(current)) return base;
    const minValue = Math.min(...base);
    const maxValue = Math.max(...base);
    const span = maxValue - minValue || 1;
    const floor = Math.max(0, current - 0.35);
    const next = base.map(value => {
      const ratio = (Number(value) - minValue) / span;
      return Math.round((floor + ratio * (current - floor)) * 100) / 100;
    });
    next[next.length - 1] = current;
    return next;
  };
  const waitingSpark = alignSparkLatest(sparks.calls, callbacksDueCount);
  const missedSpark = alignSparkLatest(sparks.calls, range === 'today' ? missedToday.length : range === 'week' ? missedWeek.length : missedMonth.length);
  const owedSpark = alignSparkLatest(sparks.qualified, callbacksOwed.length);
  const returnedCallsSpark = alignSparkLatest(sparks.qualified, returnedMissed.length);
  const returnedRatio = returnedWithinOneHour / (returnedMissed.length || missedCalls.length || 1);
  const returnedRatioSpark = alignRatioSparkLatest(sparks.score, returnedRatio);
  const openRecoveryCase = (item, source = 'today-recovery-case') => {
    if (!item) return;
    const ctx = window.AppContext.get();
    if (item.type === 'proposal') {
      window.AppContext.set({
        selection: { type: 'proposal', id: item.id },
        extra: {
          ...(ctx.extra || {}),
          triggered_from: source,
        },
      });
      setRoute('proposals');
      return;
    }
    const targetCall = (D.calls || []).find(c => c.id === item.id);
    window.AppContext.set({
      selection: { type: 'call', id: item.id },
      extra: {
        ...(ctx.extra || {}),
        call_window: pageIsMissedCall(targetCall) ? 'missed' : 'flagged',
        ...(source === 'today-recovery-next' ? { call_workflow: 'human-review' } : {}),
        triggered_from: source,
      },
    });
    setRoute('calls');
  };
  const reviewAttentionNow = () => {
    if (!attentionItem) return;
    const ctx = window.AppContext.get();
    window.AppContext.set({
      // Selection follows the live attention item rather than a hardcoded
      // CALL-2417, so the Calls page focuses whichever call the paused
      // agent is actually blocked on.
      selection: attentionItem.callId ? { type: 'call', id: attentionItem.callId } : ctx.selection,
      extra: {
        ...(ctx.extra || {}),
        call_window: 'flagged',
        call_workflow: 'human-review',
        triggered_from: 'mission-attention-review',
        attention_banner_id: ATTENTION_BANNER_ID,
      },
    });
    setRoute('calls');
  };
  const openHotLead = (company, source = 'today-hot-lead') => {
    if (!company?.id) return;
    const ctx = window.AppContext.get();
    window.AppContext.set({
      selection: { type: 'lead', id: company.id },
      extra: {
        ...(ctx.extra || {}),
        pipeline_filter: 'all',
        triggered_from: source,
      },
    });
    setRoute('pipeline');
  };

  return (
    <div className="page page--home" data-screen-label="Callbacks">
      <PageHeader
        title="Callbacks"
        sub={missionSub}
        actions={<>
          <Segmented value={range} onChange={(v) => setRange(v)} options={[
            { value:'today', label:'Today' },
            { value:'week', label:'7d' },
            { value:'month', label:'30d' },
          ]} />
          <button
            className="btn btn--ghost"
            data-testid="mission-refresh"
            data-refreshing={refreshing ? 'true' : 'false'}
            disabled={refreshing}
            onClick={triggerRefresh}
          ><I2.Refresh size={14}/>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
          <span className="mono dim" data-testid="mission-last-refresh" style={{fontSize:10}}>
            as of {new Date(lastRefreshAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}
          </span>
        </>}
      />

      <section className="home-command-strip" data-testid="home-command-center" aria-label="Callback summary">
        <div className="home-command-strip__pulse">
          <span className={`dot ${attentionCount > 0 ? 'dot--warn' : 'dot--accent'}`} />
          <span className="mono">callback queue</span>
        </div>
        <div className="home-command-strip__copy">
          <div className="home-command-strip__kicker">missed calls today</div>
          <p>{missionSub}</p>
        </div>
        <div className="home-command-strip__facts">
          {commandFacts.map(f => (
            <div key={f.label} className={`home-fact home-fact--${f.tone}`}>
              <span>{f.label}</span>
              <strong>{f.value}</strong>
            </div>
          ))}
        </div>
      </section>

      {/* Attention banner — derived from live state; hidden while snoozed
          OR when no agent is currently paused. */}
      {attentionItem && !isAttentionSnoozed ? (
        <div
          className="card card--violet attention-banner home-attention"
          data-testid="attention-banner"
          data-attention-banner-id={ATTENTION_BANNER_ID}
        >
          <span className="dot dot--critical attention-banner__dot"/>
          <div className="attention-banner__copy">
            <div className="attention-banner__title">
              {attentionItem.companyName || 'Caller'}: {attentionItem.callOutcome ? attentionItem.callOutcome.replace(/[-_]/g, ' ') : 'call'} — {pageAttentionLabel(attentionItem, 'needs callback', 'needs human review')}
            </div>
            <div className="attention-banner__meta">
              {pageAttentionLabel(
                attentionItem,
                `Your receptionist captured a message${attentionItem.callWho ? ` from ${attentionItem.callWho}` : ''} — they're waiting on a callback.`,
                `${attentionItem.agentName || attentionItem.agentId} paused after ${pluralize(attentionItem.callDeflections, 'handoff try', 'handoff tries')} and ${pluralize(attentionItem.callFlags, 'flag')} — review the call evidence.`
              )}
              {attentionItem.callId ? ` · ${attentionItem.callId}` : ''}
              {attentionItem.proposalAmount ? ` · ${attentionItem.proposalAmount} on the table` : ''}
            </div>
          </div>
          <div className="attention-banner__actions">
            <button
              className="btn btn--xs"
              data-testid="attention-snooze-1h"
              onClick={() => snoozeAttention(60 * 60 * 1000, '1h')}
            >Snooze 1h</button>
            <button
              className="btn btn--primary btn--sm"
              data-testid="attention-review-now"
              onClick={reviewAttentionNow}
            >Review now <I2.ArrowRight size={12}/></button>
          </div>
        </div>
      ) : isAttentionSnoozed && attentionItem ? (
        <div
          className="card attention-banner attention-banner--snoozed home-attention"
          data-testid="attention-snoozed"
        >
          <span className="dot dot--idle attention-banner__dot"/>
          <div className="attention-banner__copy">
            <strong>{pageAttentionLabel(attentionItem, 'Callback', 'Handoff')} snoozed</strong> · {attentionItem.companyName || 'caller'} · resumes at <span className="mono" data-testid="attention-snoozed-until">{new Date(snoozeExpiry).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
          </div>
          <div className="attention-banner__actions">
            <button
              className="btn btn--ghost btn--xs"
              data-testid="attention-unsnooze"
              onClick={unsnoozeAttention}
            >Restore</button>
          </div>
        </div>
      ) : null}

      {/* Stats row — labels re-scope with the Range segmented control,
          so picking 7d / 30d doesn't silently keep claiming "today".
          The row now stays on operator recovery work instead of mixing in
          internal eval telemetry. */}
      {(() => null)()}
      <div className="stats home-stats" data-testid="mission-stats" data-range={range}>
        <Stat
          label="Waiting on you"
          value={callbacksDueCount}
          delta={stats.callsTodayDelta}
          deltaUnit="count"
          deltaNoun="customers"
          spark={waitingSpark}
          sparkLabels={buildSparkLabels(waitingSpark, 'hour')}
          accent
        />
        <Stat
          label={`Missed · ${range === 'today' ? 'today' : range === 'week' ? '7d' : '30d'}`}
          value={(() => {
            if (range === 'today') return missedToday.length;
            if (range === 'week') return missedWeek.length;
            return missedMonth.length;
          })()}
          delta={stats.callsTodayDelta}
          deltaUnit="count"
          deltaNoun="calls"
          spark={missedSpark}
          sparkLabels={buildSparkLabels(missedSpark, range === 'today' ? 'hour' : 'day')}
        />
        <Stat label={`Callbacks owed · ${range === 'today' ? 'today' : range === 'week' ? '7d' : '30d'}`}
              value={callbacksOwed.length}
              delta={stats.qualifiedThisWeekDelta}
              deltaUnit="count"
              deltaNoun="callbacks"
              tone={callbacksOwed.length > 0 ? 'warn' : 'healthy'}
              spark={owedSpark}
              sparkLabels={buildSparkLabels(owedSpark, 'callback')}
              sparkColor="var(--healthy)" />
        <Stat
          label="Returned within 1h"
          value={`${returnedWithinOneHour}/${returnedMissed.length || missedCalls.length}`}
          delta={stats.avgScoreDelta}
          spark={returnedRatioSpark}
          sparkLabel={`Returned within 1h rate trend: current ${Math.round(returnedRatio * 100)}%`}
          sparkLabels={buildSparkLabels(returnedRatioSpark, 'return window')}
          sparkColor="var(--healthy)"
        />
        <Stat
          label="Returned calls"
          value={returnedMissed.length}
          delta={stats.qualifiedThisWeekDelta}
          deltaUnit="count"
          deltaNoun="calls"
          spark={returnedCallsSpark}
          sparkLabels={buildSparkLabels(returnedCallsSpark, 'return')}
          sparkColor="var(--healthy)"
        />
      </div>

      <div className="home-grid">
        {/* Recovery queue */}
        <div className="home-primary-rail">
          <Card
            className="home-card home-card--agents"
            title={`Missed — call them back · ${recoveryCases.length}`}
            action={(
              <div className="hstack">
                <Badge tone={recoveryCases.length > 0 ? 'warn' : 'healthy'}>
                  {recoveryCases.length > 0 ? 'needs review' : 'clear'}
                </Badge>
                <button
                  className="btn btn--xs btn--ghost"
                  disabled={recoveryCases.length === 0}
                  onClick={() => openRecoveryCase(recoveryCases[0], 'today-recovery-next')}
                >Open next →</button>
              </div>
            )}
          >
            <div className="home-agent-list">
              {recoveryCases.map(item => {
                const openCase = () => openRecoveryCase(item);
                return (
                <div key={`${item.type}-${item.id}`}
                     className="home-agent-row home-recovery-row inspectable"
                     data-testid="recovery-case-row"
                     data-case-id={item.id}
                     data-case-type={item.type}
                     data-popout={`${item.title} · ${item.meta}`}
                     role="button"
                     tabIndex={0}
                     aria-label={`Open ${item.title}`}
                     onClick={openCase}
                     onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCase(); } }}>
                  <div className="home-agent-row__icon">
                    {item.type === 'proposal' ? <I2.Doc size={18}/> : <I2.Phone size={18}/>}
                  </div>
                  <div className="home-agent-row__main">
                    <div className="home-agent-row__title">
                      {item.title}
                      <span className={`badge badge--${item.tone}`}>
                        callback
                      </span>
                    </div>
                    <div className="mono home-agent-row__role">
                      {item.meta}
                    </div>
                  </div>
                  <div className="home-agent-row__metric">
                    <div className="mono num">{item.wait || 'now'}</div>
                    <div className="eyebrow">waiting</div>
                  </div>
                </div>
                );
              })}
              {recoveryCases.length === 0 && (
                <div className="muted" data-testid="recovery-case-empty" style={{padding:'14px 8px', textAlign:'center', fontSize:12}}>
                  No missed calls waiting on a callback.
                </div>
              )}
            </div>

            <div className="home-agent-actions">
              <button className="btn btn--ghost btn--sm" data-testid="today-open-calls" onClick={() => {
                const ctx = window.AppContext.get();
                const target = callbacksOwed[0] || missedCalls[0] || null;
                window.AppContext.set({
                  selection: target ? { type: 'call', id: target.id } : ctx.selection,
                  extra: { ...(ctx.extra || {}), call_window: 'missed', triggered_from: 'today-open-calls' },
                });
                setRoute('calls');
              }}><I2.Phone size={12}/>Call log</button>
              {isAdmin && <button className="btn btn--ghost btn--sm" data-testid="today-open-proposals" onClick={() => setRoute('proposals')}><I2.Doc size={12}/>Estimates queue</button>}
              <button className="btn btn--ghost btn--sm" data-testid="today-test-sarah" onClick={() => {
                const ctx = window.AppContext.get();
                window.AppContext.set({ extra: { ...(ctx.extra || {}), selected_agent_key: 'intake', phone_setup_preview: true, triggered_from: 'today-test-sarah' } });
                setRoute('agents');
              }}><I2.Mic size={12}/>Hear greeting</button>
            </div>
          </Card>

          {isAdmin && <div>
            <Card
              className="home-card home-card--leads"
              title="Best opportunities right now"
              action={<button
                className="btn btn--ghost btn--xs"
                data-testid="hot-leads-see-all"
                onClick={() => setRoute('pipeline')}
              >See full pipeline →</button>}
            >
              <div className="home-lead-list">
                {hotLeads.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="home-lead-row home-lead-row--button"
                    data-testid="hot-lead-row"
                    data-company-id={c.id}
                    aria-label={`Open ${c.name} in pipeline`}
                    onClick={() => openHotLead(c)}
                  >
                    <div className="home-lead-row__main">
                      <div className="home-lead-row__name">{c.name}</div>
                      <div className="mono home-lead-row__meta" data-testid="hot-lead-meta">{pageCompanySummary(c)}</div>
                    </div>
                    <Badge tone={c.intent === 'high' ? 'accent' : c.intent === 'med' ? 'warn' : 'neutral'}>{c.intent} intent</Badge>
                    <div className="home-lead-row__score">
                      <div className="progress"><div className={`progress__fill progress__fill--${c.score >= 80 ? 'healthy' : c.score >= 70 ? 'accent' : 'warn'}`} style={{width:`${c.score}%`}}/></div>
                      <div className="mono num">{c.score}/100</div>
                    </div>
                    <span className="btn btn--ghost btn--icon" aria-hidden="true"><I2.ArrowRight size={12}/></span>
                  </button>
                ))}
              </div>
            </Card>
          </div>}
        </div>

        {/* Right rail */}
        <div className="home-secondary-rail">
          <Card
            className="home-card home-card--calls"
            title="Last 24 hours"
            action={<button className="btn btn--ghost btn--xs" onClick={() => setRoute('calls')}>Call log →</button>}
          >
            <div className="home-lead-list" data-testid="today-calls-list">
              {recentCalls.slice(0, 5).map(c => {
                const openCall = () => {
                  const ctx = window.AppContext.get();
                  window.AppContext.set({
                    selection: { type: 'call', id: c.id },
                    extra: {
                      ...(ctx.extra || {}),
                      call_window: pageIsMissedCall(c) ? 'missed' : Number(c.flags || 0) > 0 ? 'flagged' : 'all',
                      triggered_from: 'today-calls-list',
                    },
                  });
                  setRoute('calls');
                };
                return (
                  <div
                    key={c.id}
                    className="home-lead-row inspectable"
                    data-testid="today-call-row"
                    data-call-id={c.id}
                    data-popout={`${c.co} · ${c.who} · ${String(c.outcome || 'call').replace(/[-_]/g, ' ')}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${c.co} call`}
                    onClick={openCall}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openCall();
                      }
                    }}
                  >
                    <div className="home-lead-row__main">
                      <div className="home-lead-row__name">{c.co}</div>
                      <div className="mono home-lead-row__meta">{c.when} · {c.who}</div>
                    </div>
                    <Badge tone={Number(c.flags || 0) > 0 ? 'warn' : c.outcome === 'meeting-booked' ? 'healthy' : 'accent'}>
                      {String(c.outcome || 'call').replace(/[-_]/g, ' ')}
                    </Badge>
                    <div className="home-lead-row__score">
                      <div className="progress">
                        <div className={`progress__fill progress__fill--${Number(c.score || 0) >= 8 ? 'healthy' : Number(c.score || 0) >= 7 ? 'accent' : 'warn'}`} style={{width:`${Math.max(0, Math.min(100, Number(c.score || 0) * 10))}%`}}/>
                      </div>
                      <div className="mono num">{Number(c.score || 0).toFixed(1)}</div>
                    </div>
                  </div>
                );
              })}
              {recentCalls.length === 0 && (
                <div className="muted" data-testid="today-calls-empty" style={{padding:'14px 8px', textAlign:'center', fontSize:12}}>
                  No calls logged in the last 24 hours.
                </div>
              )}
            </div>
          </Card>

          <Card className="home-card home-card--schedule" title="Callbacks owed" data-testid="mc-schedule">
            <div className="timeline" data-testid="mc-schedule-list">
              {callbacksOwed.length === 0 ? (
                <div className="dim mono" data-testid="mc-schedule-empty" style={{fontSize:11, padding:'12px 6px', textAlign:'center'}}>
                  No callbacks owed.
                </div>
              ) : callbacksOwed.slice(0, 5).map((c, i) => (
                  <div
                    key={c.id}
                    className={`tl-step ${i === 0 ? 'tl-step--active' : ''}`}
                    data-testid="mc-schedule-step"
                    data-call-id={c.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${c.co} callback`}
                    onClick={() => {
                      window.AppContext.set({
                        selection: { type: 'call', id: c.id },
                        extra: {
                          ...(window.AppContext.get().extra || {}),
                          call_window: 'missed',
                          call_workflow: 'human-review',
                          triggered_from: 'today-callbacks-owed',
                        },
                      });
                      setRoute('calls');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.currentTarget.click();
                      }
                    }}
                    style={{cursor:'pointer'}}
                  >
                    <div className="tl-step__bullet">{i + 1}</div>
                    <div className="tl-step__body">
                      <div className="tl-step__title">{c.co} · {c.service || String(c.outcome || 'missed call').replace(/[-_]/g, ' ')}</div>
                      <div className="tl-step__sub">{c.when} · {c.who}</div>
                    </div>
                  </div>
                ))}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* PIPELINE */
/* ------------------------------------------------------------ */
function PipelinePage({ setRoute }) {
  const D = window.GTM;
  const [view, setView] = useState('kanban'); // kanban | table
  const initialSelection = window.AppContext.get().selection;
  const initialIntent = window.AppContext.get().extra || {};
  const [selected, setSelected] = useState(initialSelection?.type === 'lead' ? initialSelection.id : null);
  const [filter, setFilter] = useState(['all', 'mine', 'high'].includes(initialIntent.pipeline_filter) ? initialIntent.pipeline_filter : 'all');
  const [filterEditorOpen, setFilterEditorOpen] = useState(initialIntent.pipeline_panel === 'filters');
  const [newLeadOpen, setNewLeadOpen] = useState(initialIntent.pipeline_panel === 'new-lead');
  // Stage overrides: drag-drop on the kanban writes to this map (per
  // company id) instead of mutating the shared window.GTM.companies
  // fixture. PageHeader sub used to claim "Drag to advance" yet the
  // cards weren't draggable at all — this closes that copy lie with
  // real drag/drop and persists transitions through the session.
  const [stageOverrides, setStageOverrides] = useState({});
  const effectiveStage = React.useCallback((c) => stageOverrides[c.id] || c.stage, [stageOverrides]);
  const onDropToStage = (companyId, stageId) => {
    const company = D.companies.find(c => c.id === companyId);
    if (!company) return;
    const fromStage = effectiveStage(company);
    if (fromStage === stageId) return;
    const stageLabel = (D.stages.find(s => s.id === stageId) || {}).label || stageId;
    setStageOverrides(prev => ({ ...prev, [companyId]: stageId }));
    window.toast(`${company.name} → ${stageLabel}`, {
      sub: `moved from ${fromStage}`,
      tone: 'accent',
    });
  };

  const NEW_LEAD_DEFAULTS = { domain: '', source: 'signal', contactName: '', contactEmail: '' };
  const [newLead, setNewLead] = useState(NEW_LEAD_DEFAULTS);
  // Persist operator-submitted leads so the "Lead enrichment queued"
  // toast actually corresponds to something visible. Without this state
  // the form just discarded its input — the toast lied about queueing.
  // Each entry mirrors the company shape so it can be merged into the
  // rendered list and drawn as a "draft" card on the kanban / table.
  const [pendingLeads, setPendingLeads] = useState([]);
  const isValidDomain = (s) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(String(s).trim());
  const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
  const submitNewLead = (e) => {
    e.preventDefault();
    const domain = newLead.domain.trim().toLowerCase();
    if (!isValidDomain(domain)) {
      window.toast('Domain looks invalid', { sub: 'expected something like example.com', tone: 'critical' });
      return;
    }
    if (newLead.contactEmail && !isValidEmail(newLead.contactEmail)) {
      window.toast('Contact email looks invalid', { sub: 'leave blank if not known', tone: 'critical' });
      return;
    }
    const sourceLabel = { signal: 'intent signal', call: 'call transcript', manual: 'manual entry' }[newLead.source] || newLead.source;
    // Build a draft company that can render on the kanban + table. The
    // domain doubles as id (lowercased, dot stripped) so future drag/
    // detail interactions can find it by id like the seed companies.
    const id = `pending-${domain.replace(/\./g, '-')}-${Date.now()}`;
    const displayName = domain.split('.')[0]
      .split(/[-_]+/)
      .filter(Boolean)
      .map(w => w[0].toUpperCase() + w.slice(1))
      .join(' ') || domain;
    const draftLead = {
      id,
      name: displayName,
      industry: 'Pending enrichment',
      size: '—',
      region: '—',
      stage: 'qualifying',
      score: 70,
      owner: 'agent-01',
      icp: null,
      intent: 'med',
      pain: sourceLabel,
      url: `https://${domain}`,
      techStack: [],
      lastTouch: 'just now',
      nextStep: 'Enrich',
      nextStepWhen: 'queued',
      arr: '$0K',
      dealSize: '$0K',
      closeProb: 0.5,
      artifacts: [],
      contactName: newLead.contactName || '',
      contactEmail: newLead.contactEmail || '',
      _draft: true,
    };
    setPendingLeads(prev => [draftLead, ...prev]);
    window.toast(`Lead enrichment queued · ${domain}`, {
      sub: `${sourceLabel}${newLead.contactName ? ` · ${newLead.contactName}` : ''} · agent-01 will enrich firmographics and intent`,
      tone: 'accent',
    });
    setNewLead(NEW_LEAD_DEFAULTS);
    setNewLeadOpen(false);
  };

  // Publish the selection to AppContext so the sales coach + intake agents
  // see it as a dynamic variable.
  useEffect(() => {
    window.AppContext.set({ selection: selected ? { type:'lead', id: selected } : null });
  }, [selected]);
  useEffect(() => window.AppContext.subscribe((ctx) => {
    if (ctx.selection?.type === 'lead' && D.companies.some(c => c.id === ctx.selection.id)) {
      setSelected(ctx.selection.id);
    }
  }), []);
  useEffect(() => {
    const applyPipelineIntent = (ctx) => {
      const extra = ctx.extra || {};
      const nextFilter = ['all', 'mine', 'high'].includes(extra.pipeline_filter) ? extra.pipeline_filter : null;
      if (nextFilter) setFilter(nextFilter);
      if (extra.pipeline_panel === 'new-lead') {
        setNewLeadOpen(true);
        setFilterEditorOpen(false);
      }
      if (extra.pipeline_panel === 'filters') {
        setFilterEditorOpen(true);
        setNewLeadOpen(false);
      }
      if (!extra.pipeline_panel && !extra.pipeline_filter) return;
      const latest = window.AppContext.get().extra || {};
      window.AppContext.set({ extra: page1OmitKeys(latest, ['pipeline_panel', 'pipeline_filter']) });
    };
    applyPipelineIntent(window.AppContext.get());
    return window.AppContext.subscribe(applyPipelineIntent);
  }, []);

  // Merge operator-submitted draft leads ahead of the seed companies so
  // a freshly-typed lead lands at the top of the kanban / table — the
  // toast's "queued" claim now corresponds to a real visible card.
  const allCompanies = [...pendingLeads, ...D.companies];
  const filtered = allCompanies.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'mine') return c.owner === 'agent-01';
    if (filter === 'high') return c.intent === 'high';
    return true;
  });

  const isActivePipelineCompany = D.isActivePipelineCompany || (c => !['closed','lost'].includes(c.stage));
  const activeLeads = allCompanies.filter(isActivePipelineCompany);
  const highIntentLeads = activeLeads.filter(c => c.intent === 'high');
  const proposalLeads = allCompanies.filter(c => effectiveStage(c) === 'proposal');
  const openValueK = activeLeads.reduce((sum, c) => sum + pageProposalAmountToThousands(c.dealSize), 0);
  const selectedLead = allCompanies.find(c => c.id === selected);
  const stageCounts = D.stages.map(stage => ({
    ...stage,
    count: filtered.filter(c => effectiveStage(c) === stage.id).length,
  }));
  const visibleValueK = filtered.reduce((sum, c) => sum + pageProposalAmountToThousands(c.dealSize), 0);

  return (
    <div className="page page--wide page--pipeline">
      <PageHeader
        title="Pipeline"
        eyebrow="demo lead recovery"
        sub={(() => {
          // Derive from live state. The previous "Cards re-score on every
          // signal" promise referenced a re-scoring loop that doesn't
          // exist in the demo — scores in the fixture are static.
          const all = allCompanies || D.companies || [];
          const active = activeLeads.length;
          const high = highIntentLeads.length;
          const drafts = all.filter(c => c._draft).length;
          const draftSuffix = drafts > 0 ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : '';
          return `${all.length} leads · ${active} active · ${high} high-intent${draftSuffix}. Drag cards across stage columns to advance deals.`;
        })()}
        actions={<>
          <Segmented value={filter} onChange={setFilter} options={[
            { value:'all', label:'All' },
            { value:'mine', label:'Mine' },
            { value:'high', label:'High intent' },
          ]} />
          <Segmented value={view} onChange={setView} options={[
            { value:'kanban', label:'Board' },
            { value:'table', label:'Table' },
          ]} />
          <button className="btn btn--ghost btn--sm" aria-expanded={filterEditorOpen} onClick={() => setFilterEditorOpen(v => !v)}><I2.Filter size={12}/>Filters</button>
          <button className="btn btn--primary btn--sm" aria-expanded={newLeadOpen} onClick={() => setNewLeadOpen(v => !v)}><I2.Plus size={12}/>Add lead</button>
        </>}
      />

      <section className="pipeline-command" aria-labelledby="pipeline-command-title">
        <div className="pipeline-command__copy">
          <div className="eyebrow eyebrow--accent">[DEMO] lead recovery</div>
          <h2 id="pipeline-command-title">Missed-call pipeline</h2>
          <p>Track service callers from triage through proposal review. Open a lead when there is call evidence, a draft packet, or a human follow-up to complete.</p>
        </div>
        <div className="pipeline-command__metrics" aria-label="Pipeline summary">
          <div className="pipeline-metric">
            <span>leads</span>
            <strong className="mono num">{filtered.length}</strong>
            <small>{filter} view</small>
          </div>
          <div className="pipeline-metric">
            <span>open</span>
            <strong className="mono num">{activeLeads.length}</strong>
            <small>{highIntentLeads.length} high intent</small>
          </div>
          <div className="pipeline-metric">
            <span>open value</span>
            <strong className="mono num">{pageFormatProposalTotal(openValueK)}</strong>
            <small>{pageFormatProposalTotal(visibleValueK)} visible</small>
          </div>
          <div className="pipeline-metric">
            <span>proposals</span>
            <strong className="mono num">{proposalLeads.length}</strong>
            <small>review queue</small>
          </div>
          <div className="pipeline-metric pipeline-metric--selected">
            <span>active lead</span>
            <strong>{selectedLead?.name || 'None'}</strong>
            <small>{selectedLead ? `${selectedLead.score}/100 · ${selectedLead.owner}` : 'choose a card'}</small>
          </div>
        </div>
      </section>

      {(filterEditorOpen || newLeadOpen) && (
        <div className="workflow-popout pipeline-workflow-popout" role="region" aria-label="Pipeline workflow panel">
          <button className="workflow-popout__close btn btn--ghost btn--icon" aria-label="Close pipeline workflow panel" onClick={() => { setFilterEditorOpen(false); setNewLeadOpen(false); }}><I2.Close size={14}/></button>
          {filterEditorOpen && (
            <div className="workflow-popout__pane">
              <div className="eyebrow eyebrow--accent">saved views</div>
              <div className="workflow-popout__title">Pipeline filters</div>
              <div className="workflow-popout__grid" data-testid="pipeline-filters-grid">
                {(() => {
                  const isActive = isActivePipelineCompany;
                  const total = (allCompanies || []).length;
                  const activeCount = (allCompanies || []).filter(isActive).length;
                  const archivedCount = total - activeCount;
                  const mineCount = (allCompanies || []).filter(c => c.owner === 'agent-01').length;
                  const highCount = (allCompanies || []).filter(c => c.intent === 'high').length;
                  const views = [
                    { label: 'All', value: 'all',  sub: `${total} companies (${activeCount} active · ${archivedCount} closed/lost)` },
                    { label: 'My book', value: 'mine', sub: `${mineCount} accounts owned by agent-01` },
                    { label: 'High intent', value: 'high', sub: `${highCount} hot — pricing or intent surge` },
                  ];
                  return views.map(v => (
                    <button
                      key={v.value}
                      className="workflow-tile"
                      data-testid="pipeline-filter-tile"
                      data-filter-value={v.value}
                      aria-pressed={filter === v.value}
                      onClick={() => setFilter(v.value)}
                    >
                      <span>{v.label}</span>
                      <span>{v.sub}</span>
                    </button>
                  ));
                })()}
              </div>
            </div>
          )}
          {newLeadOpen && (
            <form className="workflow-popout__pane" onSubmit={submitNewLead} aria-label="Add lead form" data-testid="new-lead-form">
              <div className="eyebrow eyebrow--accent">intake</div>
              <div className="workflow-popout__title">Add lead</div>
              <div className="field">
                <div className="field__label" id="new-lead-domain-label">Domain</div>
                <input
                  className="input"
                  data-testid="new-lead-domain"
                  required
                  aria-labelledby="new-lead-domain-label"
                  placeholder="example.com"
                  value={newLead.domain}
                  onChange={(e) => setNewLead(f => ({ ...f, domain: e.target.value }))}
                />
              </div>
              <div className="field">
                <div className="field__label" id="new-lead-source-label">Source</div>
                <select
                  className="select"
                  data-testid="new-lead-source"
                  aria-labelledby="new-lead-source-label"
                  value={newLead.source}
                  onChange={(e) => setNewLead(f => ({ ...f, source: e.target.value }))}
                >
                  <option value="signal">Intent signal</option>
                  <option value="call">Call transcript</option>
                  <option value="manual">Manual account</option>
                </select>
              </div>
              <div className="field">
                <div className="field__label" id="new-lead-contact-label">Primary contact <span className="mono dim" style={{fontSize:10}}>· optional</span></div>
                <input
                  className="input"
                  data-testid="new-lead-contact-name"
                  aria-labelledby="new-lead-contact-label"
                  placeholder="Jordan Liu"
                  value={newLead.contactName}
                  onChange={(e) => setNewLead(f => ({ ...f, contactName: e.target.value }))}
                />
              </div>
              <div className="field">
                <div className="field__label" id="new-lead-email-label">Contact email <span className="mono dim" style={{fontSize:10}}>· optional</span></div>
                <input
                  className="input"
                  type="email"
                  data-testid="new-lead-contact-email"
                  aria-labelledby="new-lead-email-label"
                  placeholder="jordan@example.com"
                  value={newLead.contactEmail}
                  onChange={(e) => setNewLead(f => ({ ...f, contactEmail: e.target.value }))}
                />
              </div>
              <div className="hstack" style={{gap:8, justifyContent:'flex-end', marginTop:6}}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  data-testid="new-lead-cancel"
                  onClick={() => { setNewLeadOpen(false); setNewLead(NEW_LEAD_DEFAULTS); }}
                >Cancel</button>
                <button
                  type="submit"
                  className="btn btn--primary btn--sm"
                  data-testid="new-lead-submit"
                ><I2.Bolt size={12}/>Enrich lead</button>
              </div>
            </form>
          )}
        </div>
      )}

      <section className="pipeline-board-shell" aria-label="Pipeline lead board">
        <div className="pipeline-board-shell__head">
          <div>
            <div className="eyebrow">stage load</div>
            <div className="pipeline-board-shell__title">{view === 'kanban' ? 'Board' : 'Sortable table'} · {filtered.length} leads</div>
          </div>
          <div className="pipeline-stage-strip" aria-label="Visible leads by stage">
            {stageCounts.map(stage => (
              <span key={stage.id} data-stage-id={stage.id}>
                <span className={`dot dot--${stage.accent === 'sunset' ? 'accent' : stage.accent === 'violet' ? 'critical' : stage.accent === 'healthy' ? 'healthy' : 'idle'}`}/>
                <span>{stage.label}</span>
                <strong className="mono num">{stage.count}</strong>
              </span>
            ))}
          </div>
        </div>
        {view === 'kanban' && <PipelineKanban companies={filtered} stages={D.stages} onSelect={setSelected} selected={selected} effectiveStage={effectiveStage} onDropToStage={onDropToStage}/>}
        {view === 'table' && <PipelineTable companies={filtered} onSelect={setSelected} selected={selected}/>}
      </section>

      {selected && <LeadDetail company={selectedLead} onClose={()=>setSelected(null)} setRoute={setRoute}/>}
      {selected && <IntakeAgentPanel company={selectedLead} />}
    </div>
  );
}

function PipelineKanban({ companies, stages, onSelect, selected, effectiveStage, onDropToStage }) {
  const [dragOverStageId, setDragOverStageId] = React.useState(null);
  // Local fallback for drag id — Playwright (and some browser harnesses)
  // don't reliably round-trip dataTransfer string payloads through native
  // dragstart/drop. Store the source id in state on dragstart and prefer
  // the dataTransfer payload only when present (real browsers use it).
  const draggingIdRef = React.useRef(null);
  return (
    <div className="pipe">
      {stages.map(stage => {
        const cards = companies.filter(c => effectiveStage(c) === stage.id);
        const sum = cards.reduce((acc, c) => acc + pageProposalAmountToThousands(c.dealSize), 0);
        return (
          <div
            key={stage.id}
            className="pipe__col"
            data-stage-id={stage.id}
            data-drag-over={dragOverStageId === stage.id ? 'true' : 'false'}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverStageId !== stage.id) setDragOverStageId(stage.id); }}
            onDragLeave={(e) => {
              // Only clear if we're leaving the column (not hopping between children).
              if (e.currentTarget.contains(e.relatedTarget)) return;
              if (dragOverStageId === stage.id) setDragOverStageId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const dt = e.dataTransfer;
              const id = (dt && (dt.getData('text/x-gtm-company-id') || dt.getData('text/plain'))) || draggingIdRef.current;
              setDragOverStageId(null);
              draggingIdRef.current = null;
              if (id) onDropToStage?.(id, stage.id);
            }}
          >
            <div className="pipe__col-hd">
              <div className="pipe__col-title">
                <span className={`dot dot--${stage.accent === 'sunset' ? 'accent' : stage.accent === 'violet' ? 'critical' : stage.accent === 'healthy' ? 'healthy' : 'idle'}`}/>
                {stage.label}
              </div>
              <div className="pipe__col-cnt">{cards.length} · {pageFormatProposalTotal(sum)}</div>
            </div>
            <div className="pipe__col-body">
              {cards.map(c => (
                <div key={c.id}
                     className={`pipe__card inspectable${c._draft ? ' pipe__card--draft' : ''}`}
                     data-popout={`${c.name}: ${c.score}/100 score, ${c.intent} intent, ${c.dealSize} deal, next ${c.nextStepWhen}`}
                     data-testid="pipe-card"
                     data-company-id={c.id}
                     data-draft={c._draft ? 'true' : 'false'}
                     draggable={true}
                     onDragStart={(e) => {
                       draggingIdRef.current = c.id;
                       if (e.dataTransfer) {
                         e.dataTransfer.effectAllowed = 'move';
                         try {
                           e.dataTransfer.setData('text/x-gtm-company-id', c.id);
                           e.dataTransfer.setData('text/plain', c.id);
                         } catch (_) { /* some test harnesses block setData */ }
                       }
                     }}
                     onDragEnd={() => { draggingIdRef.current = null; }}
                     role="button"
                     tabIndex={0}
                     aria-pressed={selected === c.id}
                     aria-grabbed={false}
                     onClick={() => onSelect(c.id)}
                     onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.id); } }}
                     style={{borderColor: selected === c.id ? 'var(--sunset-500)' : undefined, cursor:'grab'}}>
                  <div className="pipe__card-co">
                    <span>{c.name}</span>
                    <span className="pipe__score mono num">{c.score}</span>
                  </div>
                  <div className="pipe__card-context">{pageCompanySummary(c)}</div>
                  <div className="pipe__card-pain">{c.pain}</div>
                  <div className="pipe__card-meta">
                    <span>{pageDealLocationSummary(c)}</span>
                    <span style={{display:'flex', alignItems:'center', gap:4}}>
                      <span className={`dot dot--${c.intent === 'high' ? 'accent' : c.intent === 'med' ? 'warn' : 'idle'}`} style={{width:5,height:5}}/>
                      {c.lastTouch}
                    </span>
                  </div>
                </div>
              ))}
              {cards.length === 0 && (
                <div className="pipe__empty" data-testid="pipe-stage-empty">
                  <div>
                    <strong>Ready for drop</strong>
                    <span>No {stage.label.toLowerCase()} leads in this view.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PipelineTable({ companies, onSelect, selected }) {
  // Column headers used to be plain `<th>` cells with no click handlers
  // — the table looked sortable but wasn't. Now each header is a real
  // button that toggles sort key/direction, with an arrow indicator on
  // the active column.
  const [sortKey, setSortKey] = useState('score');
  const [sortDir, setSortDir] = useState('desc');
  const INTENT_RANK = { high: 3, med: 2, low: 1 };
  const parseDeal = (s) => pageProposalAmountToThousands(s);
  const SORTABLE = [
    { key: 'name',      label: 'Company',    get: c => String(c.name || '').toLowerCase(), align: 'left' },
    { key: 'stage',     label: 'Stage',      get: c => String(c.stage || '').toLowerCase(), align: 'left' },
    { key: 'score',     label: 'Score',      get: c => Number(c.score) || 0, align: 'left' },
    { key: 'intent',    label: 'Intent',     get: c => INTENT_RANK[c.intent] || 0, align: 'left' },
    { key: 'deal',      label: 'Deal',       get: c => parseDeal(c.dealSize), align: 'right' },
    { key: 'owner',     label: 'Owner',      get: c => String(c.owner || '').toLowerCase(), align: 'left' },
    { key: 'nextStep',  label: 'Next step',  get: c => String(c.nextStep || '').toLowerCase(), align: 'left' },
    { key: 'lastTouch', label: 'Last touch', get: c => String(c.lastTouch || '').toLowerCase(), align: 'left' },
  ];
  const onHeaderClick = (key) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      // Numeric columns default desc (high score first); text columns default asc.
      setSortDir(['score', 'intent', 'deal'].includes(key) ? 'desc' : 'asc');
    }
  };
  const sortedCompanies = React.useMemo(() => {
    const col = SORTABLE.find(s => s.key === sortKey);
    if (!col) return companies;
    const rows = [...companies];
    rows.sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [companies, sortKey, sortDir]);
  return (
    <div className="card" style={{padding:0, overflow:'hidden'}}>
      <table className="tbl pipe-table" data-testid="pipe-table" data-sort-key={sortKey} data-sort-dir={sortDir}>
        <thead>
          <tr>
            {SORTABLE.map(col => {
              const active = col.key === sortKey;
              const arrow = !active ? '' : sortDir === 'asc' ? ' ▲' : ' ▼';
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={col.align === 'right' ? 'num' : undefined}
                  aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  data-testid="pipe-table-header"
                  data-col-key={col.key}
                >
                  <button
                    type="button"
                    className="pipe-table__sort"
                    aria-pressed={active}
                    onClick={() => onHeaderClick(col.key)}
                    style={{background:'transparent', border:0, color:'inherit', font:'inherit', padding:0, cursor:'pointer', textAlign: col.align === 'right' ? 'right' : 'left', width:'100%'}}
                  >{col.label}<span aria-hidden="true">{arrow}</span></button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedCompanies.map(c => (
            <tr key={c.id}
                className="inspectable"
                data-popout={`${c.name}: ${c.score}/100 score, ${c.intent} intent, owner ${c.owner}, next ${c.nextStepWhen}`}
                data-selected={selected === c.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected === c.id}
                onClick={() => onSelect(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.id); } }}>
              <td>
                <div style={{fontWeight:600}}>{c.name}</div>
                <div className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{c.industry}</div>
              </td>
              <td><Badge tone={c.stage === 'closed' ? 'healthy' : c.stage === 'lost' ? 'neutral' : c.stage === 'proposal' ? 'accent' : 'warn'}>{c.stage}</Badge></td>
              <td>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <div className="progress" style={{width:60}}><div className={`progress__fill progress__fill--${c.score >= 80 ? 'healthy' : 'accent'}`} style={{width:`${c.score}%`}}/></div>
                  <span className="mono num" style={{fontSize:12}}>{c.score}</span>
                </div>
              </td>
              <td>
                <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
                  <span className={`dot dot--${c.intent === 'high' ? 'accent' : c.intent === 'med' ? 'warn' : 'idle'}`} style={{width:6,height:6}}/>
                  <span className="mono" style={{fontSize:11, textTransform:'uppercase', letterSpacing:'.06em'}}>{c.intent}</span>
                </span>
              </td>
              <td className="num mono">{c.dealSize}</td>
              <td className="mono" style={{fontSize:11}}>{c.owner}</td>
              <td style={{fontSize:12}}>
                <div>{c.nextStep}</div>
                <div className="mono dim" style={{fontSize:10}}>{c.nextStepWhen}</div>
              </td>
              <td className="mono dim" style={{fontSize:11}}>{c.lastTouch}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function artifactPreviewHref(artifact) {
  const raw = artifact?.webPath || '';
  if (!raw || raw === '#') return '';
  if (/^(https?:)?\/\//.test(raw) || raw.startsWith('/') || raw.startsWith('../')) return raw;
  if (raw.startsWith('./fixtures/')) return raw.replace('./fixtures/', '../fixtures/');
  if (raw.startsWith('fixtures/')) return `../${raw}`;
  return raw;
}

function artifactTypeLabel(type) {
  return String(type || 'artifact').replace(/_/g, ' ');
}

function artifactReviewLocator(artifact, company) {
  const leadSlug = String(company?.id || company?.name || 'lead')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'lead';
  const rawPath = String(artifact?.path || '').trim();
  const filename = rawPath.split('/').filter(Boolean).pop()
    || `${String(artifact?.type || 'artifact').replace(/_/g, '-')}.artifact`;
  return `local-review://pipeline/${leadSlug}/${filename}`;
}

function LeadDetail({ company: c, onClose, setRoute }) {
  // Treat the side panel as a non-modal dialog: announce it as a region,
  // move focus to the close button on open so keyboard users know it
  // appeared, restore focus to the previously-focused card on close,
  // and let Escape close it. We do NOT trap Tab since the panel sits
  // alongside the kanban — operators want to keep navigating both.
  const closeRef = useRef(null);
  const previousFocusRef = useRef(null);
  const artifactRef = useRef(null);
  const [artifactPanel, setArtifactPanel] = useState(null);
  const [artifactPayload, setArtifactPayload] = useState(null);
  const [artifactState, setArtifactState] = useState('idle');
  const artifacts = Array.isArray(c?.artifacts) ? c.artifacts : [];
  const defaultArtifact = artifacts.find(a => a.type === 'json') || artifacts[0];
  const openArtifactReview = async (artifact) => {
    if (!artifact) return;
    setArtifactPanel(artifact);
    setArtifactPayload(null);
    const href = artifactPreviewHref(artifact);
    if (artifact.type !== 'json' || !href) {
      setArtifactState('summary');
      return;
    }
    setArtifactState('loading');
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText || 'artifact unavailable'}`);
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        setArtifactPayload(parsed && typeof parsed === 'object' ? parsed : { value: parsed });
      } catch (_) {
        setArtifactPayload({ raw: text });
      }
      setArtifactState('ready');
    } catch (err) {
      setArtifactPayload({
        error: err?.message || String(err),
        source: artifactReviewLocator(artifact, c),
      });
      setArtifactState('error');
    }
  };
  const copyReviewLocator = async (artifact) => {
    if (!artifact) return;
    const locator = artifactReviewLocator(artifact, c);
    try {
      await navigator.clipboard?.writeText?.(locator);
      window.toast('Review locator copied', { sub: locator, tone:'accent' });
    } catch (_) {
      window.toast('Review locator', { sub: locator, tone:'accent' });
    }
  };
  const openProposalReview = () => {
    // Strict match: only navigate when there's a real proposal for this
    // company. The previous fallback to proposals[0] silently routed to
    // Banyan whenever the active lead had no proposal on file, which lied
    // to the operator about what they were about to review.
    const proposals = window.GTM.proposals || [];
    const proposal =
      proposals.find(p => p.id === c.id || p.co === c.name) ||
      proposals.find(p => String(c.id || '').includes(p.id) || String(p.id || '').includes(c.id));
    if (!proposal) {
      window.toast(`No proposal on file for ${c.name}`, {
        sub: 'Generate one from Calls or use Generate Proposal',
        tone: 'warn',
      });
      return;
    }
    window.AppContext.set({
      selection: { type: 'proposal', id: proposal.id },
      extra: {
        ...(window.AppContext.get().extra || {}),
        triggered_from: 'pipeline-artifact-review',
      },
    });
    setRoute('proposals');
    onClose();
  };
  useEffect(() => {
    if (!c) return;
    previousFocusRef.current = document.activeElement;
    requestAnimationFrame(() => closeRef.current?.focus());
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        try { previousFocusRef.current.focus(); } catch (_) { /* unmounted */ }
        previousFocusRef.current = null;
      }
    };
  }, [c?.id]);
  useEffect(() => {
    setArtifactPanel(null);
    setArtifactPayload(null);
    setArtifactState('idle');
  }, [c?.id]);
  useEffect(() => {
    if (!artifactPanel) return;
    requestAnimationFrame(() => globalThis.scrollConsoleNodeIntoView?.(artifactRef.current, { block:'nearest' }));
  }, [artifactPanel?.path]);
  if (!c) return null;
  return (
    <div className="lead-detail-panel" role="dialog" aria-label={`Lead detail · ${c.name}`}
         style={{position:'fixed', right:18, top:74, bottom:18, width:420, background:'var(--bg-elev)', border:'1px solid var(--border-strong)', borderRadius:'var(--r-lg)', boxShadow:'var(--shadow-lg)', zIndex:50, display:'flex', flexDirection:'column', overflow:'hidden'}}>
      <div style={{padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <div className="eyebrow eyebrow--accent">{c.industry}</div>
          <div style={{fontSize:18, fontWeight:700, fontFamily:'var(--font-display)', marginTop:2}}>{c.name}</div>
        </div>
        <button ref={closeRef} className="btn btn--ghost btn--icon" aria-label="Close lead detail" onClick={onClose}><I2.Close size={14}/></button>
      </div>
      <div className="scroll" style={{flex:1, padding:18}}>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16}}>
          <div><div className="eyebrow">Score</div><div className="mono num" style={{fontSize:24, fontWeight:700, color: 'var(--healthy-fg)'}}>{c.score}</div></div>
          <div><div className="eyebrow">Close prob</div><div className="mono num" style={{fontSize:24, fontWeight:700}}>{(c.closeProb*100).toFixed(0)}%</div></div>
          <div><div className="eyebrow">Deal size</div><div className="mono num" style={{fontSize:18, fontWeight:600}}>{c.dealSize}</div></div>
          <div><div className="eyebrow">ARR · current</div><div className="mono num" style={{fontSize:18, fontWeight:600}}>{c.arr}</div></div>
        </div>

        <div className="eyebrow eyebrow--accent" style={{marginBottom:6}}>The pain</div>
        <div style={{fontSize:13, lineHeight:1.55, padding:12, background:'var(--bg-inset)', borderRadius:'var(--r-md)', borderLeft:'2px solid var(--sunset-500)', marginBottom:16}}>
          {c.pain}
        </div>

        <div className="eyebrow" style={{marginBottom:6}}>Stack</div>
        <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:16}}>
          {c.techStack.map(t => <span key={t} className="badge badge--neutral">{t}</span>)}
        </div>

        <div className="eyebrow" style={{marginBottom:6}}>Next step</div>
        <div style={{fontSize:13, marginBottom:4}}>{c.nextStep}</div>
        <div className="mono dim" style={{fontSize:11, marginBottom:16}}>{c.nextStepWhen} · owner {c.owner}</div>

        <div className="eyebrow" style={{marginBottom:6}}>Recent activity</div>
        <div className="timeline">
          {[
            { t:'45m', who:'agent-02', what:'Call completed · score 8.7', kind:'done' },
            { t:'2h', who:'agent-02', what:'Recap email sent → procurement', kind:'done' },
            { t:'5h', who:'system', what:'Intent surge · pricing page ×3', kind:'done' },
            { t:'1d', who:'agent-02', what:'Proposal v2 dispatched', kind:'done' },
            { t:'now', who:'agent-02', what:'Awaiting redlines', kind:'active' },
          ].map((s,i)=>(
            <div key={i} className={`tl-step tl-step--${s.kind}`}>
              <div className="tl-step__bullet">{s.kind==='done' ? '✓' : '·'}</div>
              <div className="tl-step__body">
                <div className="tl-step__title">{s.what}</div>
                <div className="tl-step__sub">{s.t} · {s.who}</div>
              </div>
            </div>
          ))}
        </div>

        {artifactPanel && (
          <section ref={artifactRef} className="lead-artifact-review" role="region" aria-label="Lead artifact review drawer">
            <div className="lead-artifact-review__head">
              <div>
                <div className="eyebrow eyebrow--accent">reviewable artifact</div>
                <strong>{artifactTypeLabel(artifactPanel.type)} · {c.name}</strong>
                <p>Review locator: <code className="mono" data-testid="lead-artifact-locator">{artifactReviewLocator(artifactPanel, c)}</code></p>
              </div>
              <button className="btn btn--ghost btn--icon" aria-label="Close lead artifact review drawer" onClick={() => setArtifactPanel(null)}><I2.Close size={14}/></button>
            </div>

            <div className="lead-artifact-list" aria-label="Available lead artifacts">
              {artifacts.map(a => (
                <button
                  key={`${a.type}-${a.path}`}
                  className="lead-artifact-row"
                  data-active={artifactPanel?.path === a.path && artifactPanel?.type === a.type}
                  onClick={() => openArtifactReview(a)}
                >
                  <span>{artifactTypeLabel(a.type)}</span>
                  <code>{artifactReviewLocator(a, c)}</code>
                  <Badge tone={artifactPreviewHref(a) ? 'accent' : 'neutral'}>{artifactPreviewHref(a) ? 'review' : 'record'}</Badge>
                </button>
              ))}
            </div>

            <div className="lead-artifact-preview">
              {artifactState === 'loading' && <div className="lead-artifact-empty">Loading source evidence...</div>}
              {artifactState === 'summary' && (
                <div className="lead-artifact-empty">
                  <strong>{artifactTypeLabel(artifactPanel.type)} review record</strong>
                  <span>This artifact is attached to the lead record. Use Proposals to review the packet before buyer-facing follow-up.</span>
                </div>
              )}
              {(artifactState === 'ready' || artifactState === 'error') && (
                <pre className="mono">{JSON.stringify(artifactPayload || {}, null, 2)}</pre>
              )}
            </div>

            <div className="lead-artifact-actions">
              <button className="btn btn--ghost btn--sm" onClick={() => copyReviewLocator(artifactPanel)}><I2.Doc size={12}/>Copy review locator</button>
              <button className="btn btn--primary btn--sm" onClick={openProposalReview}>Open proposal review <I2.ArrowRight size={12}/></button>
            </div>
          </section>
        )}
      </div>
      <div style={{padding:12, borderTop:'1px solid var(--border)', display:'flex', gap:8}}>
        {artifacts.length > 0 && (
          <button className="btn btn--ghost btn--sm" style={{flex:1}} onClick={() => openArtifactReview(defaultArtifact)}><I2.Doc size={12}/>Review artifacts</button>
        )}
        <button className="btn btn--ghost btn--sm" style={{flex:1}} onClick={()=>setRoute('calls')}><I2.Phone size={12}/>Calls</button>
        <button className="btn btn--primary btn--sm" style={{flex:1}} onClick={openProposalReview}>Proposals <I2.ArrowRight size={12}/></button>
      </div>
    </div>
  );
}

function IntakeAgentPanel({ company }) {
  const reg = window.AGENT_REGISTRY?.byKey('intake');
  if (!reg) return null;
  const [open, setOpen] = useState(false);
  const widget = reg.widget || {};
  const panelStyle = {
    position:'fixed',
    right:454,
    top:74,
    width:380,
    background:'var(--bg-elev)',
    border:'1px solid var(--border-strong)',
    borderRadius:'var(--r-lg)',
    boxShadow:'var(--shadow-lg)',
    zIndex:49,
    display:'flex',
    flexDirection:'column',
    overflow:'hidden',
    ...(open ? { bottom:18 } : { maxHeight:'calc(100vh - 92px)' }),
  };
  return (
    <div className="intake-agent-panel" data-state={open ? 'expanded' : 'collapsed'} style={panelStyle} role="region" aria-label="Intake agent panel">
      <div style={{padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10}}>
        <window.ElevenUI.Orb
          size={28}
          state="idle"
          color1={reg.avatar_color_1}
          color2={reg.avatar_color_2}
          label="Receptionist intake state"
        />
        <div style={{flex:1}}>
          <div style={{fontSize:13, fontWeight:700}}>Your receptionist</div>
          <div className="mono" style={{fontSize:10, color:'var(--text-3)'}}>phone intake · loaded with {company?.name || 'no lead'}</div>
        </div>
        <button className="btn btn--ghost btn--xs" onClick={()=>setOpen(o=>!o)} aria-expanded={open}>
          {open ? 'Collapse' : 'Talk to receptionist'}
        </button>
      </div>
      {open && (
        <div style={{flex:1, padding:0, minHeight:0, display:'flex', flexDirection:'column'}}>
          {/* surface="pipeline_intake" pulls voice/text-only/dismissible
              + the lead-aware first message out of agents-registry.js;
              the per-agent `widget` labels (Talk to Sarah / Sarah is
              listening / etc.) come along for free. */}
          <window.ConvaiWidget
            agentKey="intake"
            surface="pipeline_intake"
            height="100%"
            width="100%"
          />
        </div>
      )}
      {!open && (
        <div style={{padding:'14px 18px', fontSize:12, color:'var(--text-2)', lineHeight:1.5}}>
          <strong>Your receptionist is staged locally, not redirected.</strong> Open the call widget when this lead needs live intake; the lead detail stays readable until then.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ */
/* CALLS */
/* ------------------------------------------------------------ */
function CallsPage({ setRoute }) {
  const D = window.GTM;
  const initialSelection = window.AppContext.get().selection;
  const [activeId, setActiveId] = useState(initialSelection?.type === 'call' ? initialSelection.id : 'CALL-2419');
  const [callWindow, setCallWindow] = useState('all');
  const [coachingMode, setCoachingMode] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [callWorkflow, setCallWorkflow] = useState(null);
  // Recap email composer state — `recap draft` workflow used to be a
  // popout that just echoed title + sub copy. Now it carries an actual
  // editable recap email keyed to the active call's data, so clicking
  // "recap" produces something the operator can actually send.
  const [recapForm, setRecapForm] = useState({ to: '', subject: '', body: '' });
  // Persist recap-sent receipts keyed by call id so the operator can see
  // at a glance which calls already have a recap on file. Without this,
  // the Send affordance toasted and forgot — re-sending the same recap
  // twice was effortless because the UI carried no proof of the prior
  // send. Shape: { [callId]: { to, subject, sentAt: iso8601 } }
  const [sentRecaps, setSentRecaps] = useState({});
  // Same shape, same rationale, applied to "Hold security review" — the
  // booking composer also toasted and forgot, so an operator could
  // double-book the same call without any visible trace.
  // Shape: { [callId]: { date, time, durationMinutes, attendeeCount, bookedAt } }
  const [bookedReviews, setBookedReviews] = useState({});
  const slugForCall = (callCo) => String(callCo || '')
    .toLowerCase().split(/\s+/).filter(Boolean).join('').replace(/[^a-z0-9]/g, '');
  const buildRecapDraft = (call) => {
    const localPart = String(call?.who || '').toLowerCase().split(/\s+/)[0] || 'contact';
    const host = slugForCall(call?.co) || 'buyer';
    const recipient = `${localPart}@${host}.example`;
    const subject = `Recap: ${call?.id || 'call'} · ${call?.co || 'follow-up'}`;
    const lines = [
      `Hi ${(call?.who || '').split('·')[0].trim() || 'team'},`,
      '',
      `Quick recap of ${call?.id || 'our call'} (${call?.duration || ''}, outcome: ${call?.outcome || 'discussion'}).`,
      '',
      'What I heard:',
      `  · score: ${typeof call?.score === 'number' ? call.score.toFixed(1) : '—'} / 10 on the rubric`,
      `  · talk ratio: ${call?.talkRatio != null ? Math.round(call.talkRatio * 100) + '% rep' : 'n/a'}`,
      `  · deflections: ${call?.deflections ?? 0}${call?.flags ? `, flagged moments: ${call.flags}` : ''}`,
      '',
      'Open items I owe you:',
      '  · Pricing recap with banded options',
      '  · Security/compliance walkthrough scheduling',
      '  · Updated SOW addressing the open objections',
      '',
      'Reply if any of the above is wrong; otherwise expect a draft proposal in the next 48h.',
      '',
      '— Wranngle',
    ];
    return { to: recipient, subject, body: lines.join('\n') };
  };
  const openRecapDraft = () => {
    const draft = buildRecapDraft(active);
    setRecapForm(draft);
    setCallWorkflow({ kind: 'recap draft', title: `Recap for ${active.co}` });
  };
  const openProcurementRecap = () => {
    // Same composer, but pre-set for procurement-style routing: the "to"
    // line is the buyer contact, CC is procurement (security-review
    // agenda is attached as a body note). Reuses the recap-draft branch
    // so the operator gets the same editable form, not a hardcoded
    // "Procurement recap queued" toast that did nothing.
    const draft = buildRecapDraft(active);
    const procurementEmail = `procurement@${(String(active?.co || '').toLowerCase().split(/\s+/).filter(Boolean).join('').replace(/[^a-z0-9]/g, '') || 'buyer')}.example`;
    setRecapForm({
      ...draft,
      // Buyer contact stays in To; procurement is appended as CC via a
      // body line until the form picks up a real CC field. The body
      // already itemizes open items; we add the procurement loop-in line
      // and a security-review agenda pointer so the verb on the button
      // ("to procurement") is reflected in the actual draft text.
      subject: `${draft.subject} · loop in procurement`,
      body: [
        draft.body,
        '',
        `(Looping in ${procurementEmail} on this thread; security-review agenda attached.)`,
      ].join('\n'),
    });
    setCallWorkflow({ kind: 'recap draft', title: `Procurement recap for ${active.co}` });
  };
  const validRecapEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
  // Calendar-hold booking form — Book security review used to open a
  // popout that just rendered hardcoded copy ("Thursday 3:30pm, 30
  // minutes"). The button verb "Book" promised an actual scheduling
  // action but the surface had no form, no recipients, no submit.
  const [bookingForm, setBookingForm] = useState({ date: '', time: '15:30', durationMinutes: 30, attendees: '', agenda: '' });
  const buildBookingDraft = (call) => {
    // Default the date to next weekday at 15:30 local. ISO date string
    // because <input type="date"> wants `YYYY-MM-DD`.
    const next = new Date();
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, '0');
    const dd = String(next.getDate()).padStart(2, '0');
    const localPart = String(call?.who || '').toLowerCase().split(/\s+/)[0] || 'contact';
    const host = String(call?.co || '').toLowerCase().split(/\s+/).filter(Boolean).join('').replace(/[^a-z0-9]/g, '') || 'buyer';
    return {
      date: `${yyyy}-${mm}-${dd}`,
      time: '15:30',
      durationMinutes: 30,
      attendees: `${localPart}@${host}.example, security@wranngle.example`,
      agenda: `Walk through the security review for ${call?.id || 'this call'} (${call?.co || 'buyer'}). Cover: data residency, audit chain, retention windows, and the unresolved objections.`,
    };
  };
  const openBookingDraft = () => {
    setBookingForm(buildBookingDraft(active));
    setCallWorkflow({ kind: 'calendar hold', title: `Book security review · ${active.co}` });
  };
  const openNextProposalDraft = () => {
    // Carry the active call's context into Generate so the
    // context handoff is truly actionable: click "Draft next proposal"
    // should move directly into the sequence with a pre-filled brief.
    const ctx = window.AppContext.get();
    window.AppContext.set({
      extra: {
        ...(ctx.extra || {}),
        triggered_from: 'call-draft-next-proposal',
        proposal_draft_call_id: active.id,
        proposal_draft_call_co: active.co,
        proposal_draft_call_who: active.who,
        proposal_draft_call_outcome: active.outcome,
        proposal_draft_call_score: active.score,
        proposal_draft_call_duration: active.duration,
      },
    });
    setRoute('generate');
  };
  const sendBookingDraft = (e) => {
    e.preventDefault();
    const date = bookingForm.date.trim();
    const time = bookingForm.time.trim();
    const duration = Number(bookingForm.durationMinutes);
    if (!date || !time) {
      window.toast('Date and time are required', { sub: 'pick when the hold should land', tone: 'critical' });
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      window.toast('Duration must be positive', { sub: 'minutes only', tone: 'critical' });
      return;
    }
    const attendeeList = bookingForm.attendees.split(/[\s,;]+/).filter(Boolean);
    if (attendeeList.length === 0) {
      window.toast('At least one attendee required', { sub: 'comma-separated emails', tone: 'critical' });
      return;
    }
    setBookedReviews(prev => ({
      ...prev,
      [active.id]: {
        date,
        time,
        durationMinutes: duration,
        attendeeCount: attendeeList.length,
        bookedAt: new Date().toISOString(),
      },
    }));
    window.toast(`Security review held · ${date} ${time}`, {
      sub: `${duration}m · ${attendeeList.length} attendee${attendeeList.length === 1 ? '' : 's'}`,
      tone: 'accent',
    });
    setCallWorkflow(null);
  };
  const sendRecapDraft = (e) => {
    e.preventDefault();
    const to = recapForm.to.trim();
    if (!validRecapEmail(to)) {
      window.toast('Recap recipient is invalid', { sub: 'fix the To field before sending', tone: 'critical' });
      return;
    }
    if (!recapForm.subject.trim() || !recapForm.body.trim()) {
      window.toast('Recap is missing subject or body', { sub: 'both are required to send', tone: 'critical' });
      return;
    }
    const sentAt = new Date().toISOString();
    setSentRecaps(prev => ({
      ...prev,
      [active.id]: { to, subject: recapForm.subject.trim(), sentAt },
    }));
    window.toast(`Recap sent to ${to}`, {
      sub: `${active.id} · ${recapForm.subject.slice(0, 60)}${recapForm.subject.length > 60 ? '…' : ''}`,
      tone: 'accent',
    });
    setCallWorkflow(null);
  };
  // Transcript playback — the Play/Pause button on the transcript card
  // used to flip the icon and do absolutely nothing else. Now `playing`
  // drives a real timeline cursor: while playing, an interval advances
  // `playbackIndex` line-by-line; the live line gets data-playing="true"
  // and CSS scrolls it into view. Pause halts. Reaching the end auto-stops.
  const [playbackIndex, setPlaybackIndex] = useState(-1);
  const PLAYBACK_TICK_MS = 700;
  // Coaching notes are real, persisted to component state, and keyed by
  // call id so switching back and forth between calls preserves them. The
  // transcript-line click used to only fire a toast that vanished in 3
  // seconds — that promised a coaching note and delivered nothing.
  // [{ id, callId, transcriptKey: `${time}|${who}|${snippet}`, time, who, line, note, savedAt }]
  const [coachingNotes, setCoachingNotes] = useState([]);
  // The line the operator just clicked but hasn't saved yet — drives an
  // inline composer rendered beneath that transcript line. Cleared on
  // Save / Cancel / call-switch.
  const [coachingDraft, setCoachingDraft] = useState(null);
  const [coachingDraftText, setCoachingDraftText] = useState('');
  const transcriptKeyFor = (l) => `${l.t}|${l.who}|${(l.txt || '').slice(0, 24)}`;
  const callNotes = coachingNotes.filter(n => n.callId === activeId);
  const noteByLineKey = (key) => callNotes.find(n => n.transcriptKey === key) || null;
  const tryOpenCoachingDraft = (l) => {
    if (!coachingMode) {
      window.toast('Coaching mode is off', {
        sub: 'flip the Coaching mode toggle to add notes against this transcript',
        tone: 'warn',
      });
      return;
    }
    openCoachingDraft(l);
  };
  const openCoachingDraft = (l) => {
    const key = transcriptKeyFor(l);
    const existing = coachingNotes.find(n => n.callId === activeId && n.transcriptKey === key);
    setCoachingDraft({ key, time: l.t, who: l.who, line: l.txt });
    setCoachingDraftText(existing?.note || '');
    const ctx = window.AppContext.get();
    window.AppContext.set({
      extra: {
        ...(ctx.extra || {}),
        coaching_mode: true,
        selected_call_line_key: key,
        selected_call_line_time: l.t,
        selected_call_line_speaker: l.who,
        selected_call_line_text: l.txt,
        triggered_from: 'call-transcript-line',
      },
    });
  };
  const cancelCoachingDraft = () => { setCoachingDraft(null); setCoachingDraftText(''); };
  const saveCoachingNote = () => {
    if (!coachingDraft) return;
    const trimmed = coachingDraftText.trim();
    if (!trimmed) {
      window.toast('Coaching note is empty', { sub: 'add a comment before saving', tone: 'critical' });
      return;
    }
    const key = coachingDraft.key;
    setCoachingNotes(prev => {
      const filtered = prev.filter(n => !(n.callId === activeId && n.transcriptKey === key));
      return [...filtered, {
        id: `${activeId}:${key}:${Date.now()}`,
        callId: activeId,
        transcriptKey: key,
        time: coachingDraft.time,
        who: coachingDraft.who,
        line: coachingDraft.line,
        note: trimmed,
        savedAt: new Date().toISOString(),
      }];
    });
    window.toast(`Coaching note saved · ${coachingDraft.time}`, {
      sub: `${trimmed.slice(0, 80)}${trimmed.length > 80 ? '…' : ''}`,
      tone: 'accent',
    });
    setCoachingDraft(null);
    setCoachingDraftText('');
    const ctx = window.AppContext.get();
    window.AppContext.set({
      extra: {
        ...(ctx.extra || {}),
        coaching_note_saved_at: new Date().toISOString(),
        coaching_note_last: trimmed,
        triggered_from: 'call-coaching-note-save',
      },
    });
  };
  const removeCoachingNote = (note) => {
    setCoachingNotes(prev => prev.filter(n => n.id !== note.id));
    window.toast('Coaching note removed', { sub: `${note.time} · ${note.who.toUpperCase()}`, tone: 'warn' });
  };
  // Switching calls dismisses the in-progress draft so the operator
  // doesn't accidentally save a note on the wrong transcript.
  React.useEffect(() => { setCoachingDraft(null); setCoachingDraftText(''); }, [activeId]);
  // Reset playback when the active call changes — playing through one
  // transcript and then switching calls shouldn't continue advancing on
  // the old transcript's index.
  React.useEffect(() => { setPlaying(false); setPlaybackIndex(-1); }, [activeId]);
  // Tick: advance playbackIndex while playing. Auto-stops at end.
  React.useEffect(() => {
    if (!playing) return undefined;
    const total = (D.transcriptBanyan || []).length;
    if (playbackIndex >= total - 1) { setPlaying(false); return undefined; }
    const t = setInterval(() => {
      setPlaybackIndex(i => {
        const next = i + 1;
        if (next >= total - 1) {
          // Last line; let the next effect run to clear playing.
          setPlaying(false);
          return total - 1;
        }
        return next;
      });
    }, PLAYBACK_TICK_MS);
    return () => clearInterval(t);
  }, [playing, playbackIndex, D.transcriptBanyan]);
  const startOrPausePlayback = () => {
    setPlaying(p => {
      const next = !p;
      // If we were paused at -1, starting fresh begins at line 0.
      if (next && playbackIndex < 0) setPlaybackIndex(0);
      return next;
    });
  };
  const active = D.calls.find(c => c.id === activeId) || D.calls[0];
  const visibleCalls = callWindow === 'missed'
    ? D.calls.filter(pageIsMissedCall)
    : callWindow === 'flagged'
      ? D.calls.filter(c => c.flags > 0)
      : D.calls;
  const totalCalls = (D.calls || []).length;
  const flaggedCalls = (D.calls || []).filter(c => Number(c.flags || 0) > 0).length;
  const activeHasTranscript = active.id === 'CALL-2419';
  const activeAxisCount = activeHasTranscript && D.callScores ? D.callScores.length : 0;
  const scoredCalls = (D.calls || []).filter(c => Number.isFinite(Number(c.score)));
  const teamAvgScore = scoredCalls.length === 0
    ? null
    : (scoredCalls.reduce((s, c) => s + Number(c.score), 0) / scoredCalls.length).toFixed(1);
  const activeOutcomeTone = (() => {
    const o = String(active.outcome || '').toLowerCase();
    if (/booked|qualified|approved|technical-deep-dive/.test(o)) return 'healthy';
    if (/follow-up|discovery|recap/.test(o)) return 'accent';
    if (/objection|pricing|stalled/.test(o)) return 'warn';
    if (/no-fit|lost|cancel|declined/.test(o)) return 'critical';
    return 'neutral';
  })();

  // Publish active call to AppContext for the sales coach.
  useEffect(() => {
    const ctx = window.AppContext.get();
    window.AppContext.set({
      selection: { type:'call', id: activeId },
      extra: {
        ...(ctx.extra || {}),
        coaching_mode: coachingMode,
        selected_call_id: activeId,
      },
    });
    return () => { window.AppContext.set({ selection: null }); };
  }, [activeId, coachingMode]);
  useEffect(() => window.AppContext.subscribe((ctx) => {
    if (ctx.selection?.type === 'call' && D.calls.some(c => c.id === ctx.selection.id)) {
      setActiveId(ctx.selection.id);
    }
  }), []);
  useEffect(() => {
    const workflowForIntent = (intent, call) => {
      if (intent === 'recap') {
        return {
          kind: 'recap draft',
          title: `Recap for ${call?.co || 'selected call'}`,
          sub: 'Draft includes procurement owner, security review ask, and unresolved objections.',
        };
      }
      if (intent === 'quote-follow-up') {
        return {
          kind: 'quote follow-up',
          title: `Quote follow-up · ${call?.co || 'selected call'}`,
          sub: 'Draft a short callback note with price, next step, and owner.',
        };
      }
      if (intent === 'security-review') {
        return {
          kind: 'calendar hold',
          title: `Security review for ${call?.co || 'selected call'}`,
          sub: '30-minute hold with buyer, security reviewer, and operator owner.',
        };
      }
      if (intent === 'schedule-job') {
        return {
          kind: 'calendar hold',
          title: `Schedule job · ${call?.co || 'selected call'}`,
          sub: 'Hold a visit time and send the customer a clear confirmation.',
        };
      }
      if (intent === 'human-review') {
        return {
          kind: 'human review',
          title: `Human review · ${call?.id || 'selected call'}`,
          sub: `${call?.co || 'Buyer'} needs an operator decision before the agent resumes.`,
        };
      }
      return null;
    };
    const applyCallIntent = (ctx) => {
      const extra = ctx.extra || {};
      if (!extra.call_workflow && !extra.call_window) return;
      if (extra.call_window === 'missed') setCallWindow('missed');
      if (extra.call_window === 'flagged') setCallWindow('flagged');
      if (extra.call_window === 'all') setCallWindow('all');
      const selectedCall = ctx.selection?.type === 'call'
        ? D.calls.find(c => c.id === ctx.selection.id)
        : active;
      const workflow = workflowForIntent(extra.call_workflow, selectedCall);
      if (workflow) {
        if (workflow.kind === 'recap draft') setRecapForm(buildRecapDraft(selectedCall));
        if (workflow.kind === 'calendar hold') setBookingForm(buildBookingDraft(selectedCall));
        setCallWorkflow(workflow);
      }
      const latestExtra = window.AppContext.get().extra || extra;
      window.AppContext.set({ extra: page1OmitKeys(latestExtra, ['call_workflow', 'call_window']) });
    };
    applyCallIntent(window.AppContext.get());
    return window.AppContext.subscribe(applyCallIntent);
  }, [activeId]);

  return (
    <div className="calls-page page page--wide page--calls">
      <PageHeader
        title="Calls"
        sub={(() => {
          // Derive the sub from the live data so the claim matches what
          // the page actually shows. Only CALL-2419 (Banyan) has the
          // 7-axis scorecard on file in the fixture; saying every call
          // is "scored on a seven-axis rubric" lied to the operator.
          const total = (D.calls || []).length;
          const scoredAxisCount = D.callScores ? D.callScores.length : 0;
          const flagged = (D.calls || []).filter(c => Number(c.flags || 0) > 0).length;
          return `${total} call${total === 1 ? '' : 's'} on file · 1 scored on the ${scoredAxisCount}-axis rubric (CALL-2419) · ${flagged} flagged. Coaching mode is on by default for line-level notes.`;
        })()}
        actions={<>
          <button className="btn btn--ghost btn--sm" aria-pressed={callWindow === 'flagged'} onClick={() => setCallWindow(v => v === 'flagged' ? 'all' : 'flagged')}><I2.Filter size={12}/>{callWindow === 'flagged' ? 'All calls' : 'Flagged'}</button>
          <button className="btn btn--ghost btn--sm" aria-pressed={coachingMode} onClick={() => setCoachingMode(v => !v)}><I2.Mic size={12}/>{coachingMode ? 'Coaching on' : 'Coaching mode'}</button>
        </>}
      />

      <section className="calls-review-rail" aria-label="Calls review status">
        <div className="calls-review-rail__active">
          <div className="eyebrow eyebrow--accent">active review</div>
          <div className="calls-active-title">
            <I2.Phone size={15}/>
            <span className="mono">{active.id}</span>
            <span>{active.co}</span>
          </div>
          <div className="calls-active-meta">
            <span>{active.who}</span>
            <span>{active.duration}</span>
            <span>{active.when}</span>
          </div>
        </div>
        <div className="calls-review-rail__stats" aria-label="Calls summary">
          <div className="calls-mini-stat">
            <span>calls</span>
            <strong>{totalCalls}</strong>
          </div>
          <div className="calls-mini-stat">
            <span>flagged</span>
            <strong>{flaggedCalls}</strong>
          </div>
          <div className="calls-mini-stat">
            <span>score</span>
            <strong>{active.score.toFixed(1)}</strong>
          </div>
          <div className="calls-mini-stat">
            <span>axes</span>
            <strong>{activeAxisCount || 'n/a'}</strong>
          </div>
        </div>
        <div className="calls-review-rail__state">
          <span className="calls-mode-pill" data-active={coachingMode ? 'true' : 'false'} data-testid="calls-coaching-state">
            <I2.Mic size={12}/>
            {coachingMode ? 'Coaching on' : 'Coaching off'}
          </span>
          <span className="calls-mode-pill" data-active={activeHasTranscript ? 'true' : 'false'}>
            <I2.Doc size={12}/>
            {activeHasTranscript ? 'Transcript ready' : 'No transcript'}
          </span>
          <span className="calls-mode-pill" data-tone={activeOutcomeTone}>
            <I2.Flag size={12}/>
            {active.outcome}
          </span>
        </div>
      </section>

      {callWorkflow && (
        <div className="workflow-popout workflow-popout--calls" role="region" aria-label="Call workflow panel">
          <button className="workflow-popout__close btn btn--ghost btn--icon" aria-label="Close call workflow panel" onClick={() => { setCallWorkflow(null); }}><I2.Close size={14}/></button>
          {callWorkflow && callWorkflow.kind === 'human review' && (
            <div className="workflow-popout__pane" data-testid="call-human-review-panel">
              <div className="eyebrow eyebrow--accent">{callWorkflow.kind}</div>
              <div className="workflow-popout__title">{callWorkflow.title}</div>
              <div className="muted" style={{fontSize:12, marginTop:-4, marginBottom:10}}>{callWorkflow.sub}</div>
              <div className="workflow-popout__grid">
                <div className="workflow-tile" role="group" aria-label="Call risk summary">
                  <span>{active.co}</span>
                  <span>{active.outcome} · score {active.score.toFixed(1)} · {active.flags} flagged moment{active.flags === 1 ? '' : 's'}</span>
                </div>
                <div className="workflow-tile" role="group" aria-label="Objection summary">
                  <span>Pricing objection</span>
                  <span>{active.deflections} handoff tr{active.deflections === 1 ? 'y' : 'ies'} · transcript already filtered to flagged calls</span>
                </div>
              </div>
              <div className="hstack" style={{gap:8, flexWrap:'wrap', justifyContent:'flex-end', marginTop:12}}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={openProcurementRecap}><I2.Mail size={12}/>{sentRecaps[active.id] ? 'Re-draft recap' : 'Draft recap'}</button>
                <button type="button" className="btn btn--ghost btn--sm" data-testid="call-booking-open" onClick={openBookingDraft}><I2.Calendar size={12}/>{bookedReviews[active.id] ? 'Re-hold review' : 'Hold review'}</button>
                <button type="button" className="btn btn--primary btn--sm" onClick={openNextProposalDraft}><I2.Doc size={12}/>Draft next proposal</button>
              </div>
            </div>
          )}
          {callWorkflow && callWorkflow.kind === 'recap draft' && (
            <form className="workflow-popout__pane" onSubmit={sendRecapDraft} aria-label={`Recap composer for ${active.co}`} data-testid="call-recap-form">
              <div className="eyebrow eyebrow--accent">{callWorkflow.kind}</div>
              <div className="workflow-popout__title">{callWorkflow.title}</div>
              {callWorkflow.sub && <div className="muted" style={{fontSize:12, marginTop:-4, marginBottom:8}}>{callWorkflow.sub}</div>}
              <label className="form-row">
                <span className="form-row__label">To</span>
                <input
                  type="email"
                  className="form-input"
                  data-testid="call-recap-to"
                  required
                  value={recapForm.to}
                  onChange={(e) => setRecapForm(f => ({ ...f, to: e.target.value }))}
                />
              </label>
              <label className="form-row">
                <span className="form-row__label">Subject</span>
                <input
                  type="text"
                  className="form-input"
                  data-testid="call-recap-subject"
                  required
                  value={recapForm.subject}
                  onChange={(e) => setRecapForm(f => ({ ...f, subject: e.target.value }))}
                />
              </label>
              <label className="form-row">
                <span className="form-row__label">Body</span>
                <textarea
                  className="form-input form-input--mono"
                  rows={10}
                  data-testid="call-recap-body"
                  required
                  value={recapForm.body}
                  onChange={(e) => setRecapForm(f => ({ ...f, body: e.target.value }))}
                />
              </label>
              <div className="hstack" style={{gap:8, justifyContent:'flex-end', marginTop:6}}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCallWorkflow(null)}>Cancel</button>
                <button type="submit" className="btn btn--primary btn--sm" data-testid="call-recap-send"><I2.Mail size={12}/>Send recap</button>
              </div>
            </form>
          )}
          {callWorkflow && callWorkflow.kind === 'calendar hold' && (
            <form className="workflow-popout__pane" onSubmit={sendBookingDraft} aria-label={`Security review booking for ${active.co}`} data-testid="call-booking-form">
              <div className="eyebrow eyebrow--accent">{callWorkflow.kind}</div>
              <div className="workflow-popout__title">{callWorkflow.title}</div>
              {callWorkflow.sub && <div className="muted" style={{fontSize:12, marginTop:-4, marginBottom:8}}>{callWorkflow.sub}</div>}
              <div className="hstack" style={{gap:8}}>
                <label className="form-row" style={{flex:1}}>
                  <span className="form-row__label">Date</span>
                  <input
                    type="date"
                    className="form-input"
                    data-testid="call-booking-date"
                    value={bookingForm.date}
                    onChange={(e) => setBookingForm(f => ({ ...f, date: e.target.value }))}
                  />
                </label>
                <label className="form-row" style={{width:120}}>
                  <span className="form-row__label">Time</span>
                  <input
                    type="time"
                    className="form-input"
                    data-testid="call-booking-time"
                    value={bookingForm.time}
                    onChange={(e) => setBookingForm(f => ({ ...f, time: e.target.value }))}
                  />
                </label>
                <label className="form-row" style={{width:120}}>
                  <span className="form-row__label">Duration (min)</span>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    className="form-input"
                    data-testid="call-booking-duration"
                    value={bookingForm.durationMinutes}
                    onChange={(e) => setBookingForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))}
                  />
                </label>
              </div>
              <label className="form-row">
                <span className="form-row__label">Attendees <span className="mono dim" style={{fontSize:10}}>· comma-separated emails</span></span>
                <input
                  type="text"
                  className="form-input"
                  data-testid="call-booking-attendees"
                  value={bookingForm.attendees}
                  onChange={(e) => setBookingForm(f => ({ ...f, attendees: e.target.value }))}
                />
              </label>
              <label className="form-row">
                <span className="form-row__label">Agenda</span>
                <textarea
                  className="form-input"
                  rows={4}
                  data-testid="call-booking-agenda"
                  value={bookingForm.agenda}
                  onChange={(e) => setBookingForm(f => ({ ...f, agenda: e.target.value }))}
                />
              </label>
              <div className="hstack" style={{gap:8, justifyContent:'flex-end', marginTop:6}}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCallWorkflow(null)}>Cancel</button>
                <button type="submit" className="btn btn--primary btn--sm" data-testid="call-booking-send"><I2.Calendar size={12}/>Hold the time</button>
              </div>
            </form>
          )}
          {callWorkflow && callWorkflow.kind !== 'human review' && callWorkflow.kind !== 'recap draft' && callWorkflow.kind !== 'calendar hold' && (
            <div className="workflow-popout__pane">
              <div className="eyebrow eyebrow--accent">{callWorkflow.kind}</div>
              <div className="workflow-popout__title">{callWorkflow.title}</div>
              <div className="muted" style={{fontSize:12}}>{callWorkflow.sub}</div>
            </div>
          )}
        </div>
      )}

      <div className="calls-grid">
        {/* Call list */}
        <Card title={`queue · ${visibleCalls.length} ${callWindow === 'missed' ? 'missed' : callWindow === 'flagged' ? 'flagged' : 'by recency'}`} className="card--accent calls-grid__list calls-list" >
          <div className="calls-list__items">
            {visibleCalls.length === 0 && (
              <div className="calls-list__empty muted" data-testid="calls-list-empty">
                {callWindow === 'missed'
                  ? 'No missed calls right now.'
                  : callWindow === 'flagged'
                  ? 'No flagged calls right now. Toggle Flagged off to see all calls.'
                  : 'No calls on file yet.'}
              </div>
            )}
            {visibleCalls.map(c => (
              <div key={c.id}
                   className="call-row"
                   role="button"
                   tabIndex={0}
                   aria-pressed={activeId === c.id}
                   data-active={activeId === c.id ? 'true' : 'false'}
                   data-flagged={c.flags > 0 ? 'true' : 'false'}
                   onClick={()=>setActiveId(c.id)}
                   onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveId(c.id); } }}>
                <div className="call-row__top">
                  <span className="mono call-row__id">{c.id}</span>
                  <span className="mono call-row__when">{c.when}</span>
                </div>
                <div className="call-row__company">{c.co}</div>
                <div className="mono call-row__person">{c.who}</div>
                <div className="call-row__meta">
                  <Badge tone={c.score >= 8 ? 'healthy' : c.score >= 7 ? 'accent' : c.score >= 5 ? 'warn' : 'critical'}>
                    {c.score.toFixed(1)}
                  </Badge>
                  <span className="mono call-row__duration">{c.duration}</span>
                  <span className="call-row__outcome">{c.outcome}</span>
                  {c.flags > 0 && <span className="badge badge--critical" style={{marginLeft:'auto'}}><I2.Flag size={9}/>{c.flags}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Transcript */}
        <Card title={`${active.id} · ${active.co} · ${active.who}`}
              className="calls-grid__transcript"
              action={(() => {
                const recapReceipt = sentRecaps[active.id];
                const recapStamp = recapReceipt
                  ? new Date(recapReceipt.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : null;
                const bookingReceipt = bookedReviews[active.id];
                return (
                  <div className="calls-transcript-actions">
                    <span className="mono calls-transcript-actions__duration">{active.duration}</span>
                    {callNotes.length > 0 && (
                      <span data-testid="coaching-notes-count">
                        <Badge tone="accent">{callNotes.length} note{callNotes.length === 1 ? '' : 's'}</Badge>
                      </span>
                    )}
                    {recapReceipt && (
                      <span
                        data-testid="call-recap-receipt"
                        data-recap-to={recapReceipt.to}
                        title={`Recap sent to ${recapReceipt.to} at ${recapStamp}`}
                      >
                        <Badge tone="healthy">recap @ {recapStamp}</Badge>
                      </span>
                    )}
                    {bookingReceipt && (
                      <span
                        data-testid="call-booking-receipt"
                        data-booking-date={bookingReceipt.date}
                        data-booking-time={bookingReceipt.time}
                        title={`Security review held ${bookingReceipt.date} ${bookingReceipt.time} · ${bookingReceipt.durationMinutes}m · ${bookingReceipt.attendeeCount} attendee${bookingReceipt.attendeeCount === 1 ? '' : 's'}`}
                      >
                        <Badge tone="healthy">review @ {bookingReceipt.date} {bookingReceipt.time}</Badge>
                      </span>
                    )}
                    <button
                      className="btn btn--ghost btn--xs"
                      aria-pressed={playing}
                      data-testid="trans-play-toggle"
                      onClick={startOrPausePlayback}
                    >{playing ? <I2.Pause size={10}/> : <I2.Play size={10}/>}{playing ? 'pause' : 'play'}</button>
                    <button
                      className="btn btn--ghost btn--xs"
                      data-testid="call-recap-open"
                      onClick={openRecapDraft}
                    ><I2.Mail size={10}/>{recapReceipt ? 're-send recap' : 'recap'}</button>
                  </div>
                );
              })()}>

          {/* Only Banyan (CALL-2419) has a transcript in the fixture. Showing
              Banyan's lines under another call's card title would lie about
              what the operator is reading. Surface a clear placeholder for
              every other call until per-call transcripts ship. */}
          {active.id !== 'CALL-2419' && (
            <div
              className="trans calls-grid__trans-scroll calls-transcript-empty"
              data-testid="trans-empty"
              aria-label="Call transcript unavailable"
            >
              <div className="muted">
                <strong>{active.id}</strong> has no transcript on file yet.<br/>
                <span className="mono" style={{fontSize:11}}>
                  Pick {active.co !== 'Banyan Health' ? <code>CALL-2419 · Banyan Health</code> : 'another call'} from the list to walk a transcript, or wait for the live ConvAI session to capture one.
                </span>
              </div>
            </div>
          )}
          {active.id === 'CALL-2419' && <div className="trans calls-grid__trans-scroll calls-transcript-scroll" aria-label="Call transcript">
            {D.transcriptBanyan.map((l,i) => {
              const key = transcriptKeyFor(l);
              const savedNote = noteByLineKey(key);
              const isComposing = coachingDraft?.key === key;
              return (
                <React.Fragment key={i}>
                  <div className="trans__line"
                       data-flag={!!l.flag}
                       data-has-note={savedNote ? 'true' : 'false'}
                       data-playing={playbackIndex === i ? 'true' : 'false'}
                       data-coaching-mode={coachingMode ? 'true' : 'false'}
                       data-testid="trans-line"
                       role="button"
                       tabIndex={0}
                       aria-label={
                         coachingMode
                           ? (savedNote ? `Edit coaching note at ${l.t}` : `Add coaching note at ${l.t}`)
                           : `Transcript line at ${l.t} (enable Coaching mode to add a note)`
                       }
                       onClick={() => tryOpenCoachingDraft(l)}
                       onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tryOpenCoachingDraft(l); } }}
                       ref={(el) => { if (el && playbackIndex === i) globalThis.scrollConsoleNodeIntoView?.(el, { block: 'nearest', behavior: 'smooth' }); }}
                       style={{cursor: coachingMode ? 'pointer' : 'default'}}>
                    <span className="trans__time">{l.t}</span>
                    <span className={`trans__who trans__who--${l.who}`}>
                      {l.who === 'agent' ? 'AGENT' : l.who === 'caller' ? 'PRIYA' : 'SYS'}
                    </span>
                    <span className="trans__txt">{l.txt}</span>
                    {savedNote && (
                      <span className="trans__note-marker" aria-hidden="true" title={`Note: ${savedNote.note}`}><I2.Doc size={12}/></span>
                    )}
                  </div>
                  {isComposing && (
                    <div className="trans__composer" data-testid="coaching-composer" role="region" aria-label={`Coaching note composer at ${l.t}`}>
                      <textarea
                        className="form-input form-input--mono"
                        rows={2}
                        autoFocus
                        data-testid="coaching-composer-text"
                        placeholder="What should the agent have done differently here?"
                        value={coachingDraftText}
                        onChange={(e) => setCoachingDraftText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveCoachingNote(); }
                          if (e.key === 'Escape') { e.preventDefault(); cancelCoachingDraft(); }
                        }}
                      />
                      <div className="hstack" style={{gap:6, justifyContent:'flex-end', marginTop:6}}>
                        <button type="button" className="btn btn--ghost btn--xs" data-testid="coaching-composer-cancel" onClick={cancelCoachingDraft}>Cancel</button>
                        <button type="button" className="btn btn--primary btn--xs" data-testid="coaching-composer-save" onClick={saveCoachingNote}><I2.Doc size={10}/>Save note</button>
                      </div>
                    </div>
                  )}
                  {savedNote && !isComposing && (
                    <div className="trans__saved-note" data-testid="trans-saved-note">
                      <span className="mono dim" style={{fontSize:10, marginRight:6}}>note · {new Date(savedNote.savedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                      <span style={{flex:1}}>{savedNote.note}</span>
                      <button type="button" className="btn btn--ghost btn--xs" data-testid="trans-saved-note-remove" aria-label={`Remove coaching note at ${l.t}`} onClick={(e) => { e.stopPropagation(); removeCoachingNote(savedNote); }}><I2.Close size={10}/></button>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>}
        </Card>

        {/* Scorecard + actions */}
        <div className="vstack calls-grid__side">
          <Card title={`scorecard · ${activeHasTranscript ? `${D.callScores.length} axes` : 'overall only'}`} accent="accent" className="calls-scorecard">
            <div className="calls-scorecard__overall">
              <div className="eyebrow">overall</div>
              <div
                className="calls-scorecard__score"
                data-testid="scorecard-overall"
              >
                {active.score.toFixed(1)}
              </div>
              <div className="mono" style={{fontSize:10, color:'var(--text-3)'}} data-testid="scorecard-team-avg">
                vs team avg {teamAvgScore || '--'}
              </div>
            </div>
            {/* The 7 axes in D.callScores are scored against the Banyan
                transcript (CALL-2419). For every other call we don't have
                axis-level scoring on file — rendering Banyan's axes under
                a different call's overall score would lie about what each
                axis actually measured. The team-avg + per-call overall
                above stay derived; only the axis breakdown is gated. */}
            {activeHasTranscript ? D.callScores.map(s => (
              <div key={s.axis}
                   className="axis inspectable"
                   data-popout={`${s.axis}: ${s.score.toFixed(1)} score, ${s.weight}% weight. ${s.detail}`}>
                <div>
                  <div className="axis__name">{s.axis}</div>
                  <div className="axis__detail">{s.detail}</div>
                </div>
                <div style={{width:50}}>
                  <div className="progress"><div className={`progress__fill progress__fill--${s.score >= 8 ? 'healthy' : s.score >= 7 ? 'accent' : 'warn'}`} style={{width:`${s.score*10}%`}}/></div>
                </div>
                <div className="num mono" style={{textAlign:'right', fontWeight:600}}>{s.score.toFixed(1)}</div>
                <div className="axis__weight">{s.weight}%</div>
              </div>
            )) : (
              <div className="muted" data-testid="scorecard-axes-empty" style={{padding:'12px 4px', fontSize:12}}>
                No axis breakdown on file for {active.id}. Pick <code className="mono">CALL-2419 · Banyan Health</code> to see the scored 7-axis rubric, or wait for the live ConvAI session to score this call.
              </div>
            )}
          </Card>

          <Card title="signals" className="calls-signals">
            <div className="calls-signal-list">
              <div className="calls-signal-row">
                <span className="muted">Talk ratio</span>
                {(() => {
                  // Discovery rule of thumb: rep should be ≤ ~40% of talk
                  // time. The recap-draft body uses "(target ≤40%)". The
                  // signals row had no tone — the score-card axis was the
                  // only place this surfaced. Make the row carry the same
                  // signal so the operator can spot a flagged ratio
                  // without scrolling to the axis grid.
                  const pct = Math.round((Number(active.talkRatio) || 0) * 100);
                  const tone = pct > 50 ? 'cl-err' : pct > 40 ? 'cl-warn' : 'cl-ok';
                  return (
                    <span className={`mono num ${tone}`} data-testid="signal-talkratio" data-talk-ratio-pct={pct}>
                      {pct}% rep
                    </span>
                  );
                })()}
              </div>
              <div className="calls-signal-row">
                <span className="muted">Sentiment</span>
                {(() => {
                  // Derive sign + tone from the live value. Hardcoded `+`
                  // and `.cl-ok` rendered Arcadia's −12 sentiment as
                  // "+-12" with healthy-green styling — colorblind to a
                  // 0.12 negative shift on a flagged call.
                  const pct = Math.round((Number(active.sentiment) || 0) * 100);
                  const tone = pct > 5 ? 'cl-ok' : pct < -5 ? 'cl-err' : 'cl-warn';
                  const sign = pct > 0 ? '+' : '';
                  return (
                    <span className={`mono num ${tone}`} data-testid="signal-sentiment" data-sentiment-pct={pct}>
                      {sign}{pct}
                    </span>
                  );
                })()}
              </div>
              <div className="calls-signal-row">
                <span className="muted">Handoff tries</span>
                {(() => {
                  // Same tone-by-value logic as the sentiment + talk-ratio
                  // rows. Zero deflections is healthy; 1–2 warn (some
                  // friction); 3+ critical (real objection cluster).
                  const n = Number(active.deflections) || 0;
                  const tone = n === 0 ? 'cl-ok' : n <= 2 ? 'cl-warn' : 'cl-err';
                  return (
                    <span className={`mono num ${tone}`} data-testid="signal-deflections" data-deflections={n}>{n}</span>
                  );
                })()}
              </div>
              <div className="calls-signal-row">
                <span className="muted">Outcome</span>
                {(() => {
                  return (
                    <span data-testid="signal-outcome" data-outcome-tone={activeOutcomeTone}>
                      <Badge tone={activeOutcomeTone}>{active.outcome}</Badge>
                    </span>
                  );
                })()}
              </div>
            </div>
          </Card>

          <Card title="suggested next" className="calls-next-actions">
            <div className="calls-next-actions__list">
              <button
                className="btn btn--primary btn--sm calls-next-actions__button"
                data-testid="call-procurement-recap-open"
                onClick={openProcurementRecap}
              ><I2.Mail size={12}/>Send recap to procurement</button>
              <button
                className="btn btn--sm calls-next-actions__button"
                data-testid="call-book-security-review"
                onClick={openBookingDraft}
              ><I2.Calendar size={12}/>Book security review</button>
              <button
                className="btn btn--ghost btn--sm calls-next-actions__button"
                data-testid="call-draft-next-proposal"
                onClick={openNextProposalDraft}
              ><I2.Doc size={12}/>Draft next proposal</button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HomePage, PipelinePage, CallsPage });
