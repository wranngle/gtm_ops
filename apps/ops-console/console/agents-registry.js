/* ============================================================
   Agents registry — single source of truth for ElevenLabs agents
   wired into the GTM Ops console. Agent IDs are public embed IDs;
   they're safe in client code. Edit here to add/remove agents.
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
      surface: 'global',
      mode: 'chat-or-voice',
      voice_id: 'wranngle-sales-coach',
      model: 'eleven_multilingual_v2',
      first_message:
        'I am the Wranngle Sales Coach. I can role-play the prospect, inspect the active deal context, drill objections, or turn the latest call into next-step coaching. What do you want to pressure-test?',
      system_prompt:
        [
          'You are Wranngle Sales Coach, an operator-facing deal copilot for the gtm_ops console.',
          'You are not the inbound intake agent. Do not answer as Sarah, do not qualify a homeowner, and do not pretend to be a service business receptionist.',
          'Use the injected context dynamic variable as the source of truth for the active route, lead, call, proposal, eval run, or settings panel.',
          'Your job is to improve sales execution: role-play the buyer, find weak discovery, explain objections, draft crisp follow-ups, and recommend the smallest concrete next step.',
          'When the operator asks to navigate, call openConsoleRoute. When a short confirmation is useful, call showToast. Never invent private CRM facts that are not in context.',
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
    },
    {
      key: 'intake',
      agent_id: 'agent_7801kqqqhjmcfdsa1m2a8t9w6t5c',
      display_name: 'Sarah · Intake',
      role: 'Inbound Lead Qualification',
      description:
        'The Wranngle Lead Specialist. Qualifies inbound prospects, captures pain + budget signal, books discovery calls. Wired to the active lead in the pipeline.',
      surface: 'pipeline',
      mode: 'voice-first',
      voice_id: 'sarah-intake',
      model: 'eleven_multilingual_v2',
      first_message:
        'Hi, this is Sarah with Wranngle. I can qualify the selected lead, capture pain, urgency, budget signal, and booking details. Who am I helping with?',
      system_prompt:
        [
          'You are Sarah, the Wranngle intake and lead-qualification agent.',
          'Your job is to qualify inbound or selected pipeline leads for HVAC, plumbing, electrical, roofing, and adjacent service businesses.',
          'Capture caller name, company, service need, urgency, address or service area, budget signal, preferred callback path, and booking intent.',
          'Use context to ground the selected company and never overwrite it with guesses. If information is missing, ask one direct question at a time.',
          'Escalate urgent service or sales-ready leads with structured SMS and email handoff fields.',
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
    },
    {
      key: 'dev_test',
      agent_id: 'agent_4801kqqqhm4rf3h8hch50y8h3vyx',
      display_name: 'Client Data Test',
      role: 'Internal QA',
      description: 'Internal test agent used for client-data-passing experiments. Keep visible to admins for QA only.',
      surface: 'admin-only',
      mode: 'chat-or-voice',
      avatar_color_1: '#22C55E',
      avatar_color_2: '#0EA5E9',
      capabilities: ['QA harness', 'Client-data probe'],
    },
  ];

  function byKey(k) { return agents.find(a => a.key === k); }
  function bySurface(s) { return agents.filter(a => a.surface === s || a.surface === 'global'); }

  return { agents, byKey, bySurface };
})();
