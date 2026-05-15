/* ============================================================
   Pages: Home (Mission Control), Pipeline, Calls
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

/* ------------------------------------------------------------ */
/* MISSION CONTROL (home) */
/* ------------------------------------------------------------ */
function HomePage({ setRoute }) {
  const D = window.GTM;
  const { stats, sparks, feed, agents, companies, evalSuites } = D;
  const liveCalls = D.calls.slice(0, 3);
  const hotLeads = [...companies].sort((a, b) => b.score - a.score).slice(0, 5);
  const [range, setRange] = useState('today');
  const [queueMode, setQueueMode] = useState('active');
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
  // surfaces whichever agent is currently paused, the call that's blocking
  // them, and the proposal at risk — flip any of those upstream and the
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
    const matchedProposal = (D.proposals || []).find(
      p => p.co && companyName && String(p.co).toLowerCase().includes(String(companyName).toLowerCase().split(' ')[0])
    );
    return {
      agentId: pausedAgent.id,
      agentName: pausedAgent.name,
      callId: matchedCall?.id,
      callOutcome: matchedCall?.outcome || 'unknown',
      callDeflections: Number(matchedCall?.deflections || 0),
      companyName,
      proposalAmount: matchedProposal?.amount,
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
    window.toast(`Attention snoozed · ${label}`, {
      sub: `${attentionItem.agentId} will retry ${attentionItem.callOutcome} · until ${new Date(until).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`,
      tone: 'warn',
    });
  };
  const unsnoozeAttention = () => {
    setSnoozedBanners(s => {
      const { [ATTENTION_BANNER_ID]: _, ...rest } = s;
      return rest;
    });
    window.toast('Attention restored', { sub: 'banner is visible again', tone: 'accent' });
  };
  // Re-render once when the snooze expires so the banner reappears
  // automatically without the operator clicking anything.
  useEffect(() => {
    if (!isAttentionSnoozed) return undefined;
    const remaining = Math.max(0, snoozeExpiry - Date.now());
    const t = setTimeout(() => {
      setSnoozedBanners(s => {
        if (s[ATTENTION_BANNER_ID] === snoozeExpiry) {
          const { [ATTENTION_BANNER_ID]: _, ...rest } = s;
          return rest;
        }
        return s;
      });
    }, remaining + 50);
    return () => clearTimeout(t);
  }, [snoozeExpiry, isAttentionSnoozed]);

  // Live agent feed: seed the ConsolePanel via the gtm:stream channel it
  // already listens to, so the "live · agent.feed" title is honest. The
  // static fixture (frozen 14:41:08 timestamps that never advanced) now
  // streams in on mount with a small stagger; subsequent dispatches from
  // anywhere in the app (Sync context, eval lab, etc.) flow into the
  // same panel without us reinventing the feed wheel.
  useEffect(() => {
    if (!Array.isArray(feed) || feed.length === 0) return undefined;
    // Reset the live panel first so remounts don't double-stack.
    window.dispatchEvent(new CustomEvent('gtm:stream-reset'));
    const cancellers = [];
    // Reverse so the oldest entry lands first; the panel auto-scrolls
    // and the newest visually pins to the bottom (matches the snapshot's
    // implied chronology).
    feed.slice(0, 8).slice().reverse().forEach((line, idx) => {
      const t = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('gtm:stream', {
          detail: { msg: line.txt, level: line.level || 'info' },
        }));
      }, 80 + idx * 40);
      cancellers.push(() => clearTimeout(t));
    });
    return () => { cancellers.forEach(fn => fn()); };
  }, [feed]);

  // Derive the PageHeader sub from real state so the headline can't lie.
  // Previously this was hardcoded `Three agents. Forty-seven open tasks.
  // One thing wants your attention.` — the agent count was a literal "3"
  // even when history loaded fewer/more agents, the task count was a
  // literal 47 forever, and "one thing wants your attention" stayed put
  // even after the operator snoozed the banner.
  const pluralize = (n, singular, plural) => `${n} ${n === 1 ? singular : (plural || `${singular}s`)}`;
  const openTaskCount = (agents || []).reduce((sum, a) => sum + (Number(a.tasks) || 0), 0);
  const attentionCount = (attentionItem && !isAttentionSnoozed) ? 1 : 0;
  const missionSub = (() => {
    const parts = [
      pluralize((agents || []).length, 'agent'),
      `${pluralize(openTaskCount, 'open task')}`,
    ];
    if (attentionCount === 0) {
      parts.push('all attention items snoozed');
    } else {
      parts.push(`${pluralize(attentionCount, 'thing')} ${attentionCount === 1 ? 'wants' : 'want'} your attention`);
    }
    return parts.join(' · ');
  })();
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

  return (
    <div className="page">
      <PageHeader
        title="Mission Control"
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
          <button className="btn" onClick={() => {
            window.AppContext.set({
              extra: {
                ...(window.AppContext.get().extra || {}),
                evals_bridge_open: true,
                eval_harness_command_id: 'eval-quick',
                run_intent: 'eval_suite',
                eval_suite_scope: 'all',
                triggered_from: 'mission-run-all-evals',
              },
            });
            setRoute('evals');
          }}><I2.Bolt size={14}/>Run all evals</button>
        </>}
      />

      {/* Attention banner — derived from live state; hidden while snoozed
          OR when no agent is currently paused. */}
      {attentionItem && !isAttentionSnoozed ? (
        <div
          className="card card--violet attention-banner"
          data-testid="attention-banner"
          data-attention-banner-id={ATTENTION_BANNER_ID}
        >
          <span className="dot dot--critical attention-banner__dot"/>
          <div className="attention-banner__copy">
            <div className="attention-banner__title">
              {attentionItem.agentId} paused on {attentionItem.companyName || 'unknown'} call
              {attentionItem.callOutcome ? ` · ${attentionItem.callOutcome}` : ''}
              {attentionItem.callDeflections > 0 ? ` (${attentionItem.callDeflections} deflection${attentionItem.callDeflections === 1 ? '' : 's'})` : ''}
            </div>
            <div className="attention-banner__meta">
              Awaiting human review
              {attentionItem.callId ? ` · ${attentionItem.callId}` : ''}
              {attentionItem.proposalAmount ? ` · ${attentionItem.proposalAmount} proposal at risk` : ''}
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
          className="card attention-banner attention-banner--snoozed"
          data-testid="attention-snoozed"
        >
          <span className="dot dot--idle attention-banner__dot"/>
          <div className="attention-banner__copy">
            <strong>Attention snoozed</strong> · {attentionItem.agentId} / {attentionItem.companyName || 'unknown'} · resumes at <span className="mono" data-testid="attention-snoozed-until">{new Date(snoozeExpiry).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
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
          Counts are scaled by a per-range multiplier; ratios stay flat. */}
      {(() => null)()}
      {/* Pipeline tile derives its value from each active company's
          dealSize rather than a frozen literal '$8.42M' — see Stat below. */}
      <div className="stats" data-testid="mission-stats" data-range={range} style={{marginBottom:18}}>
        <Stat
          label="Pipeline"
          value={(() => {
            const isActive = D.isActivePipelineCompany || (c => !['closed','lost'].includes(c.stage));
            const totalK = (D.companies || [])
              .filter(isActive)
              .reduce((sum, c) => sum + pageProposalAmountToThousands(c.dealSize), 0);
            return totalK > 0 ? pageFormatProposalTotal(totalK) : stats.pipeline;
          })()}
          delta={stats.pipelineDelta}
          spark={sparks.pipeline}
          sparkLabels={buildSparkLabels(sparks.pipeline, 'day')}
          accent
        />
        <Stat
          label={`Calls · ${range === 'today' ? 'today' : range === 'week' ? '7d' : '30d'}`}
          value={(() => {
            // Today's count derives from the live D.calls "when" strings —
            // any call not stamped with 'd' or 'w' suffix happened within
            // the last 24h. The frozen 47 literal claimed today-volume that
            // didn't match the visible call list (which was 6 sub-day calls).
            const callList = (D.calls || []);
            const todayCount = callList.filter(c => !/\b\d+\s*[dw]\b/i.test(String(c.when || ''))).length;
            const baseToday = todayCount > 0 ? todayCount : stats.callsToday;
            if (range === 'today') return baseToday;
            if (range === 'week') return Math.round(baseToday * 7);
            return Math.round(baseToday * 30);
          })()}
          delta={stats.callsTodayDelta}
          spark={sparks.calls}
          sparkLabels={buildSparkLabels(sparks.calls, range === 'today' ? 'hour' : 'day')}
          sparkColor="var(--violet-500)"
        />
        <Stat label={`Qualified · ${range === 'today' ? 'today' : range === 'week' ? '7d' : '30d'}`}
              value={range === 'today' ? Math.round(stats.qualifiedThisWeek / 7) : range === 'week' ? stats.qualifiedThisWeek : Math.round(stats.qualifiedThisWeek * (30 / 7))}
              delta={stats.qualifiedThisWeekDelta}
              tone="healthy"
              spark={sparks.qualified}
              sparkLabels={buildSparkLabels(sparks.qualified, 'opportunity')}
              sparkColor="var(--healthy)" />
        <Stat
          label="Avg call score"
          value={(() => {
            // Average across the live calls fixture rather than the frozen
            // 7.6 literal — picking a different range or adding a call
            // would otherwise leave the headline score stuck.
            const callList = (D.calls || []).filter(c => Number.isFinite(Number(c.score)));
            if (callList.length === 0) return stats.avgScore.toFixed(1);
            const avg = callList.reduce((s, c) => s + Number(c.score), 0) / callList.length;
            return avg.toFixed(1);
          })()}
          delta={stats.avgScoreDelta}
          spark={sparks.score}
          sparkLabels={buildSparkLabels(sparks.score, 'score-step')}
          sparkColor="var(--healthy)"
        />
        <Stat
          label="Eval pass rate"
          value={(() => {
            // Run-weighted average of every eval suite's pass rate, instead
            // of the frozen 0.847 literal. A spike in compliance-phi runs or
            // a regression in objection-pricing should move this headline.
            const suites = (D.evalSuites || []).filter(s => Number.isFinite(Number(s.pass)) && Number.isFinite(Number(s.runs)));
            const totalRuns = suites.reduce((s, e) => s + Number(e.runs), 0);
            if (totalRuns <= 0) return `${(stats.evalPassRate*100).toFixed(1)}%`;
            const weighted = suites.reduce((s, e) => s + Number(e.pass) * Number(e.runs), 0) / totalRuns;
            return `${(weighted*100).toFixed(1)}%`;
          })()}
          delta={`+${(stats.evalPassRateDelta*100).toFixed(1)}`}
          spark={sparks.evalPass}
          sparkLabels={buildSparkLabels(sparks.evalPass, 'run')}
          sparkColor="var(--sunset-300)"
        />
      </div>

      <div className="split split--2" style={{marginBottom:18}}>
        {/* Agents column */}
        <div>
          <Card title={(() => {
            // Derive the in-flight count from the queue state + live
            // agents fixture so the card title doesn't claim more agents
            // are running than actually exist (especially when queueMode
            // is paused — claiming "agents · in flight" while the queue
            // is paused is inconsistent with the row badges below).
            const list = agents || [];
            if (queueMode === 'paused') return `agents · 0 of ${list.length} in flight`;
            const active = list.filter(a => a.status === 'active').length;
            return `agents · ${active} of ${list.length} in flight`;
          })()} action={<div className="hstack"><Badge tone={queueMode === 'active' ? 'healthy' : 'warn'}>{queueMode}</Badge><button className="btn btn--xs btn--ghost" onClick={() => {
            const ctx = window.AppContext.get();
            window.AppContext.set({ extra: { ...(ctx.extra || {}), triggered_from: 'mission-configure' } });
            setRoute('agents');
          }}>configure →</button></div>}>
            <div className="vstack" style={{gap:14}}>
              {agents.map(a => {
                const openAgent = () => {
                  const ctx = window.AppContext.get();
                  window.AppContext.set({
                    extra: {
                      ...(ctx.extra || {}),
                      selected_runtime_agent_id: a.id,
                      selected_runtime_agent_name: a.name,
                      // Hop directly to the History tab — runtime agents
                      // (Hunter / Closer / Watcher) are a different concept
                      // from the registry's ElevenLabs ConvAI agents, so
                      // the playground can't switch to them. The History
                      // tab is where their context surfaces. Without this
                      // hop, "Open Hunter" landed on Prompt and the
                      // operator saw nothing about Hunter — the click
                      // looked inert.
                      agent_admin_panel: 'history',
                      triggered_from: 'mission-agents-in-flight',
                    },
                  });
                  setRoute('agents');
                };
                // When the queue is paused, each agent row must reflect that
                // state — not show its own per-agent literal status. Otherwise
                // clicking "Pause queue" only flips the header badge while the
                // rows below keep claiming "active", which lies to the operator.
                const displayStatus = queueMode === 'paused' ? 'paused' : a.status;
                const statusTone = displayStatus === 'active' ? 'healthy' : 'warn';
                return (
                <div key={a.id}
                     className="agent-flight-row inspectable"
                     data-testid="agent-flight-row"
                     data-agent-id={a.id}
                     data-agent-status={displayStatus}
                     data-popout={`${a.name} · ${displayStatus} · ${a.currentTask}`}
                     role="button"
                     tabIndex={0}
                     aria-label={`Open ${a.name} in Agents page`}
                     onClick={openAgent}
                     onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAgent(); } }}
                     style={{display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:14, alignItems:'center', paddingBottom:14, borderBottom:'1px dashed var(--border)', cursor:'pointer'}}>
                  <div style={{width:36, height:36, borderRadius:9, background:'var(--bg-inset)', display:'grid',placeItems:'center', border:'1px solid var(--border)'}}>
                    <I2.Bot size={18}/>
                  </div>
                  <div>
                    <div style={{fontWeight:600, fontSize:14, display:'flex', alignItems:'center', gap:8}}>
                      {a.name}
                      <span className={`badge badge--${statusTone}`}>
                        <span className={`dot dot--${displayStatus === 'active' ? 'accent' : 'warn'}`} style={{width:5,height:5}}/>
                        {displayStatus}
                      </span>
                    </div>
                    <div className="mono" style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>
                      {a.role}
                    </div>
                    <div style={{fontSize:12, color:'var(--text-2)', marginTop:6}}>
                      {/* When the queue is paused, the displayed task line
                          must reflect that — "Drafting recap → kestrelbio"
                          while the queue is paused is a state lie. Prefix
                          with "Paused — last task:" so the operator sees
                          both the pause AND what was in flight when paused. */}
                      {queueMode === 'paused' ? `Paused — last task: ${a.currentTask}` : a.currentTask}
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="mono num" style={{fontSize:18, fontWeight:700}}>{a.tasks}</div>
                    <div className="eyebrow">tasks</div>
                  </div>
                  <div style={{textAlign:'right', minWidth:60}}>
                    <div className="mono num" style={{fontSize:18, fontWeight:700, color: 'var(--healthy-fg)'}}>{(a.success*100).toFixed(0)}%</div>
                    <div className="eyebrow">success</div>
                  </div>
                </div>
                );
              })}
            </div>

            <div style={{marginTop:14, display:'flex', gap:8}}>
              <button className="btn btn--ghost btn--sm" style={{flex:1}} aria-pressed={queueMode === 'active'} onClick={() => {
                setQueueMode('active');
                // Toast facts derive from the live agents fixture instead
                // of the previous hardcoded "throttled 80%" claim, which
                // referenced a throttle state that doesn't exist anywhere
                // in the code.
                const list = agents || [];
                const avgSuccess = list.length
                  ? Math.round(list.reduce((s, a) => s + (Number(a.success) || 0), 0) / list.length * 100)
                  : 0;
                window.toast('All agents resumed', {
                  sub: `${list.length} agent${list.length === 1 ? '' : 's'} active · avg success ${avgSuccess}%`,
                });
              }}><I2.Play size={12}/>Resume all</button>
              <button className="btn btn--ghost btn--sm" style={{flex:1}} aria-pressed={queueMode === 'paused'} onClick={() => {
                setQueueMode('paused');
                const list = agents || [];
                const inFlight = list.reduce((s, a) => s + (Number(a.tasks) || 0), 0);
                window.toast('Queue paused', {
                  sub: `${inFlight} in-flight task${inFlight === 1 ? '' : 's'} will finish before idle`,
                  tone: 'warn',
                });
              }}><I2.Pause size={12}/>Pause queue</button>
              <button className="btn btn--ghost btn--sm" data-testid="mission-new-agent" style={{flex:1}} onClick={() => {
                const ctx = window.AppContext.get();
                window.AppContext.set({ extra: { ...(ctx.extra || {}), triggered_from: 'mission-new-agent', new_agent_intent: true } });
                setRoute('agents');
              }}><I2.Sparkle size={12}/>New agent</button>
            </div>
          </Card>

          <div style={{marginTop:18}}>
            <Card
              title={`hot leads · top ${hotLeads.length} by score`}
              action={<button
                className="btn btn--ghost btn--xs"
                data-testid="hot-leads-see-all"
                onClick={() => setRoute('pipeline')}
              >see all {companies.length} →</button>}
            >
              <div className="vstack" style={{gap:0}}>
                {hotLeads.map(c => (
                  <div key={c.id} style={{display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:14, alignItems:'center', padding:'10px 0', borderBottom:'1px dashed var(--border)'}}>
                    <div>
                      <div style={{fontSize:13, fontWeight:600}}>{c.name}</div>
                      <div className="mono" style={{fontSize:11, color:'var(--text-3)', marginTop:1}}>{c.industry} · {c.size} ppl</div>
                    </div>
                    <Badge tone={c.intent === 'high' ? 'accent' : c.intent === 'med' ? 'warn' : 'neutral'}>{c.intent} intent</Badge>
                    <div style={{width:80}}>
                      <div className="progress"><div className={`progress__fill progress__fill--${c.score >= 80 ? 'healthy' : c.score >= 70 ? 'accent' : 'warn'}`} style={{width:`${c.score}%`}}/></div>
                      <div className="mono num" style={{fontSize:10, color:'var(--text-3)', textAlign:'right', marginTop:2}}>{c.score}/100</div>
                    </div>
                    <button className="btn btn--ghost btn--icon" aria-label={`Open ${c.name} in pipeline`} onClick={()=>setRoute('pipeline')}><I2.ArrowRight size={12}/></button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Console column */}
        <div className="vstack" style={{gap:18}}>
          <ConsolePanel lines={null} title="live · agent.feed" data-testid="mc-feed-panel" />

          <Card title="next 24h · scheduled" data-testid="mc-schedule">
            <div className="timeline" data-testid="mc-schedule-list">
              {(() => {
                // Derive the 24h schedule from real companies' nextStep
                // fields instead of a hardcoded JSX list. The hardcoded
                // version named agent-01/02 + leads (Helix, Banyan,
                // Kestrel) that didn't always exist in the live tree;
                // worse, "in 12m" never ticked down. Now we walk the
                // actual companies with near-term next-steps and take
                // the first five — the first is rendered active so the
                // bullet styling still has a "now" anchor.
                const NEAR_TERM = /(^|\s)(today|tomorrow|tmrw|tonight|in\s+\d+|\d{1,2}:\d{2}|mon|tue|wed|thu|fri|sat|sun|now)/i;
                const candidates = (companies || [])
                  .filter(c => c?.nextStep && c?.nextStepWhen && c.nextStepWhen !== '-' && NEAR_TERM.test(c.nextStepWhen))
                  .slice(0, 5);
                if (candidates.length === 0) {
                  return (
                    <div className="dim mono" data-testid="mc-schedule-empty" style={{fontSize:11, padding:'12px 6px', textAlign:'center'}}>
                      No near-term next-steps queued.
                    </div>
                  );
                }
                return candidates.map((c, i) => (
                  <div
                    key={c.id}
                    className={`tl-step ${i === 0 ? 'tl-step--active' : ''}`}
                    data-testid="mc-schedule-step"
                    data-company-id={c.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${c.name} in pipeline`}
                    onClick={() => {
                      window.AppContext.set({
                        selection: { type: 'lead', id: c.id },
                        extra: {
                          ...(window.AppContext.get().extra || {}),
                          triggered_from: 'mission-schedule',
                        },
                      });
                      setRoute('pipeline');
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
                      <div className="tl-step__title">{c.nextStep} · {c.name}</div>
                      <div className="tl-step__sub">{c.nextStepWhen} · {c.owner}</div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </Card>

          <Card title={(() => {
            // Card title carries the live regression count so the operator
            // can see at a glance whether the watch list is full or empty
            // without having to scan the rows below.
            const count = (evalSuites || [])
              .filter(D.isEvalRegressing || (s => s.delta < 0 || s.pass < 0.75)).length;
            return `evals · regressions watch · ${count}`;
          })()} data-testid="mc-regressions-card">
            <div className="vstack" style={{gap:10}} data-testid="mc-regressions-list">
              {(() => {
                // Real regressions only — `slice(0,4)` was just taking
                // the first four suites in fixture order regardless of
                // status. A 99% suite could occupy a "regression" slot
                // while a -10% one sat below. Now we filter for
                // suites that are actually regressing (delta < 0 or
                // pass < 0.75), sort by severity, and cap at four.
                const score = (s) => {
                  const deltaPart = (s.delta ?? 0) < 0 ? (s.delta ?? 0) : 0;
                  const passPart = (s.pass ?? 1) < 0.75 ? (s.pass - 1) : 0;
                  return deltaPart + passPart * 0.5;
                };
                const regressions = (evalSuites || [])
                  .filter(D.isEvalRegressing || (s => s.delta < 0 || s.pass < 0.75))
                  .slice()
                  .sort((a, b) => score(a) - score(b))
                  .slice(0, 4);
                if (regressions.length === 0) {
                  return (
                    <div data-testid="mc-regressions-empty" className="muted" style={{padding:'10px 6px', fontSize:12, textAlign:'center'}}>
                      No regressions tracked · all suites stable.
                    </div>
                  );
                }
                return regressions.map(s => (
                  <div key={s.id}
                       className="inspectable eval-watch-row"
                       data-testid="mc-regression-row"
                       data-suite-id={s.id}
                       data-popout={`${s.name}: ${(s.pass * 100).toFixed(1)}% pass rate, ${s.runs.toLocaleString()} runs, owner ${s.owner}`}
                       role="button"
                       tabIndex={0}
                       aria-label={`Open ${s.name} regression in Evals`}
                       onClick={() => {
                         window.AppContext.set({
                           selection: { type: 'eval', id: s.id },
                           extra: {
                             ...(window.AppContext.get().extra || {}),
                             triggered_from: 'mission-regressions-watch',
                             suite_filter: 'regressions',
                           },
                         });
                         setRoute('evals');
                       }}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter' || e.key === ' ') {
                           e.preventDefault();
                           e.currentTarget.click();
                         }
                       }}
                       style={{display:'grid', gridTemplateColumns:'1fr auto 60px', gap:10, alignItems:'center', cursor:'pointer'}}>
                    <div>
                      <div style={{fontSize:12, fontWeight:600}}>{s.name}</div>
                      <div className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{s.runs.toLocaleString()} runs · {s.latest}</div>
                    </div>
                    <div className="mono num" style={{fontSize:13, fontWeight:700, color: s.pass >= 0.85 ? 'var(--healthy)' : s.pass >= 0.75 ? 'var(--sunset-300)' : 'var(--violet-500)'}}>
                      {(s.pass*100).toFixed(1)}%
                    </div>
                    <div className={`mono num ${s.delta > 0 ? 'cl-ok' : s.delta < 0 ? 'cl-err' : 'dim'}`} style={{fontSize:11, textAlign:'right'}}>
                      {s.delta > 0 ? '▲' : s.delta < 0 ? '▼' : '·'} {(Math.abs(s.delta)*100).toFixed(1)}
                    </div>
                  </div>
                ));
              })()}
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
      const { pipeline_panel, pipeline_filter, ...rest } = latest;
      window.AppContext.set({ extra: rest });
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

  return (
    <div className="page">
      <PageHeader
        title="Pipeline"
        sub={(() => {
          // Derive from live state. The previous "Cards re-score on every
          // signal" promise referenced a re-scoring loop that doesn't
          // exist in the demo — scores in the fixture are static.
          const all = allCompanies || D.companies || [];
          const isActive = D.isActivePipelineCompany || (c => !['closed','lost'].includes(c.stage));
          const active = all.filter(isActive).length;
          const high = all.filter(c => c.intent === 'high' && isActive(c)).length;
          const drafts = all.filter(c => c._draft).length;
          const draftSuffix = drafts > 0 ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : '';
          return `${all.length} leads · ${active} active · ${high} high-intent${draftSuffix}. Drag a card across stage columns to advance the deal.`;
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

      {(filterEditorOpen || newLeadOpen) && (
        <div className="workflow-popout" role="region" aria-label="Pipeline workflow panel">
          <button className="workflow-popout__close btn btn--ghost btn--icon" aria-label="Close pipeline workflow panel" onClick={() => { setFilterEditorOpen(false); setNewLeadOpen(false); }}><I2.Close size={14}/></button>
          {filterEditorOpen && (
            <div className="workflow-popout__pane">
              <div className="eyebrow eyebrow--accent">saved views</div>
              <div className="workflow-popout__title">Pipeline filters</div>
              <div className="workflow-popout__grid" data-testid="pipeline-filters-grid">
                {(() => {
                  const isActive = D.isActivePipelineCompany || (c => !['closed','lost'].includes(c.stage));
                  const total = (D.companies || []).length;
                  const activeCount = (D.companies || []).filter(isActive).length;
                  const archivedCount = total - activeCount;
                  const mineCount = (D.companies || []).filter(c => c.owner === 'agent-01').length;
                  const highCount = (D.companies || []).filter(c => c.intent === 'high').length;
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

      {view === 'kanban' && <PipelineKanban companies={filtered} stages={D.stages} onSelect={setSelected} selected={selected} effectiveStage={effectiveStage} onDropToStage={onDropToStage}/>}
      {view === 'table' && <PipelineTable companies={filtered} onSelect={setSelected} selected={selected}/>}

      {selected && <LeadDetail company={D.companies.find(c=>c.id===selected)} onClose={()=>setSelected(null)} setRoute={setRoute}/>}
      {selected && <IntakeAgentPanel company={D.companies.find(c=>c.id===selected)} />}
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
        const sum = cards.reduce((acc, c) => {
          const n = parseFloat(c.dealSize.replace(/[^\d.]/g, ''));
          return acc + n;
        }, 0);
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
              <div className="pipe__col-cnt">{cards.length} · ${sum}K</div>
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
                    <span className="mono num" style={{fontSize:11, color:'var(--text-3)'}}>{c.score}</span>
                  </div>
                  <div className="pipe__card-pain">{c.pain}</div>
                  <div className="pipe__card-meta">
                    <span>{c.dealSize} · {c.region.split(',')[0]}</span>
                    <span style={{display:'flex', alignItems:'center', gap:4}}>
                      <span className={`dot dot--${c.intent === 'high' ? 'accent' : c.intent === 'med' ? 'warn' : 'idle'}`} style={{width:5,height:5}}/>
                      {c.lastTouch}
                    </span>
                  </div>
                </div>
              ))}
              {cards.length === 0 && <div className="dim mono" style={{fontSize:11, padding:'14px 6px', textAlign:'center'}}>— empty —</div>}
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
  const parseDeal = (s) => {
    const n = parseFloat(String(s || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
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
        source: href,
      });
      setArtifactState('error');
    }
  };
  const copyArtifactPath = async (artifact) => {
    if (!artifact?.path) return;
    try {
      await navigator.clipboard?.writeText?.(artifact.path);
      window.toast('Artifact path copied', { sub: artifact.path, tone:'accent' });
    } catch (_) {
      window.toast('Artifact path', { sub: artifact.path, tone:'accent' });
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
    <div role="dialog" aria-label={`Lead detail · ${c.name}`}
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
                <p>Repo path: <code className="mono">{artifactPanel.path}</code></p>
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
                  <code>{a.path}</code>
                  <Badge tone={artifactPreviewHref(a) ? 'accent' : 'neutral'}>{artifactPreviewHref(a) ? 'preview' : 'record'}</Badge>
                </button>
              ))}
            </div>

            <div className="lead-artifact-preview">
              {artifactState === 'loading' && <div className="lead-artifact-empty">Loading source evidence...</div>}
              {artifactState === 'summary' && (
                <div className="lead-artifact-empty">
                  <strong>{artifactTypeLabel(artifactPanel.type)} path recorded</strong>
                  <span>This run exposes the artifact path but does not ship a public fixture for inline preview.</span>
                </div>
              )}
              {(artifactState === 'ready' || artifactState === 'error') && (
                <pre className="mono">{JSON.stringify(artifactPayload || {}, null, 2)}</pre>
              )}
            </div>

            <div className="lead-artifact-actions">
              <button className="btn btn--ghost btn--sm" onClick={() => copyArtifactPath(artifactPanel)}><I2.Doc size={12}/>Copy repo path</button>
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
  const [open, setOpen] = useState(true);
  const widget = reg.widget || {};
  return (
    <div style={{position:'fixed', right:454, top:74, bottom:18, width:380, background:'var(--bg-elev)', border:'1px solid var(--border-strong)', borderRadius:'var(--r-lg)', boxShadow:'var(--shadow-lg)', zIndex:49, display:'flex', flexDirection:'column', overflow:'hidden'}} role="region" aria-label="Intake agent panel">
      <div style={{padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10}}>
        <window.ElevenUI.Orb
          size={28}
          state="idle"
          color1={reg.avatar_color_1}
          color2={reg.avatar_color_2}
          label={`${reg.display_name} intake state`}
        />
        <div style={{flex:1}}>
          <div style={{fontSize:13, fontWeight:700}}>{reg.display_name}</div>
          <div className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{reg.role} · loaded with {company?.name || 'no lead'}</div>
        </div>
        <button className="btn btn--ghost btn--xs" onClick={()=>setOpen(o=>!o)} aria-expanded={open}>
          {open ? 'Collapse' : widget.actionText || 'Talk to Sarah'}
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
          <strong>Sarah is embedded here, not redirected.</strong> Expand the official ElevenLabs widget to qualify {company?.name || 'the selected lead'}, capture urgency, and prepare SMS/email handoff fields.
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
  const [coachingMode, setCoachingMode] = useState(false);
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
  const openProposalV3 = () => {
    // Carry the active call's context into Generate so the
    // context handoff is truly actionable: click "Generate proposal v3"
    // should move directly into the sequence with a pre-filled brief.
    const ctx = window.AppContext.get();
    window.AppContext.set({
      extra: {
        ...(ctx.extra || {}),
        triggered_from: 'call-generate-proposal-v3',
        proposal_v3_call_id: active.id,
        proposal_v3_call_co: active.co,
        proposal_v3_call_who: active.who,
        proposal_v3_call_outcome: active.outcome,
        proposal_v3_call_score: active.score,
        proposal_v3_call_duration: active.duration,
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
  const visibleCalls = callWindow === 'flagged' ? D.calls.filter(c => c.flags > 0) : D.calls;

  // Publish active call to AppContext for the sales coach.
  useEffect(() => {
    window.AppContext.set({ selection: { type:'call', id: activeId }});
    return () => { window.AppContext.set({ selection: null }); };
  }, [activeId]);
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
      if (intent === 'security-review') {
        return {
          kind: 'calendar hold',
          title: `Security review for ${call?.co || 'selected call'}`,
          sub: '30-minute hold with buyer, security reviewer, and operator owner.',
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
      const { call_workflow, call_window, ...rest } = extra;
      window.AppContext.set({ extra: rest });
    };
    applyCallIntent(window.AppContext.get());
    return window.AppContext.subscribe(applyCallIntent);
  }, [activeId]);

  return (
    <div className="calls-page page page--wide">
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
          return `${total} call${total === 1 ? '' : 's'} on file · 1 scored on the ${scoredAxisCount}-axis rubric (CALL-2419) · ${flagged} flagged. Flip Coaching mode to attach notes to any line.`;
        })()}
        actions={<>
          <button className="btn btn--ghost btn--sm" aria-pressed={callWindow === 'flagged'} onClick={() => setCallWindow(v => v === 'flagged' ? 'all' : 'flagged')}><I2.Filter size={12}/>{callWindow === 'flagged' ? 'All calls' : 'Flagged'}</button>
          <button className="btn btn--ghost btn--sm" aria-pressed={coachingMode} onClick={() => setCoachingMode(v => !v)}><I2.Mic size={12}/>{coachingMode ? 'Coaching on' : 'Coaching mode'}</button>
        </>}
      />

      {(coachingMode || callWorkflow) && (
        <div className="workflow-popout" role="region" aria-label="Call workflow panel">
          <button className="workflow-popout__close btn btn--ghost btn--icon" aria-label="Close call workflow panel" onClick={() => { setCoachingMode(false); setCallWorkflow(null); }}><I2.Close size={14}/></button>
          {coachingMode && (
            <div className="workflow-popout__pane">
              <div className="eyebrow eyebrow--accent">coaching mode</div>
              <div className="workflow-popout__title">{active.id} notes armed</div>
              <div className="muted" style={{fontSize:12}}>Transcript rows now create coaching notes against {active.co}. Flagged lines are prioritized for the sales coach context.</div>
            </div>
          )}
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
                  <span>{active.deflections} deflection{active.deflections === 1 ? '' : 's'} · transcript already filtered to flagged calls</span>
                </div>
              </div>
              <div className="hstack" style={{gap:8, flexWrap:'wrap', justifyContent:'flex-end', marginTop:12}}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={openProcurementRecap}><I2.Mail size={12}/>{sentRecaps[active.id] ? 'Re-draft recap' : 'Draft recap'}</button>
                <button type="button" className="btn btn--ghost btn--sm" data-testid="call-booking-open" onClick={openBookingDraft}><I2.Calendar size={12}/>{bookedReviews[active.id] ? 'Re-hold review' : 'Hold review'}</button>
                <button type="button" className="btn btn--primary btn--sm" onClick={openProposalV3}><I2.Doc size={12}/>Generate proposal v3</button>
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
        <Card title={`recent · ${visibleCalls.length} ${callWindow === 'flagged' ? 'flagged' : 'sorted by recency'}`} className="card--accent calls-grid__list" >
          <div className="vstack" style={{gap:6}}>
            {visibleCalls.length === 0 && (
              <div className="muted" data-testid="calls-list-empty" style={{padding:'18px 8px', fontSize:12, textAlign:'center'}}>
                {callWindow === 'flagged'
                  ? 'No flagged calls right now. Toggle Flagged off to see all calls.'
                  : 'No calls on file yet.'}
              </div>
            )}
            {visibleCalls.map(c => (
              <div key={c.id}
                   role="button"
                   tabIndex={0}
                   aria-pressed={activeId === c.id}
                   onClick={()=>setActiveId(c.id)}
                   onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveId(c.id); } }}
                   style={{padding:10, borderRadius:8, cursor:'pointer', border:'1px solid', borderColor: activeId === c.id ? 'var(--sunset-500)' : 'transparent', background: activeId === c.id ? 'var(--bg-selected)' : 'transparent'}}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                  <span className="mono" style={{fontSize:11, color:'var(--accent-fg)', fontWeight:600}}>{c.id}</span>
                  <span className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{c.when}</span>
                </div>
                <div style={{fontSize:13, fontWeight:600, marginBottom:2}}>{c.co}</div>
                <div className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{c.who}</div>
                <div style={{display:'flex', gap:6, marginTop:6, alignItems:'center'}}>
                  <Badge tone={c.score >= 8 ? 'healthy' : c.score >= 7 ? 'accent' : c.score >= 5 ? 'warn' : 'critical'}>
                    {c.score.toFixed(1)}
                  </Badge>
                  <span className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{c.duration}</span>
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
                  <div style={{display:'flex', gap:6, alignItems:'center'}}>
                    <span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{active.duration}</span>
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
              className="trans calls-grid__trans-scroll"
              data-testid="trans-empty"
              aria-label="Call transcript unavailable"
              style={{padding:'24px 16px', display:'flex', alignItems:'center', justifyContent:'center'}}
            >
              <div className="muted" style={{fontSize:13, textAlign:'center', maxWidth:380}}>
                <strong>{active.id}</strong> has no transcript on file yet.<br/>
                <span className="mono" style={{fontSize:11}}>
                  Pick {active.co !== 'Banyan Health' ? <code>CALL-2419 · Banyan Health</code> : 'another call'} from the list to walk a transcript, or wait for the live ConvAI session to capture one.
                </span>
              </div>
            </div>
          )}
          {active.id === 'CALL-2419' && <div className="trans calls-grid__trans-scroll" aria-label="Call transcript">
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
                      <span className="trans__note-marker" aria-hidden="true" title={`Note: ${savedNote.note}`}>📝</span>
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
          <Card title={`scorecard · ${active.id === 'CALL-2419' ? `${D.callScores.length} axes` : 'overall only'}`} accent="accent">
            <div style={{textAlign:'center', marginBottom:14, paddingBottom:14, borderBottom:'1px solid var(--border)'}}>
              <div className="eyebrow">overall</div>
              <div
                style={{fontFamily:'var(--font-display)', fontSize:48, fontWeight:800, color: 'var(--healthy-fg)', lineHeight:1}}
                data-testid="scorecard-overall"
              >
                {active.score.toFixed(1)}
              </div>
              <div className="mono" style={{fontSize:10, color:'var(--text-3)'}} data-testid="scorecard-team-avg">
                vs team avg {(() => {
                  const scored = D.calls.filter(c => Number.isFinite(Number(c.score)));
                  if (scored.length === 0) return '--';
                  return (scored.reduce((s, c) => s + Number(c.score), 0) / scored.length).toFixed(1);
                })()}
              </div>
            </div>
            {/* The 7 axes in D.callScores are scored against the Banyan
                transcript (CALL-2419). For every other call we don't have
                axis-level scoring on file — rendering Banyan's axes under
                a different call's overall score would lie about what each
                axis actually measured. The team-avg + per-call overall
                above stay derived; only the axis breakdown is gated. */}
            {active.id === 'CALL-2419' ? D.callScores.map(s => (
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

          <Card title="signals" >
            <div className="vstack" style={{gap:6, fontSize:12}}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
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
              <div style={{display:'flex',justifyContent:'space-between'}}>
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
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span className="muted">Deflections</span>
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
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span className="muted">Outcome</span>
                {(() => {
                  // Tone derives from the outcome string. Hardcoding
                  // tone="accent" rendered "no-fit" and "pricing-objection"
                  // in healthy/orange colors — same green-everything bug
                  // as the sentiment fix above.
                  const o = String(active.outcome || '').toLowerCase();
                  const tone =
                    /booked|qualified|approved|technical-deep-dive/.test(o) ? 'healthy' :
                    /follow-up|discovery|recap/.test(o) ? 'accent' :
                    /objection|pricing|stalled/.test(o) ? 'warn' :
                    /no-fit|lost|cancel|declined/.test(o) ? 'critical' :
                    'neutral';
                  return (
                    <span data-testid="signal-outcome" data-outcome-tone={tone}>
                      <Badge tone={tone}>{active.outcome}</Badge>
                    </span>
                  );
                })()}
              </div>
            </div>
          </Card>

          <Card title="suggested next">
            <div className="vstack" style={{gap:8}}>
              <button
                className="btn btn--primary btn--sm"
                data-testid="call-procurement-recap-open"
                style={{width:'100%', justifyContent:'flex-start'}}
                onClick={openProcurementRecap}
              ><I2.Mail size={12}/>Send recap to procurement</button>
              <button
                className="btn btn--sm"
                data-testid="call-book-security-review"
                style={{width:'100%', justifyContent:'flex-start'}}
                onClick={openBookingDraft}
              ><I2.Calendar size={12}/>Book security review</button>
              <button
                className="btn btn--ghost btn--sm"
                data-testid="call-generate-proposal-v3"
                style={{width:'100%', justifyContent:'flex-start'}}
                onClick={openProposalV3}
              ><I2.Doc size={12}/>Generate proposal v3</button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HomePage, PipelinePage, CallsPage });
