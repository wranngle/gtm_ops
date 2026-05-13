/* ============================================================
   Pages: Evals, Proposals, Settings
   ============================================================ */

const I3 = globalThis.Icon;

function page2OmitKeys(source, keys) {
  const blocked = new Set(keys);
  const next = {};
  Object.keys(source || {}).forEach(key => {
    if (!blocked.has(key)) next[key] = source[key];
  });
  return next;
}

/* ------------------------------------------------------------ */
/* EVALS */
/* ------------------------------------------------------------ */
const EVAL_AGENT_BY_DEMO_ID = {
  agent_xxxx_demo: 'sales_coach',
  agent_yyyy_demo: 'intake',
};

function evalPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return `${Math.round(Number(value) * 100)}%`;
}

function evalScoreTone(score) {
  if (score == null) return 'neutral';
  if (score >= 0.82) return 'healthy';
  if (score >= 0.65) return 'warn';
  return 'critical';
}

function evalAggregateTone(score) {
  if (score == null) return 'neutral';
  if (score >= 0.82) return 'healthy';
  return 'warn';
}

function evalSuiteWeightedPassRate(suites) {
  const rows = Array.isArray(suites) ? suites : [];
  const totalRuns = rows.reduce((sum, suite) => sum + (Number(suite.runs) || 0), 0);
  if (!totalRuns) return null;
  return rows.reduce((sum, suite) => {
    const runs = Number(suite.runs) || 0;
    const pass = Number(suite.pass);
    return sum + (Number.isFinite(pass) ? pass * runs : 0);
  }, 0) / totalRuns;
}

function evalDate(value) {
  if (!value) return '--';
  try { return new Date(value).toLocaleString(); }
  catch (_) { return value; }
}

function evalDuration(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function evalScenarioTitle(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Selected scenario';
  const spaced = raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!spaced) return raw;
  const smallWords = new Set(['a', 'an', 'and', 'as', 'at', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
  return spaced.split(' ').map((word, index) => {
    if (/^[A-Z0-9]+$/.test(word) && /[A-Z]/.test(word)) return word;
    const lower = word.toLowerCase();
    if (index > 0 && smallWords.has(lower)) return lower;
    return lower.replace(/(^|\/)([a-z])/g, (_, prefix, char) => `${prefix}${char.toUpperCase()}`);
  }).join(' ');
}

function evalReviewContextLabel(run, suite) {
  if (run?.scenario_id) {
    return `${evalScenarioTitle(run.scenario_id)} · ${run.prompt_tag || 'prompt/latest'}`;
  }
  return suite?.name || suite?.id || 'Selected eval context';
}

function evalArtifactReviewLocator(run) {
  const scenario = String(run?.scenario_id || run?.id || 'selected-run')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'selected-run';
  return `local-review://eval-runs/${scenario}/result.json`;
}

/* The bridge to voice_ai_agent_evals is sourced live from
   /api/eval-harness-manifest, which serves the root
   eval-harness.manifest.json (also read by voice_ai_agent_evals
   itself). The UI is a presenter — it does not fabricate commands. */
function formatHarnessTags(cmd) {
  const tags = Array.isArray(cmd?.tags) ? cmd.tags : [];
  return tags.join(' · ');
}
function formatHarnessTimeout(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

const INTEGRATION_CONNECTIONS = [
  {
    name:'Salesforce',
    status:'connected',
    sub:'helix.my.salesforce.com · OAuth · 4d ago',
    icon:'SF',
    what:'CRM system of record for accounts, opportunities, contacts, and proposal outcomes.',
    canDo:['Create/update leads from Sarah intake', 'Sync opportunity stage and proposal links', 'Write eval risk flags to account notes'],
    scopes:['read/write accounts', 'read/write opportunities', 'read contacts'],
    sync:'15 min pull, immediate webhook writeback',
    automations:'Hot lead -> opportunity task; signed proposal -> closed-won draft.',
  },
  {
    name:'Gong',
    status:'connected',
    sub:'streaming · 47 calls · 24h',
    icon:'G',
    what:'Call transcript and coaching evidence source for proposals, evals, and sales-coach context.',
    canDo:['Import call transcripts and speakers', 'Attach scored snippets to eval runs', 'Feed objections into Sales Coach drills'],
    scopes:['read calls', 'read transcripts', 'read participants'],
    sync:'near-real-time transcript polling',
    automations:'Flag pricing/security objections, then queue a coach review.',
  },
  {
    name:'Slack',
    status:'connected',
    sub:'#gtm-ops · 14 channels watched',
    icon:'#',
    what:'Operator alerts for run failures, hot leads, and approvals that need attention.',
    canDo:['Send eval regression alerts', 'Post proposal-ready approvals', 'Listen for slash-command run triggers'],
    scopes:['post messages', 'read configured channels', 'slash commands'],
    sync:'event subscription + retry queue',
    automations:'Critical eval -> #gtm-ops with one-click console deeplink.',
  },
  {
    name:'Outreach',
    status:'syncing',
    sub:'sequence sync paused · 502 retry 3/5',
    icon:'O',
    what:'Outbound sequence platform for multi-thread follow-up after calls and proposal sends.',
    canDo:['Push contacts into a sequence', 'Pause sequences after booked calls', 'Write reply/meeting signals back to pipeline'],
    scopes:['read/write prospects', 'read/write sequences', 'webhooks'],
    sync:'retrying writes with exponential backoff',
    automations:'Proposal sent -> executive sponsor + operator follow-up sequence.',
  },
  {
    name:'HubSpot',
    status:'disabled',
    sub:'available · click to connect',
    icon:'H',
    what:'Alternative CRM for service businesses that do not run Salesforce.',
    canDo:['Create contacts and deals', 'Sync form submissions', 'Attach branded proposal URLs'],
    scopes:['crm.objects.contacts.write', 'crm.objects.deals.write', 'forms.read'],
    sync:'OAuth required',
    automations:'Website lead -> deal -> Sarah intake task.',
  },
  {
    name:'Snowflake',
    status:'connected',
    sub:'warehouse: HELIX_GTM · read+write · ANALYST role',
    icon:'DB',
    what:'Analytics warehouse for immutable run history, eval aggregates, and finance reporting.',
    canDo:['Export eval runs and audit chain', 'Materialize pipeline health dashboards', 'Backfill proposal economics'],
    scopes:['read/write GTM schema', 'warehouse ANALYST role'],
    sync:'nightly export + on-demand backfill',
    automations:'Daily model-risk rollup and stale lead cohort export.',
  },
  {
    name:'Clay',
    status:'available',
    sub:'enrichment tables · waterfall data · API ready',
    icon:'CL',
    what:'Data enrichment and list-building workbench for ICP expansion and account research.',
    canDo:['Enrich inbound leads with firmographics', 'Waterfall emails, domains, employee counts, and tech stack', 'Push scored accounts back into Pipeline'],
    scopes:['read/write workbooks', 'enrichment API', 'webhooks'],
    sync:'manual configure, then webhook per table',
    automations:'New lead -> Clay enrichment -> score update -> proposal prerequisites.',
  },
  {
    name:'Krisp',
    status:'available',
    sub:'noise cancellation + meeting notes · needs token',
    icon:'KR',
    what:'Audio cleanup and meeting summary source for cleaner transcripts before coaching/evals.',
    canDo:['Ingest post-call summaries', 'Tag noisy or low-confidence transcript spans', 'Improve call-quality evidence in eval reports'],
    scopes:['read meeting notes', 'read recording metadata'],
    sync:'API token pending',
    automations:'Low-quality transcript -> Krisp note lookup -> attach cleaner summary.',
  },
  {
    name:'ElevenLabs',
    status:'connected',
    sub:'Sales Coach + Sarah agents · ConvAI widgets embedded',
    icon:'EL',
    what:'Conversational AI voice/chat runtime for Sarah intake and the Sales Coach copilot.',
    canDo:['Embed official ConvAI widgets in-console', 'Inject active route/deal/eval context as dynamic variables', 'Expose local prompt, tools, context, and safety admin controls'],
    scopes:['public agent embed IDs', 'dynamic variables', 'client tools'],
    sync:'widget runtime loaded from official embed package',
    automations:'Agent asks to navigate -> openConsoleRoute; agent confirms action -> showToast.',
  },
];

const ELEVENLABS_AGENTS_DASHBOARD_URL = 'https://elevenlabs.io/app/agents';

function parseEvalJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); }
  catch (_) { return fallback; }
}

function normalizeEvalRun(raw) {
  const scorePayload = raw.score || parseEvalJson(raw.scores_json, null) || {};
  const weighted = typeof scorePayload.weighted === 'number'
    ? scorePayload.weighted
    : typeof raw.aggregate_score === 'number'
      ? raw.aggregate_score
      : typeof scorePayload.aggregate_score === 'number'
        ? scorePayload.aggregate_score
        : null;
  const objectAxes = !Array.isArray(scorePayload.axes) && scorePayload && typeof scorePayload === 'object'
    ? Object.entries(scorePayload)
      .filter(([name, value]) => name !== 'aggregate_score' && typeof value === 'number')
      .map(([name, value]) => ({
        name,
        pass: value >= 0.72,
        weight: 1,
        detail: `scalar score ${evalPct(value)}`,
      }))
    : [];
  const axes = Array.isArray(scorePayload.axes) ? scorePayload.axes : objectAxes;
  const flaws = raw.flaws || parseEvalJson(raw.flaws_json || raw.flaws_detected, []) || [];
  const statusVerdict = String(raw.verdict || raw.status || '').toLowerCase();
  const verdict = statusVerdict === 'fail' || statusVerdict === 'failed'
    ? 'fail'
    : statusVerdict === 'pass' || statusVerdict === 'passed' || statusVerdict === 'completed'
      ? 'pass'
      : weighted != null && weighted < 0.7
        ? 'fail'
        : weighted == null
          ? 'unknown'
          : 'pass';
  // Preserve voice_ai_agent_evals run-result fields the previous
  // normalizer dropped: per-tool round trips + schema-pass flags, plus
  // the latency_breakdown_ms sample arrays the harness produces for
  // ttfb / end-to-first-audio / total-turn. Lets the EvalsPage surface
  // tool-call latency aggregation + the live TTFB / first-audio split
  // that the punch-list called out as missing.
  const latencyBreakdown = raw.latency_breakdown_ms && typeof raw.latency_breakdown_ms === 'object'
    ? {
      ttfb: Array.isArray(raw.latency_breakdown_ms.ttfb) ? raw.latency_breakdown_ms.ttfb.map(Number).filter(Number.isFinite) : [],
      end_to_first_audio: Array.isArray(raw.latency_breakdown_ms.end_to_first_audio) ? raw.latency_breakdown_ms.end_to_first_audio.map(Number).filter(Number.isFinite) : [],
      total_turn: Array.isArray(raw.latency_breakdown_ms.total_turn) ? raw.latency_breakdown_ms.total_turn.map(Number).filter(Number.isFinite) : [],
    }
    : null;
  const toolCalls = Array.isArray(raw.tool_calls)
    ? raw.tool_calls.map(tc => ({
      name: String(tc?.name || 'unknown'),
      schema_pass: tc?.schema_pass === true,
      round_trip_ms: Number.isFinite(Number(tc?.round_trip_ms)) ? Number(tc.round_trip_ms) : null,
      response_consumed_in_next_turn: tc?.response_consumed_in_next_turn === true,
    }))
    : [];
  return {
    id: raw.id || raw.scenario_id || raw.case_study_id,
    scenario_id: raw.scenario_id || raw.case_study_id || `run-${raw.id || 'unknown'}`,
    agent_id: raw.agent_id || 'agent_from_eval_db',
    prompt_tag: raw.prompt_tag || raw.pipeline_version || 'pipeline/latest',
    harness_version: raw.harness_version || raw.pipeline_version || 'gtm-db',
    started_at: raw.started_at || raw.created_at,
    duration_ms: raw.duration_ms,
    verdict,
    score: { weighted, axes },
    flaws,
    latency_breakdown: latencyBreakdown,
    tool_calls: toolCalls,
    result_path: raw.result_path || null,
  };
}

function evalRunsFromPayload(data) {
  const next = Array.isArray(data) ? data : (data?.runs || []);
  return [...next].sort((a, b) => {
    const ta = new Date(a.started_at || a.created_at || 0).getTime();
    const tb = new Date(b.started_at || b.created_at || 0).getTime();
    return tb - ta;
  });
}

function evalAgentKeyForRun(run, suite) {
  if (run && EVAL_AGENT_BY_DEMO_ID[run.agent_id]) return EVAL_AGENT_BY_DEMO_ID[run.agent_id];
  if (suite && /pricing|closing|recap/i.test(suite.name)) return 'sales_coach';
  if (suite && /discovery|compliance|multi-thread/i.test(suite.name)) return 'intake';
  return 'sales_coach';
}

function evalSuiteIdForRun(run, suites) {
  const rows = Array.isArray(suites) ? suites : [];
  if (!run || rows.length === 0) return null;
  const explicitId = run.suite_id || run.suiteId || run.suite || run.eval_suite_id;
  if (explicitId && rows.some(s => s.id === explicitId)) return explicitId;
  const text = [
    run.scenario_id,
    run.case_study_id,
    run.prompt_tag,
    ...(Array.isArray(run.score?.axes) ? run.score.axes.map(axis => `${axis.name || ''} ${axis.detail || ''}`) : []),
  ].join(' ').toLowerCase();
  const pick = (id) => rows.some(s => s.id === id) ? id : null;
  if (/price|pricing|knowledge.?base|kb|tier|objection|refund/.test(text)) return pick('objection-pricing');
  if (/multi.?thread|stakeholder|tool.?loop|schedule_appointment|send_confirmation/.test(text)) return pick('multithread');
  if (/phi|hipaa|compliance|scope|handoff|policy|billing dispute/.test(text)) return pick('compliance-phi');
  if (/closing|mutual action|next.?step|commit/.test(text)) return pick('closing-mutual');
  if (/recap|recall|summary/.test(text)) return pick('recap-quality');
  return pick('discovery-q1') || rows[0]?.id || null;
}

function evalRunsForSuite(runs, suite, suites) {
  if (!suite || !Array.isArray(runs)) return [];
  return runs.filter(run => evalSuiteIdForRun(run, suites) === suite.id);
}

function evalBestRunForSuite(runs, suite, suites, preferredFilter = 'all') {
  const matches = evalRunsForSuite(runs, suite, suites);
  if (matches.length === 0) return null;
  const filtered = preferredFilter === 'all' ? matches : matches.filter(run => run.verdict === preferredFilter);
  return filtered.find(run => run.verdict === 'fail') || filtered[0] || matches.find(run => run.verdict === 'fail') || matches[0];
}

// Build axis-by-axis labels for a Sparkline series (hoisted to module scope
// because EvalsPage references it before its old in-component declaration —
// `const` arrow functions are NOT hoisted, so the inline def threw a
// ReferenceError at render time and crashed the page).
function buildEvalSparkLabels(series, cadence = 'sample') {
  const points = Array.isArray(series) ? series : [];
  const total = Math.max(1, points.length);
  const unit = String(cadence || 'sample')
    .trim()
    .replace(/[-_]/g, ' ');
  return points.map((_, i) => {
    const age = total - i - 1;
    const marker = i === total - 1 ? 'latest' : `${age} ${unit}${age === 1 ? '' : 's'} ago`;
    return `${unit} · ${marker}`;
  });
}

function buildLoadedEvalPassTrend(runs) {
  const rows = (Array.isArray(runs) ? runs : [])
    .filter(run => run?.verdict === 'pass' || run?.verdict === 'fail')
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.started_at || 0).getTime();
      const tb = new Date(b.started_at || 0).getTime();
      return ta - tb;
    });
  let passed = 0;
  return rows.map((run, i) => {
    if (run.verdict === 'pass') passed += 1;
    return passed / (i + 1);
  });
}

function buildLoadedEvalPassLabels(runs) {
  const rows = (Array.isArray(runs) ? runs : [])
    .filter(run => run?.verdict === 'pass' || run?.verdict === 'fail')
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.started_at || 0).getTime();
      const tb = new Date(b.started_at || 0).getTime();
      return ta - tb;
    });
  const total = Math.max(1, rows.length);
  return rows.map((run, i) => {
    const age = total - i - 1;
    const marker = i === total - 1 ? 'latest loaded run' : `${age} loaded run${age === 1 ? '' : 's'} ago`;
    return `${run.verdict} · ${run.scenario_id || run.id || 'unnamed scenario'} · ${marker}`;
  });
}

function EvalsPage({ setRoute }) {
  const D = globalThis.GTM;
  const initialSelection = globalThis.AppContext.get().selection;
  const [activeId, setActiveId] = useState(initialSelection?.type === 'eval' ? initialSelection.id : 'discovery-q1');
  const isAdmin = (() => {
    try { return new URLSearchParams(globalThis.location.search).has('admin'); }
    catch (_) { return false; }
  })();
  const visibleEvalAgents = globalThis.AGENT_REGISTRY.agents.filter(a => isAdmin || a.surface !== 'admin-only');
  const visibleEvalAgentLabel = `${visibleEvalAgents.length} ElevenLabs agent${visibleEvalAgents.length === 1 ? '' : 's'}${isAdmin ? ' · admin' : ''}`;
  const defaultSuiteAgentKey = visibleEvalAgents[0]?.key || 'sales_coach';
  // Honor `extra.suite_filter` from the AppContext handoff (e.g.,
  // Home "regressions watch" → setRoute('evals') sets
  // suite_filter='regressions'). Without this, the click looked like it
  // routed but the filter silently stayed on 'all' and the operator
  // had to toggle it manually.
  const initialSuiteFilter = ['all', 'regressions'].includes(globalThis.AppContext.get().extra?.suite_filter)
    ? globalThis.AppContext.get().extra.suite_filter
    : 'all';
  const [suiteFilter, setSuiteFilter] = useState(initialSuiteFilter);
  const [runFilter, setRunFilter] = useState('all');
  const [runs, setRuns] = useState([]);
  const [activeRunId, setActiveRunId] = useState(null);
  const [runsState, setRunsState] = useState('loading');
  const [replaying, setReplaying] = useState(false);
  const [runDetail, setRunDetail] = useState(null);
  const [artifactPath, setArtifactPath] = useState(null);
  const [bridgeOpen, setBridgeOpen] = useState(Boolean(globalThis.AppContext.get().extra?.evals_bridge_open));
  const [activeHarnessCommandId, setActiveHarnessCommandId] = useState(null);
  const [rerunTarget, setRerunTarget] = useState(null);
  const bridgePanelRef = React.useRef(null);
  const artifactPanelRef = React.useRef(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [liveLatency, setLiveLatency] = useState(null);

  useEffect(() => {
    const handleLatency = (e) => setLiveLatency(e.detail);
    globalThis.addEventListener('gtm:convai-latency', handleLatency);
    return () => globalThis.removeEventListener('gtm:convai-latency', handleLatency);
  }, []);

  const [harnessManifest, setHarnessManifest] = useState(null);
  const [harnessManifestState, setHarnessManifestState] = useState('loading');
  const [draftSuites, setDraftSuites] = useState([]);
  const [suiteBuilderOpen, setSuiteBuilderOpen] = useState(false);
  const [suiteBuilderError, setSuiteBuilderError] = useState('');
  const suiteNameInputRef = React.useRef(null);
  const suiteScenarioInputRef = React.useRef(null);
  const [suiteDraft, setSuiteDraft] = useState({
    name: '',
    agentKey: defaultSuiteAgentKey,
    owner: 'eval-owner',
    scenario: '',
    passTarget: '0.85',
  });
  const harnessCommands = harnessManifest?.commands || [];
  const activeHarnessCommand = harnessCommands.find(cmd => cmd.id === activeHarnessCommandId) || harnessCommands[0] || null;
  const allEvalSuites = useMemo(() => [...draftSuites, ...D.evalSuites], [draftSuites, D.evalSuites]);
  const visibleSuites = suiteFilter === 'regressions'
    ? allEvalSuites.filter(s => !s.draft && (D.isEvalRegressing || (x => x.delta < 0 || x.pass < 0.75))(s))
    : allEvalSuites;
  const active = allEvalSuites.find(s => s.id === activeId) || visibleSuites[0] || allEvalSuites[0];
  const suiteTrendSeries = active.draft
    ? null
    : [.81,.82,.83,.82,.84,.85,.83,.86,.84,.87,.85,.88,.86,active.pass];
  const suiteTrendLabels = suiteTrendSeries
    ? buildEvalSparkLabels(suiteTrendSeries, 'day')
    : null;
  const normalizedRuns = useMemo(() => runs.map(normalizeEvalRun), [runs]);
  const visibleRuns = useMemo(() => normalizedRuns.filter(r => runFilter === 'all' || r.verdict === runFilter), [normalizedRuns, runFilter]);
  const defaultActiveRun = visibleRuns.find(r => r.verdict === 'fail') || visibleRuns[0] || normalizedRuns.find(r => r.verdict === 'fail') || normalizedRuns[0] || null;
  const isActiveDraftSuite = Boolean(active?.draft);
  const activeRunCandidate = normalizedRuns.find(r => r.scenario_id === activeRunId) || null;
  const activeRunCandidateSuiteId = activeRunCandidate ? evalSuiteIdForRun(activeRunCandidate, allEvalSuites) : null;
  const activeRun = isActiveDraftSuite
    ? null
    : activeRunCandidate && activeRunCandidateSuiteId === active?.id
      ? activeRunCandidate
      : evalBestRunForSuite(normalizedRuns, active, allEvalSuites, runFilter) || defaultActiveRun;
  const activeAxes = activeRun?.score?.axes || [];
  const failedAxes = activeAxes.filter(axis => axis.pass === false);
  const hasActiveRunEvidence = Boolean(activeRun);
  const failedAxesReviewCopy = failedAxes.length > 0
    ? `${failedAxes.length} failed judge ${failedAxes.length === 1 ? 'axis needs' : 'axes need'} review before this prompt ships.`
    : 'No failed axes selected; use the fail filter to inspect the risk surface.';
  const commandCenterState = isActiveDraftSuite
    ? 'draft'
    : hasActiveRunEvidence
    ? activeRun.verdict || 'ready'
    : runsState === 'error'
      ? 'error'
      : 'loading';
  const commandCenterEyebrow = isActiveDraftSuite
    ? 'draft suite queued'
    : hasActiveRunEvidence
    ? activeRun.verdict === 'fail' ? 'active regression' : 'active run'
    : runsState === 'error' ? 'run evidence unavailable' : 'loading run evidence';
  const commandCenterTitle = isActiveDraftSuite
    ? active?.name || 'Draft eval suite'
    : hasActiveRunEvidence
    ? evalScenarioTitle(activeRun.scenario_id)
    : evalScenarioTitle(active?.name || activeId || 'Harness evidence');
  const commandCenterCopy = isActiveDraftSuite
    ? `No run evidence exists for this draft yet. Copy the manifest command, run the harness, then attach the resulting artifact before opening local agent admin.`
    : hasActiveRunEvidence
    ? failedAxesReviewCopy
    : runsState === 'error'
      ? 'Harness run evidence is unavailable; retry the run panel before reviewing prompt risk.'
      : 'Loading harness run evidence before judge axes, latency, and transcript risk are summarized.';
  const commandCenterBadgeTone = activeRun?.verdict === 'fail'
    ? 'critical'
    : isActiveDraftSuite
      ? 'neutral'
      : hasActiveRunEvidence
      ? 'healthy'
      : runsState === 'error' ? 'critical' : 'neutral';
  const commandCenterBadge = isActiveDraftSuite ? 'draft' : activeRun?.verdict || (runsState === 'error' ? 'blocked' : 'loading');
  const commandCenterScore = isActiveDraftSuite ? evalPct(active?.targetPass || active?.pass) : hasActiveRunEvidence ? evalPct(activeRun?.score?.weighted) : '--';
  const commandCenterOrbState = activeRun?.verdict === 'fail' ? 'alert' : hasActiveRunEvidence ? 'talking' : 'idle';
  const commandCenterBarTone = activeRun?.verdict === 'fail' ? 'critical' : hasActiveRunEvidence ? 'healthy' : 'neutral';
  const commandCenterBars = hasActiveRunEvidence
    ? activeAxes.map((axis, i) => axis.pass ? 0.35 + ((i % 5) * 0.1) : 0.88)
    : [.18,.22,.2,.24,.19,.21,.18,.23];
  const artifactPayload = runDetail || activeRun || {};
  const artifactAxes = Array.isArray(artifactPayload?.score?.axes) ? artifactPayload.score.axes : activeAxes;
  const artifactFailedAxes = artifactAxes.filter(axis => axis.pass === false);
  const artifactFailedAxesReviewCopy = artifactFailedAxes.length > 0
    ? `${artifactFailedAxes.length} failed judge ${artifactFailedAxes.length === 1 ? 'axis needs' : 'axes need'} operator review before prompt changes ship.`
    : 'No failed judge axes in this artifact; verify the pass evidence and latency budget before closing the run.';
  const artifactScenario = artifactPayload.scenario_id || activeRun?.scenario_id || 'selected run';
  const artifactVerdict = artifactPayload.verdict || activeRun?.verdict || 'unknown';
  const artifactScore = artifactPayload.score?.weighted ?? activeRun?.score?.weighted;
  const artifactDuration = artifactPayload.duration_ms ?? activeRun?.duration_ms;
  const artifactReviewLocator = evalArtifactReviewLocator(artifactPayload || activeRun);
  const activeAgentKey = active?.draft && active.agentKey ? active.agentKey : evalAgentKeyForRun(activeRun, active);
  const activeAgent = globalThis.AGENT_REGISTRY.byKey(activeAgentKey) || globalThis.AGENT_REGISTRY.byKey('sales_coach');
  const activeEvalReviewContext = evalReviewContextLabel(activeRun, active);
  const passCount = normalizedRuns.filter(r => r.verdict === 'pass').length;
  const failCount = normalizedRuns.filter(r => r.verdict === 'fail').length;
  const scoredRuns = normalizedRuns.filter(r => typeof r.score.weighted === 'number');
  const meanScore = scoredRuns.length > 0
    ? scoredRuns.reduce((sum, r) => sum + r.score.weighted, 0) / scoredRuns.length
    : null;
  // Latency parity with voice_ai_agent_evals: every harness run carries a
  // total-turn duration_ms (== `latency_ms` in their schema). Surface
  // avg + slowest so the dashboard reflects the run-summary the harness
  // already produces, instead of pretending latency does not exist.
  const latencyDurations = normalizedRuns
    .map(r => Number(r.duration_ms))
    .filter(n => Number.isFinite(n) && n > 0);
  const avgLatencyMs = latencyDurations.length > 0
    ? latencyDurations.reduce((a, b) => a + b, 0) / latencyDurations.length
    : null;
  const slowestRun = normalizedRuns.reduce(
    (worst, r) => (Number.isFinite(r.duration_ms) && (worst == null || r.duration_ms > worst.duration_ms)) ? r : worst,
    null,
  );
  const slowestRunTitle = slowestRun ? evalScenarioTitle(slowestRun.scenario_id) : '';
  // Latency budget thresholds mirror the harness scenario YAML axes
  // (ttfb_p95_ms / end_to_first_audio_p95_ms / total_turn_p95_ms). These
  // are conservative GTM-tier defaults; tone goes critical when avg blows
  // past total-turn p95.
  const LATENCY_BUDGET = { ttfb_p95_ms: 800, end_to_first_audio_p95_ms: 1600, total_turn_p95_ms: 5000 };
  const evalLatencyTone = (ms) => {
    if (!Number.isFinite(ms) || ms <= 0) return 'neutral';
    if (ms > LATENCY_BUDGET.total_turn_p95_ms) return 'critical';
    if (ms > LATENCY_BUDGET.end_to_first_audio_p95_ms * 1.5) return 'warn';
    return 'healthy';
  };
  const latencyTone = evalLatencyTone(avgLatencyMs);
  // Rolling p95 across the loaded runs. voice_ai_agent_evals'
  // README calls out rolling-window p95 aggregation as a planned next
  // slice (their per-test latency is already captured); the console
  // can compute it from `duration_ms` directly. Linear interpolation
  // between the two nearest sorted samples for small N.
  const evalPercentile = (xs, p) => {
    if (!Array.isArray(xs) || xs.length === 0) return null;
    const sorted = [...xs].sort((a, b) => a - b);
    if (sorted.length === 1) return sorted[0];
    const rank = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
  };
  const p95LatencyMs = evalPercentile(latencyDurations, 95);
  const p95LatencyTone = evalLatencyTone(p95LatencyMs);
  // Per-tool rolling aggregation across the loaded runs. voice_ai_agent_evals'
  // README explicitly calls out "Tool-call latency aggregation. Per-call
  // tool latency can be asserted from fixtures and live simulate responses,
  // but there is no rolling p95/p99 view by tool yet" as a known gap. We
  // already retain `tool_calls[]` (name, schema_pass, round_trip_ms,
  // response_consumed_in_next_turn) on every normalized run — group by
  // tool name so an operator can spot a tool that's slow / schema-broken
  // / orphan-response-prone across the run set, not just inside one run.
  const TOOL_ROUND_TRIP_BUDGET_MS = 2000; // matches scenario.yaml thresholds.tool_call_round_trip_ms
  const toolLatencyRollup = (() => {
    const byTool = new Map();
    for (const run of normalizedRuns) {
      for (const tc of run.tool_calls || []) {
        if (!tc.name) continue;
        let bucket = byTool.get(tc.name);
        if (!bucket) {
          bucket = { name: tc.name, samples: [], schemaPass: 0, schemaTotal: 0, orphan: 0 };
          byTool.set(tc.name, bucket);
        }
        if (Number.isFinite(tc.round_trip_ms)) bucket.samples.push(tc.round_trip_ms);
        bucket.schemaTotal += 1;
        if (tc.schema_pass) bucket.schemaPass += 1;
        if (!tc.response_consumed_in_next_turn) bucket.orphan += 1;
      }
    }
    const rows = [...byTool.values()].map(b => {
      const mean = b.samples.length ? b.samples.reduce((a, c) => a + c, 0) / b.samples.length : null;
      const p95 = b.samples.length ? evalPercentile(b.samples, 95) : null;
      const p99 = b.samples.length ? evalPercentile(b.samples, 99) : null;
      const schemaRate = b.schemaTotal ? b.schemaPass / b.schemaTotal : null;
      const tone = (schemaRate != null && schemaRate < 1)
        ? 'critical'
        : (p95 != null && p95 > TOOL_ROUND_TRIP_BUDGET_MS)
          ? 'critical'
          : (p95 != null && p95 > TOOL_ROUND_TRIP_BUDGET_MS * 0.85)
            ? 'warn'
            : 'healthy';
      return { ...b, mean, p95, p99, schemaRate, tone };
    });
    rows.sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0));
    return rows;
  })();
  const realEvalSuites = allEvalSuites.filter(s => !s.draft);
  const suiteCount = allEvalSuites.length;
  const suiteRegressionCount = realEvalSuites.filter(D.isEvalRegressing || (s => s.delta < 0 || s.pass < 0.75)).length;
  const fallbackRunCount = realEvalSuites.reduce((sum, suite) => sum + (Number(suite.runs) || 0), 0);
  const displayedPassRate = normalizedRuns.length > 0
    ? passCount / normalizedRuns.length
    : evalSuiteWeightedPassRate(realEvalSuites) ?? D.stats?.evalPassRate ?? null;
  const displayedRegressionCount = normalizedRuns.length > 0 ? failCount : suiteRegressionCount;
  const displayedRunCount = normalizedRuns.length > 0 ? normalizedRuns.length : fallbackRunCount;
  const loadedEvalPassTrend = buildLoadedEvalPassTrend(normalizedRuns);
  const passTrendSeries = loadedEvalPassTrend.length > 0 ? loadedEvalPassTrend : D.sparks.evalPass;
  const passTrendDelta = Array.isArray(passTrendSeries) && passTrendSeries.length > 1
    ? passTrendSeries[passTrendSeries.length - 1] - passTrendSeries[0]
    : 0;
  const passTrendLabels = loadedEvalPassTrend.length > 0
    ? buildLoadedEvalPassLabels(normalizedRuns)
    : buildEvalSparkLabels(D.sparks.evalPass, 'suite run');
  const passTrendSourceLabel = loadedEvalPassTrend.length > 0
    ? `${passCount}/${normalizedRuns.length} loaded harness results`
    : 'suite-library pass-rate trend';
  const evalHeaderRunLabel = normalizedRuns.length > 0
    ? `${normalizedRuns.length.toLocaleString()} loaded result${normalizedRuns.length === 1 ? '' : 's'} · ${fallbackRunCount.toLocaleString()} suite-library runs`
    : `${fallbackRunCount.toLocaleString()} suite-library runs`;
  const runFilterLabels = { all:'all runs', fail:'failures', pass:'passes' };
  const runFilterLabel = runFilterLabels[runFilter] || `${runFilter} runs`;
  const evalRunFilterSummary = normalizedRuns.length > 0
    ? `${runFilterLabel} · ${visibleRuns.length.toLocaleString()} of ${normalizedRuns.length.toLocaleString()}`
    : `${runFilterLabel} · no runs loaded`;
  const selectDomainEvalCommandId = () => {
    const domainCommand = harnessCommands.find(cmd => cmd.id === 'eval-quick')
      || harnessCommands.find(cmd => Array.isArray(cmd.tags) && cmd.tags.includes('domain-eval'));
    return (domainCommand || harnessCommands[0])?.id || 'eval-quick';
  };
  useEffect(() => {
    if (harnessManifestState !== 'ready' || activeHarnessCommandId || harnessCommands.length === 0) return;
    setActiveHarnessCommandId(selectDomainEvalCommandId());
  }, [harnessManifestState, activeHarnessCommandId, harnessCommands.map(cmd => cmd.id).join('|')]);
  const openHarnessCommand = (cmd) => {
    if (cmd?.id) setActiveHarnessCommandId(cmd.id);
    setRerunTarget(null);
    setArtifactPath(null);
    setSuiteBuilderOpen(false);
    setBridgeOpen(true);
  };
  const openDomainEvalRunPlan = () => {
    const commandId = selectDomainEvalCommandId();
    const command = harnessCommands.find(cmd => cmd.id === commandId) || { id: commandId };
    openHarnessCommand(command);
  };
  const toggleDomainEvalRunPlan = () => {
    if (bridgeOpen) {
      setBridgeOpen(false);
      return;
    }
    openDomainEvalRunPlan();
  };
  const toggleFailureRuns = () => {
    if (runFilter === 'fail') {
      setRunFilter('all');
      globalThis.toast('All harness runs shown', { sub:'showing pass and fail results', tone:'accent' });
      return;
    }
    setRunFilter('fail');
    globalThis.toast('Regression filter applied', { sub:'showing failing harness runs', tone:'warn' });
  };
  const openEvalArtifactPanelForRun = (run) => {
    if (!run) return false;
    setBridgeOpen(false);
    setSuiteBuilderOpen(false);
    setArtifactPath(evalArtifactReviewLocator(run));
    return true;
  };
  const openActiveArtifactPanel = () => {
    if (!activeRun) {
      const commandId = activeHarnessCommandId || selectDomainEvalCommandId();
      if (commandId) setActiveHarnessCommandId(commandId);
      setArtifactPath(null);
      setSuiteBuilderOpen(false);
      setBridgeOpen(true);
      return;
    }
    openEvalArtifactPanelForRun(activeRun);
  };
  const openSuiteBuilder = () => {
    setBridgeOpen(false);
    setArtifactPath(null);
    setSuiteBuilderOpen(true);
    setSuiteBuilderError('');
    globalThis.AppContext.set({
      extra: {
        ...globalThis.AppContext.get().extra,
        triggered_from: 'evals-new-suite',
        eval_suite_builder_open: true,
      },
    });
  };
  const rerunEvalSuite = (suite) => {
    const commandId = selectDomainEvalCommandId();
    setActiveId(suite.id);
    setActiveHarnessCommandId(commandId);
    setArtifactPath(null);
    setSuiteBuilderOpen(false);
    setRerunTarget({
      id: suite.id,
      name: suite.name,
      owner: suite.owner,
      runs: suite.runs,
      pass: suite.pass,
      delta: suite.delta,
    });
    const ctx = globalThis.AppContext.get();
    globalThis.AppContext.set({
      selection: { type: 'eval', id: suite.id },
      extra: {
        ...ctx.extra,
        run_intent: 'eval_suite_rerun',
        eval_suite_id: suite.id,
        eval_suite_name: suite.name,
        eval_harness_command_id: commandId,
        triggered_from: 'eval-suite-rerun',
      },
    });
    setBridgeOpen(true);
  };
  const slugifySuiteId = (value) => {
    const base = String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return base || 'suite';
  };
  const submitSuiteDraft = (event) => {
    event.preventDefault();
    const name = suiteDraft.name.trim();
    const scenario = suiteDraft.scenario.trim();
    if (!name || !scenario) {
      setSuiteBuilderError(!name && !scenario
        ? 'Suite name and scenario focus are required before a draft can enter the run plan.'
        : !name
          ? 'Suite name is required before a draft can enter the run plan.'
          : 'Scenario focus is required before a draft can enter the run plan.');
      requestAnimationFrame(() => {
        const target = !name ? suiteNameInputRef.current : suiteScenarioInputRef.current;
        target?.focus?.({ preventScroll: true });
      });
      return;
    }
    const agent = visibleEvalAgents.find(a => a.key === suiteDraft.agentKey) || visibleEvalAgents[0] || {};
    const existingIds = new Set(allEvalSuites.map(s => s.id));
    const idBase = `draft-${slugifySuiteId(name)}`;
    let id = idBase;
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${idBase}-${suffix}`;
      suffix += 1;
    }
    const target = Number.parseFloat(suiteDraft.passTarget);
    const passTarget = Number.isFinite(target) ? Math.max(0, Math.min(1, target)) : 0.85;
    const draft = {
      id,
      name,
      owner: suiteDraft.owner.trim() || agent.display_name || 'operator',
      runs: 0,
      latest: 'drafted now',
      pass: passTarget,
      delta: 0,
      draft: true,
      agentKey: agent.key || suiteDraft.agentKey || defaultSuiteAgentKey,
      agentName: agent.display_name || 'ElevenLabs agent',
      scenarioFocus: scenario,
      targetPass: passTarget,
    };
    setDraftSuites(prev => [draft, ...prev]);
    setSuiteFilter('all');
    setSuiteBuilderOpen(false);
    setSuiteBuilderError('');
    setSuiteDraft({
      name: '',
      agentKey: defaultSuiteAgentKey,
      owner: 'eval-owner',
      scenario: '',
      passTarget: '0.85',
    });
    const commandId = selectDomainEvalCommandId();
    setActiveId(draft.id);
    setActiveRunId(null);
    setActiveHarnessCommandId(commandId);
    setRerunTarget({
      id: draft.id,
      name: draft.name,
      owner: draft.owner,
      runs: draft.runs,
      pass: draft.pass,
      delta: draft.delta,
      scenarioFocus: draft.scenarioFocus,
      draft: true,
    });
    globalThis.AppContext.set({
      selection: { type: 'eval', id: draft.id },
      extra: {
        ...globalThis.AppContext.get().extra,
        run_intent: 'eval_suite_draft',
        eval_suite_id: draft.id,
        eval_suite_name: draft.name,
        eval_suite_agent: draft.agentName,
        eval_suite_scenario_focus: draft.scenarioFocus,
        eval_harness_command_id: commandId,
        triggered_from: 'evals-new-suite',
      },
    });
    setBridgeOpen(true);
  };
  const copyHarnessCommand = async (cmd) => {
    if (!cmd?.command) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cmd.command);
        globalThis.toast('Command copied', { sub: cmd.name, tone:'accent' });
      } else {
        globalThis.toast('Clipboard unavailable', { sub: cmd.command, tone:'warn' });
      }
    } catch (_) {
      globalThis.toast('Could not copy command', { tone:'critical' });
    }
  };
  const openEvalAgentAdmin = () => {
    if (!activeRun) {
      globalThis.toast('Load a harness run first', {
        sub: 'Local agent admin needs a selected eval run, not suite-level placeholder context.',
        tone: 'warn',
      });
      return;
    }
    const prevExtra = globalThis.AppContext.get().extra || {};
    const activeRunScore = activeRun?.score?.weighted;
    globalThis.AppContext.set({
      selection: { type: 'eval', id: activeId },
      extra: {
        ...prevExtra,
        selected_agent_key: activeAgentKey,
        agent_admin_panel: 'context',
        eval_run: activeRun || null,
        selected_eval_suite: activeEvalReviewContext,
        selected_eval_suite_id: active?.id || activeId,
        selected_eval_context: activeEvalReviewContext,
        selected_eval_run: activeRun?.scenario_id || 'none',
        selected_eval_verdict: activeRun?.verdict || 'unknown',
        selected_eval_score: typeof activeRunScore === 'number' ? evalPct(activeRunScore) : '--',
        eval_failed_axes: failedAxes.map(axis => axis.name || axis.id || 'unnamed_axis').join(', ') || 'none',
        eval_evidence_path: evalArtifactReviewLocator(activeRun),
        eval_admin_return_route: 'evals',
        triggered_from: 'eval-agent-admin',
      },
    });
    setRoute?.('agents');
  };
  const syncActiveEvalContextEvidence = () => {
    if (!activeRun) {
      globalThis.toast('Load a harness run first', {
        sub: 'Context sync needs a concrete harness run and local evidence path.',
        tone: 'warn',
      });
      return;
    }
    const prevExtra = globalThis.AppContext.get().extra || {};
    globalThis.AppContext.set({
      extra: {
        ...prevExtra,
        selected_agent_key: activeAgentKey,
        eval_run: activeRun || null,
        selected_eval_suite: activeEvalReviewContext,
        selected_eval_suite_id: active?.id || activeId,
        selected_eval_context: activeEvalReviewContext,
        selected_eval_run: activeRun?.scenario_id || 'none',
        selected_eval_verdict: activeRun?.verdict || 'unknown',
        selected_eval_score: evalPct(activeRun?.score?.weighted),
        eval_failed_axes: failedAxes.map(axis => axis.name || axis.id || 'unnamed_axis').join(', ') || 'none',
        eval_evidence_path: evalArtifactReviewLocator(activeRun),
        triggered_from: 'evals-sync',
      },
    });
    openEvalArtifactPanelForRun(activeRun);
    setLastSyncedAt(new Date());
    globalThis.toast('Context & evidence synced', {
      sub: `${activeRun?.scenario_id || activeId} armed as dynamic_variables; evidence drawer open`,
      tone: 'accent',
    });
  };
  const hasActiveEvalRun = Boolean(activeRun);
  const canOpenEvalAgentAdmin = hasActiveEvalRun;
  const canSyncEvalEvidence = hasActiveEvalRun;
  const evalLabReadiness = hasActiveEvalRun
    ? {
      tone: activeRun?.verdict === 'fail' ? 'critical' : 'healthy',
      label: 'run context armed',
      title: activeRun?.scenario_id || 'selected harness run',
      body: `${activeEvalReviewContext} is ready for local admin review and evidence sync.`,
      badge: activeRun?.verdict || 'ready',
    }
    : {
      tone: runsState === 'error' ? 'critical' : 'neutral',
      label: runsState === 'error' ? 'harness load failed' : 'waiting on harness run',
      title: runsState === 'error' ? 'Harness run evidence did not load' : 'Waiting for harness run evidence',
      body: runsState === 'error'
        ? 'Retry the harness runs panel before opening local agent admin or syncing evidence.'
        : 'Local admin and evidence sync unlock only after a concrete run loads inside this console.',
      badge: runsState,
    };
  const evalAgentSession = hasActiveEvalRun
    ? {
      orbState: activeRun?.verdict === 'fail' ? 'alert' : 'idle',
      subtitle: `${activeAgent?.role || 'ConvAI'} · ${activeRun?.agent_id || activeRun?.scenario_id || 'selected run'}`,
      barActive: activeRun?.verdict === 'fail',
      barTone: activeRun?.verdict === 'fail' ? 'critical' : 'healthy',
      bars: activeAxes.length > 0 ? activeAxes.map((axis, i) => axis.pass ? 0.35 + ((i % 5) * 0.1) : 0.85) : [.28,.34,.3,.36,.32],
      status: activeRun?.verdict === 'fail' ? 'Regression context armed' : 'Baseline context armed',
      badge: activeRun?.verdict || 'ready',
      badgeTone: activeRun?.verdict === 'fail' ? 'critical' : 'healthy',
    }
    : {
      orbState: 'idle',
      subtitle: `${activeAgent?.role || 'ConvAI'} · harness run pending`,
      barActive: false,
      barTone: runsState === 'error' ? 'critical' : 'neutral',
      bars: [.18,.22,.2,.24,.19],
      status: runsState === 'error'
        ? 'Harness evidence failed; local context is not armed'
        : 'Harness run required before local context is armed',
      badge: runsState === 'error' ? 'blocked' : 'pending',
      badgeTone: runsState === 'error' ? 'critical' : 'neutral',
    };

  const [runsError, setRunsError] = useState(null);
  const [runsReloadToken, setRunsReloadToken] = useState(0);
  const reloadEvalRuns = () => setRunsReloadToken(n => n + 1);
  const suiteNameInvalid = Boolean(suiteBuilderError && !suiteDraft.name.trim());
  const suiteScenarioInvalid = Boolean(suiteBuilderError && !suiteDraft.scenario.trim());
  const selectEvalRun = React.useCallback((run) => {
    if (!run?.scenario_id) return;
    setActiveRunId(run.scenario_id);
    const suiteId = evalSuiteIdForRun(run, allEvalSuites);
    if (suiteId) setActiveId(suiteId);
  }, [allEvalSuites]);
  const selectEvalSuite = React.useCallback((suite) => {
    if (!suite?.id) return;
    setActiveId(suite.id);
    const run = evalBestRunForSuite(normalizedRuns, suite, allEvalSuites, runFilter);
    if (run?.scenario_id) setActiveRunId(run.scenario_id);
  }, [normalizedRuns, allEvalSuites, runFilter]);

  // Consume the `suite_filter` handoff key once so re-navigating to
  // Evals later doesn't keep snapping back to 'regressions'. Read on
  // mount above; clear here.
  React.useEffect(() => {
    const ctx = globalThis.AppContext.get();
    const extra = ctx?.extra || {};
    if (extra.suite_filter == null) return;
    globalThis.AppContext.set({ extra: page2OmitKeys(extra, ['suite_filter']) });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRunsState('loading');
    setRunsError(null);
    fetch('/api/eval-runs')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`)))
      .then(data => ({
        data,
        source: globalThis.DEMO_MODE ? 'fixture' : 'live',
      }))
      .catch(err => {
        console.warn('Falling back to bundled eval runs fixture', err);
        return fetch('../fixtures/eval-runs.json')
          .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`)))
          .then(data => ({ data, source: 'fixture' }));
      })
      .then(({ data, source }) => {
        if (cancelled) return;
        setRuns(evalRunsFromPayload(data));
        setRunsState(source);
        setRunsError(null);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to load eval runs', err);
        setRuns([]);
        setRunsState('error');
        setRunsError(err && (err.message || String(err)) || 'unknown error');
      });
    return () => { cancelled = true; };
  }, [runsReloadToken]);

  useEffect(() => {
    let cancelled = false;
    setHarnessManifestState('loading');
    fetch('/api/eval-harness-manifest')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`)))
      .catch(err => {
        console.warn('Falling back to bundled eval-harness manifest fixture', err);
        return fetch('../fixtures/eval-harness-manifest.json').then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`)));
      })
      .then(data => {
        if (cancelled) return;
        setHarnessManifest(data);
        setHarnessManifestState('ready');
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to load eval-harness manifest', err);
        setHarnessManifest(null);
        setHarnessManifestState('error');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (normalizedRuns.length === 0) return;
    if (isActiveDraftSuite) return;
    if (activeRunId && normalizedRuns.some(r => r.scenario_id === activeRunId)) return;
    const firstRegression = normalizedRuns.find(r => r.verdict === 'fail');
    const nextRun = firstRegression || normalizedRuns[0];
    setActiveRunId(nextRun.scenario_id);
    if (initialSelection?.type !== 'eval') {
      const suiteId = evalSuiteIdForRun(nextRun, allEvalSuites);
      if (suiteId) setActiveId(suiteId);
    }
  }, [normalizedRuns, activeRunId, allEvalSuites, initialSelection?.type, isActiveDraftSuite]);

  useEffect(() => globalThis.AppContext.subscribe((ctx) => {
    if (ctx.selection?.type === 'eval' && D.evalSuites.some(s => s.id === ctx.selection.id)) {
      if (ctx.selection.id === activeId) return;
      const suite = allEvalSuites.find(s => s.id === ctx.selection.id);
      if (suite) selectEvalSuite(suite);
    }
  }), [D.evalSuites, activeId, allEvalSuites, selectEvalSuite]);

  useEffect(() => {
    const applyEvalsIntent = (ctx) => {
      if (!ctx.extra?.evals_bridge_open) return;
      if (ctx.extra.eval_harness_command_id) {
        setActiveHarnessCommandId(ctx.extra.eval_harness_command_id);
      }
      setArtifactPath(null);
      setSuiteBuilderOpen(false);
      setBridgeOpen(true);
      const latest = globalThis.AppContext.get().extra || {};
      globalThis.AppContext.set({ extra: page2OmitKeys(latest, ['evals_bridge_open']) });
    };
    applyEvalsIntent(globalThis.AppContext.get());
    return globalThis.AppContext.subscribe(applyEvalsIntent);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRunDetail(null);
    if (!activeRun?.result_path) return;
    fetch(activeRun.result_path)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`)))
      .then(data => { if (!cancelled) setRunDetail(data); })
      .catch(() => { if (!cancelled) setRunDetail(null); });
    return () => { cancelled = true; };
  }, [activeRun?.result_path]);

  useEffect(() => {
    const ctx = globalThis.AppContext.get();
    globalThis.AppContext.set({
      selection: { type: 'eval', id: activeId },
      extra: {
        ...ctx.extra,
        selected_agent_key: activeAgentKey,
        selected_eval_suite: activeEvalReviewContext,
        selected_eval_suite_id: active?.id || activeId,
        selected_eval_context: activeEvalReviewContext,
        selected_eval_run: activeRun?.scenario_id || 'none',
        selected_eval_verdict: activeRun?.verdict || 'unknown',
        selected_eval_score: evalPct(activeRun?.score?.weighted),
        eval_failed_axes: failedAxes.map(a => a.name).join(', ') || 'none',
      },
    });
  }, [activeId, active?.id, activeEvalReviewContext, activeAgentKey, activeRun?.scenario_id, activeRun?.verdict, activeRun?.score?.weighted, failedAxes.map(a => a.name).join('|')]);

  useEffect(() => () => {
    const latest = globalThis.AppContext.get();
    if (latest.selection?.type === 'eval') globalThis.AppContext.set({ selection: null });
  }, []);

  useEffect(() => {
    if (!bridgeOpen) return;
    requestAnimationFrame(() => {
      globalThis.scrollConsoleNodeIntoView?.(bridgePanelRef.current, { block:'start' });
    });
  }, [bridgeOpen, activeHarnessCommandId]);

  useEffect(() => {
    if (!artifactPath) return;
    requestAnimationFrame(() => {
      globalThis.scrollConsoleNodeIntoView?.(artifactPanelRef.current, { block:'start' });
      artifactPanelRef.current?.focus?.({ preventScroll: true });
    });
  }, [artifactPath]);

  return (
    <div className="page page--evals">
      <h1 id="console-page-title" className="sr-only ph__title">Evals</h1>

      <section className="eval-control-rail" data-testid="eval-control-rail" aria-label="Evals command controls">
        <div className="eval-control-rail__filters">
          <Segmented value={runFilter} onChange={setRunFilter} options={[
            { value:'all', label:'All' },
            { value:'fail', label:'Fail' },
            { value:'pass', label:'Pass' },
          ]} />
          <span className="mono eval-control-rail__chip">{evalHeaderRunLabel}</span>
          <span className="mono eval-control-rail__chip">{visibleEvalAgentLabel}</span>
        </div>
        <div className="eval-control-rail__actions">
          <button
            className="btn btn--ghost btn--sm"
            data-testid="eval-header-artifacts-open"
            aria-label="Open evaluation artifact drawer"
            aria-controls="eval-artifact-panel"
            aria-expanded={Boolean(artifactPath)}
            onClick={openActiveArtifactPanel}
          ><I3.Doc size={12}/>Artifacts</button>
          <button className="btn btn--ghost btn--sm" onClick={() => {
            globalThis.AppContext.set({
              extra: {
                ...globalThis.AppContext.get().extra,
                settings_tab:'evals',
                triggered_from:'evals-policy',
              },
            });
            globalThis.dispatchEvent(new CustomEvent('gtm:settings-tab', { detail: { tab:'evals' } }));
            setRoute?.('settings');
          }}><I3.Cog size={12}/>Policy</button>
          <button
            className="btn btn--ghost btn--sm"
            data-testid="eval-header-run-plan-open"
            aria-label={bridgeOpen ? 'Close local eval run plan drawer' : 'Open local eval run plan drawer'}
            aria-controls="eval-harness-bridge"
            aria-expanded={bridgeOpen}
            onClick={toggleDomainEvalRunPlan}
          ><I3.Bracket size={12}/>{bridgeOpen ? 'Close run plan' : 'Run plan'}</button>
          <button
            className="btn btn--primary btn--sm"
            data-testid="eval-new-suite-open"
            onClick={openSuiteBuilder}
          ><I3.Plus size={12}/>New suite</button>
        </div>
      </section>

      {suiteBuilderOpen && (
        <div className="workflow-popout workflow-popout--single eval-suite-builder" role="region" aria-label="New eval suite builder" data-testid="eval-suite-builder">
          <form className="workflow-popout__pane" onSubmit={submitSuiteDraft}>
            <div style={{display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start'}}>
              <div>
                <div className="eyebrow eyebrow--accent">new eval suite</div>
                <div className="workflow-popout__title">Draft a local scenario pack</div>
                <div className="muted" style={{fontSize:12}}>
                  Create the suite inside the console first. It becomes a draft row, then the harness run plan opens with the domain eval command selected.
                </div>
              </div>
              <button type="button" className="btn btn--ghost btn--icon" aria-label="Close new eval suite builder" onClick={() => setSuiteBuilderOpen(false)}><I3.Close size={14}/></button>
            </div>
            <div className="eval-suite-builder__grid">
              <label className="field">
                <span className="field__label">Suite name</span>
                <input
                  ref={suiteNameInputRef}
                  className="input"
                  data-testid="eval-suite-builder-name"
                  aria-label="Suite name"
                  aria-describedby="eval-suite-builder-name-hint"
                  aria-invalid={suiteNameInvalid}
                  placeholder="Name this suite"
                  value={suiteDraft.name}
                  onChange={(e) => {
                    setSuiteBuilderError('');
                    setSuiteDraft(d => ({ ...d, name: e.target.value }));
                  }}
                />
                <span id="eval-suite-builder-name-hint" className="field__hint">Local draft label; the harness command is selected after save.</span>
              </label>
              <label className="field">
                <span className="field__label">ElevenLabs agent</span>
                <select
                  className="select"
                  data-testid="eval-suite-builder-agent"
                  aria-label="ElevenLabs agent"
                  value={suiteDraft.agentKey}
                  onChange={(e) => {
                    setSuiteBuilderError('');
                    setSuiteDraft(d => ({ ...d, agentKey: e.target.value }));
                  }}
                >
                  {visibleEvalAgents.map(a => (
                    <option key={a.key} value={a.key}>{a.display_name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Owner</span>
                <input
                  className="input"
                  data-testid="eval-suite-builder-owner"
                  aria-label="Owner"
                  value={suiteDraft.owner}
                  onChange={(e) => {
                    setSuiteBuilderError('');
                    setSuiteDraft(d => ({ ...d, owner: e.target.value }));
                  }}
                />
              </label>
              <label className="field">
                <span className="field__label">Target pass rate</span>
                <select
                  className="select"
                  data-testid="eval-suite-builder-target"
                  aria-label="Target pass rate"
                  value={suiteDraft.passTarget}
                  onChange={(e) => {
                    setSuiteBuilderError('');
                    setSuiteDraft(d => ({ ...d, passTarget: e.target.value }));
                  }}
                >
                  <option value="0.85">85%</option>
                  <option value="0.90">90%</option>
                  <option value="0.95">95%</option>
                </select>
              </label>
              <label className="field eval-suite-builder__scenario">
                <span className="field__label">Scenario focus</span>
                <textarea
                  ref={suiteScenarioInputRef}
                  className="textarea"
                  data-testid="eval-suite-builder-scenario"
                  aria-label="Scenario focus"
                  aria-describedby="eval-suite-builder-scenario-hint"
                  aria-invalid={suiteScenarioInvalid}
                  placeholder="Describe caller behavior and success criteria"
                  value={suiteDraft.scenario}
                  onChange={(e) => {
                    setSuiteBuilderError('');
                    setSuiteDraft(d => ({ ...d, scenario: e.target.value }));
                  }}
                />
                <span id="eval-suite-builder-scenario-hint" className="field__hint">No fixture copy here; write the failure mode the next run should prove.</span>
              </label>
            </div>
            {suiteBuilderError && <div className="eval-suite-builder__error" role="alert">{suiteBuilderError}</div>}
            <div className="eval-suite-builder__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSuiteBuilderOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn--primary btn--sm"><I3.Plus size={12}/>Add suite draft</button>
            </div>
          </form>
        </div>
      )}

      <section className="eval-command-center" data-testid="eval-command-center" data-state={commandCenterState}>
        <div className="eval-command-center__copy">
          <div className="eyebrow eyebrow--accent">{commandCenterEyebrow}</div>
          <h2 data-testid="eval-active-scenario-title">{commandCenterTitle}</h2>
          <p data-testid="eval-active-regression-review-copy">{commandCenterCopy}</p>
          <div className="eval-command-center__meta">
            <Badge tone={commandCenterBadgeTone}>{commandCenterBadge}</Badge>
            <span className="mono">{commandCenterScore}</span>
            {activeRun?.scenario_id && <span className="mono eval-command-center__scenario-id" data-testid="eval-active-scenario-id">scenario {activeRun.scenario_id}</span>}
            {active?.name && <span className="mono eval-command-center__suite-id" data-testid="eval-active-suite-context">suite {active.name}</span>}
            <span className="mono">{activeAgent?.display_name || 'Sales Coach'}</span>
          </div>
          {hasActiveRunEvidence && (
            <div className="eval-command-center__actions" aria-label="Active eval local review actions">
	              <button
	                type="button"
	                className="btn btn--primary btn--sm"
	                data-testid="eval-command-center-review-evidence"
	                aria-controls={artifactPath ? 'eval-artifact-panel' : undefined}
	                onClick={openActiveArtifactPanel}
	              >
                <I3.Doc size={12}/>
                Review evidence
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                data-testid="eval-command-center-sync-context"
                onClick={syncActiveEvalContextEvidence}
              >
                <I3.Refresh size={12}/>
                Sync context &amp; evidence
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                data-testid="eval-command-center-open-agent-admin"
                onClick={openEvalAgentAdmin}
              >
                <I3.Bot size={12}/>
                Open local agent admin
              </button>
            </div>
          )}
        </div>
        <div className="eval-command-center__voice" aria-label="ElevenLabs eval state">
          <window.ElevenUI.Orb
            state={commandCenterOrbState}
            size={54}
            color1={activeAgent?.avatar_color_1}
            color2={activeAgent?.avatar_color_2}
            label={`${activeAgent?.display_name || 'ElevenLabs'} eval state`}
          />
          <window.ElevenUI.BarVisualizer
            active={hasActiveRunEvidence}
            tone={commandCenterBarTone}
            bars={commandCenterBars}
          />
        </div>
      </section>

      <div className="stats eval-stats">
        <Stat label="Suites" value={suiteCount.toLocaleString()} />
        <Stat label="Harness runs" value={displayedRunCount ? displayedRunCount.toLocaleString() : '--'} />
        <Stat
          label="Pass rate"
          value={evalPct(displayedPassRate)}
          tone={evalAggregateTone(displayedPassRate)}
          spark={passTrendSeries}
          sparkLabels={passTrendLabels}
          sparkColor={passTrendDelta < 0 ? 'var(--warning)' : 'var(--healthy)'}
          sparkLabel={`Pass rate trend: ${passTrendSourceLabel}`}
          accent
        />
        <Stat label="Regressions" value={displayedRegressionCount} tone={displayedRegressionCount > 0 ? 'critical' : 'healthy'} />
        <Stat label="Mean score" value={meanScore == null ? '74%' : evalPct(meanScore)} tone={evalAggregateTone(meanScore)} />
        <Stat
          label="Avg latency"
          value={avgLatencyMs == null ? '--' : evalDuration(Math.round(avgLatencyMs))}
          tone={latencyTone}
        />
      </div>
      {(slowestRun || avgLatencyMs != null) && (
        <div className="eval-latency-strip" data-testid="eval-latency-strip" aria-label="Harness latency summary">
          <span className="eyebrow eyebrow--accent">latency budget</span>
          <span className="mono dim">
            ttfb p95 ≤ {LATENCY_BUDGET.ttfb_p95_ms}ms · first-audio p95 ≤ {LATENCY_BUDGET.end_to_first_audio_p95_ms}ms · total-turn p95 ≤ {evalDuration(LATENCY_BUDGET.total_turn_p95_ms)}
          </span>
          {p95LatencyMs != null && (
            <span
              className="mono eval-latency-strip__p95"
              data-testid="eval-latency-p95"
              data-tone={p95LatencyTone}
              data-p95-ms={Math.round(p95LatencyMs)}
              title={`Rolling p95 across the ${latencyDurations.length} loaded run${latencyDurations.length === 1 ? '' : 's'} · budget ≤ ${evalDuration(LATENCY_BUDGET.total_turn_p95_ms)}`}
            >
              total-turn p95: <strong>{evalDuration(Math.round(p95LatencyMs))}</strong> <span className="dim">/ {evalDuration(LATENCY_BUDGET.total_turn_p95_ms)}</span>
            </span>
          )}
          {slowestRun && (
            <span className="mono">
              slowest: <strong
                data-testid="eval-slowest-scenario"
                data-scenario-id={slowestRun.scenario_id}
                title={`scenario ${slowestRun.scenario_id}`}
              >{slowestRunTitle}</strong> · <span data-testid="eval-slowest-duration">{evalDuration(slowestRun.duration_ms)}</span>
            </span>
          )}
        </div>
      )}

      {toolLatencyRollup.length > 0 && (
        <div
          className="eval-tool-latency-rollup"
          data-testid="eval-tool-latency-rollup"
          aria-label="Per-tool latency rollup across loaded harness runs"
        >
          <span className="eyebrow eyebrow--accent eval-tool-latency-rollup__caption">
            tool latency · rolling across {normalizedRuns.length} run{normalizedRuns.length === 1 ? '' : 's'}
          </span>
          <span className="mono dim eval-tool-latency-rollup__budget">
            budget · round-trip p95 ≤ {TOOL_ROUND_TRIP_BUDGET_MS}ms
          </span>
          {toolLatencyRollup.map(row => (
            <span
              key={row.name}
              data-testid="eval-tool-latency-rollup-row"
              data-tool-name={row.name}
              data-tone={row.tone}
              data-call-count={row.schemaTotal}
              data-p95-ms={row.p95 != null ? Math.round(row.p95) : ''}
              className={`mono eval-tool-latency-rollup__chip ${row.tone === 'critical' ? 'cl-err' : row.tone === 'warn' ? 'cl-warn' : 'cl-ok'}`}
            >
              <span className="eval-tool-latency-rollup__chip-name">{row.name}</span>
              <span className="dim"> · n={row.schemaTotal}</span>
              <span className="dim"> · schema {row.schemaRate == null ? '—' : `${Math.round(row.schemaRate * 100)}%`}</span>
              <span> · {row.p95 != null ? `p95 ${evalDuration(Math.round(row.p95))}` : 'no timing'}</span>
              {row.orphan > 0 ? <span className="dim"> · {row.orphan} orphan</span> : null}
            </span>
          ))}
        </div>
      )}

      <section className="eval-run-plan-summary" aria-label="Local eval run plan" data-testid="eval-run-plan-summary">
        <div>
          <div className="eyebrow eyebrow--accent">local run plan</div>
          <strong>
            {rerunTarget
              ? `${rerunTarget.draft ? 'Draft suite' : 'Suite'} queued · ${rerunTarget.name}`
              : activeHarnessCommandId
                ? `${activeHarnessCommand?.name || activeHarnessCommandId} selected`
                : 'No harness command queued.'}
          </strong>
          <div
            className="mono dim"
            data-testid="eval-harness-manifest-status"
            data-schema-version={harnessManifest?.schema_version || ''}
          >
            {harnessManifestState === 'loading' && 'loading eval-harness.manifest.json…'}
            {harnessManifestState === 'ready' && harnessManifest && (
              <>manifest ready · {harnessCommands.length} local commands</>
            )}
            {harnessManifestState === 'error' && 'manifest unreachable — run plan is read-only'}
          </div>
          <div className="eval-run-plan-summary__path" data-testid="eval-run-plan-summary-path">
            command -&gt; local artifact drawer -&gt; local agent admin
          </div>
        </div>
        <button
          className="btn btn--ghost btn--sm"
          data-testid="eval-run-plan-open"
          aria-controls="eval-harness-bridge"
          aria-expanded={bridgeOpen}
          onClick={() => {
            // Toggle: a second click on the surfacing button while the
            // popout is already open should close it (standard expander
            // pattern). Previously this branch always force-opened, so
            // re-clicking the button felt inert.
            if (bridgeOpen) { setBridgeOpen(false); return; }
            if (activeHarnessCommandId) openHarnessCommand(activeHarnessCommand || { id: activeHarnessCommandId });
            else openDomainEvalRunPlan();
          }}
        ><I3.Bracket size={12}/>{bridgeOpen ? 'Close run plan' : 'Open run plan'}</button>
      </section>

      {bridgeOpen && (
        <div
          ref={bridgePanelRef}
          className="workflow-popout workflow-popout--single eval-bridge-popout"
          data-testid="eval-harness-bridge"
          role="region"
          aria-label="Local eval run plan details"
        >
          <div className="workflow-popout__pane">
            <div style={{display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start'}}>
              <div>
                <div className="eyebrow eyebrow--accent">local run plan</div>
                <div className="workflow-popout__title">Manifest command handoff</div>
                <div className="muted" style={{fontSize:12}}>Command source: eval-harness.manifest.json. Outputs stay attached to reviewable console run artifacts before any external harness follow-up.</div>
              </div>
              <button className="btn btn--ghost btn--icon" aria-label="Close eval run plan" onClick={() => setBridgeOpen(false)}><I3.Close size={14}/></button>
            </div>
            <div className="eval-run-plan">
              {activeHarnessCommand && (
                <div className="eval-run-plan__detail" data-testid="eval-harness-command-detail">
                  {rerunTarget && (
                    <div className="eval-run-plan__target" data-testid="eval-rerun-target">
                      <div className="eyebrow eyebrow--accent">{rerunTarget.draft ? 'draft target' : 'rerun target'}</div>
                      <strong>{rerunTarget.name}</strong>
                      <span className="mono">
                        {rerunTarget.id} · owner {rerunTarget.owner} · {rerunTarget.runs.toLocaleString()} historic runs · {rerunTarget.draft ? 'target' : 'pass'} {evalPct(rerunTarget.pass)}
                      </span>
                      {rerunTarget.scenarioFocus && (
                        <span className="mono">focus · {rerunTarget.scenarioFocus}</span>
                      )}
                    </div>
                  )}
                  <div>
                    <div className="eyebrow">selected command</div>
                    <h4>{activeHarnessCommand.name}</h4>
                    <code>{activeHarnessCommand.command}</code>
                  </div>
                  <div className="eval-run-plan__meta">
                    {formatHarnessTags(activeHarnessCommand) && <Badge tone="neutral">{formatHarnessTags(activeHarnessCommand)}</Badge>}
                    {activeHarnessCommand.timeout_ms && <Badge tone="warn">{formatHarnessTimeout(activeHarnessCommand.timeout_ms)} timeout</Badge>}
                    <Badge tone={Array.isArray(activeHarnessCommand.artifacts) && activeHarnessCommand.artifacts.length > 0 ? 'accent' : 'neutral'}>
                      {Array.isArray(activeHarnessCommand.artifacts) && activeHarnessCommand.artifacts.length > 0
                        ? `${activeHarnessCommand.artifacts.length} artifact${activeHarnessCommand.artifacts.length === 1 ? '' : 's'}`
                        : 'no artifact declared'}
                    </Badge>
                  </div>
                  <div className="eval-run-plan__actions">
                    <button className="btn btn--primary btn--sm" onClick={() => copyHarnessCommand(activeHarnessCommand)}><I3.Doc size={12}/>Copy command</button>
                    <button
                      className="btn btn--ghost btn--sm"
                      data-testid="eval-run-plan-open-artifact"
                      disabled={!activeRun}
                      onClick={openActiveArtifactPanel}
                      title={activeRun?.scenario_id ? `Open ${activeRun.scenario_id} locally` : 'Run the harness before a local artifact exists'}
                    >
                      <I3.Doc size={12}/>
                      Open local run artifact
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      data-testid="eval-run-plan-open-agent-admin"
                      disabled={!canOpenEvalAgentAdmin}
                      title={canOpenEvalAgentAdmin ? 'Open this eval run in local ElevenLabs agent admin' : 'Load a harness run before opening local agent admin'}
                      onClick={openEvalAgentAdmin}
                    >
                      <I3.Bot size={12}/>
                      Open local agent admin
                    </button>
                  </div>
                  {Array.isArray(activeHarnessCommand.artifacts) && activeHarnessCommand.artifacts.length > 0 && (
                    <div className="eval-run-plan__artifacts">
                      {activeHarnessCommand.artifacts.map(artifact => (
                        <div key={`${artifact.name}-${artifact.path}`}>
                          <span>{artifact.name}</span>
                          <code>{artifact.path}</code>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="eval-run-plan__review-path" data-testid="eval-run-plan-review-path" aria-label="Eval run local review path">
                    <div data-state="ready">
                      <span className="eval-run-plan__path-index">1</span>
                      <div>
                        <strong>Command</strong>
                        <p>Copy the manifest command without leaving the console.</p>
                      </div>
                    </div>
                    <div data-state={activeRun ? 'ready' : 'blocked'}>
                      <span className="eval-run-plan__path-index">2</span>
                      <div>
                        <strong>Artifact review</strong>
                        <p>{activeRun ? `${evalScenarioTitle(activeRun.scenario_id)} opens as local evidence.` : 'Load a harness run before opening evidence.'}</p>
                      </div>
                    </div>
                    <div data-state={canOpenEvalAgentAdmin ? 'ready' : 'blocked'}>
                      <span className="eval-run-plan__path-index">3</span>
                      <div>
                        <strong>Agent admin</strong>
                        <p>ElevenLabs context opens in the local admin wrapper.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="workflow-popout__grid" data-testid="eval-harness-popout-grid">
                {harnessCommands.map(cmd => (
                  <button
                    key={cmd.id}
                    className="workflow-tile"
                    data-testid="eval-harness-command"
                    data-command-id={cmd.id}
                    data-active={activeHarnessCommand?.id === cmd.id}
                    onClick={() => setActiveHarnessCommandId(cmd.id)}
                  >
                    <span>{cmd.name}</span>
                    <span>{cmd.command}</span>
                    <span>
                      {formatHarnessTags(cmd)}
                      {cmd.timeout_ms ? ` · ${formatHarnessTimeout(cmd.timeout_ms)} timeout` : ''}
                      {Array.isArray(cmd.artifacts) && cmd.artifacts.length > 0 ? ` · ${cmd.artifacts.length} artifact${cmd.artifacts.length === 1 ? '' : 's'}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {artifactPath && (
        <div
          id="eval-artifact-panel"
          ref={artifactPanelRef}
          className="workflow-popout workflow-popout--single eval-artifact-panel"
          role="region"
          aria-label="Evaluation artifact drawer"
          data-testid="eval-artifact-panel"
          data-review-locator={artifactPath || ''}
          tabIndex={-1}
        >
          <div className="workflow-popout__pane">
            <div className="eval-artifact-panel__head">
              <div>
                <div className="eyebrow eyebrow--accent">artifact review packet</div>
                <div className="workflow-popout__title">{evalScenarioTitle(artifactScenario)}</div>
                <div className="muted" style={{fontSize:12}}>Evidence is loaded inside the console first. The raw payload stays below as supporting detail, not the primary review surface.</div>
              </div>
              <button className="btn btn--ghost btn--icon" aria-label="Close artifact panel" onClick={() => setArtifactPath(null)}><I3.Close size={14}/></button>
            </div>
            <div className="eval-artifact-review" data-testid="eval-artifact-review">
              <div className="eval-artifact-review__summary">
                <Badge tone={artifactVerdict === 'fail' ? 'critical' : artifactVerdict === 'pass' ? 'healthy' : 'neutral'}>{artifactVerdict}</Badge>
                <strong>{evalScenarioTitle(artifactScenario)} · review evidence</strong>
                <p data-testid="eval-artifact-review-copy">{artifactFailedAxesReviewCopy}</p>
              </div>
              <div className="artifact-drawer__facts" aria-label="Evaluation artifact metadata">
                <div>
                  <span className="eyebrow">scenario</span>
                  <code className="mono" data-testid="eval-artifact-scenario">{artifactScenario}</code>
                </div>
                <div>
                  <span className="eyebrow">score</span>
                  <code className="mono" data-testid="eval-artifact-score">{evalPct(artifactScore)}</code>
                </div>
                <div>
                  <span className="eyebrow">latency</span>
                  <code className="mono">{evalDuration(artifactDuration)}</code>
                </div>
                <div>
                  <span className="eyebrow">review locator</span>
                  <code className="mono" data-testid="eval-artifact-path">{artifactReviewLocator}</code>
                </div>
              </div>
              <div className="eval-artifact-review__axes" aria-label="Judge axis evidence">
                {artifactAxes.length > 0 ? artifactAxes.map(axis => (
                  <div key={axis.name} className="eval-artifact-review__axis" data-testid="eval-artifact-axis" data-status={axis.pass === false ? 'fail' : axis.pass === true ? 'pass' : 'unknown'}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <strong>{axis.name}</strong>
                      <p style={{ margin: 0 }}>{axis.detail || 'No judge detail supplied.'}</p>
                      {(axis.success_criteria || axis.partial_credit !== undefined || axis.judge_llm) && (
                        <div className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, marginTop: 4 }}>
                          {axis.success_criteria && <div><span className="eyebrow" style={{ display: 'inline-block', marginRight: 4 }}>criteria</span>{axis.success_criteria}</div>}
                          {axis.partial_credit !== undefined && <div><span className="eyebrow" style={{ display: 'inline-block', marginRight: 4 }}>partial credit</span>{axis.partial_credit}</div>}
                          {axis.judge_llm && <div><span className="eyebrow" style={{ display: 'inline-block', marginRight: 4 }}>judge</span>{axis.judge_llm}</div>}
                        </div>
                      )}
                    </div>
                    <Badge tone={axis.pass === false ? 'critical' : axis.pass === true ? 'healthy' : 'neutral'}>{axis.pass === false ? 'fail' : axis.pass === true ? 'pass' : 'unknown'}</Badge>
                  </div>
                )) : (
                  <div className="lead-artifact-empty">No judge axis evidence was attached to this artifact.</div>
                )}
              </div>
              <div>
                <div className="eyebrow">normalized payload</div>
                <pre className="mono eval-artifact-json">{JSON.stringify(artifactPayload || {}, null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="evals-grid">
        {/* Suites table */}
        <Card title={`suites · ${visibleSuites.length}`} action={<button className="btn btn--ghost btn--xs" aria-pressed={suiteFilter === 'regressions'} onClick={() => setSuiteFilter(f => f === 'all' ? 'regressions' : 'all')}><I3.Filter size={10}/>{suiteFilter === 'all' ? 'regressions' : 'all suites'}</button>}>
          <div className="vstack" style={{gap:0}}>
            {visibleSuites.map(s => (
              <div key={s.id}
                className="eval-suite-row inspectable"
                data-popout={s.draft
                  ? `${s.name}: draft suite for ${s.agentName || s.owner}; ${s.scenarioFocus}`
                  : `${s.name}: ${(s.pass * 100).toFixed(1)}% pass rate, ${(s.delta * 100).toFixed(1)}% delta, ${s.runs.toLocaleString()} runs`}
                data-active={activeId === s.id}
                data-draft={s.draft ? 'true' : 'false'}
                style={{paddingLeft: activeId === s.id ? 10 : 4}}>
                <button className="eval-suite-row__select" aria-pressed={activeId === s.id} onClick={()=>selectEvalSuite(s)}>
                  <div className="eval-suite-row__copy">
                    <div className="eval-suite-row__title">{s.name}</div>
                    <div
                      className="mono eval-suite-row__meta"
                      aria-label={s.draft
                        ? `draft suite, ${s.agentName || s.owner}, target ${evalPct(s.targetPass || s.pass)}`
                        : `${s.runs.toLocaleString()} runs, last ${s.latest}, owner ${s.owner}`}
                    >
                      {s.draft ? (
                        <>
                          <span className="eval-suite-row__meta-item">draft</span>
                          <span className="eval-suite-row__meta-item">{s.agentName || s.owner}</span>
                          <span className="eval-suite-row__meta-item">target {evalPct(s.targetPass || s.pass)}</span>
                        </>
                      ) : (
                        <>
                          <span className="eval-suite-row__meta-item">{s.runs.toLocaleString()} runs</span>
                          <span className="eval-suite-row__meta-item">last {s.latest}</span>
                          <span className="eval-suite-row__meta-item">owner {s.owner}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="eval-suite-row__metric">
                    <div className="progress" style={{marginBottom:4}}>
                      <div className={`progress__fill progress__fill--${s.draft || s.pass >= 0.85 ? 'healthy' : s.pass >= 0.75 ? 'accent' : 'warn'}`} style={{width:`${(s.draft ? (s.targetPass || s.pass || 0) : s.pass) * 100}%`}}/>
                    </div>
                    <div className="mono num" style={{fontSize:11, color:'var(--text-2)'}}>{s.draft ? 'draft' : `${(s.pass*100).toFixed(1)}%`}</div>
                  </div>
                  <div className={`eval-suite-row__delta mono num ${s.delta > 0 ? 'cl-ok' : s.delta < 0 ? 'cl-err' : 'dim'}`}>
                    {s.draft ? 'new' : `${s.delta > 0 ? '▲' : s.delta < 0 ? '▼' : '·'} ${(Math.abs(s.delta)*100).toFixed(1)}%`}
                  </div>
                </button>
                <button className="btn btn--ghost btn--icon" aria-label={`${s.draft ? 'Queue' : 'Re-run'} ${s.name}`} onClick={(e)=>{e.stopPropagation(); rerunEvalSuite(s); }}><I3.Play size={12}/></button>
              </div>
            ))}
          </div>
        </Card>

        {/* Harness detail */}
        <div className="vstack" style={{gap:18}}>
          <Card title={`suite · ${active.id}`} accent={active.delta < 0 ? 'violet' : 'accent'}>
            <div className="eval-suite-detail">
              <div>
                <div style={{fontSize:15, fontWeight:600, marginBottom:6}}>{active.name}</div>
                <div className="mono" style={{fontSize:11, color:'var(--text-3)'}}>
                  {active.draft
                    ? `draft · ${active.agentName || active.owner} · target ${evalPct(active.targetPass || active.pass)}`
                    : `owner: ${active.owner} · last: ${active.latest}`}
                </div>
              </div>
              <div>
                <div className="eyebrow">{active.draft ? 'Target' : 'Pass rate'}</div>
                <div className="eval-kpi eval-kpi--healthy">{active.draft ? evalPct(active.targetPass || active.pass) : `${(active.pass*100).toFixed(1)}%`}</div>
              </div>
              <div>
                <div className="eyebrow">{active.draft ? 'Status' : 'Δ vs prev'}</div>
                <div className={`eval-kpi ${active.delta < 0 ? 'eval-kpi--critical' : 'eval-kpi--healthy'}`}>
                  {active.draft ? 'draft' : `${active.delta > 0 ? '+' : ''}${(active.delta*100).toFixed(1)}%`}
                </div>
              </div>
            </div>
            {active.draft ? (
              <div className="eval-suite-draft-focus" data-testid="eval-suite-draft-focus">
                <div className="eyebrow eyebrow--accent">scenario focus</div>
                <p>{active.scenarioFocus}</p>
              </div>
            ) : (
              <>
                <div className="eyebrow" style={{marginTop:16, marginBottom:6}}>14-day trend</div>
                <Sparkline
                  data={suiteTrendSeries}
                  h={56}
                  w={360}
                  fill={true}
                  pointLabels={suiteTrendLabels}
                  label={`${active.name}: 14-day pass-rate trend ending at ${(active.pass * 100).toFixed(1)}%`}
                />
              </>
            )}
          </Card>

          <Card title={`harness runs · ${runFilterLabel}${normalizedRuns.length > 0 ? ` · ${visibleRuns.length}` : ''}`} action={
            <span className="hstack" style={{gap:8, alignItems:'center'}}>
              <span className="mono dim" data-testid="eval-runs-filter-summary" style={{fontSize:10}}>
                {evalRunFilterSummary}
              </span>
              <span data-testid="eval-runs-source-badge">
                <Badge
                  tone={runsState === 'live' ? 'healthy' : runsState === 'fixture' ? 'accent' : runsState === 'loading' ? 'neutral' : runsState === 'error' ? 'critical' : 'neutral'}
                >{runsState}</Badge>
              </span>
              <button
                className="btn btn--ghost btn--xs"
                data-testid="eval-runs-filter-toggle"
                aria-pressed={runFilter === 'fail'}
                onClick={toggleFailureRuns}
              ><I3.Flag size={10}/>{runFilter === 'fail' ? 'show all runs' : 'show failures'}</button>
            </span>
          }>
            <div className="eval-run-list" role="group" aria-label="Evaluation harness runs">
              {runsState === 'loading' && (
                <div className="empty" style={{padding:18}} data-testid="eval-runs-loading">Loading harness runs…</div>
              )}
              {runsState === 'error' && (
                <div className="empty eval-runs-error" style={{padding:18}} data-testid="eval-runs-error" role="alert">
                  <div style={{fontWeight:600, marginBottom:4}}>Couldn't load harness runs</div>
                  <div className="muted" style={{fontSize:12, marginBottom:10}}>
                    {runsError ? `Reason: ${runsError}` : 'Both /api/eval-runs and the bundled fixture failed.'}
                  </div>
                  <button
                    className="btn btn--primary btn--sm"
                    data-testid="eval-runs-retry"
                    onClick={() => { reloadEvalRuns(); globalThis.toast('Retrying harness runs', { tone:'accent' }); }}
                  ><I3.Refresh size={12}/>Retry</button>
                </div>
              )}
              {runsState !== 'loading' && runsState !== 'error' && visibleRuns.length === 0 && (
                <div className="empty" style={{padding:18}} data-testid="eval-runs-empty">
                  {normalizedRuns.length === 0
                    ? 'Harness has no runs yet — kick off a scenario from the bridge above.'
                    : `No runs match the "${runFilter}" filter.`}
                </div>
              )}
              {visibleRuns.slice(0, 8).map(r => (
                <div
                  key={r.scenario_id}
                  className="eval-run-row inspectable"
                  data-popout={`${r.scenario_id}: ${r.verdict}, ${evalPct(r.score.weighted)} score, ${(r.score.axes || []).filter(axis => axis.pass === false).length} failed axes`}
                  data-verdict={r.verdict}
                  data-active={activeRun?.scenario_id === r.scenario_id}
                  onClick={() => selectEvalRun(r)}
                >
                  <button
                    className="eval-run-row__select"
                    aria-pressed={activeRun?.scenario_id === r.scenario_id}
                    onClick={(e) => { e.stopPropagation(); selectEvalRun(r); }}
                  >
                    <div>
                      <div className="eval-run-row__title">{evalScenarioTitle(r.scenario_id)}</div>
                      <div className="mono dim" style={{fontSize:10}}>
                        <span data-testid="eval-run-row-scenario-id">scenario {r.scenario_id}</span> · {r.agent_id} · {r.prompt_tag}
                      </div>
                    </div>
                    <Badge tone={r.verdict === 'pass' ? 'healthy' : r.verdict === 'fail' ? 'critical' : 'neutral'}>{r.verdict}</Badge>
                    <div
                      className="eval-run-row__latency"
                      data-tone={evalLatencyTone(r.duration_ms)}
                      data-testid="eval-run-row-latency"
                      data-duration-ms={Number.isFinite(r.duration_ms) ? r.duration_ms : ''}
                      title={Number.isFinite(r.duration_ms) ? `total-turn latency · budget ≤ ${evalDuration(LATENCY_BUDGET.total_turn_p95_ms)}` : 'no latency captured'}
                    >{Number.isFinite(r.duration_ms) ? evalDuration(r.duration_ms) : '--'}</div>
                    <div className="eval-score-pill" data-tone={evalScoreTone(r.score.weighted)}>{evalPct(r.score.weighted)}</div>
                  </button>
                  <button
                    className="btn btn--ghost btn--icon"
                    aria-label={`Review local evidence for ${r.scenario_id}`}
                    title="Review local evidence"
                    onClick={(e) => { e.stopPropagation(); selectEvalRun(r); openEvalArtifactPanelForRun(r); }}
                  ><I3.Bracket size={12}/></button>
                </div>
              ))}
            </div>
          </Card>

          <Card title={`run detail · ${activeRun ? evalScenarioTitle(activeRun.scenario_id) : 'none'}`} accent={activeRun?.verdict === 'fail' ? 'violet' : 'accent'}>
            {!activeRun && <div className="empty" style={{padding:18}}>No harness run selected.</div>}
            {activeRun && (
              <div className="eval-detail-grid">
                <div className="eval-detail-main">
                  <div className="eval-meta-strip">
                    <Badge tone={activeRun.verdict === 'pass' ? 'healthy' : 'critical'}>{activeRun.verdict}</Badge>
                    <span className="mono">{evalPct(activeRun.score.weighted)}</span>
                    <span className="mono"><span className="eval-meta-strip__label">scenario</span>{activeRun.scenario_id}</span>
                    <span className="mono"><span className="eval-meta-strip__label">prompt</span>{activeRun.prompt_tag}</span>
                    <span className="mono"><span className="eval-meta-strip__label">harness</span>{activeRun.harness_version}</span>
                    <span className="mono">{evalDate(activeRun.started_at)}</span>
                  </div>
                  <div className="eval-axis-stack">
                    {activeAxes.map(axis => (
                      <div key={axis.name}
                        className="eval-axis-row inspectable"
                        data-popout={`${axis.name}: ${axis.pass ? 'pass' : 'fail'}, weight ${axis.weight}. ${axis.detail}`}
                        data-pass={axis.pass ? 'true' : 'false'}>
                        <div>
                          <div className="mono" style={{fontSize:12, fontWeight:700}}>{axis.name}</div>
                          <div style={{fontSize:12, color:'var(--text-2)', marginTop:3}}>{axis.detail}</div>
                        </div>
                        <Badge tone={axis.pass ? 'healthy' : 'critical'}>{axis.pass ? 'pass' : 'fail'}</Badge>
                        <span className="mono dim">{axis.weight}x</span>
                      </div>
                    ))}
                    {activeAxes.length === 0 && <div className="empty">No per-axis scores were emitted by this run.</div>}
                  </div>

                  {/* Latency breakdown — voice_ai_agent_evals harness emits
                      ttfb / end_to_first_audio / total_turn sample arrays
                      per run. Surface mean + p95 + sample count so the
                      console isn't lying about coverage. */}
                  {activeRun.latency_breakdown && (() => {
                    const rows = [
                      { key: 'ttfb', label: 'TTFB', samples: activeRun.latency_breakdown.ttfb || [], budget: LATENCY_BUDGET.ttfb_p95_ms },
                      { key: 'end_to_first_audio', label: 'First-audio', samples: activeRun.latency_breakdown.end_to_first_audio || [], budget: LATENCY_BUDGET.end_to_first_audio_p95_ms },
                      { key: 'total_turn', label: 'Total turn', samples: activeRun.latency_breakdown.total_turn || [], budget: LATENCY_BUDGET.total_turn_p95_ms },
                    ].filter(r => r.samples.length > 0);
                    if (rows.length === 0) return null;
                    return (
                      <div className="eval-latency-breakdown" data-testid="eval-latency-breakdown" style={{marginTop:12, padding:'10px 12px', background:'var(--bg-inset)', borderRadius:'var(--r-md)'}}>
                        <div className="eyebrow eyebrow--accent" style={{marginBottom:6}}>latency breakdown · live samples</div>
                        <div style={{display:'grid', gap:6}}>
                          {rows.map(r => {
                            const mean = r.samples.reduce((s, v) => s + v, 0) / r.samples.length;
                            const p95 = evalPercentile(r.samples, 95);
                            const tone = p95 > r.budget ? 'cl-err' : p95 > r.budget * 0.85 ? 'cl-warn' : 'cl-ok';
                            return (
                              <div key={r.key} data-testid="eval-latency-row" data-axis={r.key} data-tone={tone} style={{display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12}}>
                                <span className="mono">{r.label}</span>
                                <span className="mono dim" style={{flex:1, textAlign:'center'}}>n={r.samples.length} · mean {evalDuration(Math.round(mean))}</span>
                                <span className={`mono num ${tone}`}>p95 {evalDuration(Math.round(p95))} <span className="dim">/ {evalDuration(r.budget)}</span></span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Tool-call latency aggregation — the harness records each
                      tool call with round_trip_ms + schema_pass; surface them
                      so the operator can spot a slow tool-call before it
                      blows the total-turn budget. */}
                  {activeRun.tool_calls?.length > 0 && (
                    <div className="eval-tool-calls" data-testid="eval-tool-calls" style={{marginTop:12, padding:'10px 12px', background:'var(--bg-inset)', borderRadius:'var(--r-md)'}}>
                      <div className="eyebrow eyebrow--accent" style={{marginBottom:6}}>tool calls · {activeRun.tool_calls.length}</div>
                      <div style={{display:'grid', gap:6}}>
                        {activeRun.tool_calls.map((tc, i) => {
                          const tone = tc.schema_pass ? (tc.round_trip_ms != null && tc.round_trip_ms > 1500) ? 'cl-warn' : 'cl-ok' : 'cl-err';
                          return (
                            <div key={`${tc.name}-${i}`} data-testid="eval-tool-call-row" data-tool-name={tc.name} data-schema-pass={tc.schema_pass ? 'true' : 'false'} style={{display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12}}>
                              <span className="mono">{tc.name}</span>
                              <span className="mono dim" style={{flex:1, textAlign:'center'}}>
                                schema {tc.schema_pass ? 'pass' : 'fail'}{tc.response_consumed_in_next_turn ? ' · response consumed' : ' · response orphan'}
                              </span>
                              <span className={`mono num ${tone}`}>
                                {tc.round_trip_ms == null ? '—' : `${tc.round_trip_ms}ms`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <window.ElevenUI.TranscriptViewer
                  run={activeRun}
                  detail={runDetail}
                  replaying={replaying}
                  onReplay={() => setReplaying(v => !v)}
                />
              </div>
            )}
          </Card>
        </div>

        {/* ElevenLabs lab */}
        <div className="vstack eval-agent-column" style={{gap:18, minWidth:0}}>
          <Card title="elevenlabs ui · live agent lab" accent="accent" action={
            <button
              className="btn btn--ghost btn--xs"
              data-testid="eval-local-agent-admin"
              disabled={!canOpenEvalAgentAdmin}
              title={canOpenEvalAgentAdmin ? 'Open this eval run in local agent admin' : 'Load a harness run before opening local agent admin'}
              aria-label={canOpenEvalAgentAdmin ? 'Open selected eval run in local agent admin' : 'Local agent admin unavailable until a harness run loads'}
              onClick={openEvalAgentAdmin}
            ><I3.Bot size={10}/>local admin</button>
          }>
            <div
              className="eval-agent-readiness"
              data-testid="eval-agent-readiness"
              data-tone={evalLabReadiness.tone}
              role="status"
              aria-live="polite"
            >
              <div>
                <div className="eyebrow eyebrow--accent">{evalLabReadiness.label}</div>
                <strong>{evalLabReadiness.title}</strong>
                <p>{evalLabReadiness.body}</p>
              </div>
              <Badge tone={evalLabReadiness.tone === 'critical' ? 'critical' : evalLabReadiness.tone === 'healthy' ? 'healthy' : 'neutral'}>{evalLabReadiness.badge}</Badge>
            </div>
            <div className="el-agent-panel">
              <div className="el-agent-panel__head">
                <window.ElevenUI.Orb
                  state={evalAgentSession.orbState}
                  color1={activeAgent?.avatar_color_1}
                  color2={activeAgent?.avatar_color_2}
                  label={`${activeAgent?.display_name || 'ElevenLabs'} eval agent`}
                />
                <div>
                  <div style={{fontWeight:700, fontSize:15}}>{activeAgent?.display_name || 'ElevenLabs agent'}</div>
                  <div className="mono dim" style={{fontSize:10}}>{evalAgentSession.subtitle}</div>
                </div>
              </div>
              <window.ElevenUI.BarVisualizer
                active={evalAgentSession.barActive}
                tone={evalAgentSession.barTone}
                bars={evalAgentSession.bars}
              />
              <div className="el-conversation-bar" role="status" aria-live="polite">
                <I3.Mic size={14}/>
                <span>{evalAgentSession.status}</span>
                <Badge tone={evalAgentSession.badgeTone}>{evalAgentSession.badge}</Badge>
              </div>
              <div className="eval-sync-bar" style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                <button
                  className="btn btn--primary btn--sm"
                  data-testid="eval-sync-context-evidence"
                  disabled={!canSyncEvalEvidence}
                  title={canSyncEvalEvidence ? 'Sync this harness run into agent context and open its evidence drawer' : 'Load a harness run before syncing context and evidence'}
                  aria-label={canSyncEvalEvidence ? 'Sync selected eval run context and evidence' : 'Context and evidence sync unavailable until a harness run loads'}
                  onClick={syncActiveEvalContextEvidence}
                ><I3.Refresh size={12}/>Sync context &amp; evidence</button>
                {lastSyncedAt && (
                  <span
                    className="mono dim eval-sync-stamp"
                    data-testid="eval-sync-stamp"
                    aria-live="polite"
                    style={{fontSize:10}}
                  >synced {lastSyncedAt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>
                )}
              </div>
            </div>

            <div className="eval-convai-frame" role="region" aria-label="ElevenLabs regression chat">
              {liveLatency && (
                <div className="eval-live-latency" data-testid="eval-live-latency" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-inset)', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span className="eyebrow eyebrow--accent">live latency</span>
                  <span className="mono num" style={{ color: liveLatency.ttfb > 1000 ? 'var(--warn-fg)' : 'var(--healthy-fg)' }}>
                    ttfb: {Math.round(liveLatency.ttfb)}ms {liveLatency.first_audio ? ` · first audio: ${Math.round(liveLatency.first_audio)}ms` : ''}
                  </span>
                </div>
              )}
              {/* surface="eval_lab" pulls the regression labels +
                  text-only mode out of agents-registry.js#surfaces.
                  The per-run `firstMessage` is still call-site-driven
                  because it interpolates the active scenario id; the
                  surface block's firstMessage is the no-run-loaded
                  default. */}
              <window.ConvaiWidget
                agentKey={activeAgentKey}
                surface="eval_lab"
                firstMessage={`Review eval run ${activeRun?.scenario_id || activeId}. Focus on failed axes and propose the smallest prompt or tool fix.`}
                height="100%"
                width="100%"
              />
            </div>
          </Card>

          <Card title="judge panel · agreement">
            <div className="vstack" style={{gap:8}}>
              {[
                { name:'judge-precision', model:'haiku-4.5', agree:0.94 },
                { name:'judge-tone',      model:'haiku-4.5', agree:0.91 },
                { name:'judge-policy',    model:'sonnet-4.5', agree:0.97 },
              ].map(j => (
                <div key={j.name}
                  className="inspectable"
                  data-popout={`${j.name}: ${(j.agree * 100).toFixed(0)}% agreement on ${j.model}`}
                  style={{display:'grid', gridTemplateColumns:'1fr auto 60px', gap:12, alignItems:'center', fontSize:12}}>
                  <div>
                    <div className="mono" style={{fontSize:12, fontWeight:600}}>{j.name}</div>
                    <div className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{j.model}</div>
                  </div>
                  <div className="progress" style={{width:80}}>
                    <div className="progress__fill progress__fill--healthy" style={{width:`${j.agree*100}%`}}/>
                  </div>
                  <div className="mono num" style={{fontSize:12, textAlign:'right'}}>{(j.agree*100).toFixed(0)}%</div>
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
/* PROPOSALS */
/* ------------------------------------------------------------ */
function ProposalsPage({ setRoute }) {
  const D = globalThis.GTM;
  const initialProposal = globalThis.AppContext.get().selection;
  const initialProposalId = initialProposal?.type === 'proposal' && D.proposals.some(p => p.id === initialProposal.id)
    ? initialProposal.id
    : (D.proposals[0]?.id || 'PR-2041');
  const [activeId, setActiveId] = useState(initialProposalId);
  const [filter, setFilter] = useState('all');
  const [proposalWorkflow, setProposalWorkflow] = useState(null);
  const [resendForm, setResendForm] = useState({ recipient: '', cc: '', note: '' });
  // Persist per-proposal re-send receipts so the operator can see at a
  // glance which proposals have already been re-sent. Without this, the
  // composer toasted and forgot — re-sending the same proposal twice was
  // effortless because the UI carried no proof of the prior send.
  // Shape: { [proposalId]: { recipient, ccCount, sentAt: iso8601 } }
  const [resentProposals, setResentProposals] = useState({});
  const [reviewArtifactKey, setReviewArtifactKey] = useState('proposal');
  const [reviewArtifactPayload, setReviewArtifactPayload] = useState(null);
  const [reviewArtifactState, setReviewArtifactState] = useState('idle');
  const proposalWorkflowRef = useRef(null);
  const active = D.proposals.find(p => p.id === activeId) || D.proposals[0];
  const proposalReviewPacket = (proposal) => {
    const rawArtifacts = Array.isArray(proposal?.artifacts) ? proposal.artifacts : [];
    const findArtifact = (type) => rawArtifacts.find(a => a?.type === type);
    const usableWebPath = (artifact) => {
      const webPath = String(artifact?.webPath || '').trim();
      if (!webPath || webPath === '#') return '';
      if (/sample-proposal\.(?:pdf|json)(?:$|\?)/i.test(webPath)) return '';
      return webPath;
    };
    const pdf = findArtifact('pdf');
    const json = findArtifact('json');
    const audit = findArtifact('pdf_internal');
    const items = [
      {
        key: 'proposal',
        label: 'Proposal PDF',
        sourcePath: pdf?.path || `review/${proposal?.id || 'proposal'}/proposal.pdf`,
        previewPath: usableWebPath(pdf),
        state: proposal?.stage === 'signed' ? 'sent' : (proposal?.blockers?.length ? 'needs review' : 'ready'),
      },
      {
        key: 'source',
        label: 'Source evidence',
        sourcePath: json?.path || `review/${proposal?.id || 'proposal'}/source-evidence.json`,
        previewPath: usableWebPath(json),
        state: 'bound',
      },
      {
        key: 'audit',
        label: 'Audit packet',
        sourcePath: audit?.path || `review/${proposal?.id || 'proposal'}/audit-report.pdf`,
        previewPath: usableWebPath(audit),
        state: proposal?.auditScore ? `score ${proposal.auditScore}` : 'pending',
      },
    ];
    return {
      packetId: proposal?.executionId || proposal?.id || 'proposal-review',
      mode: globalThis.DEMO_MODE ? 'demo review' : 'live review',
      gate: proposal?.blockers?.length ? 'blocker_review' : (proposal?.stage === 'signed' ? 'sent_review' : 'operator_review'),
      items,
      pdf: items[0],
    };
  };
  const activeReview = proposalReviewPacket(active);
  const selectedReviewArtifact = activeReview.items.find(item => item.key === reviewArtifactKey) || activeReview.pdf;
  const selectedReviewIsJson = selectedReviewArtifact.key === 'source' || /\.json(?:$|\?)/i.test(String(selectedReviewArtifact.previewPath || ''));
  const localProposalArtifactPayload = (proposal, artifact, review) => ({
    artifact_id: `${review.packetId}:${artifact.key}`,
    proposal_id: proposal.id,
    buyer: proposal.co,
    artifact: artifact.label,
    source_path: artifact.sourcePath,
    status: artifact.key === 'source' ? 'source_evidence_bound' : 'local_review_sheet',
    stage: proposal.stage,
    gate: review.gate,
    annual_value: proposal.amount,
    owner: proposal.owner,
    sent: proposal.sent,
    viewed: proposal.viewed,
    section_progress: {
      accepted: proposal.accepted,
      total: proposal.sections,
    },
    blockers: Array.isArray(proposal.blockers) ? proposal.blockers : [],
    note: 'Generated in-console from the selected proposal record; no shared sample artifact is used.',
  });

  const defaultRecipient = (proposal) => {
    if (!proposal?.co) return '';
    const words = String(proposal.co).toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    const local = words[0];
    const host = words.length > 1 ? [...words].join('').replace(/[^a-z0-9]/g, '') : words[0];
    return `${local}@${host}.example`;
  };
  const openResend = () => {
    setResendForm({
      recipient: defaultRecipient(active),
      cc: '',
      note: `Re-sending ${active.id} for review. ${active.blockers?.length ? `${active.blockers.length} blocker${active.blockers.length === 1 ? '' : 's'} remain.` : 'Sections look ready.'}`,
    });
    setProposalWorkflow({
      kind: 'send',
      title: `Re-send ${active.id}`,
      sub: `Tracking enabled · owner ${active.owner} · stage ${active.stage}`,
      tone: 'accent',
    });
  };
  const openProposalReview = () => {
    setReviewArtifactKey('proposal');
    setProposalWorkflow({
      kind: 'viewer',
      title: `${active.id} · ${active.co}`,
      sub: `${active.accepted}/${active.sections} sections accepted · ${active.amount} annual · ${activeReview.packetId}`,
      tone: active.blockers?.length ? 'critical' : 'accent',
    });
  };
  const activeBlockers = Array.isArray(active?.blockers) ? active.blockers : [];
  const activeBlockerCount = activeBlockers.length;
  const addressBlockers = () => {
    // Short-circuit when the proposal has no blockers — the action is
    // meaningless ("0 blockers carried" gives the operator nothing to
    // address) and the navigation would land on Generate with a brief
    // that just says "OUTSTANDING BLOCKERS:" followed by an empty list.
    if (activeBlockerCount === 0) {
      return;
    }
    const ctx = globalThis.AppContext.get();
    globalThis.AppContext.set({
      extra: {
        ...ctx.extra,
        triggered_from: 'proposal-address-blockers',
        address_blockers_proposal_id: active.id,
        address_blockers_co: active.co,
        address_blockers_list: activeBlockers,
      },
    });
    setRoute('generate');
  };
  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
  const submitResend = (e) => {
    e.preventDefault();
    const recipient = resendForm.recipient.trim();
    if (!validEmail(recipient)) {
      globalThis.toast('Recipient email is invalid', { sub: 'fix the To field before re-sending', tone: 'critical' });
      return;
    }
    const ccCount = resendForm.cc.split(/[\s,;]+/).filter(s => s && validEmail(s)).length;
    setResentProposals(prev => ({
      ...prev,
      [active.id]: { recipient, ccCount, sentAt: new Date().toISOString() },
    }));
    globalThis.toast(`${active.id} re-sent to ${recipient}`, {
      sub: ccCount ? `cc: ${ccCount} · tracking enabled` : 'tracking enabled',
      tone: 'accent',
    });
    setProposalWorkflow(null);
  };
  const filtered = D.proposals.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'open') return isOpenProposalStage(p.stage);
    return true;
  });
  const filteredProposalIds = filtered.map(p => p.id).join('|');
  const openProposalCount = D.proposals.filter(p => isOpenProposalStage(p.stage)).length;
  const proposalTotal = formatProposalTotal(D.proposals.reduce((sum, p) => sum + proposalAmountToThousands(p.amount), 0));
  const proposalListLabel = filter;
  const blockedProposalCount = D.proposals.filter(p => Array.isArray(p.blockers) && p.blockers.length > 0).length;
  const blockerCount = D.proposals.reduce((s, p) => s + (Array.isArray(p.blockers) ? p.blockers.length : 0), 0);
  const signedProposalCount = D.proposals.filter(p => String(p.stage || '').toLowerCase() === 'signed').length;
  const totalSections = D.proposals.reduce((sum, p) => sum + (Number(p.sections) || 0), 0);
  const acceptedSections = D.proposals.reduce((sum, p) => sum + (Number(p.accepted) || 0), 0);
  const acceptanceRate = totalSections > 0 ? Math.round((acceptedSections / totalSections) * 100) : 0;

  // Publish active proposal so the sales coach can copilot it.
  useEffect(() => {
    globalThis.AppContext.set({ selection: { type:'proposal', id: activeId }});
    return () => { globalThis.AppContext.set({ selection: null }); };
  }, [activeId]);
  useEffect(() => globalThis.AppContext.subscribe((ctx) => {
    if (ctx.selection?.type === 'proposal' && D.proposals.some(p => p.id === ctx.selection.id)) {
      setActiveId(ctx.selection.id);
    }
  }), []);
  useEffect(() => {
    if (filtered.length > 0 && !filtered.some(p => p.id === activeId)) {
      setActiveId(filtered[0].id);
    }
  }, [activeId, filteredProposalIds]);
  useEffect(() => {
    setReviewArtifactKey('proposal');
    setReviewArtifactPayload(null);
    setReviewArtifactState('idle');
  }, [activeId]);
  useEffect(() => {
    if (proposalWorkflow?.kind !== 'viewer') return undefined;
    if (!selectedReviewIsJson) {
      setReviewArtifactPayload(null);
      setReviewArtifactState('idle');
      return undefined;
    }
    if (!selectedReviewArtifact.previewPath) {
      setReviewArtifactPayload(localProposalArtifactPayload(active, selectedReviewArtifact, activeReview));
      setReviewArtifactState('ready');
      return undefined;
    }
    let cancelled = false;
    setReviewArtifactState('loading');
    fetch(selectedReviewArtifact.previewPath)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText || 'artifact unavailable'}`)))
      .then(data => {
        if (cancelled) return;
        setReviewArtifactPayload(data);
        setReviewArtifactState('ready');
      })
      .catch(err => {
        if (cancelled) return;
        setReviewArtifactPayload({
          artifact: selectedReviewArtifact.label,
          source_path: selectedReviewArtifact.sourcePath,
          preview_path: selectedReviewArtifact.previewPath,
          status: 'preview_unavailable',
          error: err?.message || 'Unable to load artifact preview',
        });
        setReviewArtifactState('error');
      });
    return () => { cancelled = true; };
  }, [proposalWorkflow?.kind, selectedReviewArtifact.key, selectedReviewArtifact.previewPath, selectedReviewIsJson]);
  useEffect(() => {
    if (!proposalWorkflow) return undefined;
    const frame = requestAnimationFrame(() => {
      globalThis.scrollConsoleNodeIntoView?.(proposalWorkflowRef.current, { block:'start', margin:18 });
      proposalWorkflowRef.current?.focus?.({ preventScroll:true });
    });
    return () => cancelAnimationFrame(frame);
  }, [proposalWorkflow?.kind, active.id]);

  return (
    <div className="page page--proposals">
      <PageHeader
        eyebrow={`${D.proposals.length} proposals · ${openProposalCount} open · ${proposalTotal} total`}
        title="Proposals"
        sub={(() => {
          // Derive sub from live proposals state. Previous "auto-assembled
          // from call signals" referenced a generation pipeline that
          // doesn't run inside the proposals page itself — that's the
          // Generate page's job.
          const blockerCount = D.proposals.reduce((s, p) => s + (Array.isArray(p.blockers) ? p.blockers.length : 0), 0);
          const blocked = D.proposals.filter(p => Array.isArray(p.blockers) && p.blockers.length > 0).length;
          return `${blocked} of ${D.proposals.length} proposal${D.proposals.length === 1 ? '' : 's'} carry open blockers (${blockerCount} total). Use Address blockers to draft a v-next packet that names each one.`;
        })()}
        actions={<>
          <Segmented value={filter} onChange={setFilter} options={[
            { value:'all', label:`All (${D.proposals.length})`, ariaLabel:'All' },
            { value:'open', label:`Open (${openProposalCount})`, ariaLabel:'Open' },
          ]} />
          <button className="btn btn--primary btn--sm" onClick={() => setRoute('generate')}><I3.Plus size={12}/>Generate proposal</button>
        </>}
      />

      <section className="proposals-command-strip" aria-label="Proposal review queue">
        <div className="proposal-kpi">
          <span className="eyebrow eyebrow--accent">open review</span>
          <strong>{openProposalCount}</strong>
          <span>open approvals</span>
        </div>
        <div className="proposal-kpi" data-state={blockedProposalCount > 0 ? 'blocked' : 'clear'}>
          <span className="eyebrow eyebrow--accent">blockers</span>
          <strong>{blockerCount}</strong>
          <span>{blockedProposalCount} proposal{blockedProposalCount === 1 ? '' : 's'}</span>
        </div>
        <div className="proposal-kpi">
          <span className="eyebrow eyebrow--accent">accepted</span>
          <strong>{acceptanceRate}%</strong>
          <span>{acceptedSections}/{totalSections} sections</span>
        </div>
        <div className="proposal-kpi">
          <span className="eyebrow eyebrow--accent">signed</span>
          <strong>{signedProposalCount}</strong>
          <span>{proposalTotal} reviewed</span>
        </div>
      </section>

      <div className="split split--2 proposals-workbench">
        <Card title={`${proposalListLabel} proposals · ${filtered.length}`} className="card--accent proposals-list-card">
          <div className="proposal-queue" role="list" aria-label={`${proposalListLabel} proposal queue`}>
            {filtered.map(p => {
              const rowBlockers = Array.isArray(p.blockers) ? p.blockers : [];
              return (
              <div key={p.id} role="listitem" className="proposal-queue-item">
                <button
                  type="button"
                  className="inspectable proposal-queue-row"
                  data-testid="proposal-row"
                  data-active={activeId === p.id ? 'true' : 'false'}
                  data-popout={`${p.id}: ${p.co}, ${p.amount}, ${p.stage}, ${p.accepted}/${p.sections} sections accepted`}
                  aria-label={`Select proposal ${p.id} for ${p.co}`}
                  aria-pressed={activeId === p.id}
                  onClick={()=>setActiveId(p.id)}
                >
                  <div className="proposal-queue-row__main">
                    <div className="proposal-queue-row__meta">
                      <span className="mono proposal-queue-row__id">{p.id}</span>
                      <Badge tone={p.stage === 'signed' ? 'healthy' : p.stage === 'legal' || p.stage === 'redlines' ? 'warn' : 'accent'}>{p.stage}</Badge>
                      {rowBlockers.length > 0 && <Badge tone="critical">{rowBlockers.length} blocker{rowBlockers.length > 1 ? 's' : ''}</Badge>}
                    </div>
                    <div className="proposal-queue-row__company">{p.co}</div>
                    <div className="mono proposal-queue-row__activity">
                      sent {p.sent} · viewed {p.viewed} · {p.accepted}/{p.sections} sections accepted
                    </div>
                  </div>
                  <div className="proposal-queue-row__value">
                    <div className="mono num">{p.amount}</div>
                    <div className="eyebrow">value</div>
                  </div>
                </button>
              </div>
            );})}
          </div>
        </Card>

        <div className="proposals-review-stack">
          <Card
            title={`detail · ${active.id}`}
            accent={activeBlockerCount > 0 ? 'violet' : 'accent'}
            className="proposal-detail-card"
            data-testid="proposal-detail-card"
          >
            <div className="proposal-detail__head">
              <div>
                <div className="proposal-detail__company">{active.co}</div>
                <div className="mono proposal-detail__meta">{active.id} · owner {active.owner} · gate {activeReview.gate}</div>
              </div>
              <div className="proposal-detail__amount">
                <div>{active.amount}</div>
                <div className="eyebrow">annual</div>
              </div>
            </div>

            <div className="proposal-detail__facts" aria-label={`${active.id} review facts`}>
              <div>
                <span className="eyebrow">stage</span>
                <strong>{active.stage}</strong>
              </div>
              <div>
                <span className="eyebrow">viewed</span>
                <strong>{active.viewed}</strong>
              </div>
              <div>
                <span className="eyebrow">sent</span>
                <strong>{active.sent}</strong>
              </div>
              <div>
                <span className="eyebrow">packet</span>
                <strong>{activeReview.packetId}</strong>
              </div>
            </div>

            <div className="proposal-progress-label">
              <span className="eyebrow">Section progress · {active.accepted}/{active.sections}</span>
              <span className="mono">{Math.round((active.accepted / Math.max(active.sections, 1)) * 100)}%</span>
            </div>
            <div className="proposal-progress" aria-hidden="true">
              {Array.from({length:active.sections}).map((_,i)=>(
                <div key={i} data-state={i < active.accepted ? 'accepted' : 'open'}/>
              ))}
            </div>

            {activeBlockerCount > 0 && (
              <div className="proposal-blockers">
                <div className="eyebrow eyebrow--accent">Blockers · {activeBlockerCount}</div>
                <div className="proposal-blockers__list">
                  {activeBlockers.map((b,i)=>(
                    <div key={i} className="proposal-blocker">
                      {b}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(() => {
              const receipt = resentProposals[active.id];
              if (!receipt) return null;
              const stamp = new Date(receipt.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div
                  className="proposal-resend-receipt"
                  data-testid="proposal-resend-receipt"
                  data-recipient={receipt.recipient}
                >
                  <Badge tone="healthy">re-sent @ {stamp}</Badge>
                  <span className="mono">
                    to {receipt.recipient}{receipt.ccCount ? ` · cc ${receipt.ccCount}` : ''}
                  </span>
                </div>
              );
            })()}
            <div className="proposal-detail__actions">
              <button className="btn btn--ghost btn--sm" onClick={openProposalReview}><I3.Eye size={12}/>Review packet</button>
              <button className="btn btn--ghost btn--sm" data-testid="proposal-resend-open" onClick={openResend}><I3.Mail size={12}/>{resentProposals[active.id] ? 'Re-send again' : 'Re-send'}</button>
              {(() => (
                <button
                  className="btn btn--primary btn--sm"
                  data-testid="proposal-address-blockers"
                  data-blocker-count={activeBlockerCount}
                  disabled={activeBlockerCount === 0}
                  title={activeBlockerCount === 0 ? 'No open blockers — nothing to address' : `${activeBlockerCount} blocker${activeBlockerCount === 1 ? '' : 's'} to address`}
                  onClick={addressBlockers}
                >{activeBlockerCount > 0 ? `Address blockers · ${activeBlockerCount}` : 'No blockers to address'}</button>
              ))()}
            </div>
          </Card>

          {proposalWorkflow && (
            <div
              ref={proposalWorkflowRef}
              className="workflow-popout workflow-popout--single"
              role="region"
              aria-label="Proposal workflow panel"
              tabIndex={-1}
            >
              <div className="workflow-popout__pane">
                <div style={{display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start'}}>
                  <div>
                    <div className="eyebrow eyebrow--accent">{proposalWorkflow.kind}</div>
                    <div className="workflow-popout__title">{proposalWorkflow.title}</div>
                  </div>
                  <button className="btn btn--ghost btn--icon" aria-label="Close proposal workflow panel" onClick={() => setProposalWorkflow(null)}><I3.Close size={14}/></button>
                </div>
                <div className="muted" style={{fontSize:12}}>{proposalWorkflow.sub}</div>
                {proposalWorkflow.kind === 'viewer' && (
                  <div className="proposal-review" data-testid="proposal-review-panel">
                    <div className="artifact-review__packet" data-testid="proposal-review-packet">
                      <div>
                        <div className="eyebrow eyebrow--accent">review packet</div>
                        <strong>{active.co} proposal packet</strong>
                        <p>PDF preview, source evidence, audit state, and buyer-send gate stay together before any re-send.</p>
                      </div>
                    </div>
                    <div className="artifact-drawer__facts" aria-label="Proposal review packet metadata">
                      <div>
                        <span className="eyebrow">review packet id</span>
                        <code className="mono" data-testid="proposal-review-packet-id">{activeReview.packetId}</code>
                      </div>
                      <div>
                        <span className="eyebrow">stage</span>
                        <code className="mono">{active.stage}</code>
                      </div>
                      <div>
                        <span className="eyebrow">gate</span>
                        <code className="mono" data-testid="proposal-review-gate">{activeReview.gate}</code>
                      </div>
                      <div>
                        <span className="eyebrow">mode</span>
                        <code className="mono" data-testid="proposal-review-mode">{activeReview.mode}</code>
                      </div>
                    </div>
                    <div className="proposal-review__artifacts" aria-label="Proposal artifact list">
                      {activeReview.items.map(item => (
                        <button
                          key={item.key}
                          type="button"
                          className="proposal-review__artifact"
                          data-testid="proposal-review-artifact"
                          data-active={selectedReviewArtifact.key === item.key ? 'true' : 'false'}
                          aria-pressed={selectedReviewArtifact.key === item.key}
                          aria-label={`Review ${item.label} artifact for ${active.id}`}
                          onClick={() => setReviewArtifactKey(item.key)}
                        >
                          <div>
                            <strong>{item.label}</strong>
                            <Badge tone={item.state.includes('needs') ? 'warn' : item.state.includes('pending') ? 'neutral' : 'healthy'}>{item.state}</Badge>
                          </div>
                          <code>{item.sourcePath}</code>
                          <span className="proposal-review__artifact-action">Review in console</span>
                        </button>
                      ))}
                    </div>
                    <div className="artifact-drawer__review proposal-review__preview" data-testid="proposal-review-artifact-preview">
                      {selectedReviewIsJson ? (
                        <>
                          {reviewArtifactState === 'loading' && (
                            <div className="lead-artifact-empty">Loading source evidence...</div>
                          )}
                          {reviewArtifactState !== 'loading' && (
                            <pre className="mono" data-testid="proposal-review-source-json">
                              {JSON.stringify(reviewArtifactPayload || {}, null, 2)}
                            </pre>
                          )}
                        </>
                      ) : (
                        selectedReviewArtifact.previewPath ? (
                          <iframe title={`${active.co} ${selectedReviewArtifact.label} review preview`} src={selectedReviewArtifact.previewPath}></iframe>
                        ) : (
                          <div className="proposal-pdf-preview" data-testid="proposal-pdf-bound-preview">
                            <div className="proposal-pdf-preview__chrome">
                              <span className="mono">wranngle / gtm_ops</span>
                              <span className="mono">{activeReview.mode}</span>
                            </div>
                            <div className="proposal-pdf-preview__sheet">
                              <div className="proposal-pdf-preview__masthead">
                                <div>
                                  <span className="eyebrow eyebrow--accent">{selectedReviewArtifact.label}</span>
                                  <h3 data-testid="proposal-review-pdf-title">{active.co}</h3>
                                  <p>{active.id} · {activeReview.packetId} · {active.stage}</p>
                                </div>
                                <div className="proposal-pdf-preview__amount">
                                  <strong>{active.amount}</strong>
                                  <span>annual</span>
                                </div>
                              </div>
                              <div className="proposal-pdf-preview__grid">
                                <div>
                                  <span className="eyebrow">review gate</span>
                                  <strong>{activeReview.gate}</strong>
                                </div>
                                <div>
                                  <span className="eyebrow">sections accepted</span>
                                  <strong>{active.accepted}/{active.sections}</strong>
                                </div>
                                <div>
                                  <span className="eyebrow">owner</span>
                                  <strong>{active.owner}</strong>
                                </div>
                              </div>
                              <div className="proposal-pdf-preview__block">
                                <span className="eyebrow eyebrow--accent">review notes</span>
                                <p>
                                  This preview is assembled from the selected proposal record so the packet identity,
                                  blockers, and approval gate match the proposal under review.
                                </p>
                              </div>
                              <div className="proposal-pdf-preview__block">
                                <span className="eyebrow">open blockers</span>
                                {activeBlockerCount > 0 ? (
                                  <ul>
                                    {activeBlockers.map(blocker => <li key={blocker}>{blocker}</li>)}
                                  </ul>
                                ) : (
                                  <p>No blockers are open on this packet.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                    <div className="artifact-drawer__actions">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={openResend}><I3.Mail size={12}/>Re-send from review</button>
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        data-testid="proposal-review-address-blockers"
                        data-blocker-count={activeBlockerCount}
                        disabled={activeBlockerCount === 0}
                        title={activeBlockerCount === 0 ? 'No open blockers — Generate handoff is unavailable' : `${activeBlockerCount} blocker${activeBlockerCount === 1 ? '' : 's'} carried into Generate`}
                        onClick={addressBlockers}
                      >{activeBlockerCount > 0 ? 'Address blockers in Generate' : 'No blockers to address'}</button>
                    </div>
                  </div>
                )}
                {proposalWorkflow.kind === 'send' && (
                  <form
                    className="proposal-resend-form"
                    onSubmit={submitResend}
                    aria-label={`Re-send ${active.id} form`}
                    data-testid="proposal-resend-form"
                  >
                    <label className="form-row">
                      <span className="form-row__label">To</span>
                      <input
                        type="email"
                        className="form-input"
                        data-testid="proposal-resend-recipient"
                        required
                        value={resendForm.recipient}
                        onChange={(e) => setResendForm(f => ({ ...f, recipient: e.target.value }))}
                      />
                    </label>
                    <label className="form-row">
                      <span className="form-row__label">CC <span className="mono dim">· comma-separated</span></span>
                      <input
                        type="text"
                        className="form-input"
                        data-testid="proposal-resend-cc"
                        value={resendForm.cc}
                        onChange={(e) => setResendForm(f => ({ ...f, cc: e.target.value }))}
                        placeholder="legal@example.com, owner@example.com"
                      />
                    </label>
                    <label className="form-row">
                      <span className="form-row__label">Note</span>
                      <textarea
                        className="form-input"
                        rows={3}
                        data-testid="proposal-resend-note"
                        value={resendForm.note}
                        onChange={(e) => setResendForm(f => ({ ...f, note: e.target.value }))}
                      />
                    </label>
                    <div className="proposal-resend-form__actions">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setProposalWorkflow(null)}>Cancel</button>
                      <button type="submit" className="btn btn--primary btn--sm" data-testid="proposal-resend-send"><I3.Mail size={12}/>Send</button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          <Card title={`proposal sections · ${active.accepted}/${active.sections}`}>
            <div className="proposal-sections-list" data-testid="proposal-sections-list">
              {/* Section list now derives from the active proposal:
                  - first N (accepted) cells = canonical accepted-section names
                  - remaining cells = real blocker names from the proposal,
                    so switching between proposals actually changes what
                    the operator sees. The static 7-row list silently
                    showed the same Banyan blockers ("Liability cap",
                    "Auto-renewal terms") for every proposal regardless
                    of which one was active. */}
              {(() => {
                const ACCEPTED_BANK = [
                  { n: 'Executive summary',           who: 'Priya' },
                  { n: 'Scope of work · Phase 1',    who: 'Priya' },
                  { n: 'Scope · Phase 2',             who: 'Marcus' },
                  { n: 'Implementation timeline',     who: 'Marcus' },
                  { n: 'Pricing · banded',            who: 'Marcus' },
                  { n: 'Security & compliance',       who: 'Sam' },
                  { n: 'SLA + support tiers',         who: 'Sam' },
                  { n: 'Mutual action plan',          who: 'Priya' },
                ];
                const acceptedRows = Array.from({ length: active.accepted }).map((_, idx) => ({
                  n: ACCEPTED_BANK[idx]?.n || `Section ${idx + 1}`,
                  who: ACCEPTED_BANK[idx]?.who || active.owner,
                  status: 'accepted',
                }));
                const remaining = Math.max(0, active.sections - active.accepted);
                const blockerRows = Array.from({ length: remaining }).map((_, idx) => {
                  const blockerName = (active.blockers || [])[idx];
                  return {
                    n: blockerName || `Section ${active.accepted + idx + 1} · open`,
                    who: 'Reena',
                    status: blockerName ? 'redline' : 'pending',
                  };
                });
                return [...acceptedRows, ...blockerRows];
              })().map((s, i) => (
                <div key={i}
                  className="inspectable proposal-section-row"
                  data-testid="proposal-section-row"
                  data-status={s.status}
                  data-popout={`${s.n}: ${s.status}, owner ${s.who}`}>
                  <div className="proposal-section-row__dot" data-status={s.status}>
                    {s.status === 'accepted' && '✓'}
                  </div>
                  <div className="proposal-section-row__name">{s.n}</div>
                  <span className="mono proposal-section-row__owner">{s.who}</span>
                  <Badge tone={s.status === 'accepted' ? 'healthy' : s.status === 'redline' ? 'critical' : 'neutral'}>{s.status}</Badge>
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
/* SETTINGS */
/* ------------------------------------------------------------ */
function SettingsPage({ setRoute }) {
  const initialSettingsTab = globalThis.AppContext.get().extra?.settings_tab;
  const [tab, setTab] = useState(initialSettingsTab || 'account');
  const tabs = [
    { id:'account',   label:'My Account' },
    { id:'integrations', label:'Integrations' },
    { id:'evals',     label:'Eval policy' },
    { id:'team',      label:'Team' },
    { id:'billing',   label:'Billing' },
    { id:'security',  label:'Security' },
  ];
  const tabRefs = useRef({});
  const pendingFocusTab = useRef(null);
  useEffect(() => {
    const onSettingsTab = (event) => {
      const next = event.detail?.tab;
      if (tabs.some(t => t.id === next)) setTab(next);
    };
    globalThis.addEventListener('gtm:settings-tab', onSettingsTab);
    return () => globalThis.removeEventListener('gtm:settings-tab', onSettingsTab);
  }, []);
  const activeTabLabel = tabs.find(t => t.id === tab)?.label || 'My Account';
  useEffect(() => {
    if (pendingFocusTab.current !== tab) return;
    const next = pendingFocusTab.current;
    pendingFocusTab.current = null;
    tabRefs.current[next]?.focus();
  }, [tab]);

  // ARIA tabs pattern (manual activation): roving tabindex so only the
  // selected tab is in the document tab order, ArrowLeft/Right + Home/End
  // move focus and selection across tabs. Enter/Space were already handled.
  function onTabKeyDown(e, idx) {
    let nextIdx = null;
    switch (e.key) {
      case 'ArrowRight': 
      case 'ArrowDown': {
        nextIdx = (idx + 1) % tabs.length;
        break;
      }
      case 'ArrowLeft': 
      case 'ArrowUp': {
        nextIdx = (idx - 1 + tabs.length) % tabs.length;
        break;
      }
      case 'Home': {
        nextIdx = 0;
        break;
      }
      case 'End': {
        nextIdx = tabs.length - 1;
        // No default
      }
        break;
    }
    if (nextIdx === null) return;
    e.preventDefault();
    const nextId = tabs[nextIdx].id;
    pendingFocusTab.current = nextId;
    setTab(nextId);
  }

  return (
    <div className="page page--settings">
      <h1 id="console-page-title" className="sr-only">Settings</h1>

      <section className="settings-command-strip" data-testid="settings-command-strip" aria-label="Settings overview">
        <div className="settings-command-strip__status">
          <span className="settings-command-strip__chip settings-command-strip__chip--accent">workspace · helix</span>
          <span className="settings-command-strip__chip">active section · {activeTabLabel}</span>
          <span className="settings-command-strip__chip">changes saved in session</span>
        </div>
        <div className="settings-command-strip__actions">
          <button className="btn btn--ghost btn--sm" onClick={() => setRoute && setRoute('agents')}>
            <I3.Bot size={12}/>Manage agents →
          </button>
        </div>
      </section>

      <div className="settings-grid">
        <div className="settings-nav" role="tablist" aria-label="Settings sections" aria-orientation="horizontal" data-testid="settings-top-tabs">
          {tabs.map((t, idx) => (
            <div key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              id={`settings-tab-${t.id}`}
              className="settings-nav__item"
              role="tab"
              tabIndex={tab === t.id ? 0 : -1}
              aria-selected={tab === t.id}
              aria-controls={`settings-panel-${t.id}`}
              data-active={tab === t.id}
              onClick={()=>setTab(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(t.id); return; }
                onTabKeyDown(e, idx);
              }}>
              {t.label}
            </div>
          ))}
        </div>

        <div className="settings-panel" role="tabpanel"
          id={`settings-panel-${tab}`}
          aria-labelledby={`settings-tab-${tab}`}
          tabIndex={0}>
          {tab === 'integrations' && <IntegrationsSettings setRoute={setRoute}/>}
          {tab === 'evals' && <EvalPolicySettings/>}
          {tab === 'team' && <TeamSettings/>}
          {tab === 'billing' && <BillingSettings/>}
          {tab === 'account' && <AccountSettings/>}
          {tab === 'security' && <SecuritySettings/>}
        </div>
      </div>
    </div>
  );
}

function IntegrationIcon({ name }) {
  const key = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const common = { viewBox:'0 0 40 40', role:'img', 'aria-label': `${name} logo` };
  if (name === 'Salesforce') {
    return <span className={`integration-logo integration-logo--${key}`} data-testid="integration-logo"><svg {...common}><path d="M14 27c-5 0-8-3-8-7 0-3 2-6 5-7 2-5 8-7 13-4 2-2 6-2 8 1 4 0 7 4 7 8 0 5-4 9-10 9H14Z"/><text x="20" y="23" textAnchor="middle">SF</text></svg></span>;
  }
  if (name === 'Slack') {
    return <span className={`integration-logo integration-logo--${key}`} data-testid="integration-logo"><svg {...common}><rect x="8" y="17" width="15" height="6" rx="3"/><rect x="17" y="8" width="6" height="15" rx="3"/><rect x="17" y="26" width="15" height="6" rx="3"/><rect x="26" y="17" width="6" height="15" rx="3"/></svg></span>;
  }
  if (name === 'HubSpot') {
    return <span className={`integration-logo integration-logo--${key}`} data-testid="integration-logo"><svg {...common}><circle cx="19" cy="22" r="7"/><circle cx="30" cy="12" r="4"/><circle cx="11" cy="10" r="3"/><path d="M24 17l4-3M16 16l-4-4M19 8v6"/></svg></span>;
  }
  if (name === 'Snowflake') {
    return <span className={`integration-logo integration-logo--${key}`} data-testid="integration-logo"><svg {...common}><path d="M20 7v26M9 13l22 14M31 13L9 27M14 9l6 6 6-6M14 31l6-6 6 6"/></svg></span>;
  }
  if (name === 'ElevenLabs') {
    return <span className={`integration-logo integration-logo--${key}`} data-testid="integration-logo"><svg {...common}><rect x="10" y="9" width="4" height="22" rx="2"/><rect x="18" y="6" width="4" height="28" rx="2"/><rect x="26" y="11" width="4" height="18" rx="2"/></svg></span>;
  }
  if (name === 'Gong') {
    return <span className={`integration-logo integration-logo--${key}`} data-testid="integration-logo"><svg {...common}><circle cx="20" cy="20" r="6"/><path d="M8 20c3-7 8-11 12-11s9 4 12 11c-3 7-8 11-12 11S11 27 8 20Z"/></svg></span>;
  }
  if (name === 'Outreach') {
    return <span className={`integration-logo integration-logo--${key}`} data-testid="integration-logo"><svg {...common}><circle cx="20" cy="20" r="12"/><path d="M20 11v9l7 5"/></svg></span>;
  }
  if (name === 'Clay') {
    return <span className={`integration-logo integration-logo--${key}`} data-testid="integration-logo"><svg {...common}><rect x="8" y="8" width="24" height="24" rx="8"/><path d="M25 15a8 8 0 1 0 0 10"/></svg></span>;
  }
  if (name === 'Krisp') {
    return <span className={`integration-logo integration-logo--${key}`} data-testid="integration-logo"><svg {...common}><path d="M9 21c4-8 6-8 10 0s6 8 12 0"/><path d="M9 28h22M9 12h22"/></svg></span>;
  }
  return <span className={`integration-logo integration-logo--${key}`} data-testid="integration-logo"><svg {...common}><circle cx="20" cy="20" r="13"/><text x="20" y="25" textAnchor="middle">{String(name || '?').slice(0, 2).toUpperCase()}</text></svg></span>;
}

function IntegrationsSettings({ setRoute }) {
  // Live status per integration; flipping disconnect/connect mutates this
  // map so the connected-count and the row badges actually reflect operator
  // actions instead of the static fixture.
  const [statusMap, setStatusMap] = useState(() => {
    const init = {};
    for (const c of INTEGRATION_CONNECTIONS) init[c.name] = c.status;
    return init;
  });
  // Per-integration "actions permitted" map. The drawer's Save flushes
  // this snapshot back into a saved layer; Revert pulls from it.
  const buildActionMap = () => {
    const map = {};
    for (const c of INTEGRATION_CONNECTIONS) {
      const actions = {};
      for (const a of c.canDo) actions[a] = true;
      map[c.name] = actions;
    }
    return map;
  };
  const [savedActions, setSavedActions] = useState(buildActionMap);
  const [draftActions, setDraftActions] = useState(buildActionMap);
  const [lastTestSync, setLastTestSync] = useState({});
  const [integrationEvents, setIntegrationEvents] = useState({});
  const [activeName, setActiveName] = useState(() => {
    const requestedName = globalThis.AppContext.get().extra?.integration_name;
    return INTEGRATION_CONNECTIONS.some(c => c.name === requestedName) ? requestedName : null;
  });
  const activeConfig = INTEGRATION_CONNECTIONS.find(c => c.name === activeName) || null;
  const connectedCount = Object.values(statusMap).filter(s => s === 'connected').length;

  const draftFor = (name) => draftActions[name] || {};
  const savedFor = (name) => savedActions[name] || {};
  const isDirty = activeConfig
    ? activeConfig.canDo.some(a => Boolean(draftFor(activeConfig.name)[a]) !== Boolean(savedFor(activeConfig.name)[a]))
    : false;
  const enabledCount = activeConfig
    ? Object.values(draftFor(activeConfig.name)).filter(Boolean).length
    : 0;

  const recordIntegrationEvent = (name, title, detail, tone = 'neutral') => {
    const at = new Date();
    setIntegrationEvents(prev => ({
      ...prev,
      [name]: [{
        id: `${name}-${at.getTime()}-${title}`,
        title,
        detail,
        tone,
        at: at.toISOString(),
      }, ...(prev[name] || [])].slice(0, 5),
    }));
  };

  const onToggleAction = (name, action, checked) => {
    setDraftActions(prev => ({
      ...prev,
      [name]: { ...prev[name], [action]: checked },
    }));
  };
  const onSaveActions = () => {
    if (!activeConfig) return;
    if (!isDirty) {
      globalThis.toast('No mapping changes to save', { sub: activeConfig.name, tone: 'neutral' });
      return;
    }
    setSavedActions(prev => ({ ...prev, [activeConfig.name]: { ...draftFor(activeConfig.name) } }));
    recordIntegrationEvent(
      activeConfig.name,
      'Mapping saved',
      `${enabledCount}/${activeConfig.canDo.length} actions permitted for this connector.`,
      'accent',
    );
    globalThis.toast(`${activeConfig.name} mapping saved`, {
      sub: `${enabledCount}/${activeConfig.canDo.length} actions permitted`,
      tone: 'accent',
    });
  };
  const onRevertActions = () => {
    if (!activeConfig) return;
    setDraftActions(prev => ({ ...prev, [activeConfig.name]: { ...savedFor(activeConfig.name) } }));
    globalThis.toast(`${activeConfig.name} mapping reverted`, { tone: 'neutral' });
  };
  const onTestSync = () => {
    if (!activeConfig) return;
    const stamp = new Date();
    setLastTestSync(prev => ({ ...prev, [activeConfig.name]: stamp.toISOString() }));
    recordIntegrationEvent(
      activeConfig.name,
      'Test sync completed',
      `Connectivity and schema check passed at ${stamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}.`,
      'accent',
    );
    globalThis.toast(`${activeConfig.name} test sync ok`, {
      sub: `last sync ${stamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}`,
      tone: 'accent',
    });
  };
  const onConnect = () => {
    if (!activeConfig) return;
    setStatusMap(prev => ({ ...prev, [activeConfig.name]: 'syncing' }));
    recordIntegrationEvent(activeConfig.name, 'OAuth handshake started', 'Connector is waiting for provider authorization.', 'warn');
    globalThis.toast(`${activeConfig.name} connecting…`, { sub: 'OAuth handshake started', tone: 'accent' });
    setTimeout(() => {
      setStatusMap(prev => ({ ...prev, [activeConfig.name]: 'connected' }));
      recordIntegrationEvent(activeConfig.name, 'Connected', 'Provider session is active; mapping controls are available.', 'accent');
      globalThis.toast(`${activeConfig.name} connected`, { sub: 'mapping ready to configure', tone: 'accent' });
    }, 320);
  };
  const onDisconnect = () => {
    if (!activeConfig) return;
    setStatusMap(prev => ({ ...prev, [activeConfig.name]: 'disabled' }));
    recordIntegrationEvent(activeConfig.name, 'Disconnected', 'OAuth tokens revoked; sync and mapping save are blocked.', 'warn');
    globalThis.toast(`${activeConfig.name} disconnected`, { sub: 'OAuth tokens revoked', tone: 'warn' });
  };
  const openElevenLabsLocalAdmin = () => {
    const ctx = globalThis.AppContext.get();
    globalThis.AppContext.set({
      extra: {
        ...(ctx.extra || {}),
        selected_agent_key: 'sales_coach',
        agent_admin_panel: 'context',
        triggered_from: 'settings-elevenlabs-local-admin',
      },
    });
    setRoute?.('agents');
  };
  const recordElevenLabsEscape = () => {
    recordIntegrationEvent(
      'ElevenLabs',
      'Dashboard escape opened',
      'Vendor dashboard opened from the single settings escape hatch after local admin was surfaced.',
      'warn',
    );
  };

  return (
    <Card className="settings-card settings-card--integrations">
      <div className="settings-panel-summary">
        <span className="eyebrow eyebrow--accent">integrations</span>
        <Badge tone="healthy">{connectedCount} of {INTEGRATION_CONNECTIONS.length} connected</Badge>
      </div>
      <div className="vstack" style={{gap:10}}>
        {INTEGRATION_CONNECTIONS.map(c => {
          const status = statusMap[c.name];
          const isConnected = status === 'connected' || status === 'syncing';
          return (
            <div key={c.name} className="integration-row inspectable" data-popout={`${c.name}: ${c.what}`} data-testid="integration-row" data-status={status}>
              <IntegrationIcon name={c.name}/>
              <div className="integration-row__copy">
                <div style={{fontSize:13, fontWeight:600}}>{c.name}</div>
                <div className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{c.sub}</div>
              </div>
              <Badge tone={status === 'connected' ? 'healthy' : status === 'syncing' ? 'warn' : status === 'available' ? 'accent' : 'neutral'}>{status}</Badge>
              <button
                className="btn btn--ghost btn--sm"
                data-testid="integration-open"
                aria-label={`${isConnected ? 'Configure' : 'Connect'} ${c.name} integration`}
                aria-expanded={activeName === c.name}
                onClick={() => setActiveName(c.name)}
              >{isConnected ? 'Configure' : 'Connect'}</button>
            </div>
          );
        })}
      </div>
      {activeConfig && (() => {
        const status = statusMap[activeConfig.name];
        const isConnected = status === 'connected' || status === 'syncing';
        const lastTest = lastTestSync[activeConfig.name];
        const events = integrationEvents[activeConfig.name] || [];
        return (
          <div className="workflow-popout workflow-popout--single settings-config-popout" role="region" aria-label={`${activeConfig.name} configuration`}>
            <form className="workflow-popout__pane" onSubmit={(e) => { e.preventDefault(); onSaveActions(); }} aria-label={`${activeConfig.name} mapping form`}>
              <div style={{display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start'}}>
                <div>
                  <div className="eyebrow eyebrow--accent">{isConnected ? 'configuration' : 'connect + map'}</div>
                  <div className="workflow-popout__title">{activeConfig.name}</div>
                  <div className="muted" style={{fontSize:12}}>{activeConfig.what}</div>
                  {lastTest && (
                    <div className="mono dim" data-testid="integration-last-test" style={{fontSize:10, marginTop:4}}>
                      last test sync · {new Date(lastTest).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}
                    </div>
                  )}
                </div>
                <button type="button" className="btn btn--ghost btn--icon" aria-label={`Close ${activeConfig.name} configuration`} onClick={() => setActiveName(null)}><I3.Close size={14}/></button>
              </div>
              <div className="integration-config-grid">
                <div>
                  <div className="eyebrow">actions permitted ({enabledCount}/{activeConfig.canDo.length})</div>
                  <div className="vstack" style={{gap:6, marginTop:6}}>
                    {activeConfig.canDo.map(action => (
                      <label key={action} className="form-row form-row--inline" style={{margin:0}}>
                        <input
                          type="checkbox"
                          data-testid="integration-action"
                          data-action-label={action}
                          checked={Boolean(draftFor(activeConfig.name)[action])}
                          onChange={(e) => onToggleAction(activeConfig.name, action, e.target.checked)}
                        />
                        <span style={{fontSize:12}}>{action}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="eyebrow">data contract</div>
                  <div className="mono settings-code">{activeConfig.scopes.join('\n')}</div>
                </div>
                <div>
                  <div className="eyebrow">sync</div>
                  <p className="muted" style={{fontSize:12}}>{activeConfig.sync}</p>
                </div>
                <div>
                  <div className="eyebrow">automation</div>
                  <p className="muted" style={{fontSize:12}}>{activeConfig.automations}</p>
                </div>
              </div>
              {activeConfig.name === 'ElevenLabs' && (
                <div
                  className="integration-local-admin"
                  data-testid="integration-elevenlabs-local-admin"
                >
                  <div>
                    <div className="eyebrow eyebrow--accent">local agent admin</div>
                    <strong>Open the in-console wrapper before using the dashboard.</strong>
                    <p>Prompt, tools, context, and safety review stay inside gtm_ops; the Agents page now keeps those edits in the local admin surface.</p>
                    <p data-testid="integration-elevenlabs-escape-note">One explicit dashboard escape hatch lives here for vendor-only edits after local review.</p>
                  </div>
                  <div className="integration-local-admin__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      data-testid="integration-open-elevenlabs-local-admin"
                      onClick={openElevenLabsLocalAdmin}
                    ><I3.Bot size={12}/>Open local agent admin</button>
                    <a
                      className="btn btn--ghost btn--sm btn--external integration-elevenlabs-escape"
                      data-testid="integration-elevenlabs-escape"
                      href={ELEVENLABS_AGENTS_DASHBOARD_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open ElevenLabs Agents dashboard in a new tab"
                      onClick={recordElevenLabsEscape}
                    ><I3.ArrowUpRight size={12}/>Open ElevenLabs dashboard</a>
                  </div>
                </div>
              )}
              <div
                className="integration-operation-log"
                data-testid="integration-operation-log"
                aria-live="polite"
                aria-label={`${activeConfig.name} local operation log`}
              >
                <div className="integration-operation-log__head">
                  <span className="eyebrow">operation log</span>
                  <span className="mono dim">
                    {events.length > 0
                      ? `${events.length} local event${events.length === 1 ? '' : 's'}`
                      : 'no local events yet'}
                  </span>
                </div>
                {events.length > 0 ? events.map(event => (
                  <div
                    key={event.id}
                    className="integration-operation-event"
                    data-testid="integration-operation-event"
                    data-tone={event.tone}
                  >
                    <span
                      className={`dot dot--${event.tone === 'warn' ? 'warn' : event.tone === 'critical' ? 'critical' : event.tone === 'accent' ? 'accent' : 'idle'}`}
                      style={{width:7,height:7}}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.detail}</p>
                    </div>
                    <time className="mono dim" dateTime={event.at}>
                      {new Date(event.at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}
                    </time>
                  </div>
                )) : (
                  <div className="integration-operation-empty">
                    Connect, save, or test sync to leave visible local evidence here.
                  </div>
                )}
              </div>
              <div className="hstack" style={{marginTop:12, justifyContent:'space-between'}}>
                <div className="hstack" style={{gap:8}}>
                  {isConnected ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      data-testid="integration-disconnect"
                      onClick={onDisconnect}
                    ><I3.Close size={12}/>Disconnect</button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      data-testid="integration-connect"
                      onClick={onConnect}
                    ><I3.ArrowUpRight size={12}/>Start OAuth flow</button>
                  )}
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    data-testid="integration-test-sync"
                    onClick={onTestSync}
                    disabled={!isConnected}
                  ><I3.Refresh size={12}/>Test sync</button>
                </div>
                <div className="hstack" style={{gap:8}}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    data-testid="integration-revert"
                    onClick={onRevertActions}
                    disabled={!isDirty}
                  >Revert</button>
                  <button
                    type="submit"
                    className="btn btn--primary btn--sm"
                    data-testid="integration-save"
                    disabled={!isConnected || !isDirty}
                  >Save mapping</button>
                </div>
              </div>
            </form>
          </div>
        );
      })()}
    </Card>
  );
}

function EvalPolicySettings() {
  return (
    <Card className="settings-card settings-card--evals">
      <EvalPolicyForm/>
    </Card>
  );
}

function EvalPolicyForm() {
  const DEFAULTS = {
    freq: 'hourly',
    regressionThreshold: '-2.0% (alert) · -5.0% (auto-pause agent)',
    judgeConsensus: '2 of 3 judges must agree',
    pager: '#gtm-ops · pagerduty: gtm-oncall',
  };
  const [form, setForm] = useState(DEFAULTS);
  // Persist a "last saved at" stamp so the operator can see at a glance
  // when policy was most recently saved. Without this, Save toasted and
  // forgot — there was no per-form proof a policy save ever happened, so
  // re-saving the same policy or wondering "did that go through?" had no
  // honest answer.
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const dirty =
    form.freq !== DEFAULTS.freq ||
    form.regressionThreshold !== DEFAULTS.regressionThreshold ||
    form.judgeConsensus !== DEFAULTS.judgeConsensus ||
    form.pager !== DEFAULTS.pager;

  const onSave = () => {
    if (!dirty) {
      globalThis.toast('No changes to save', { sub: 'eval policy unchanged', tone: 'neutral' });
      return;
    }
    setLastSavedAt(new Date());
    globalThis.toast('Eval policy saved', {
      sub: `freq · ${form.freq} · ${form.judgeConsensus} · regression ${form.regressionThreshold}`,
      tone: 'accent',
    });
  };
  const onRevert = () => {
    if (!dirty) {
      globalThis.toast('Already at saved policy', { sub: 'nothing to revert', tone: 'neutral' });
      return;
    }
    setForm(DEFAULTS);
    globalThis.toast('Policy reverted', { sub: 'fields restored to last saved values', tone: 'neutral' });
  };

  return (
    <>
      <div className="field">
        <div className="field__label">Run frequency</div>
        <Segmented value={form.freq} onChange={(v) => setForm(f => ({ ...f, freq: v }))} options={[
          { value:'realtime', label:'Real-time' }, { value:'hourly', label:'Hourly' }, { value:'daily', label:'Daily' },
        ]}/>
      </div>
      <div className="field">
        <div className="field__label" id="evalpol-regression-label">Regression threshold</div>
        <input
          className="input"
          data-testid="evalpol-regression"
          value={form.regressionThreshold}
          onChange={(e) => setForm(f => ({ ...f, regressionThreshold: e.target.value }))}
          aria-labelledby="evalpol-regression-label"
        />
      </div>
      <div className="field">
        <div className="field__label" id="evalpol-consensus-label">Judge consensus required</div>
        <input
          className="input"
          type="text"
          data-testid="evalpol-consensus"
          value={form.judgeConsensus}
          onChange={(e) => setForm(f => ({ ...f, judgeConsensus: e.target.value }))}
          aria-labelledby="evalpol-consensus-label"
          aria-describedby="evalpol-consensus-hint"
        />
        <div className="field__hint" id="evalpol-consensus-hint">Higher consensus reduces false positives but increases cost ~1.6×.</div>
      </div>
      <div className="field">
        <div className="field__label" id="evalpol-pager-label">Failure → pager</div>
        <input
          className="input"
          data-testid="evalpol-pager"
          value={form.pager}
          onChange={(e) => setForm(f => ({ ...f, pager: e.target.value }))}
          aria-labelledby="evalpol-pager-label"
        />
      </div>
      <div style={{display:'flex', gap:8, justifyContent:'flex-end', alignItems:'center', marginTop:14}}>
        {lastSavedAt && (
          <span
            className="mono dim"
            data-testid="evalpol-saved-stamp"
            aria-live="polite"
            style={{fontSize:10, marginRight:'auto'}}
          >saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        )}
        <button
          className="btn btn--ghost btn--sm"
          data-testid="evalpol-revert"
          onClick={onRevert}
          disabled={!dirty}
        >Revert</button>
        <button
          className="btn btn--primary btn--sm"
          data-testid="evalpol-save"
          onClick={onSave}
        >Save policy</button>
      </div>
    </>
  );
}

function TeamSettings() {
  const ROLES = ['Admin', 'Operator', 'Reviewer', 'Read-only'];
  const SCOPE_KEYS = [
    { id: 'pipeline_read',   label: 'Pipeline · read' },
    { id: 'pipeline_write',  label: 'Pipeline · write' },
    { id: 'calls_listen',    label: 'Calls · listen + coach' },
    { id: 'proposals_send',  label: 'Proposals · send to buyer' },
    { id: 'settings_admin',  label: 'Settings · workspace admin' },
  ];
  const SCOPE_DEFAULTS = {
    Admin:      { pipeline_read:true, pipeline_write:true, calls_listen:true, proposals_send:true, settings_admin:true },
    Operator:   { pipeline_read:true, pipeline_write:true, calls_listen:true, proposals_send:true, settings_admin:false },
    Reviewer:   { pipeline_read:true, pipeline_write:false, calls_listen:true, proposals_send:false, settings_admin:false },
    'Read-only':{ pipeline_read:true, pipeline_write:false, calls_listen:false, proposals_send:false, settings_admin:false },
  };
  const [team, setTeam] = useState([
    { name:'Rae Park',     role:'Admin',    email:'rae@helix.io',     last:'now',         scopes: SCOPE_DEFAULTS.Admin },
    { name:'Jordan Liu',   role:'Operator', email:'jordan@helix.io',  last:'14m ago',     scopes: SCOPE_DEFAULTS.Operator },
    { name:'Sam Okafor',   role:'Operator', email:'sam@helix.io',     last:'1h ago',      scopes: SCOPE_DEFAULTS.Operator },
    { name:'Maya Cohen',   role:'Reviewer', email:'maya@helix.io',    last:'yesterday',   scopes: SCOPE_DEFAULTS.Reviewer },
  ]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [managedEmail, setManagedEmail] = useState(null);
  const [managedDraft, setManagedDraft] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: '', role: 'Operator', message: '' });

  const managed = team.find(m => m.email === managedEmail) || null;
  const draftDirty = managed && managedDraft && (
    managed.role !== managedDraft.role ||
    SCOPE_KEYS.some(s => Boolean(managed.scopes?.[s.id]) !== Boolean(managedDraft.scopes?.[s.id]))
  );

  const openManage = (member) => {
    setManagedEmail(member.email);
    setManagedDraft({ role: member.role, scopes: { ...member.scopes } });
  };
  const closeManage = () => { setManagedEmail(null); setManagedDraft(null); };

  const onRoleChange = (role) => {
    // Picking a role pre-fills its default scopes (admins can then customize).
    setManagedDraft({ role, scopes: { ...SCOPE_DEFAULTS[role] } });
  };
  const onScopeChange = (scopeId, checked) => {
    setManagedDraft(d => ({ ...d, scopes: { ...d.scopes, [scopeId]: checked } }));
  };
  const onSaveManaged = (e) => {
    e.preventDefault();
    if (!managed || !managedDraft) return;
    setTeam(t => t.map(m => m.email === managed.email ? { ...m, role: managedDraft.role, scopes: managedDraft.scopes } : m));
    globalThis.toast(`${managed.name} updated`, { sub: `role: ${managedDraft.role} · ${Object.values(managedDraft.scopes).filter(Boolean).length}/${SCOPE_KEYS.length} scopes`, tone: 'accent' });
    closeManage();
  };
  const onRemoveManaged = () => {
    if (!managed) return;
    if (managed.role === 'Admin' && team.filter(m => m.role === 'Admin').length === 1) {
      globalThis.toast('Cannot remove the last admin', { sub: 'promote another member first', tone: 'critical' });
      return;
    }
    setTeam(t => t.filter(m => m.email !== managed.email));
    globalThis.toast(`${managed.name} removed from workspace`, { sub: 'sessions revoked', tone: 'warn' });
    closeManage();
  };

  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
  const onSubmitInvite = (e) => {
    e.preventDefault();
    const email = invite.email.trim().toLowerCase();
    if (!validEmail(email)) {
      globalThis.toast('Enter a valid email address', { tone: 'critical' });
      return;
    }
    if (team.some(m => m.email.toLowerCase() === email) || pendingInvites.some(p => p.email === email)) {
      globalThis.toast('That email is already on the team or invited', { tone: 'warn' });
      return;
    }
    setPendingInvites(q => [...q, { email, role: invite.role, message: invite.message, sentAt: new Date().toISOString() }]);
    setInvite({ email: '', role: 'Operator', message: '' });
    setInviteOpen(false);
    globalThis.toast(`Invite sent to ${email}`, { sub: `role: ${invite.role} · expires in 7 days`, tone: 'accent' });
  };
  const onRevokeInvite = (email) => {
    setPendingInvites(q => q.filter(p => p.email !== email));
    globalThis.toast(`Invite to ${email} revoked`, { tone: 'warn' });
  };

  return (
    <div className="vstack" style={{gap:18}}>
      <Card title={`team · ${team.length} members`} action={
        <button className="btn btn--primary btn--sm" data-testid="team-invite-open" onClick={() => setInviteOpen(true)}>
          <I3.Plus size={12}/>Invite
        </button>
      }>
        <table className="tbl">
          <thead><tr><th>Member</th><th>Role</th><th>Last active</th><th></th></tr></thead>
          <tbody>
            {team.map(m => (
              <tr key={m.email} data-testid="team-row" data-email={m.email}>
                <td><div style={{fontWeight:600}}>{m.name}</div><div className="mono dim" style={{fontSize:11}}>{m.email}</div></td>
                <td><Badge tone={m.role === 'Admin' ? 'accent' : 'neutral'}>{m.role}</Badge></td>
                <td className="mono dim" style={{fontSize:11}}>{m.last}</td>
                <td style={{textAlign:'right'}}>
                  <button
                    className="btn btn--ghost btn--xs"
                    data-testid="team-manage-open"
                    aria-expanded={managedEmail === m.email}
                    onClick={() => openManage(m)}
                  >manage</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {managed && managedDraft && (
          <div className="workflow-popout workflow-popout--single team-manage-popout" role="region" aria-label={`Manage ${managed.name}`}>
            <form className="workflow-popout__pane vstack" style={{gap:12}} onSubmit={onSaveManaged} aria-label={`Manage ${managed.name} form`}>
              <div className="hstack" style={{justifyContent:'space-between', alignItems:'flex-start', gap:10}}>
                <div>
                  <div className="eyebrow eyebrow--accent">member access</div>
                  <div className="workflow-popout__title">{managed.name}</div>
                  <div className="muted" style={{fontSize:12}}>{managed.email} · last active {managed.last}</div>
                </div>
                <button type="button" className="btn btn--ghost btn--icon" aria-label="Close manage panel" data-testid="team-manage-close" onClick={closeManage}>
                  <I3.Close size={14}/>
                </button>
              </div>

              <label className="form-row">
                <span className="form-row__label">Role</span>
                <select
                  className="form-input"
                  data-testid="team-manage-role"
                  value={managedDraft.role}
                  onChange={(e) => onRoleChange(e.target.value)}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>

              <div className="form-row">
                <span className="form-row__label">Scopes</span>
                <div className="vstack" style={{gap:6}}>
                  {SCOPE_KEYS.map(s => (
                    <label key={s.id} className="form-row form-row--inline" style={{margin:0}}>
                      <input
                        type="checkbox"
                        data-testid={`team-manage-scope-${s.id}`}
                        checked={Boolean(managedDraft.scopes?.[s.id])}
                        onChange={(e) => onScopeChange(s.id, e.target.checked)}
                      />
                      <span>{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="hstack" style={{gap:8, justifyContent:'space-between', marginTop:4}}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  data-testid="team-manage-remove"
                  onClick={onRemoveManaged}
                ><I3.Close size={12}/>Remove from workspace</button>
                <div className="hstack" style={{gap:8}}>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={closeManage}>Cancel</button>
                  <button
                    type="submit"
                    className="btn btn--primary btn--sm"
                    data-testid="team-manage-save"
                    disabled={!draftDirty}
                  >Save changes</button>
                </div>
              </div>
            </form>
          </div>
        )}
      </Card>

      {inviteOpen && (
        <Card title="invite a teammate" className="card--accent">
          <form className="vstack" style={{gap:12}} onSubmit={onSubmitInvite} aria-label="Invite teammate form" data-testid="team-invite-form">
            <label className="form-row">
              <span className="form-row__label">Email</span>
              <input
                type="email"
                className="form-input"
                data-testid="team-invite-email"
                required
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                placeholder="teammate@your-company.com"
              />
            </label>
            <label className="form-row">
              <span className="form-row__label">Role</span>
              <select
                className="form-input"
                data-testid="team-invite-role"
                value={invite.role}
                onChange={(e) => setInvite({ ...invite, role: e.target.value })}
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="form-row">
              <span className="form-row__label">Personal note (optional)</span>
              <textarea
                className="form-input"
                rows={3}
                data-testid="team-invite-message"
                value={invite.message}
                onChange={(e) => setInvite({ ...invite, message: e.target.value })}
                placeholder="What should they look at first?"
              />
            </label>
            <div className="hstack" style={{gap:8, justifyContent:'flex-end'}}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setInviteOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn--primary btn--sm" data-testid="team-invite-send">Send invite</button>
            </div>
          </form>
        </Card>
      )}

      {pendingInvites.length > 0 && (
        <Card title={`pending invites · ${pendingInvites.length}`}>
          <div className="vstack" style={{gap:0}}>
            {pendingInvites.map(p => (
              <div key={p.email} data-testid="team-pending-row" data-email={p.email} style={{display:'grid', gridTemplateColumns:'1fr auto auto', gap:12, alignItems:'center', padding:'8px 0', borderBottom:'1px dashed var(--border)'}}>
                <div>
                  <div style={{fontSize:13, fontWeight:600}}>{p.email}</div>
                  {p.message && <div className="muted" style={{fontSize:11, marginTop:2}}>"{p.message}"</div>}
                </div>
                <Badge tone="neutral">{p.role}</Badge>
                <button className="btn btn--ghost btn--xs" data-testid="team-pending-revoke" onClick={() => onRevokeInvite(p.email)}>Revoke</button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function AccountSettings() {
  const CONSENT_DEFAULTS = { sms: true, email: true, digest: false };
  const [consentDraft, setConsentDraft] = useState(CONSENT_DEFAULTS);
  const [savedConsent, setSavedConsent] = useState(CONSENT_DEFAULTS);
  const [lastConsentSavedAt, setLastConsentSavedAt] = useState('session baseline');
  const { sms, email, digest } = consentDraft;
  const consentDirty = sms !== savedConsent.sms || email !== savedConsent.email || digest !== savedConsent.digest;
  const consentSummary = (consent) => {
    const enabled = [
      consent.email && 'email',
      consent.sms && 'sms',
      consent.digest && 'weekly digest',
    ].filter(Boolean);
    return enabled.length > 0 ? enabled.join(' + ') : 'no operator alerts';
  };
  const setConsent = (key, value) => {
    setConsentDraft(prev => ({ ...prev, [key]: value }));
  };
  const saveConsent = () => {
    if (!consentDirty) {
      globalThis.toast('Alert consent already current', { sub: consentSummary(savedConsent), tone:'neutral' });
      return;
    }
    const savedAt = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const next = { ...consentDraft };
    setSavedConsent(next);
    setLastConsentSavedAt(savedAt);
    globalThis.toast('Alert consent saved', { sub:`${consentSummary(next)} · saved ${savedAt}`, tone:'accent' });
  };
  const revertConsent = () => {
    if (!consentDirty) return;
    setConsentDraft(savedConsent);
    globalThis.toast('Alert consent reverted', { sub: consentSummary(savedConsent), tone:'neutral' });
  };
  // Account delivery rules — each rule has a per-channel toggle map. The
  // tiles used to onClick to a static toast that just echoed the rule
  // copy back; now they expand into a real channel editor and the
  // tile sub-text re-derives from the enabled channels.
  const ALL_CHANNELS = [
    { id: 'sms', label: 'SMS' },
    { id: 'email', label: 'Email' },
    { id: 'push', label: 'Push' },
    { id: 'slack', label: 'Slack' },
  ];
  const DELIVERY_RULES_DEFAULTS = {
    'critical-regression': { id: 'critical-regression', name: 'Critical eval regression', channels: { sms: true, email: true, push: true, slack: false } },
    'proposal-draft':      { id: 'proposal-draft',      name: 'Proposal draft ready',     channels: { sms: false, email: true, push: false, slack: false } },
    'sarah-hot-lead':      { id: 'sarah-hot-lead',      name: 'Sarah hot lead',           channels: { sms: true, email: true, push: false, slack: true } },
    'security-admin':      { id: 'security-admin',      name: 'Security / admin change',  channels: { sms: false, email: true, push: false, slack: false } },
  };
  const [deliveryRules, setDeliveryRules] = useState(DELIVERY_RULES_DEFAULTS);
  const [activeRuleId, setActiveRuleId] = useState(null);
  const channelSummary = (channels) => {
    const on = ALL_CHANNELS.filter(c => channels[c.id]).map(c => c.label);
    if (on.length === 0) return 'silent — no channels enabled';
    if (on.length === ALL_CHANNELS.length) return 'all channels (sms + email + push + slack)';
    return on.join(' + ').toLowerCase();
  };
  const toggleChannel = (ruleId, channelId, on) => {
    setDeliveryRules(prev => ({
      ...prev,
      [ruleId]: {
        ...prev[ruleId],
        channels: { ...prev[ruleId].channels, [channelId]: on },
      },
    }));
  };
  return (
    <div className="vstack" style={{gap:18}}>
      <Card className="card--accent settings-card settings-card--account">
        <div className="account-settings-grid">
          <div>
            <div className="eyebrow eyebrow--accent">operator</div>
            <div style={{fontFamily:'var(--font-display)', fontSize:24, fontWeight:800}}>Rae Park</div>
            <div className="mono dim" style={{fontSize:11, marginTop:4}}>rae@helix.io · +1 512 555 0194 · admin</div>
          </div>
          <div className="account-consent-stack">
            <label className="consent-row">
              <input type="checkbox" checked={email} onChange={e => setConsent('email', e.target.checked)} />
              <span>
                <strong>Email alerts</strong>
                <em>Eval regressions, proposal failures, billing, and security notices.</em>
              </span>
            </label>
            <label className="consent-row">
              <input type="checkbox" checked={sms} onChange={e => setConsent('sms', e.target.checked)} />
              <span>
                <strong>SMS alerts</strong>
                <em>Critical pauses, hot lead handoffs, and after-hours escalation only.</em>
              </span>
            </label>
            <label className="consent-row">
              <input type="checkbox" checked={digest} onChange={e => setConsent('digest', e.target.checked)} />
              <span>
                <strong>Weekly email digest</strong>
                <em>Pipeline, eval, agent, and proposal health rollup.</em>
              </span>
            </label>
          </div>
        </div>
        <div
          className="account-consent-status"
          data-testid="account-consent-status"
          data-dirty={consentDirty ? 'true' : 'false'}
          role="status"
          aria-live="polite"
        >
          <div>
            <span className="eyebrow">saved routing</span>
            <strong data-testid="account-consent-saved">{consentSummary(savedConsent)}</strong>
          </div>
          <div>
            <span className="eyebrow">draft</span>
            <strong data-testid="account-consent-draft">{consentSummary(consentDraft)}</strong>
          </div>
          <span className="mono dim" data-testid="account-consent-saved-at">
            {consentDirty ? 'unsaved changes' : `saved · ${lastConsentSavedAt}`}
          </span>
        </div>
        <div className="hstack" style={{marginTop:14, justifyContent:'flex-end'}}>
          <button className="btn btn--ghost btn--sm" onClick={revertConsent} disabled={!consentDirty}>Revert</button>
          <button className="btn btn--primary btn--sm" onClick={saveConsent} disabled={!consentDirty}>Save alert consent</button>
        </div>
      </Card>

      <Card className="settings-card settings-card--delivery">
        <div className="settings-panel-summary">
          <span className="eyebrow eyebrow--accent">delivery rules</span>
          <Badge tone="accent">{Object.values(deliveryRules).length} configured</Badge>
        </div>
        <div className="workflow-popout__grid">
          {Object.values(deliveryRules).map(rule => {
            const isOpen = activeRuleId === rule.id;
            return (
              <div
                key={rule.id}
                className="workflow-tile"
                data-testid="delivery-rule-tile"
                data-rule-id={rule.id}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => setActiveRuleId(isOpen ? null : rule.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveRuleId(isOpen ? null : rule.id); } }}
              >
                <span>{rule.name}</span>
                <span data-testid="delivery-rule-summary">{channelSummary(rule.channels)}</span>
                {isOpen && (
                  <div
                    className="vstack"
                    style={{gap:6, marginTop:8, gridColumn:'1 / -1', borderTop:'1px solid var(--border)', paddingTop:8}}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {ALL_CHANNELS.map(c => (
                      <label key={c.id} className="form-row form-row--inline" style={{margin:0}}>
                        <input
                          type="checkbox"
                          data-testid={`delivery-rule-channel`}
                          data-rule-id={rule.id}
                          data-channel-id={c.id}
                          checked={Boolean(rule.channels[c.id])}
                          onChange={(e) => toggleChannel(rule.id, c.id, e.target.checked)}
                        />
                        <span style={{fontSize:12}}>{c.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

    </div>
  );
}

/* Account plan options used by the console billing panel. Keep limits,
   prices, and usage copy aligned with the billing contract below. */
const GTM_OPS_TIERS = [
  {
    id: 'trial',
    name: 'Trial',
    monthly: 0,
    annualMonthly: 0,
    badge: null,
    cta: 'Start gtm_ops Trial',
    blurb: 'Full-feature 14-day evaluation. Lead in, branded proposal out — no card required.',
    features: [
      '14-day full-feature trial',
      '5 proposals during trial',
      'Branded PDF generation',
      'Demo data preloaded',
      'Gemini-powered extraction',
      'No credit card required',
    ],
  },
  {
    id: 'plus',
    name: 'Plus',
    monthly: 20,
    annualMonthly: 16.67,
    badge: 'Most Popular',
    cta: 'Start gtm_ops Plus',
    blurb: 'For solo operators and small teams running real proposals. Branded PDFs, custom workspace, full audit chain.',
    features: [
      '50 proposals per month',
      'Branded PDFs (logo + colors)',
      'Custom workspace branding',
      'Lead intake forms',
      'Full audit log',
      'n8n webhook integration',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 99,
    annualMonthly: 82.5,
    badge: null,
    cta: 'Talk to Sales',
    blurb: 'For teams who need SSO, custom domains, and unlimited throughput. Built for ops orgs shipping hundreds of proposals.',
    features: [
      'Unlimited proposals',
      'Everything in Plus',
      'SSO (Google + Azure AD)',
      'Team workspaces with RBAC',
      'Custom domain (proposals.yourco.com)',
      'Immutable + exportable audit chain',
      'Priority support + SLA',
      'Onboarding session included',
    ],
  },
];

function BillingSettings() {
  const [planOpen, setPlanOpen] = useState(false);
  const [currentTierId, setCurrentTierId] = useState('plus');
  const [cycle, setCycle] = useState('monthly');
  const currentTier = GTM_OPS_TIERS.find(t => t.id === currentTierId);
  const headlinePrice = cycle === 'annual' ? currentTier.annualMonthly : currentTier.monthly;
  const fmtPrice = (n) => n === 0 ? '$0' : n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;

  const switchTo = (tier) => {
    if (tier.id === currentTierId) {
      globalThis.toast(`Already on ${tier.name}`, { sub: 'no change', tone: 'neutral' });
      return;
    }
    const direction = (GTM_OPS_TIERS.findIndex(t => t.id === tier.id) > GTM_OPS_TIERS.findIndex(t => t.id === currentTierId)) ? 'upgraded' : 'downgraded';
    setCurrentTierId(tier.id);
    setPlanOpen(false);
    globalThis.toast(`${direction.charAt(0).toUpperCase()}${direction.slice(1)} to gtm_ops ${tier.name}`, {
      sub: tier.id === 'pro' ? 'Sales will reach out to finalize the Pro contract' : `Billing now ${cycle} · ${fmtPrice(cycle === 'annual' ? tier.annualMonthly : tier.monthly)}/mo`,
      tone: 'accent',
    });
  };

  return (
    <div className="vstack" style={{gap:18}}>
      <Card title="plan" className="card--accent">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:14, flexWrap:'wrap'}}>
          <div>
            <div className="eyebrow eyebrow--accent" data-testid="billing-current-tier">gtm_ops {currentTier.name} · {cycle}</div>
            <div style={{fontFamily:'var(--font-display)', fontSize:36, fontWeight:800}}>
              {fmtPrice(headlinePrice)} <span style={{fontSize:14, color:'var(--text-2)', fontWeight:500}}>/ mo</span>
            </div>
            <div className="mono" style={{fontSize:11, color:'var(--text-3)', marginTop:4}}>
              {currentTier.id === 'trial' ? 'no card on file · upgrade to keep proposals' : `renews · 2026-09-14 · ${cycle === 'annual' ? '17% off vs monthly' : 'cancel anytime'}`}
            </div>
          </div>
          <div className="hstack" style={{gap:8, flexWrap:'wrap'}}>
            <div className="seg" role="group" aria-label="Billing cycle">
              <button
                className="seg__btn"
                data-active={cycle === 'monthly'}
                aria-pressed={cycle === 'monthly'}
                data-testid="billing-cycle-monthly"
                onClick={() => setCycle('monthly')}
              >Monthly</button>
              <button
                className="seg__btn"
                data-active={cycle === 'annual'}
                aria-pressed={cycle === 'annual'}
                data-testid="billing-cycle-annual"
                onClick={() => setCycle('annual')}
              >Annual <span className="mono dim" style={{fontSize:10, marginLeft:4}}>−17%</span></button>
            </div>
            <button className="btn btn--ghost btn--sm" data-testid="billing-change-plan-toggle" aria-expanded={planOpen} onClick={() => setPlanOpen(v => !v)}>
              {planOpen ? 'Close plans' : 'Change plan'}
            </button>
          </div>
        </div>
      </Card>
      {planOpen && (
        <Card title="plan options">
          <div className="muted" style={{fontSize:12, marginBottom:12}}>Choose the plan for this workspace. Annual saves 17% vs monthly.</div>
          <div className="tier-grid" data-testid="billing-tier-grid">
            {GTM_OPS_TIERS.map(tier => {
              const active = tier.id === currentTierId;
              const tierPrice = cycle === 'annual' ? tier.annualMonthly : tier.monthly;
              return (
                <div
                  key={tier.id}
                  className={`tier-card ${active ? 'tier-card--active' : ''}`}
                  data-testid={`billing-tier-${tier.id}`}
                  data-active={active}
                  aria-current={active ? 'true' : undefined}
                >
                  <div className="hstack" style={{justifyContent:'space-between', alignItems:'center'}}>
                    <div className="tier-card__name" style={{fontFamily:'var(--font-display)', fontWeight:800, fontSize:18}}>{tier.name}</div>
                    {tier.badge && <Badge tone="accent">{tier.badge}</Badge>}
                  </div>
                  <div style={{fontFamily:'var(--font-display)', fontSize:28, fontWeight:800, marginTop:4}}>
                    {fmtPrice(tierPrice)} <span style={{fontSize:13, color:'var(--text-2)', fontWeight:500}}>/ mo</span>
                  </div>
                  <div className="muted" style={{fontSize:12, marginTop:6, minHeight:36}}>{tier.blurb}</div>
                  <ul className="tier-card__features" style={{margin:'10px 0 12px', padding:0, listStyle:'none'}}>
                    {tier.features.map(f => (
                      <li key={f} style={{fontSize:12, padding:'3px 0', display:'flex', gap:6}}>
                        <span aria-hidden="true" style={{color:'var(--accent-fg)'}}>✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    className={`btn btn--sm ${active ? 'btn--ghost' : 'btn--primary'}`}
                    data-testid={`billing-tier-switch-${tier.id}`}
                    disabled={active}
                    aria-disabled={active}
                    onClick={() => switchTo(tier)}
                  >{active ? 'Current plan' : tier.cta}</button>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <Card title="usage · current cycle" data-testid="billing-usage-card">
        <div className="vstack" style={{gap:14}} data-testid="billing-usage-list" data-tier-id={currentTierId}>
          {(() => {
            // Caps derived from the active gtm_ops tier so flipping
            // Trial → Plus → Pro on the picker above actually changes
            // what the usage card claims about your limits. The static
            // 12000/10000/300/50 caps had no relationship to any real
            // tier and never moved with the picker.
            const TIER_LIMITS = {
              trial: { proposalsCap: 5,            seatsCap: 1,         evalRunsCap: 200,    apiTokensCapM: 5  },
              plus:  { proposalsCap: 50,           seatsCap: 3,         evalRunsCap: 1500,   apiTokensCapM: 25 },
              pro:   { proposalsCap: Infinity,     seatsCap: Infinity,  evalRunsCap: 12000,  apiTokensCapM: 50 },
            };
            const limits = TIER_LIMITS[currentTierId] || TIER_LIMITS.plus;
            // Synthetic "used" values that scale plausibly with the tier
            // — there is no real usage telemetry in the demo, but the
            // ratios should at least feel believable for each cap. For
            // Pro (Unlimited), show absolute counts without a ratio.
            const TIER_USED = {
              trial: { proposals: 2,   seats: 1, evalRuns: 47,    apiTokensM: 1.4  },
              plus:  { proposals: 23,  seats: 2, evalRuns: 612,   apiTokensM: 11.8 },
              pro:   { proposals: 184, seats: 9, evalRuns: 7690,  apiTokensM: 28.4 },
            };
            const used = TIER_USED[currentTierId] || TIER_USED.plus;
            const fmt = (n, unit) => `${n.toLocaleString()}${unit || ''}`;
            const fmtCap = (cap, unit) => cap === Infinity ? 'Unlimited' : `${cap.toLocaleString()}${unit || ''}`;
            const ratio = (u, c) => c === Infinity ? null : Math.min(1, u / c);
            const rows = [
              { key: 'proposals', name: 'Proposals',          used: used.proposals,    cap: limits.proposalsCap,   unit: '' },
              { key: 'seats',     name: 'Active seats',       used: used.seats,        cap: limits.seatsCap,       unit: '' },
              { key: 'eval-runs', name: 'Eval runs',          used: used.evalRuns,     cap: limits.evalRunsCap,    unit: '' },
              { key: 'api',       name: 'API tokens',         used: used.apiTokensM,   cap: limits.apiTokensCapM,  unit: 'M' },
            ];
            return rows.map(r => {
              const r0 = ratio(r.used, r.cap);
              const tone = r0 == null ? 'accent' : r0 >= 0.9 ? 'critical' : r0 >= 0.75 ? 'warn' : 'accent';
              return (
                <div key={r.key} data-testid="billing-usage-row" data-usage-key={r.key}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                    <span style={{fontSize:13}}>{r.name}</span>
                    <span className="mono num" style={{fontSize:12}}>{fmt(r.used, r.unit)} / {fmtCap(r.cap, r.unit)}</span>
                  </div>
                  <div className="progress">
                    <div
                      className={`progress__fill progress__fill--${tone === 'critical' ? 'warn' : tone === 'warn' ? 'warn' : 'accent'}`}
                      style={{width: r0 == null ? '14%' : `${Math.max(2, r0 * 100)}%`}}
                    />
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </Card>
    </div>
  );
}

function SecuritySettings() {
  const DEFAULTS = {
    ssoProvider: 'okta',
    ssoEnforced: true,
    twofaEnforced: true,
    ipAllowlist: '10.0.0.0/8\n192.168.4.0/24\n203.0.113.0/24\n2001:db8::/32',
    sessionTimeoutHours: 8,
    recoveryCodesEnabled: true,
  };
  const SESSION_DEFAULTS = [
    { id: 'current', device: 'Chrome on this workstation', location: 'Austin, TX', lastSeen: 'now', current: true },
    { id: 'sess-macbook', device: 'Safari on MacBook Pro', location: 'Austin, TX', lastSeen: '18m ago', current: false },
    { id: 'sess-ipad', device: 'Chrome on iPad', location: 'Dallas, TX', lastSeen: '2h ago', current: false },
    { id: 'sess-cli', device: 'gtm_ops CLI token', location: 'Cloudflare Pages', lastSeen: 'yesterday', current: false },
  ];
  const AUDIT_DEFAULTS = [
    { t:'14:39', who:'rae@helix.io',    act:'updated agent.hunter system prompt' },
    { t:'13:12', who:'agent-02',        act:'sent proposal PR-2041 -> priya@banyan.health' },
    { t:'11:48', who:'jordan@helix.io', act:'paused agent-03 - manual review' },
    { t:'09:02', who:'system',          act:'rotated salesforce oauth token' },
    { t:'yest',  who:'maya@helix.io',   act:'exported call CALL-2417 transcript' },
  ];
  const [savedPolicy, setSavedPolicy] = useState(DEFAULTS);
  const [form, setForm] = useState(DEFAULTS);
  const [pending, setPending] = useState(false);
  const [sessions, setSessions] = useState(SESSION_DEFAULTS);
  const [recoveryBatch, setRecoveryBatch] = useState({
    id: 'RC-20260505-03',
    count: 10,
    generation: 3,
    generatedLabel: 'today 08:12 AM',
  });
  const [recoveryArtifact, setRecoveryArtifact] = useState(null);
  const [auditEvents, setAuditEvents] = useState(AUDIT_DEFAULTS);
  const dirty =
    form.ssoProvider !== savedPolicy.ssoProvider ||
    form.ssoEnforced !== savedPolicy.ssoEnforced ||
    form.twofaEnforced !== savedPolicy.twofaEnforced ||
    form.ipAllowlist !== savedPolicy.ipAllowlist ||
    form.sessionTimeoutHours !== savedPolicy.sessionTimeoutHours ||
    form.recoveryCodesEnabled !== savedPolicy.recoveryCodesEnabled;

  const ipRangeCount = form.ipAllowlist.split(/\s+/).filter(Boolean).length;
  const otherSessionCount = sessions.filter(s => !s.current).length;
  const audit = (act, who = 'rae@helix.io') => {
    const stamp = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    setAuditEvents(prev => [{ t: stamp, who, act }, ...prev].slice(0, 5));
  };
  const buildRecoveryCodes = (batchId, generation, count = 10) => {
    const hashChunk = (seed) => {
      let hash = 0x811c9dc5;
      for (const ch of seed) {
        hash ^= ch.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(36).toUpperCase().padStart(6, '0').slice(-6);
    };
    return Array.from({ length: count }, (_, i) => {
      const index = String(i + 1).padStart(2, '0');
      return `WR-${index}-${hashChunk(`${batchId}:${generation}:${i}:a`)}-${hashChunk(`${batchId}:${generation}:${i}:b`)}`;
    });
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!dirty) {
      globalThis.toast('No changes to save', { sub: 'security policy unchanged', tone: 'neutral' });
      return;
    }
    setPending(true);
    const nextPolicy = { ...form };
    setTimeout(() => {
      setSavedPolicy(nextPolicy);
      setPending(false);
      audit(`saved security policy - ${ipRangeCount} IP ranges, ${form.sessionTimeoutHours}h sessions`);
      globalThis.toast('Security policy saved', {
        sub: `SSO ${form.ssoEnforced ? 'enforced' : 'optional'} · 2FA ${form.twofaEnforced ? 'enforced' : 'optional'} · ${ipRangeCount} IP ranges · ${form.sessionTimeoutHours}h sessions`,
        tone: 'accent',
      });
    }, 280);
  };

  const onReset = () => {
    setForm(savedPolicy);
    globalThis.toast('Reverted to current policy', { sub: 'no fields will be saved', tone: 'neutral' });
  };

  const onSignOutOthers = () => {
    if (otherSessionCount === 0) {
      globalThis.toast('No other sessions to sign out', { sub: 'this session is the only active session', tone: 'neutral' });
      return;
    }
    setSessions(prev => prev.filter(s => s.current));
    audit(`revoked ${otherSessionCount} other session${otherSessionCount === 1 ? '' : 's'}`);
    globalThis.toast(`Signed out ${otherSessionCount} other session${otherSessionCount === 1 ? '' : 's'}`, {
      sub: 'this session preserved',
      tone: 'warn',
    });
  };

  const onRegenerateRecovery = () => {
    const stamp = new Date();
    const yyyy = stamp.getFullYear();
    const mm = String(stamp.getMonth() + 1).padStart(2, '0');
    const dd = String(stamp.getDate()).padStart(2, '0');
    const nextGeneration = recoveryBatch.generation + 1;
    const nextBatch = {
      id: `RC-${yyyy}${mm}${dd}-${String(nextGeneration).padStart(2, '0')}`,
      count: 10,
      generation: nextGeneration,
      generatedLabel: stamp.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
    };
    const codes = buildRecoveryCodes(nextBatch.id, nextGeneration, nextBatch.count);
    setRecoveryBatch(nextBatch);
    setRecoveryArtifact({
      ...nextBatch,
      codes,
      generatedAt: stamp.toLocaleString([], { dateStyle:'medium', timeStyle:'short' }),
      copiedAt: null,
      storedAt: null,
      visible: true,
    });
    audit(`regenerated recovery code batch ${nextBatch.id}`);
    globalThis.toast(`${nextBatch.count} new recovery codes generated`, {
      sub: `${nextBatch.id} active · review artifact opened`,
      tone: 'accent',
    });
  };
  const copyRecoveryArtifact = async () => {
    if (!recoveryArtifact?.visible) return;
    const copiedAt = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const body = [
      `gtm_ops recovery code artifact ${recoveryArtifact.id}`,
      `generated ${recoveryArtifact.generatedAt}`,
      '',
      ...recoveryArtifact.codes,
    ].join('\n');
    try { await navigator.clipboard?.writeText?.(body); }
    catch (_) { /* clipboard can be unavailable in locked-down browsers */ }
    setRecoveryArtifact(prev => prev ? { ...prev, copiedAt } : prev);
    audit(`copied recovery code artifact ${recoveryArtifact.id}`);
    globalThis.toast('Recovery codes copied', { sub: `${recoveryArtifact.id} · store them before closing`, tone:'accent' });
  };
  const markRecoveryStored = () => {
    if (!recoveryArtifact) return;
    const storedAt = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    setRecoveryArtifact(prev => prev ? { ...prev, storedAt, visible: false } : prev);
    audit(`marked recovery code artifact stored ${recoveryArtifact.id}`);
    globalThis.toast('Recovery artifact stored', { sub: `${recoveryArtifact.id} · one-time codes hidden`, tone:'healthy' });
  };

  return (
    <div className="vstack" style={{gap:18}}>
      <Card title="auth policy">
        <form className="security-form vstack" style={{gap:14}} onSubmit={onSubmit} aria-label="Security policy form">
          <label className="form-row">
            <span className="form-row__label">SSO provider</span>
            <select
              className="form-input"
              data-testid="sec-sso-provider"
              value={form.ssoProvider}
              onChange={(e) => setForm({ ...form, ssoProvider: e.target.value })}
            >
              <option value="okta">Okta</option>
              <option value="google">Google Workspace</option>
              <option value="azure">Microsoft Entra ID</option>
              <option value="generic-saml">Generic SAML 2.0</option>
              <option value="none">None</option>
            </select>
          </label>

          <label className="form-row form-row--inline">
            <input
              type="checkbox"
              data-testid="sec-sso-enforced"
              checked={form.ssoEnforced}
              onChange={(e) => setForm({ ...form, ssoEnforced: e.target.checked })}
            />
            <span>Require SSO for all members</span>
          </label>

          <label className="form-row form-row--inline">
            <input
              type="checkbox"
              data-testid="sec-2fa-enforced"
              checked={form.twofaEnforced}
              onChange={(e) => setForm({ ...form, twofaEnforced: e.target.checked })}
            />
            <span>Require 2FA for all members</span>
          </label>

          <label className="form-row">
            <span className="form-row__label">
              IP allowlist <span className="mono dim" style={{fontSize:10}}>· {ipRangeCount} ranges · CIDR, one per line</span>
            </span>
            <textarea
              className="form-input form-input--mono"
              data-testid="sec-ip-allowlist"
              rows={4}
              spellCheck={false}
              value={form.ipAllowlist}
              onChange={(e) => setForm({ ...form, ipAllowlist: e.target.value })}
              placeholder={'10.0.0.0/8\n192.168.0.0/16'}
            />
          </label>

          <label className="form-row">
            <span className="form-row__label">Session timeout</span>
            <select
              className="form-input"
              data-testid="sec-session-timeout"
              value={form.sessionTimeoutHours}
              onChange={(e) => setForm({ ...form, sessionTimeoutHours: Number(e.target.value) })}
            >
              <option value={1}>1 hour</option>
              <option value={4}>4 hours</option>
              <option value={8}>8 hours</option>
              <option value={24}>24 hours</option>
              <option value={168}>7 days</option>
            </select>
          </label>

          <label className="form-row form-row--inline">
            <input
              type="checkbox"
              data-testid="sec-recovery-codes"
              checked={form.recoveryCodesEnabled}
              onChange={(e) => setForm({ ...form, recoveryCodesEnabled: e.target.checked })}
            />
            <span>Allow recovery codes (one-time backup for 2FA)</span>
          </label>

          <div className="hstack" style={{gap:8, justifyContent:'flex-end', marginTop:4}}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              data-testid="sec-reset"
              onClick={onReset}
              disabled={!dirty || pending}
            >Discard changes</button>
            <button
              type="submit"
              className="btn btn--primary btn--sm"
              data-testid="sec-save"
              disabled={pending}
              aria-disabled={pending}
            >{pending ? 'Saving…' : 'Save policy'}</button>
          </div>
        </form>
      </Card>

      <Card title={`session actions · ${sessions.length} active`}>
        <div className="vstack" style={{gap:10}}>
          <div className="hstack" style={{justifyContent:'space-between', gap:12, padding:'8px 0', borderBottom:'1px dashed var(--border)'}}>
            <div>
              <div style={{fontSize:13, fontWeight:600}}>Sign out all other sessions</div>
              <div className="muted" data-testid="sec-session-summary" style={{fontSize:12}}>
                {otherSessionCount === 0
                  ? 'This browser is the only active session.'
                  : `${otherSessionCount} other active session${otherSessionCount === 1 ? '' : 's'} can be revoked.`}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              data-testid="sec-signout-others"
              disabled={otherSessionCount === 0}
              onClick={onSignOutOthers}
            >{otherSessionCount === 0 ? 'No other sessions' : `Sign out ${otherSessionCount}`}</button>
          </div>
          <div className="vstack" data-testid="sec-session-list" style={{gap:6}}>
            {sessions.map(s => (
              <div
                key={s.id}
                data-testid="sec-session-row"
                data-current={s.current ? 'true' : 'false'}
                style={{display:'grid', gridTemplateColumns:'minmax(0, 1fr) auto', gap:10, alignItems:'center', padding:'7px 9px', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', background:'var(--bg-inset)'}}
              >
                <div style={{minWidth:0}}>
                  <div style={{fontSize:12, fontWeight:600}}>{s.device}</div>
                  <div className="mono dim" style={{fontSize:10, marginTop:2}}>{s.location} · {s.lastSeen}</div>
                </div>
                <Badge tone={s.current ? 'healthy' : 'neutral'}>{s.current ? 'current' : 'active'}</Badge>
              </div>
            ))}
          </div>
          <div className="hstack" style={{justifyContent:'space-between', gap:12, padding:'8px 0'}}>
            <div>
              <div style={{fontSize:13, fontWeight:600}}>Regenerate recovery codes</div>
              <div className="muted" style={{fontSize:12}}>Invalidates the current set and opens a one-time local review artifact.</div>
              <div className="mono dim" data-testid="sec-recovery-status" style={{fontSize:10, marginTop:4}}>
                {recoveryBatch.id} · {recoveryBatch.count} codes · generated {recoveryBatch.generatedLabel}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              data-testid="sec-regen-recovery"
              disabled={!form.recoveryCodesEnabled}
              onClick={onRegenerateRecovery}
            >Regenerate</button>
          </div>
          {recoveryArtifact && (
            <div className="recovery-artifact" data-testid="sec-recovery-artifact" data-state={recoveryArtifact.storedAt ? 'stored' : recoveryArtifact.copiedAt ? 'copied' : 'review'}>
              <div className="recovery-artifact__header">
                <div>
                  <span className="eyebrow eyebrow--accent">recovery artifact</span>
                  <strong>{recoveryArtifact.id}</strong>
                  <p>Copy these one-time codes into the password manager, then mark the artifact stored. Codes are hidden after storage confirmation.</p>
                </div>
                <Badge tone={recoveryArtifact.storedAt ? 'healthy' : recoveryArtifact.copiedAt ? 'accent' : 'warn'}>
                  {recoveryArtifact.storedAt ? 'stored' : recoveryArtifact.copiedAt ? 'copied' : 'review now'}
                </Badge>
              </div>
              {recoveryArtifact.visible ? (
                <div className="recovery-artifact__codes" data-testid="sec-recovery-code-list" aria-label="Generated recovery codes">
                  {recoveryArtifact.codes.map(code => <code key={code}>{code}</code>)}
                </div>
              ) : (
                <div className="recovery-artifact__hidden" data-testid="sec-recovery-codes-hidden">
                  Codes hidden after storage confirmation. Regenerate again if this packet was not captured.
                </div>
              )}
              <div className="recovery-artifact__footer">
                <span className="mono dim" data-testid="sec-recovery-artifact-status">
                  generated {recoveryArtifact.generatedAt}
                  {recoveryArtifact.copiedAt ? ` · copied ${recoveryArtifact.copiedAt}` : ''}
                  {recoveryArtifact.storedAt ? ` · stored ${recoveryArtifact.storedAt}` : ''}
                </span>
                <div className="hstack" style={{gap:8}}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    data-testid="sec-copy-recovery-codes"
                    disabled={!recoveryArtifact.visible}
                    onClick={copyRecoveryArtifact}
                  >Copy codes</button>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    data-testid="sec-store-recovery-codes"
                    disabled={Boolean(recoveryArtifact.storedAt)}
                    onClick={markRecoveryStored}
                  >{recoveryArtifact.storedAt ? 'Stored' : 'Mark stored'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="audit log · last 5">
        <div className="vstack" style={{gap:0}}>
          {auditEvents.map((e,i)=>(
            <div key={`${e.t}-${e.act}-${i}`} data-testid="sec-audit-row" style={{display:'grid', gridTemplateColumns:'60px 140px 1fr', gap:12, padding:'8px 0', borderBottom:'1px dashed var(--border)', fontSize:12}}>
              <span className="mono dim">{e.t}</span>
              <span className="mono" style={{color:'var(--accent-fg)'}}>{e.who}</span>
              <span>{e.act}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function GeneratePage({ setRoute }) {
  const [inputText, setInputText] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [reviewReady, setReviewReady] = React.useState(false);
  const [artifactPanel, setArtifactPanel] = React.useState(null);
  const [artifactPayload, setArtifactPayload] = React.useState(null);
  const [artifactState, setArtifactState] = React.useState('idle');
  const [briefError, setBriefError] = React.useState('');
  const [addressBlockersBanner, setAddressBlockersBanner] = React.useState(null);
  const [proposalDraftBanner, setProposalDraftBanner] = React.useState(null);
  const [newRunBanner, setNewRunBanner] = React.useState(null);
  const [publicSampleArtifact, setPublicSampleArtifact] = React.useState(false);
  // Captures the most-recent handoff context so reviewInProposals can route
  // to the matching proposal even after the visible banner auto-clears on
  // reviewReady. Without this, the route handoff lost the buyer identity
  // the moment a draft was produced and would silently fall back to the
  // Acme/Banyan default.
  const lastHandoffRef = React.useRef(null);
  const generationIdRef = React.useRef(0);
  const briefRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const artifactPanelRef = React.useRef(null);
  const artifactIdSlug = (value) => {
    const slug = String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
    return slug || 'proposal';
  };
  const briefBuyerName = (() => {
    const match = String(inputText || '').match(/^\s*(?:CLIENT|BUYER|COMPANY)\s*:\s*([^\n]+)/im);
    if (!match) return '';
    return match[1]
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .replace(/\s+(?:services|service company|llc|inc\.?|corp\.?|corporation)$/i, '')
      .trim();
  })();
  const hasProofText = Boolean(inputText.trim());
  const sampleProofActive = publicSampleArtifact || /^\s*CLIENT\s*:\s*Acme HVAC Services/im.test(inputText);
  const activeHandoff = lastHandoffRef.current || {};
  const reviewSubject = (() => {
    if (activeHandoff.kind === 'address-blockers') return activeHandoff.co || activeHandoff.proposalId || 'Proposal';
    if (activeHandoff.kind === 'call-proposal-draft' || activeHandoff.kind === 'new-run') return activeHandoff.callCo || activeHandoff.callId || 'Proposal';
    return briefBuyerName || (hasProofText ? 'Operator brief' : sampleProofActive ? 'Acme HVAC' : 'Unbound review packet');
  })();
  const reviewSignal = (() => {
    if (activeHandoff.kind === 'address-blockers') {
      const blockers = Array.isArray(activeHandoff.blockers) ? activeHandoff.blockers.length : 0;
      return blockers
        ? `${blockers} buyer ${blockers === 1 ? 'blocker' : 'blockers'} carried from proposal review`
        : 'proposal review requested without blocker detail';
    }
    if (activeHandoff.kind === 'call-proposal-draft' || activeHandoff.kind === 'new-run') {
      const parts = [
        activeHandoff.callId,
        activeHandoff.callOutcome,
        typeof activeHandoff.callScore === 'number' ? `${activeHandoff.callScore.toFixed(1)}/10 call score` : null,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' · ') : 'qualified call context carried from the console';
    }
    if (sampleProofActive) return '22% after-hours voicemail · 40% no-callback · pilot approved';
    return hasProofText ? 'operator-supplied buyer proof' : 'waiting for buyer proof';
  })();
  const reviewContextSource = activeHandoff.kind
    ? 'console handoff · selected buyer context'
    : sampleProofActive
      ? 'demo proof · regional HVAC contractor · TX'
      : hasProofText
        ? 'operator-supplied buyer proof'
        : 'unbound preview · no buyer loaded';
  const reviewPacketId = activeHandoff.kind
    ? `run_${artifactIdSlug(reviewSubject)}`
    : sampleProofActive
      ? 'run_acme_hvac'
      : briefBuyerName
        ? `run_${artifactIdSlug(briefBuyerName)}`
        : hasProofText
          ? 'run_operator_brief'
          : 'run_unbound_preview';
  const focusBuyerBrief = React.useCallback(() => {
    requestAnimationFrame(() => {
      globalThis.scrollConsoleNodeIntoView?.(briefRef.current, { block: 'center' });
      briefRef.current?.focus({ preventScroll: true });
    });
  }, []);
  const invalidateDraftForBriefChange = React.useCallback(() => {
    setPublicSampleArtifact(false);
    if (!reviewReady && !isGenerating && !artifactPanel) return;
    generationIdRef.current += 1;
    setIsGenerating(false);
    setReviewReady(false);
    setArtifactPanel(null);
    setArtifactPayload(null);
    setArtifactState('idle');
    globalThis.toast('Draft review reset', {
      sub: 'Buyer proof changed. Regenerate before opening Proposals.',
      tone: 'warn',
    });
  }, [artifactPanel, isGenerating, reviewReady]);
  const [attachedFiles, setAttachedFiles] = React.useState([]);
  const [attachmentPickerNote, setAttachmentPickerNote] = React.useState('');
  const isReadableAttachment = (file) => (
    /^text\//i.test(file.type || '') ||
    /\.(txt|md|markdown|json|jsonl|csv|tsv|log)$/i.test(file.name || '')
  );
  const readAttachment = (file) => new Promise((resolve) => {
    const base = {
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      lastModified: file.lastModified,
      includedInBrief: false,
    };
    if (!isReadableAttachment(file)) {
      resolve(base);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({
      ...base,
      includedInBrief: true,
      text: String(reader.result || '').slice(0, 24000),
    });
    reader.onerror = () => resolve(base);
    reader.readAsText(file);
  });
  const handleFileAttach = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      setAttachmentPickerNote('No file attached yet. Choose a source file or paste buyer proof below.');
      return;
    }
    const loaded = await Promise.all(files.map(readAttachment));
    setAttachedFiles(prev => {
      const seen = new Set(prev.map(f => f.id));
      return [...prev, ...loaded.filter(f => !seen.has(f.id))];
    });
    const readable = loaded.filter(f => f.includedInBrief && f.text);
    if (readable.length > 0) {
      const attachmentText = readable.map(f => [
        `--- attachment: ${f.name} (${Math.round(f.size / 1024)} KB) ---`,
        f.text,
      ].join('\n')).join('\n\n');
      setInputText(prev => `${prev.trim() ? `${prev.trim()}\n\n` : ''}${attachmentText}`);
    }
    invalidateDraftForBriefChange();
    setBriefError('');
    setAttachmentPickerNote(
      `${files.length} file${files.length === 1 ? '' : 's'} attached to this review packet. ${
        readable.length > 0
          ? `${readable.length} text attachment${readable.length === 1 ? '' : 's'} appended to buyer proof.`
          : 'Binary metadata will travel with the run packet.'
      }`
    );
    globalThis.toast(`${files.length} file${files.length === 1 ? '' : 's'} attached`, {
      sub: readable.length > 0 ? `${readable.length} text attachment${readable.length === 1 ? '' : 's'} added to buyer proof` : 'binary metadata added to the run packet',
      tone: 'accent',
    });
    event.target.value = '';
  };
  const requestFileAttach = () => {
    setAttachmentPickerNote('File picker requested. Choose PDF, JSON, TXT, CSV, or log evidence; buyer send stays gated.');
    fileInputRef.current?.click();
  };
  const removeAttachedFile = (fileId) => {
    const nextCount = attachedFiles.filter(f => f.id !== fileId).length;
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
    setAttachmentPickerNote(
      nextCount > 0
        ? `${nextCount} file${nextCount === 1 ? '' : 's'} still attached to this review packet.`
        : 'All attachments removed. Add buyer proof before running the draft engine.'
    );
    invalidateDraftForBriefChange();
  };

  // Clear handoff banners as soon as the operator successfully generates
  // a review draft. The banners exist to label "this brief came from a
  // handoff"; once a draft is ready, the handoff has been consumed and
  // leaving the banner up makes it lie about current state — re-running
  // or returning to Generate would still see "Addressing blockers from
  // PR-2039" even after the draft was produced and reviewed.
  React.useEffect(() => {
    if (!reviewReady) return;
    setAddressBlockersBanner(null);
    setProposalDraftBanner(null);
    setNewRunBanner(null);
  }, [reviewReady]);

  // Public demo CTAs can deep-link into the console's artifact review
  // drawer. Treat the query as a one-shot opener so closing/navigating
  // inside the console does not keep resurrecting a local preview artifact.
  React.useEffect(() => {
    try {
      const url = new URL(globalThis.location.href);
      const requestedArtifact = url.searchParams.get('artifact');
      if (requestedArtifact === 'pdf' || requestedArtifact === 'json') {
        setPublicSampleArtifact(true);
        setArtifactPanel(requestedArtifact);
        url.searchParams.delete('artifact');
        globalThis.history.replaceState(globalThis.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } catch (_) {
      /* URL API unavailable */
    }
  }, []);

  // Consume the "Address blockers" handoff from ProposalsPage. Pre-fills
  // the brief textarea with a structured prompt that names the proposal
  // and lists each blocker, so the operator doesn't land on an empty
  // composer after clicking a button labeled "Address blockers".
  React.useEffect(() => {
    const applyAddressBlockersHandoff = (ctx) => {
      const extra = ctx?.extra || {};
      if (extra.triggered_from !== 'proposal-address-blockers') return;
      const proposalId = String(extra.address_blockers_proposal_id || '').trim();
      const co = String(extra.address_blockers_co || '').trim();
      const blockers = Array.isArray(extra.address_blockers_list) ? extra.address_blockers_list : [];
      if (!proposalId && blockers.length === 0) return;
      const prefilled = [
        `CONTEXT: Drafting a revised proposal (${proposalId || 'next version'}) for ${co || 'the active buyer'}.`,
        '',
        'OUTSTANDING BLOCKERS to address head-on in this draft:',
        ...blockers.map((b, i) => `  ${i + 1}. ${b}`),
        '',
        'GOAL: Produce a v-next packet that proactively addresses each blocker (legal, scope, pricing) with explicit language buyers can review.',
      ].join('\n');
      setInputText(prefilled);
      setBriefError('');
      setReviewReady(false);
      setArtifactPanel(null);
      setPublicSampleArtifact(false);
      setAddressBlockersBanner({ proposalId, co, blockers });
      lastHandoffRef.current = { kind: 'address-blockers', proposalId, co, blockers };
      // Clear the handoff so re-navigating to Generate doesn't keep
      // re-prefilling the textarea.
      globalThis.AppContext.set({
        extra: page2OmitKeys(extra, [
          'triggered_from',
          'address_blockers_proposal_id',
          'address_blockers_co',
          'address_blockers_list',
        ]),
      });
    };
    applyAddressBlockersHandoff(globalThis.AppContext.get());
    return globalThis.AppContext.subscribe(applyAddressBlockersHandoff);
  }, []);

  // Consume the "Draft next proposal" handoff from CallsPage. Pre-fills
  // the brief textarea with the active call's metadata so the toast's
  // "agent-02 context carries this call" claim is actually true.
  React.useEffect(() => {
    const applyCallProposalDraftHandoff = (ctx) => {
      const extra = ctx?.extra || {};
      if (!['call-draft-next-proposal', 'call-generate-proposal-v3'].includes(extra.triggered_from)) return;
      const callId = String(extra.proposal_draft_call_id || extra.proposal_v3_call_id || '').trim();
      const callCo = String(extra.proposal_draft_call_co || extra.proposal_v3_call_co || '').trim();
      const callWho = String(extra.proposal_draft_call_who || extra.proposal_v3_call_who || '').trim();
      const callOutcome = String(extra.proposal_draft_call_outcome || extra.proposal_v3_call_outcome || '').trim();
      const callScore = extra.proposal_draft_call_score ?? extra.proposal_v3_call_score;
      const callDuration = String(extra.proposal_draft_call_duration || extra.proposal_v3_call_duration || '').trim();
      if (!callId && !callCo) return;
      const prefilled = [
        `CONTEXT: Drafting the next proposal from ${callId || 'the most recent call'} with ${callCo || 'the active buyer'}.`,
        '',
        `Call signal:`,
        `  · who: ${callWho || 'buyer stakeholder'}`,
        `  · duration: ${callDuration || '—'}`,
        `  · outcome: ${callOutcome || 'discussion'}`,
        `  · rubric score: ${typeof callScore === 'number' ? callScore.toFixed(1) : '—'} / 10`,
        '',
        'GOAL: Produce a proposal that builds on what was confirmed on the call. Address any objections raised explicitly. Include pricing, scope, security/compliance, and the operator gate before send.',
      ].join('\n');
      setInputText(prefilled);
      setBriefError('');
      setReviewReady(false);
      setArtifactPanel(null);
      setPublicSampleArtifact(false);
      setProposalDraftBanner({ callId, callCo, callWho, callOutcome, callScore });
      lastHandoffRef.current = { kind: 'call-proposal-draft', callId, callCo, callWho, callOutcome, callScore };
      globalThis.AppContext.set({
        extra: page2OmitKeys(extra, [
          'triggered_from',
          'proposal_draft_call_id',
          'proposal_draft_call_co',
          'proposal_draft_call_who',
          'proposal_draft_call_outcome',
          'proposal_draft_call_score',
          'proposal_draft_call_duration',
          'proposal_v3_call_id',
          'proposal_v3_call_co',
          'proposal_v3_call_who',
          'proposal_v3_call_outcome',
          'proposal_v3_call_score',
          'proposal_v3_call_duration',
        ]),
      });
    };
    applyCallProposalDraftHandoff(globalThis.AppContext.get());
    return globalThis.AppContext.subscribe(applyCallProposalDraftHandoff);
  }, []);

  // Consume the topbar "New task -> Generate proposal" handoff. That
  // action advertises buyer proof from an existing call, so the Generate
  // page must not land on an empty composer.
  React.useEffect(() => {
    const applyNewRunHandoff = (ctx) => {
      const extra = ctx?.extra || {};
      if (extra.triggered_from !== 'topbar-new-run' || extra.run_intent !== 'proposal_generation') return;
      const callId = String(extra.proposal_seed_call_id || '').trim();
      const callCo = String(extra.proposal_seed_call_co || '').trim();
      const callWho = String(extra.proposal_seed_call_who || '').trim();
      const callOutcome = String(extra.proposal_seed_call_outcome || '').trim();
      const callScore = extra.proposal_seed_call_score;
      const callDuration = String(extra.proposal_seed_call_duration || '').trim();
      const hasSeed = callId || callCo || callWho || callOutcome;
      if (!hasSeed) return;
      const prefilled = [
        `CONTEXT: New proposal run seeded from ${callId || 'the latest qualified call'}${callCo ? ` with ${callCo}` : ''}.`,
        '',
        'Buyer proof carried from the call:',
        `  · stakeholder: ${callWho || 'buyer stakeholder'}`,
        `  · duration: ${callDuration || '—'}`,
        `  · outcome: ${callOutcome || 'discussion'}`,
        `  · rubric score: ${typeof callScore === 'number' ? callScore.toFixed(1) : '—'} / 10`,
        '',
        'GOAL: Generate a review draft with pricing, scope, implementation sequence, risk checks, and an operator approval gate before buyer send.',
      ].join('\n');
      setInputText(prefilled);
      setBriefError('');
      setReviewReady(false);
      setArtifactPanel(null);
      setPublicSampleArtifact(false);
      setNewRunBanner({ callId, callCo, callWho, callOutcome, callScore });
      lastHandoffRef.current = { kind: 'new-run', callId, callCo, callWho, callOutcome, callScore };
      globalThis.AppContext.set({
        extra: page2OmitKeys(extra, [
          'triggered_from',
          'proposal_seed_source',
          'proposal_seed_call_id',
          'proposal_seed_call_co',
          'proposal_seed_call_who',
          'proposal_seed_call_outcome',
          'proposal_seed_call_score',
          'proposal_seed_call_duration',
        ]),
      });
    };
    applyNewRunHandoff(globalThis.AppContext.get());
    return globalThis.AppContext.subscribe(applyNewRunHandoff);
  }, []);

  const hasAttachment = attachedFiles.length > 0;
  const hasBrief = Boolean(inputText.trim() || hasAttachment);
  const sampleArtifactPreviewOnly = publicSampleArtifact && !hasBrief && !activeHandoff.kind;
  const readableAttachmentCount = attachedFiles.filter(f => f.includedInBrief).length;
  const isDemoArtifactMode = Boolean(globalThis.DEMO_MODE);
  const artifactMode = isDemoArtifactMode ? 'demo sequence' : 'live backend';
  const artifactHasBuyerProof = Boolean(activeHandoff.kind || sampleProofActive || hasBrief);
  const artifactIsUnbound = !artifactHasBuyerProof;
  const artifactPreviewReady = Boolean(reviewReady || sampleArtifactPreviewOnly);
  const pendingArtifactPath = artifactIsUnbound
    ? 'pending: buyer proof required before render'
    : 'pending: run sequence required before render';
  const reviewArtifactLocator = (kind) => (
    artifactPreviewReady
      ? `local-review://${reviewPacketId}/${kind === 'pdf' ? 'proposal.pdf' : 'source-evidence.json'}`
      : pendingArtifactPath
  );
  const artifacts = {
    pdf: {
      kind: 'PDF',
      title: reviewReady
        ? `${reviewSubject} proposal draft`
        : sampleArtifactPreviewOnly
          ? `${reviewSubject} proposal packet preview`
          : artifactHasBuyerProof
            ? `${reviewSubject} packet requirements`
            : 'Unbound proposal packet requirements',
      path: artifactPreviewReady ? '../assets/sample-proposal.pdf' : '',
      displayPath: reviewArtifactLocator('pdf'),
      previewAvailable: artifactPreviewReady,
      artifactId: reviewPacketId,
      sourceLabel: artifactIsUnbound
        ? 'PDF renderer waiting on buyer proof'
        : sampleArtifactPreviewOnly
          ? 'demo artifact preview'
        : artifactPreviewReady
          ? 'branded PDF renderer'
          : 'draft engine waiting to render PDF',
      previewTitle: `${reviewReady ? 'Generated' : 'Local'} proposal PDF review preview`,
      status: reviewReady
        ? (isDemoArtifactMode ? 'demo draft ready' : 'draft ready')
        : sampleArtifactPreviewOnly
          ? 'demo preview only'
          : artifactHasBuyerProof ? 'sequence required' : 'requirements',
      gate: reviewReady ? 'operator_review' : 'sequence_required',
      mode: artifactMode,
      summary: reviewReady
        ? (isDemoArtifactMode
          ? `Demo-generated ${reviewSubject} packet replayed through the local review sequence. The review gate, audit trace, and proposal handoff are real console behavior; buyer send remains blocked.`
          : 'Seven-page branded proposal packet generated from this run. Review pricing, scope, and the AI risk report before buyer send.')
        : sampleArtifactPreviewOnly
          ? `Demo-proof ${reviewSubject} review artifact preview. Load proof or run a fresh sequence before buyer approval.`
          : artifactHasBuyerProof
            ? 'Buyer proof is loaded, but no PDF artifact exists yet. Run the sequence to bind evidence, pricing, risk, and the approval gate.'
          : 'Unbound artifact requirements. Load demo proof or paste buyer context before a buyer packet exists.',
    },
    json: {
      kind: 'JSON',
      title: reviewReady
        ? `${reviewSubject} source evidence bundle`
        : sampleArtifactPreviewOnly
          ? `${reviewSubject} source artifact preview`
          : artifactHasBuyerProof
            ? `${reviewSubject} source requirements`
            : 'Unbound source evidence requirements',
      path: artifactPreviewReady ? '../fixtures/transcripts/sample-proposal.json' : '',
      displayPath: reviewArtifactLocator('json'),
      previewAvailable: artifactPreviewReady,
      artifactId: reviewPacketId,
      sourceLabel: artifactIsUnbound
        ? 'buyer evidence not loaded'
        : sampleArtifactPreviewOnly
          ? 'demo source preview'
        : artifactPreviewReady
          ? 'buyer evidence bundle'
          : 'draft engine waiting to bind source evidence',
      status: reviewReady
        ? (isDemoArtifactMode ? `demo-bound to ${reviewPacketId}` : `bound to ${reviewPacketId}`)
        : sampleArtifactPreviewOnly
          ? 'demo preview only'
          : artifactHasBuyerProof ? 'sequence required' : 'requirements',
      gate: reviewReady ? 'operator_review' : 'sequence_required',
      mode: artifactMode,
      summary: reviewReady
        ? (isDemoArtifactMode
          ? `Demo evidence bundle replayed through the local review sequence with ${reviewSubject} review metadata. Use it to inspect the review path; live runs replace this with backend-generated source evidence.`
          : 'Transcript, extracted buyer context, pricing inputs, and checks bound to the generated proposal draft.')
        : sampleArtifactPreviewOnly
          ? 'Demo transcript and buyer context are open as a preview-only artifact. Generate a fresh draft before buyer approval.'
          : artifactHasBuyerProof
            ? 'Buyer proof is loaded, but source evidence has not been bound to a generated draft yet. Run the sequence first.'
          : 'Source evidence requirements are waiting on buyer proof; no source preview exists yet.',
    },
  };
  const activeArtifact = artifactPanel ? artifacts[artifactPanel] : null;
  const pdfReviewChecks = [
    { label: 'Buyer evidence', state: artifactIsUnbound ? 'missing' : sampleArtifactPreviewOnly ? 'preview' : reviewReady ? 'bound' : 'loaded' },
    { label: 'Pricing math', state: reviewReady ? 'check' : 'pending' },
    { label: 'Risk report', state: reviewReady ? 'review' : 'pending' },
    { label: 'Brand polish', state: reviewReady ? 'renderer' : 'pending' },
  ];
  const artifactSourcePreview = (() => {
    if (!activeArtifact) return null;
    const base = {
      artifact_id: activeArtifact.artifactId,
      review_subject: reviewSubject,
      source_path: activeArtifact.displayPath || activeArtifact.path,
      gate: activeArtifact.gate,
      buyer_send: 'blocked_until_operator_review',
    };
    if (!activeHandoff.kind && !sampleProofActive && !hasBrief) {
      return {
        ...base,
        evidence: {
          packet_type: 'unbound_preview',
          status: 'waiting_for_buyer_proof',
          note: 'No buyer proof is loaded. Load demo proof, paste buyer context, or attach source evidence before reviewing a buyer packet.',
        },
      };
    }
    if (!activeArtifact.previewAvailable) {
      return {
        ...base,
        evidence: {
          packet_type: 'sequence_required',
          status: 'run_sequence_before_artifact_preview',
          note: 'Buyer proof is loaded, but the PDF/source artifact does not exist until the draft engine completes.',
        },
      };
    }
    if (!activeHandoff.kind) {
      return {
        ...base,
        evidence: artifactPayload || {},
      };
    }
    const loadedPayload = artifactPayload && typeof artifactPayload === 'object' ? artifactPayload : {};
    return {
      ...base,
      evidence: {
        packet_type: 'handoff_review_source',
        buyer: reviewSubject,
        signal: reviewSignal,
        context_source: reviewContextSource,
        review_metadata: {
          review_subject: reviewSubject,
          review_packet_id: activeArtifact.artifactId,
          review_gate: activeArtifact.gate,
          artifact_mode: activeArtifact.mode,
          buyer_send: 'blocked_until_operator_review',
        },
        carried_handoff: {
          kind: activeHandoff.kind,
          call_id: activeHandoff.callId || null,
          call_outcome: activeHandoff.callOutcome || null,
          call_score: typeof activeHandoff.callScore === 'number' ? activeHandoff.callScore : null,
          proposal_id: activeHandoff.proposalId || null,
          blockers: Array.isArray(activeHandoff.blockers) ? activeHandoff.blockers : [],
        },
        synthetic_fixture_shape: {
          source_path: activeArtifact.path,
          proposal_id: loadedPayload.proposal_id || 'prop_demo_001',
          revision: loadedPayload.revision || null,
          sections: loadedPayload.sections ? Object.keys(loadedPayload.sections) : [],
          note: loadedPayload._demo_note || 'Synthetic fixture used only for local preview shape.',
        },
      },
    };
  })();
  React.useEffect(() => {
    if (!artifactPanel) return undefined;
    const frame = requestAnimationFrame(() => {
      globalThis.scrollConsoleNodeIntoView?.(artifactPanelRef.current, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [artifactPanel]);
  React.useEffect(() => {
    setArtifactPayload(null);
    if (!activeArtifact || activeArtifact.kind !== 'JSON') {
      setArtifactState('idle');
      return undefined;
    }
    if (!activeArtifact.previewAvailable || !activeArtifact.path) {
      setArtifactState('ready');
      return undefined;
    }
    let cancelled = false;
    setArtifactState('loading');
    fetch(activeArtifact.path)
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`${res.status} ${res.statusText || 'artifact unavailable'}`)))
      .then(data => {
        if (cancelled) return;
        setArtifactPayload(data);
        setArtifactState('ready');
      })
      .catch(err => {
        if (cancelled) return;
        setArtifactPayload({
          artifact_id: activeArtifact.artifactId,
          source_path: activeArtifact.displayPath || activeArtifact.path,
          gate: activeArtifact.gate,
          status: 'preview_unavailable',
          error: err?.message || 'Unable to load artifact preview',
        });
        setArtifactState('error');
      });
    return () => { cancelled = true; };
  }, [activeArtifact?.kind, activeArtifact?.path, activeArtifact?.displayPath, activeArtifact?.previewAvailable, activeArtifact?.artifactId, activeArtifact?.gate]);

  const buyerCommandState = activeHandoff.kind
    ? 'handoff'
    : sampleArtifactPreviewOnly
      ? 'preview'
      : hasBrief
        ? 'ready'
        : 'missing';
  const buyerCommandValue = activeHandoff.kind
    ? reviewSubject
    : sampleArtifactPreviewOnly
      ? 'Demo proof packet'
      : briefBuyerName || (hasBrief ? 'operator brief' : 'No buyer loaded');
  const buyerCommandMeta = activeHandoff.kind
    ? reviewContextSource
    : sampleArtifactPreviewOnly
      ? 'demo packet preview · load proof to regenerate'
      : briefBuyerName
      ? reviewContextSource
      : hasBrief
        ? 'buyer name not parsed from proof'
        : 'load demo proof or paste buyer proof';
  const proofSourceLabel = activeHandoff.kind
    ? 'console handoff'
    : sampleProofActive
      ? 'demo proof loaded'
      : hasBrief
        ? 'operator supplied'
        : sampleArtifactPreviewOnly
          ? 'demo artifact preview'
          : 'empty composer';
  const draftStateLabel = isGenerating
    ? 'running'
    : reviewReady
      ? 'ready for review'
      : hasBrief
        ? 'ready to run'
        : sampleArtifactPreviewOnly
          ? 'load proof to run'
          : 'needs proof';
  const commandStripItems = [
    {
      label: 'buyer proof',
      value: hasBrief
        ? sampleProofActive
          ? 'demo proof loaded'
          : (hasAttachment ? `${attachedFiles.length} file${attachedFiles.length === 1 ? '' : 's'} attached` : 'brief ready')
        : sampleArtifactPreviewOnly
          ? 'demo artifact open'
          : 'proof missing',
      meta: hasAttachment
        ? `${readableAttachmentCount} text attachment${readableAttachmentCount === 1 ? '' : 's'} included`
        : sampleProofActive
          ? 'synthetic buyer proof bound to local review packet'
        : sampleArtifactPreviewOnly
          ? 'reviewable preview · proof not loaded into draft engine'
          : 'paste notes or attach source files',
      state: hasBrief ? 'ready' : sampleArtifactPreviewOnly ? 'preview' : 'missing',
      tone: hasBrief ? 'healthy' : sampleArtifactPreviewOnly ? 'accent' : 'neutral',
    },
    {
      label: 'active buyer',
      value: buyerCommandValue,
      meta: buyerCommandMeta,
      state: buyerCommandState,
      tone: activeHandoff.kind || briefBuyerName ? 'accent' : hasBrief ? 'warn' : 'neutral',
    },
    {
      label: 'packet',
      value: reviewPacketId,
      meta: reviewReady ? 'artifact bound to this run' : 'preview id until sequence completes',
      state: reviewReady ? 'ready' : 'preview',
      tone: reviewReady ? 'healthy' : 'neutral',
    },
    {
      label: 'buyer send',
      value: reviewReady ? 'approval gate' : 'blocked',
      meta: reviewReady ? 'Proposals approval required before buyer send' : 'no send path until approval',
      state: reviewReady ? 'gated' : 'locked',
      tone: reviewReady ? 'warn' : 'neutral',
    },
  ];
  const draftButtonLabel = isGenerating
    ? 'Generating draft'
    : reviewReady
      ? 'Regenerate review draft'
      : hasBrief
        ? 'Generate review draft'
        : sampleArtifactPreviewOnly
          ? 'Load demo proof'
          : 'Add buyer proof';
  const lowerDraftButtonLabel = isGenerating
    ? 'Sequence running...'
    : reviewReady
      ? 'Regenerate review draft'
      : hasBrief
        ? 'Generate review draft'
        : sampleArtifactPreviewOnly
          ? 'Load demo proof'
          : 'Add buyer proof';
  const sequenceSteps = [
    {
      n: '01',
      title: 'Buyer proof',
      sub: 'Call notes, CRM context, transcript, constraints.',
      state: hasBrief ? 'ready' : 'missing',
      tone: hasBrief ? 'healthy' : 'neutral',
    },
    {
      n: '02',
      title: 'Draft engine',
      sub: hasBrief ? 'Ready to extract, enrich, price, risk-check, render.' : 'Waiting for buyer proof before extract, enrich, price, risk-check, render.',
      state: isGenerating ? 'running' : reviewReady ? 'complete' : hasBrief ? 'ready' : 'waiting',
      tone: isGenerating ? 'warn' : reviewReady ? 'healthy' : hasBrief ? 'accent' : 'neutral',
    },
    {
      n: '03',
      title: 'Review gate',
      sub: 'Review packet locally, then open Proposals for operator approval before buyer send.',
      state: reviewReady ? 'ready' : 'locked',
      tone: reviewReady ? 'accent' : 'neutral',
    },
  ];
  const artifactReviewDetail = reviewReady
    ? `${reviewPacketId} PDF and source artifacts are available locally.`
    : sampleArtifactPreviewOnly
      ? 'Demo review artifact is open; load proof to run a fresh sequence.'
      : artifactHasBuyerProof
        ? 'Buyer proof is loaded; run the sequence to render PDF/source artifacts.'
      : 'Inspect packet requirements; no PDF/source preview exists until buyer proof is loaded.';
  const artifactReviewActionLabel = reviewReady ? 'Review artifact' : 'Inspect requirements';
  const pendingReviewMessage = artifactHasBuyerProof
    ? 'Run the sequence to create the proposal review packet.'
    : 'Add buyer proof before this packet can be reviewed.';
  const readyReviewMessage = `${reviewSubject} draft is ready for operator review. Packet ${reviewPacketId} stays gated in Proposals.`;
  const packetReviewCopy = artifactHasBuyerProof
    ? reviewReady
      ? 'Review PDF/source artifacts locally first; approval happens in Proposals before buyer send.'
      : 'Buyer proof is loaded. Run the sequence to create PDF/source artifacts; approval happens in Proposals before buyer send.'
    : 'Requirements are visible here; PDF/source artifacts appear after buyer proof is attached and the sequence completes, then approval happens in Proposals.';
  const pdfArtifactActionLabel = reviewReady
    ? 'Review PDF artifact'
    : sampleArtifactPreviewOnly
      ? 'Preview demo PDF'
      : 'Inspect PDF requirements';
  const sourceArtifactActionLabel = reviewReady
    ? 'Inspect source evidence'
    : sampleArtifactPreviewOnly
      ? 'Preview demo source'
      : 'Inspect source requirements';
  const reviewPathSteps = [
    {
      key: 'artifact',
      label: 'Artifact',
      detail: artifactReviewDetail,
      state: activeArtifact ? 'active' : reviewReady ? 'ready' : 'pending',
      action: { key: reviewReady || sampleArtifactPreviewOnly ? 'open-artifact-preview' : 'inspect-artifact-requirements', label: artifactReviewActionLabel },
    },
    {
      key: 'review',
      label: 'Review',
      detail: reviewReady
        ? 'Operator approval in Proposals.'
        : artifactHasBuyerProof
          ? 'Draft gate waits for sequence output.'
          : 'Draft gate locked until buyer proof is loaded.',
      state: reviewReady ? 'ready' : 'locked',
      action: reviewReady ? { key: 'open-proposals-review', label: 'Open review' } : null,
    },
    {
      key: 'send',
      label: 'Send',
      detail: 'Buyer send blocked until approved.',
      state: 'blocked',
    },
  ];

  const openArtifact = (kind) => {
    setArtifactPanel(kind);
  };
  const copyReviewPacketId = async (artifact) => {
    if (!artifact?.artifactId) return;
    try {
      await navigator.clipboard?.writeText?.(artifact.artifactId);
      globalThis.toast('Review packet ID copied', { sub: artifact.artifactId, tone:'accent' });
    } catch (_) {
      globalThis.toast('Review packet ID', { sub: artifact.artifactId, tone:'accent' });
    }
  };

  const reviewInProposals = () => {
    // Prefer the most recently active handoff context to pick the matching
    // proposal — without this, the handoff always force-routed to the Acme
    // demo proposal (or fell back to PR-2041 / Banyan), which silently lied
    // when the operator had just generated a v3 from a different call or
    // addressed blockers on a different buyer's proposal.
    const proposals = globalThis.GTM.proposals || [];
    const matchByName = (needle) => {
      if (!needle) return null;
      const n = String(needle).toLowerCase().split(/\s+/).find(Boolean);
      if (!n) return null;
      return proposals.find(p => `${p.id} ${p.co}`.toLowerCase().includes(n)) || null;
    };
    const matchById = (id) => (id ? proposals.find(p => p.id === id) : null);
    const matchByPacket = (id) => (id ? proposals.find(p => p.executionId === id) : null);
    const localDraftId = `DRAFT-${artifactIdSlug(reviewSubject).replace(/_/g, '-').toUpperCase()}`;
    const createLocalReviewProposal = () => {
      const existingDraft = matchById(localDraftId) || matchByPacket(reviewPacketId);
      if (existingDraft) return existingDraft;
      const draft = {
        id: localDraftId,
        co: reviewSubject,
        amount: sampleProofActive ? '$24K' : '$0K',
        stage: 'review',
        sent: 'not sent',
        viewed: '0 times',
        sections: 7,
        accepted: 0,
        blockers: [],
        owner: activeHandoff.kind === 'call-proposal-draft' || activeHandoff.kind === 'new-run'
          ? 'agent-02'
          : 'operator',
        executionId: reviewPacketId,
        artifacts: [],
      };
      globalThis.GTM.proposals = [draft, ...proposals];
      return draft;
    };
    // Read from lastHandoffRef rather than the live banner state — the
    // banners auto-clear when reviewReady becomes true, but the buyer
    // identity captured by the most-recent handoff is what should drive
    // the routing.
    const handoff = lastHandoffRef.current || {};
    let reviewProposal = null;
    if (!handoff.kind && reviewReady) {
      reviewProposal = createLocalReviewProposal();
    }
    const reviewProposalCandidates = [
      matchById(handoff.proposalId),
      matchByName(handoff.co),
      matchByName(handoff.callCo),
      matchByName('acme'),
      matchByPacket(reviewPacketId),
    ];
    reviewProposal = reviewProposal || reviewProposalCandidates.find(Boolean);
    if (!reviewProposal) {
      reviewProposal = createLocalReviewProposal();
    }
    if (!reviewProposal) {
      reviewProposal = proposals.find(p => isOpenProposalStage(p.stage)) || proposals[0];
    }
    if (!reviewProposal) {
      globalThis.toast('No proposal available to review', { sub: 'demo proposals fixture is empty', tone: 'critical' });
      return;
    }
    globalThis.AppContext.set({
      selection: { type: 'proposal', id: reviewProposal.id },
      extra: {
        ...globalThis.AppContext.get().extra,
        generated_artifact_id: reviewPacketId,
        triggered_from: 'generate-artifact-review',
      },
    });
    setRoute('proposals');
  };

  // Canned pipeline trace replayed in DEMO_MODE so visitors see the
  // sequence actually run. Live mode lets the real backend stream.
  const DEMO_STREAM = [
    { delay: 100,  level: 'info', msg: 'intake.received: parsing brief…' },
    { delay: 300,  level: 'info', msg: `extract.client: ${reviewSubject}` },
    { delay: 280,  level: 'info', msg: `extract.signals: ${reviewSignal}` },
    { delay: 260,  level: 'info', msg: `enrichment.context: ${reviewContextSource}` },
    { delay: 320,  level: 'ok',   msg: 'enrichment.icp: 0.82 · ICP fit confirmed' },
    { delay: 360,  level: 'info', msg: 'pricing.model: 1q pilot · payback ≤ 6mo target · banded $1.5–2.5k/mo' },
    { delay: 280,  level: 'info', msg: 'compliance.scan: TX two-party recording disclosure flagged' },
    { delay: 320,  level: 'info', msg: 'scope.draft: phases 1–4 · SOW + AI risk report attached' },
    { delay: 280,  level: 'info', msg: 'pdf.render: branded template · Wranngle livery · 7 pages' },
    { delay: 180,  level: 'ok',   msg: `audit.signed: artifact_id=${reviewPacketId} · trace ok` },
    { delay: 220,  level: 'ok',   msg: 'pipeline.done: proposal ready for review →' },
  ];

  const stream = (msg, level = 'info') => {
    globalThis.dispatchEvent(new CustomEvent('gtm:stream', { detail: { msg, level } }));
  };

  const handleGenerate = async () => {
    if (!inputText.trim() && attachedFiles.length === 0) {
      setBriefError('Paste buyer context, attach buyer proof, or load demo proof before generating a review draft.');
      focusBuyerBrief();
      return globalThis.toast('Input required', { sub: 'Buyer proof is required before the draft engine runs.', tone: 'critical' });
    }
    const generationId = generationIdRef.current + 1;
    generationIdRef.current = generationId;
    setBriefError('');
    setIsGenerating(true);
    setReviewReady(false);
    setArtifactPanel(null);
    setArtifactPayload(null);
    setArtifactState('idle');
    globalThis.dispatchEvent(new CustomEvent('gtm:stream-reset'));
    stream('pipeline.start: review draft requested · validating buyer brief');
    const payload = JSON.stringify({
      input: inputText,
      attachments: attachedFiles.map(f => ({
        name: f.name,
        type: f.type,
        size: f.size,
        includedInBrief: f.includedInBrief,
        text: f.text,
      })),
    });
    stream(`request.posting: POST /api/generate · ${payload.length} bytes${globalThis.DEMO_MODE ? ' · DEMO_MODE' : ''}`);
    const generateRequest = () => fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    const replayDemoSequence = () => {
      let cumulative = 0;
      for (const evt of DEMO_STREAM) {
        cumulative += evt.delay;
        setTimeout(() => {
          if (generationIdRef.current !== generationId) return;
          globalThis.dispatchEvent(new CustomEvent('gtm:stream', { detail: { msg: evt.msg, level: evt.level } }));
        }, cumulative);
      }
      setTimeout(() => {
        if (generationIdRef.current !== generationId) return;
        stream(`pipeline.complete: artifact_id=${reviewPacketId} · 7 pages · ready for review`, 'ok');
        setIsGenerating(false);
        setReviewReady(true);
      }, cumulative + 200);
    };

    if (globalThis.DEMO_MODE) {
      try {
        generateRequest()
          .then(res => {
            stream(`request.response: HTTP ${res.status} ${res.statusText || ''}`.trim(), res.ok ? 'ok' : 'warn');
          })
          .catch(e => {
            const msg = (e && (e.message || String(e))) || 'unknown error';
            stream(`request.demo_fallback: ${msg} · replaying local proposal trace`, 'warn');
          });
      } catch (e) {
        const msg = (e && (e.message || String(e))) || 'unknown error';
        stream(`request.demo_fallback: ${msg} · replaying local proposal trace`, 'warn');
      }
      replayDemoSequence();
      return;
    }

    try {
      const res = await generateRequest();
      stream(`request.response: HTTP ${res.status} ${res.statusText || ''}`.trim(), res.ok ? 'ok' : 'warn');
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        const bodySummary = detail ? ` · ${detail.slice(0, 180)}` : '';
        throw new Error(`HTTP ${res.status} ${res.statusText || 'generation failed'}${bodySummary}`);
      }
      // In live mode the backend keeps the stream open; the console
      // still unlocks the review surface after a short grace period so the
      // operator is not trapped behind transport latency.
      stream('pipeline.live: backend stream open — events will appear above', 'info');
      setTimeout(() => {
        if (generationIdRef.current !== generationId) return;
        setIsGenerating(false);
        setReviewReady(true);
      }, 1500);
    } catch (e) {
      const msg = (e && (e.message || String(e))) || 'unknown error';
      stream(`pipeline.error: ${msg}`, 'err');
      globalThis.toast('Generation failed', { sub: msg, tone: 'critical' });
      setIsGenerating(false);
    }
  };

  const autoSample = async () => {
    try {
      const res = await fetch('/fixtures/sample.json');
      const data = await res.json();
      if (data?.text) {
        invalidateDraftForBriefChange();
        setInputText(data.text);
        setPublicSampleArtifact(true);
        setBriefError('');
      }
    } catch (e) {
      invalidateDraftForBriefChange();
      setInputText("CLIENT: Acme HVAC Services\n\nCONTEXT: Regional HVAC contractor (~30 employees, residential + light commercial). 22% of after-hours calls go to voicemail; 40% of those callers do not call back the next day.\n\nGOAL: Voice agent that answers after-hours, gathers caller details (name, address, urgency, problem class), and SMS-routes urgency-tagged dispatches to the on-call tech.\n\nSTACK: HouseCallPro for dispatch, Twilio for inbound SMS, Outlook 365 calendars. No current AI surface.\n\nBUDGET SIGNAL: Comparable peers spending $1.5–2.5k/mo on dispatch tooling. Owner has approved 1 quarter pilot if ROI math holds (target payback < 6 months).\n\nCOMPLIANCE: No PHI. Standard call-recording disclosure required (TX two-party).\n\nDEMO ASK: Generate proposal + SOW + AI risk report.");
      setPublicSampleArtifact(true);
      setBriefError('');
    }
  };
  const handleDraftAction = () => {
    if (!hasBrief && !isGenerating) {
      if (sampleArtifactPreviewOnly) {
        autoSample();
        return;
      }
      focusBuyerBrief();
      return;
    }
    handleGenerate();
  };

  const artifactReviewCard = (
    <Card
      title="artifact review"
      action={
        <button className="btn btn--primary btn--sm generate-review-cta" disabled={!reviewReady} onClick={reviewInProposals}>
          Review in Proposals
        </button>
      }
      accent={reviewReady ? 'accent' : undefined}
      className="generate-review-card"
    >
      <div className="artifact-review">
        <div className="artifact-review__state" data-testid="generate-review-state">
          <Badge tone={reviewReady ? 'healthy' : 'neutral'}>{reviewReady ? 'ready' : 'waiting'}</Badge>
          <span>{reviewReady ? readyReviewMessage : pendingReviewMessage}</span>
          {!reviewReady && (
            <button type="button" className="btn btn--ghost btn--xs artifact-review__jump" onClick={sampleArtifactPreviewOnly ? autoSample : focusBuyerBrief}>
              {hasBrief ? 'Edit buyer proof' : sampleArtifactPreviewOnly ? 'Load demo proof' : 'Add buyer proof'}
            </button>
          )}
        </div>
        <div className="artifact-review__path" aria-label="Proposal review path" data-testid="generate-review-path">
          {reviewPathSteps.map((step, idx) => (
            <div key={step.label} data-state={step.state} data-testid={`generate-review-path-step-${step.key}`}>
              <span className="artifact-review__path-index">{idx + 1}</span>
              <div className="artifact-review__path-copy">
                <strong>{step.label}</strong>
                <p>{step.detail}</p>
              </div>
              {step.action ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--xs artifact-review__path-action"
                  data-testid={`generate-review-path-action-${step.action.key}`}
                  aria-controls={step.action.key.includes('artifact') ? 'generate-artifact-drawer' : undefined}
                  aria-expanded={step.action.key.includes('artifact') ? artifactPanel === 'pdf' : undefined}
                  aria-pressed={step.action.key.includes('artifact') ? artifactPanel === 'pdf' : undefined}
                  onClick={() => {
                    if (step.action.key.includes('artifact')) {
                      openArtifact('pdf');
                    } else if (step.action.key === 'open-proposals-review') {
                      reviewInProposals();
                    }
                  }}
                >
                  {step.action.label}
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <div className="artifact-review__links">
          <button type="button" className="btn btn--ghost btn--sm" data-testid="generate-review-pdf-action" aria-controls="generate-artifact-drawer" aria-expanded={artifactPanel === 'pdf'} aria-pressed={artifactPanel === 'pdf'} onClick={() => openArtifact('pdf')}><I3.Doc size={12}/>{pdfArtifactActionLabel}</button>
          <button type="button" className="btn btn--ghost btn--sm" data-testid="generate-review-source-action" aria-controls="generate-artifact-drawer" aria-expanded={artifactPanel === 'json'} aria-pressed={artifactPanel === 'json'} onClick={() => openArtifact('json')}><I3.Bracket size={12}/>{sourceArtifactActionLabel}</button>
        </div>
        <div className="artifact-review__packet" data-testid="generate-review-packet">
          <div>
            <div className="artifact-review__packet-title">
              <span className="eyebrow eyebrow--accent">review packet</span>
              <strong>Proposal packet stays bound to evidence and approval gate.</strong>
            </div>
            <p>{packetReviewCopy}</p>
          </div>
        </div>
        <div className="artifact-review__quality">
          {[
            { label:'Pricing math', state: reviewReady ? 'checked' : 'pending' },
            { label:'Risk report', state: reviewReady ? 'checked' : 'pending' },
            { label:'PDF polish', state: 'needs review' },
          ].map(q => (
            <div key={q.label}>
              <span>{q.label}</span>
              <Badge tone={q.state === 'checked' ? 'healthy' : q.state === 'needs review' ? 'warn' : 'neutral'}>{q.state}</Badge>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );

  return (
    <div className="page page--generate">
      <PageHeader
        eyebrow="proposal sequence"
        title="Generate Proposal"
        sub="Paste buyer context, generate a review draft, and keep the operator gate in the console. Nothing sends until the draft is reviewed."
        actions={<>
          <button className="btn btn--ghost btn--sm" onClick={autoSample}><I3.Doc size={12}/>Load demo proof</button>
          <button
            className="btn btn--primary btn--sm"
            onClick={handleDraftAction}
            disabled={isGenerating}
            aria-controls={!hasBrief ? 'generate-buyer-proof' : undefined}
            aria-describedby={hasBrief ? undefined : 'generate-brief-required-note'}
            title={hasBrief ? undefined : 'Buyer proof is required before the draft engine runs.'}
          >
            {draftButtonLabel}
          </button>
        </>}
      />

      <section className="generate-command-strip" aria-label="Generate run command strip" data-testid="generate-command-strip">
        {commandStripItems.map(item => (
          <div
            key={item.label}
            className="generate-command-strip__item"
            data-state={item.state}
            data-testid={`generate-command-item-${item.label.replace(/\s+/g, '-')}`}
          >
            <div className="generate-command-strip__label">
              <span>{item.label}</span>
              <Badge tone={item.tone}>{item.state}</Badge>
            </div>
            <strong>{item.value}</strong>
            <p>{item.meta}</p>
          </div>
        ))}
      </section>

      <section className="generate-sequence" aria-label="Proposal generation sequence" data-testid="generate-sequence">
        {sequenceSteps.map(step => (
          <div key={step.n} className="generate-step" data-state={step.state} data-testid={`generate-step-${step.n}`}>
            <span className="generate-step__number">{step.n}</span>
            <div className="generate-step__copy">
              <strong>{step.title}</strong>
              <p>{step.sub}</p>
            </div>
            <Badge tone={step.tone}>{step.state}</Badge>
          </div>
        ))}
      </section>

      <div className="generate-grid">
        {artifactReviewCard}

        <Card title="buyer proof composer" className="card--accent generate-brief-card">
          {newRunBanner && (
            <div className="generate-handoff-banner" data-testid="generate-new-run-banner" role="status">
              <div className="generate-handoff-banner__title">
                New proposal run seeded from {newRunBanner.callId || 'latest qualified call'}
                {newRunBanner.callCo ? ` · ${newRunBanner.callCo}` : ''}
              </div>
              <div className="muted" data-testid="generate-new-run-summary">
                {newRunBanner.callWho || 'stakeholder'} · {newRunBanner.callOutcome || 'outcome unknown'}
                {typeof newRunBanner.callScore === 'number' ? ` · ${newRunBanner.callScore.toFixed(1)} / 10` : ''}
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--xs"
                data-testid="generate-new-run-dismiss"
                onClick={() => setNewRunBanner(null)}
              >Dismiss banner</button>
            </div>
          )}
          {addressBlockersBanner && (
            <div className="generate-handoff-banner" data-testid="generate-address-blockers-banner" role="status">
              <div className="generate-handoff-banner__title">
                Addressing blockers from {addressBlockersBanner.proposalId || 'active proposal'}
                {addressBlockersBanner.co ? ` · ${addressBlockersBanner.co}` : ''}
              </div>
              {addressBlockersBanner.blockers.length > 0 ? (
                <ul className="generate-handoff-banner__list" data-testid="generate-address-blockers-list">
                  {addressBlockersBanner.blockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              ) : (
                <div className="muted">No blockers were carried over — the brief was pre-populated anyway.</div>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--xs"
                data-testid="generate-address-blockers-dismiss"
                onClick={() => setAddressBlockersBanner(null)}
              >Dismiss banner</button>
            </div>
          )}
          {proposalDraftBanner && (
            <div className="generate-handoff-banner" data-testid="generate-proposal-draft-banner" role="status">
              <div className="generate-handoff-banner__title">
                Drafting next proposal from {proposalDraftBanner.callId || 'active call'}
                {proposalDraftBanner.callCo ? ` · ${proposalDraftBanner.callCo}` : ''}
              </div>
              <div className="muted" data-testid="generate-proposal-draft-summary">
                {proposalDraftBanner.callWho || 'stakeholder'} · {proposalDraftBanner.callOutcome || 'outcome unknown'}
                {typeof proposalDraftBanner.callScore === 'number' ? ` · ${proposalDraftBanner.callScore.toFixed(1)} / 10` : ''}
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--xs"
                data-testid="generate-proposal-draft-dismiss"
                onClick={() => setProposalDraftBanner(null)}
              >Dismiss banner</button>
            </div>
          )}
          <div className="generate-proof-meter" data-testid="generate-proof-meter">
            <div>
              <span className="eyebrow eyebrow--accent">proof source</span>
              <strong>{proofSourceLabel}</strong>
            </div>
            <div>
              <span className="eyebrow">payload</span>
              <strong>{Math.max(0, inputText.trim().length).toLocaleString()} chars · {attachedFiles.length} file{attachedFiles.length === 1 ? '' : 's'}</strong>
            </div>
            <div>
              <span className="eyebrow">draft state</span>
              <strong>{draftStateLabel}</strong>
            </div>
          </div>
          <label className="sr-only" htmlFor="generate-buyer-proof">Buyer proof</label>
          <textarea
            id="generate-buyer-proof"
            ref={briefRef}
            value={inputText}
            onChange={e => {
              setInputText(e.target.value);
              invalidateDraftForBriefChange();
              if (briefError && e.target.value.trim()) setBriefError('');
            }}
            placeholder="Paste buyer context: pain, stack, budget signal, compliance constraints, and the ask."
            className="generate-brief"
            aria-invalid={briefError ? 'true' : 'false'}
            aria-describedby={briefError ? 'generate-brief-error' : undefined}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            aria-label="Attach buyer proof files"
            data-testid="generate-file-input"
            onChange={handleFileAttach}
          />
          <div className="generate-attachments" data-testid="generate-attachments">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              data-testid="generate-file-attach"
              aria-describedby={attachmentPickerNote ? 'generate-attachment-status' : undefined}
              onClick={requestFileAttach}
            ><I3.Doc size={12}/>Attach file</button>
            {attachedFiles.map(file => (
              <span key={file.id} className="generate-attachment-chip" data-testid="generate-attachment-chip">
                <span className="mono">{file.name}</span>
                <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeAttachedFile(file.id)}><I3.Close size={10}/></button>
              </span>
            ))}
            {attachmentPickerNote && (
              <span
                id="generate-attachment-status"
                className="generate-attachment-status"
                data-testid="generate-attachment-status"
                role="status"
                aria-live="polite"
              >
                {attachmentPickerNote}
              </span>
            )}
          </div>
          {briefError && <div id="generate-brief-error" className="generate-brief-error" role="alert">{briefError}</div>}
          <div className="generate-actions">
            <button className="btn btn--ghost btn--sm" onClick={autoSample}>Use demo proof</button>
            <button
              className="btn btn--primary btn--sm"
              onClick={handleDraftAction}
              disabled={isGenerating}
              aria-controls={!hasBrief ? 'generate-buyer-proof' : undefined}
              aria-describedby={hasBrief ? undefined : 'generate-brief-required-note'}
              title={hasBrief ? undefined : 'Buyer proof is required before the draft engine runs.'}
            >
              {lowerDraftButtonLabel}
            </button>
          </div>
          {!hasBrief && <div id="generate-brief-required-note" className="generate-brief-note">Buyer proof is required before the draft engine runs.</div>}
        </Card>

        <Card title="sequence trace" className="generate-trace-card">
          <window.ConsolePanel title="live · pipeline.stream" lines={null} useLiveStream={true} />
        </Card>
      </div>

      {activeArtifact && (
        <div id="generate-artifact-drawer" ref={artifactPanelRef} className="workflow-popout workflow-popout--single generate-artifact-panel" role="region" aria-label="Proposal artifact review drawer">
          <div className="workflow-popout__pane">
            <div style={{display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start'}}>
              <div>
                <div className="eyebrow eyebrow--accent">{activeArtifact.kind} artifact</div>
                <div className="workflow-popout__title">{activeArtifact.title}</div>
              </div>
              <button className="btn btn--ghost btn--icon" aria-label="Close proposal artifact review drawer" onClick={() => setArtifactPanel(null)}><I3.Close size={14}/></button>
            </div>
            <div className="artifact-drawer">
              <div className="artifact-drawer__meta">
                <Badge tone={reviewReady ? 'healthy' : 'neutral'}>{activeArtifact.status}</Badge>
                <span>{activeArtifact.summary}</span>
                <div className="artifact-drawer__facts" aria-label="Review packet metadata">
                  <div>
                    <span className="eyebrow">review packet id</span>
                    <code className="mono" data-testid="generate-artifact-id">{activeArtifact.artifactId}</code>
                  </div>
                  <div>
                    <span className="eyebrow">source</span>
                    <code className="mono">{activeArtifact.sourceLabel}</code>
                  </div>
                  <div>
                    <span className="eyebrow">gate</span>
                    <code className="mono">{activeArtifact.gate}</code>
                  </div>
                  <div>
                    <span className="eyebrow">artifact mode</span>
                    <code className="mono" data-testid="generate-artifact-mode">{activeArtifact.mode}</code>
                  </div>
                </div>
                <div className="artifact-drawer__source">
                  <span className="eyebrow">review locator</span>
                  <code className="artifact-drawer__path">{activeArtifact.displayPath || activeArtifact.path}</code>
                </div>
                <div className="artifact-drawer__pathway" data-testid="generate-artifact-review-path">
                  {reviewPathSteps.map((step, idx) => (
                    <div key={step.label} data-state={step.state}>
                      <span className="artifact-review__path-index">{idx + 1}</span>
                      <strong>{step.label}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="artifact-drawer__review">
                {activeArtifact.kind === 'PDF' ? (
                  <div className="artifact-drawer__pdf-frame" data-preview-available={activeArtifact.previewAvailable ? 'true' : 'false'} data-testid="generate-pdf-review-frame">
                    <div className="artifact-drawer__pdf-map">
                      <span className="eyebrow">PDF review map</span>
                      <strong>{reviewReady ? 'Draft packet checkpoint' : activeArtifact.previewAvailable ? 'Preview packet checkpoint' : 'Pending packet checkpoint'}</strong>
                      <p>{activeArtifact.previewAvailable
                        ? sampleArtifactPreviewOnly
                          ? 'Inspect this demo PDF preview here. Load demo proof or run the sequence before treating it as source-bound buyer evidence.'
                          : 'Read the PDF here with source evidence, quality checks, and the approval gate still attached to the review packet.'
                        : artifactIsUnbound
                          ? 'No PDF has been rendered yet. Add buyer proof first so the draft engine can bind evidence, pricing, risk, and the approval gate.'
                          : 'No PDF has been rendered yet. Run the sequence so the draft engine can bind evidence, pricing, risk, and the approval gate.'}</p>
                      <div className="artifact-drawer__pdf-checks">
                        {pdfReviewChecks.map(check => (
                          <div key={check.label}>
                            <span>{check.label}</span>
                            <Badge tone={check.state === 'check' || check.state === 'bound' ? 'healthy' : check.state === 'preview' ? 'accent' : check.state === 'review' ? 'warn' : 'neutral'}>{check.state}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                    {activeArtifact.previewAvailable ? (
                      <iframe title={activeArtifact.previewTitle || 'Proposal PDF review preview'} src={activeArtifact.path}></iframe>
                    ) : (
                      <div className="artifact-drawer__pdf-empty" data-testid="generate-pdf-review-placeholder">
                        <div>
                          <span className="eyebrow eyebrow--accent">PDF preview pending</span>
                          <strong>{artifactIsUnbound ? 'Buyer proof is required before this packet exists.' : 'Run the sequence before this packet exists.'}</strong>
                          <p>{artifactIsUnbound
                            ? 'The review packet id is reserved, but there is no source evidence or rendered PDF to inspect yet.'
                            : 'Buyer proof is loaded, but the draft engine has not created a source-bound PDF artifact yet.'}</p>
                        </div>
                        <div className="artifact-drawer__pending-steps" aria-label="Pending proposal packet requirements">
                          <span>buyer proof</span>
                          <span>draft engine</span>
                          <span>operator review</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : artifactState === 'loading' ? (
                  <div className="lead-artifact-empty">Loading source evidence...</div>
                ) : (
                  <pre className="mono" data-testid="generate-artifact-source-json" data-state={artifactState}>{JSON.stringify(artifactSourcePreview, null, 2)}</pre>
                )}
              </div>
              <div className="artifact-drawer__actions">
                <button className="btn btn--ghost btn--sm" onClick={() => copyReviewPacketId(activeArtifact)}><I3.Doc size={12}/>Copy review packet ID</button>
                {reviewReady ? (
                  <button className="btn btn--primary btn--sm" data-testid="generate-artifact-drawer-primary-action" onClick={reviewInProposals}>Continue review</button>
                ) : hasBrief ? (
                  <button className="btn btn--primary btn--sm" data-testid="generate-artifact-drawer-primary-action" disabled={isGenerating} onClick={handleGenerate}>
                    {isGenerating ? 'Sequence running...' : 'Run sequence'}
                  </button>
                ) : sampleArtifactPreviewOnly ? (
                  <button className="btn btn--primary btn--sm" data-testid="generate-artifact-drawer-primary-action" onClick={autoSample}>Load demo proof</button>
                ) : (
                  <button className="btn btn--primary btn--sm" data-testid="generate-artifact-drawer-primary-action" onClick={focusBuyerBrief}>Add buyer proof</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(globalThis, { EvalsPage, ProposalsPage, SettingsPage, GeneratePage });
