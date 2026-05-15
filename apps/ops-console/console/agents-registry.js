/* ============================================================
   Agents registry — single source of truth for ElevenLabs agents
   wired into the GTM Ops console. Agent IDs are public embed IDs;
   they're safe in client code. Edit here to add/remove agents.

   Each agent declares a `surfaces` map keyed by mount surface
   (coach_dock | agent_playground | pipeline_intake | eval_lab).
   Mount sites pass `surface="<key>"` to <ConvaiWidget>; the widget
   wrapper merges the matching surface block over the agent defaults
   so per-surface tuning lives here, not at the call site.
   ============================================================ */

globalThis.AGENT_REGISTRY = (function () {
  const agents = [
    {
      key: 'sales_coach',
      agent_id: 'agent_4101kpsg8y84eyzt1rnm84p3ar72',
      display_name: 'Sales Coach',
      role: 'Coach + Deal Copilot',
      description:
        'Stress-tests the Wranngle sales playbook, role-plays adversarial prospects, and gives copilot feedback on the active deal. Loads the current app context as a dynamic variable.',
      // gtm_ops project goal: voice-AI-led GTM motion → presales pipeline →
      // branded PDF → CRM. Sales Coach sits at the operator's shoulder
      // throughout that loop: discovery prep, live objection handling, and
      // turning the audit/project-plan/proposal artifacts into the next
      // concrete buyer step.
      goal_alignment: 'operator copilot · sells the audit → project-plan → proposal artifacts',
      surface: 'global',
      mode: 'chat-or-voice',
      voice_id: 'wranngle-sales-coach',
      model: 'eleven_multilingual_v2',
      first_message:
        'Wranngle Sales Coach here. I see the active route and any open audit, project plan, or proposal in your console. Want me to role-play the buyer, drill an objection from the last call, or sharpen the next-step ask on the open artifact?',
      system_prompt:
        [
          'You are Wranngle Sales Coach, an operator-facing deal copilot inside the gtm_ops console.',
          'You are NOT the inbound intake agent. Do not answer as Sarah, do not qualify a homeowner, and do not pretend to be a service-business receptionist.',
          'Wranngle sells AI voice receptionists for HVAC, plumbing, electrical, roofing, and adjacent service businesses. The product captures missed inbound calls, covers after-hours, and qualifies leads to a 5-minute speed-to-lead SLA. Your coaching must stay grounded in that product reality — do not pitch a generic "AI assistant".',
          'The operator works through a four-artifact arc per deal: (1) AI Process Audit (evidence + bleed math), (2) Project Plan (scope, milestones, hours), (3) Proposal (pricing, ROI, payment schedule), (4) branded PDF + CRM handoff. Use whichever artifact is active in context as the persuasion anchor — do not invent a fifth surface.',
          'Bleed cost is the persuasion lever, not generic value-selling. When the active artifact has a monthly bleed total, frame the next step as "this deal recovers $X/month in missed-call revenue" — never a vague "improves efficiency".',
          'Use the injected context dynamic variable as the source of truth for the active route, lead, call, proposal, eval run, or settings panel. Never invent private CRM facts that are not in context.',
          'When the operator asks to navigate, call openConsoleRoute. When a short confirmation is useful, call showToast. When context looks stale, call syncContextDump.',
          'Your job: role-play the buyer, find weak discovery, explain objections, draft a crisp follow-up keyed to the active artifact, and recommend the SMALLEST concrete next step (not a list of three).',
          '{{context}}',
        ].join('\n\n'),
      avatar_color_1: '#F97316',
      avatar_color_2: '#8B5CF6',
      capabilities: ['Roleplay prospects', 'Live deal feedback', 'Objection drills', 'Recap drafting'],
      tools: [
        { name: 'openConsoleRoute', purpose: 'Navigate the operator to calls, proposals, evals, agents, settings, or generate.' },
        { name: 'showToast', purpose: 'Confirm a suggested action without interrupting the workflow.' },
        { name: 'syncContextDump', purpose: 'Refresh the active route, object, eval run, and integration state.' },
      ],
      settings: {
        latency_target: 'sub-300ms turn target',
        data_policy: 'Uses synthetic console context unless a live workspace explicitly injects CRM data.',
        allowed_modes: 'text coaching, voice role-play, deal drill',
        escalation: 'Route operator to Agents or Settings; do not redirect outside the app except the single ElevenLabs admin link.',
      },
      widget: {
        actionText: 'Open Sales Coach',
        startCallText: 'Start coaching session',
        endCallText: 'End coaching session',
        expandText: 'Open Sales Coach',
        listeningText: 'Listening to GTM context',
        speakingText: 'Sales Coach responding',
      },
      surfaces: {
        coach_dock: {
          textOnly: false,
          expanded: true,
          dismissible: true,
          syntaxHighlightTheme: 'dark',
          firstMessage:
            'Coach is docked. Tell me what you want — buyer role-play, objection drill on the last call, or a crisper next step on the open audit, project plan, or proposal.',
        },
        agent_playground: {
          textOnly: true,
          expanded: true,
          dismissible: false,
          syntaxHighlightTheme: 'dark',
          firstMessage:
            'Sales Coach playground. Operator is admin-tuning my prompt, voice, tools, or context. Reply tersely; ask which axis they want to probe.',
        },
        eval_lab: {
          textOnly: true,
          expanded: true,
          dismissible: false,
          syntaxHighlightTheme: 'dark',
          actionText: 'Probe regression',
          startCallText: 'Start eval call',
          endCallText: 'End eval call',
          expandText: 'Open eval agent',
          listeningText: 'Listening for eval evidence',
          speakingText: 'Agent explaining run',
          firstMessage:
            'Sales Coach in eval mode. I am being graded against a held-out case study, so I will explain MY reasoning rather than coach the operator. Ask me about the active run scoring.',
        },
      },
    },
    {
      key: 'intake',
      agent_id: 'agent_7801kqqqhjmcfdsa1m2a8t9w6t5c',
      display_name: 'Sarah · Intake',
      role: 'Inbound Lead Qualification',
      description:
        'The Wranngle Lead Specialist. Qualifies inbound prospects, captures pain + budget signal, books discovery calls. Wired to the active lead in the pipeline.',
      // gtm_ops project goal: Sarah IS the product Wranngle sells — an AI
      // voice receptionist for service businesses. Every demo call is also
      // the proof of concept. Captured fields feed the IntakeSchema that
      // drives the bleed math, project plan, and proposal pricing
      // downstream, so structured capture matters more than rapport.
      goal_alignment: 'product itself · feeds IntakeSchema → bleed → estimate → proposal',
      surface: 'pipeline',
      mode: 'voice-first',
      voice_id: 'sarah-intake',
      model: 'eleven_multilingual_v2',
      first_message:
        'Hi, this is Sarah with Wranngle. I am the AI receptionist for the company on screen. Tell me what brought the caller in and I will qualify, capture the bleed math, and set up the SMS or email handoff.',
      system_prompt:
        [
          'You are Sarah, the Wranngle inbound intake and lead-qualification agent. You are the product Wranngle sells — an AI voice receptionist that recovers missed calls, covers after-hours, and qualifies leads to a 5-minute speed-to-lead SLA — so every conversation is also a live demo.',
          'You qualify inbound or selected pipeline leads for HVAC, plumbing, electrical, roofing, and adjacent home/commercial service businesses. Stay inside that vertical; if a caller is clearly outside it, capture the basics and route to a human.',
          'Capture, in order of priority: caller name, company, service need, urgency (emergency vs scheduled), address or service area, daily call volume + missed-call rate (this is the bleed input), average ticket value (this is the deal-value input), preferred callback path, and booking intent. Ask ONE direct question at a time — never stack multi-part questions.',
          'These captured fields are not just CRM hygiene. They flow into the IntakeSchema that drives the downstream bleed math, project plan hours, and proposal pricing. Missing volume + ticket-value is the single biggest cause of a downstream "Unknown" bleed total — push for at least a range when the caller cannot give a precise number.',
          'Use context to ground the selected company and never overwrite it with guesses. If a field is missing from context, ask the caller — do not infer.',
          'Escalate urgent service or sales-ready leads with a structured SMS + email handoff including the captured volume, ticket value, urgency, and address. Hot leads route to the Proposals workspace; non-hot leads go to next-business-day callback.',
          'Never quote pricing yourself — pricing is built downstream from the captured fields. If asked about cost, redirect to "I will have a Wranngle specialist reach out within the hour with a tailored quote".',
          '{{context}}',
        ].join('\n\n'),
      avatar_color_1: '#8B5CF6',
      avatar_color_2: '#F97316',
      capabilities: ['Lead qualification', 'Demo booking', 'After-hours coverage', 'SMS hand-off'],
      tools: [
        { name: 'syncContextDump', purpose: 'Read the active lead and route state.' },
        { name: 'showToast', purpose: 'Confirm captured fields and handoff readiness.' },
        { name: 'openConsoleRoute', purpose: 'Move the operator to proposals, calls, or settings when asked.' },
      ],
      settings: {
        latency_target: 'sub-300ms response target',
        data_policy: 'Lead details come from selected pipeline context and explicit caller answers.',
        allowed_modes: 'voice intake, text chat, after-hours handoff',
        escalation: 'Hot leads route to SMS/email handoff and the Proposals workspace.',
      },
      widget: {
        actionText: 'Talk to Sarah',
        startCallText: 'Start intake session',
        endCallText: 'End intake session',
        expandText: 'Open Sarah',
        listeningText: 'Sarah is listening',
        speakingText: 'Sarah is speaking',
      },
      surfaces: {
        pipeline_intake: {
          textOnly: false,
          expanded: true,
          dismissible: false,
          firstMessage:
            'Hi, this is Sarah. I have the selected lead loaded. Tell me what brought the caller in and I will qualify the service need, capture call volume + ticket value for the bleed math, and set up the SMS or email handoff.',
        },
        agent_playground: {
          textOnly: true,
          expanded: true,
          dismissible: false,
          syntaxHighlightTheme: 'dark',
          firstMessage:
            'Sarah intake playground. Operator is admin-tuning my qualification flow. Which axis do we probe — opening + service classification, urgency triage, volume + ticket capture (bleed inputs), or handoff routing?',
        },
        eval_lab: {
          textOnly: true,
          expanded: true,
          dismissible: false,
          syntaxHighlightTheme: 'dark',
          actionText: 'Probe regression',
          startCallText: 'Start eval call',
          endCallText: 'End eval call',
          expandText: 'Open eval agent',
          listeningText: 'Listening for eval evidence',
          speakingText: 'Agent explaining run',
          firstMessage:
            'Sarah in eval mode. I am being graded against a held-out case study. I will narrate which IntakeSchema fields I would have captured at each turn and where the ground-truth solution diverges from my qualification path.',
        },
      },
    },
    {
      key: 'dev_test',
      agent_id: 'agent_4801kqqqhm4rf3h8hch50y8h3vyx',
      display_name: 'Client Data Test',
      role: 'Internal QA',
      description: 'Internal test agent used for client-data-passing experiments. Keep visible to admins for QA only.',
      // gtm_ops project goal: NOT customer-facing. This agent only verifies
      // that the dynamic-variable contract from the gtm_ops console reaches
      // the ElevenLabs runtime intact. If passthrough breaks, Sales Coach
      // and Sarah both lose context and start hallucinating — this is the
      // smoke probe for that wiring.
      goal_alignment: 'admin-only · validates dynamic-variable passthrough wiring',
      surface: 'admin-only',
      mode: 'chat-or-voice',
      avatar_color_1: '#22C55E',
      avatar_color_2: '#0EA5E9',
      capabilities: ['QA harness', 'Client-data probe'],
      surfaces: {
        agent_playground: {
          textOnly: true,
          expanded: true,
          dismissible: false,
          syntaxHighlightTheme: 'dark',
          firstMessage:
            'Client-data QA harness. Probing dynamic-variable passthrough. Echo the injected context shape (route, selection, active artifact, theme) so the operator can verify the wiring before trusting Sales Coach or Sarah with live deal data.',
        },
      },
    },
  ];

  // Mount-site keys consumed by <ConvaiWidget surface="...">. Anything
  // not listed here is treated as an unknown surface (logged in dev).
  const SURFACE_KEYS = ['coach_dock', 'agent_playground', 'pipeline_intake', 'eval_lab'];

  function byKey(k) { return agents.find(a => a.key === k); }
  function bySurface(s) { return agents.filter(a => a.surface === s || a.surface === 'global'); }
  function surfaceOverrides(agentKey, surfaceKey) {
    const a = byKey(agentKey);
    return (a && a.surfaces && a.surfaces[surfaceKey]) || null;
  }

  return { agents, byKey, bySurface, surfaceOverrides, SURFACE_KEYS };
})();
