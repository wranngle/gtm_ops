/* ============================================================
   Vertical presets — plumber | hvac | electrician
   In-bundle deterministic copy of the on-disk YAML under
   /presets. The static-HTML console can't read YAML at runtime
   (Babel-standalone, no bundler, no fs); the source of truth
   stays in /presets/<id>.yaml and the contract test in
   tests/unit/vertical-switcher.test.ts asserts the two stay in
   sync (id, voice_id, proposal_template, default_tier).

   Round-1 PR #171 (post-call sentiment rollup) introduced the
   row-chip pattern (badge--healthy/critical/neutral); the
   switcher reuses it for the active-vertical chip.
   ============================================================ */

const VERTICAL_PRESETS = [
  {
    id: 'plumber',
    label: 'Plumber',
    voice_id: 'voice-plumber-sarah',
    proposal_template: 'presales_report__plumber.html',
    default_tier: 'silver',
    system_prompt: [
      'You are Sarah, the after-hours dispatcher for a residential and light-commercial plumbing shop.',
      'Priorities: safety first (shut off main valve / gas if active leak), capture address + fixture + severity + shutoff state,',
      'quote tiered rates by customer tier, book the on-call tech with a 30-minute callback,',
      'trigger the proposal pipeline once intake is complete.',
      'Never quote a fixed total without a diagnostic. Reference presales_report__plumber.html.',
    ].join(' '),
    intake_fields: ['address', 'fixture', 'severity', 'water_shutoff', 'access'],
  },
  {
    id: 'hvac',
    label: 'HVAC',
    voice_id: 'voice-hvac-sarah',
    proposal_template: 'presales_report__hvac.html',
    default_tier: 'gold',
    system_prompt: [
      'You are Sarah, the after-hours dispatcher for a residential HVAC shop.',
      'Priorities: health/safety (CO alarm, gas smell, vulnerable occupants escalate), capture address + equipment + symptom + tier,',
      'quote tiered rates with after-hours surcharge disclosure, book the on-call tech with a 30-minute callback,',
      'trigger the proposal pipeline once intake is complete.',
      'Never promise a same-night fix for an unconfirmed part. Reference presales_report__hvac.html.',
    ].join(' '),
    intake_fields: ['address', 'equipment_type', 'symptom', 'error_code', 'tier'],
  },
  {
    id: 'electrician',
    label: 'Electrician',
    voice_id: 'voice-electrician-sarah',
    proposal_template: 'presales_report__electrician.html',
    default_tier: 'silver',
    system_prompt: [
      'You are Sarah, the after-hours dispatcher for a residential and light-commercial electrical contractor.',
      'Priorities: safety first (smoke/sparks/burning smell → shut main breaker + evacuate + emergency dispatch),',
      'capture address + panel age + symptom + circuits + tier, quote tiered rates with permits/inspections separate from labor,',
      'book the on-call tech with a 30-minute callback, trigger the proposal pipeline once intake is complete.',
      'Never advise opening a panel. Reference presales_report__electrician.html.',
    ].join(' '),
    intake_fields: ['address', 'panel_age', 'symptom', 'circuits_affected', 'tier'],
  },
];

const VERTICAL_IDS = VERTICAL_PRESETS.map(p => p.id);
const DEFAULT_VERTICAL_ID = 'hvac';
const VERTICAL_STORAGE_KEY = 'gtm.ops.vertical';

function getVerticalPreset(id) {
  return VERTICAL_PRESETS.find(p => p.id === id) || VERTICAL_PRESETS.find(p => p.id === DEFAULT_VERTICAL_ID);
}

function readPersistedVerticalId() {
  try {
    const v = window.localStorage?.getItem(VERTICAL_STORAGE_KEY);
    return VERTICAL_IDS.includes(v) ? v : DEFAULT_VERTICAL_ID;
  } catch (_) {
    return DEFAULT_VERTICAL_ID;
  }
}

function persistVerticalId(id) {
  if (!VERTICAL_IDS.includes(id)) return;
  try { window.localStorage?.setItem(VERTICAL_STORAGE_KEY, id); } catch (_) { /* private mode */ }
}

window.VERTICAL_PRESETS = VERTICAL_PRESETS;
window.VERTICAL_IDS = VERTICAL_IDS;
window.DEFAULT_VERTICAL_ID = DEFAULT_VERTICAL_ID;
window.VERTICAL_STORAGE_KEY = VERTICAL_STORAGE_KEY;
window.getVerticalPreset = getVerticalPreset;
window.readPersistedVerticalId = readPersistedVerticalId;
window.persistVerticalId = persistVerticalId;
