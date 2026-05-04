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
      avatar_color_1: '#F97316',
      avatar_color_2: '#8B5CF6',
      capabilities: ['Roleplay prospects', 'Live deal feedback', 'Objection drills', 'Recap drafting'],
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
      avatar_color_1: '#8B5CF6',
      avatar_color_2: '#F97316',
      capabilities: ['Lead qualification', 'Demo booking', 'After-hours coverage', 'SMS hand-off'],
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
