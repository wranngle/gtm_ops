/* ============================================================
   AI follow-up email composer — prompt builder + mock LLM client.

   Consumes a call trace shaped like `gtm-ops.call-trace.v1`
   (shipped by round-1 PR #173 — the exportable call-trace JSON
   button) and produces a deterministic post-call follow-up email
   {subject, body} for preview in the ops-console.

   The LLM client is mocked. A real client would replace
   `mockLlmCompose` with a fetch to /api/llm or the agents SDK;
   the prompt shape (`buildEmailPrompt`) is the same regardless.

   In-bundle pattern: loaded via <script type="text/babel"> in
   index.html alongside the other console TSX files, and exposes
   its functions on `window` for sibling files (email-composer.tsx)
   to read. Same convention as verticals.ts.
   ============================================================ */

const FOLLOWUP_SYSTEM_PROMPT = [
  'You are a sales-engineer for a residential service shop drafting a post-call follow-up email.',
  'The email goes to the customer who just spoke with the on-call dispatcher.',
  'Tone: warm, professional, concise (no marketing fluff).',
  'Always address the customer by first name.',
  'Cite the specific issue they described and the next concrete step the shop committed to.',
  'End with a clear signature from the dispatcher who took the call.',
  'Output strictly JSON: {"subject": "...", "body": "..."} — no fences, no preamble.',
].join(' ');

function extractCustomerFirstName(trace) {
  const full = String(trace?.participant || '').trim();
  if (!full) return 'there';
  return full.split(/\s+/)[0];
}

function extractIssueSummary(trace) {
  const callerLines = (trace?.transcript || []).filter(t => t.role === 'caller');
  const first = callerLines[0]?.text || '';
  // Trim to a sentence-or-two summary so the prompt stays compact.
  const trimmed = first.replace(/\s+/g, ' ').trim();
  return trimmed.length > 240 ? trimmed.slice(0, 237) + '...' : trimmed;
}

function extractNextStep(trace) {
  const agentLines = (trace?.transcript || []).filter(t => t.role === 'agent');
  // The last agent line typically restates the commitment ("Mike will call back …").
  const last = agentLines[agentLines.length - 1]?.text || '';
  return last.replace(/\s+/g, ' ').trim();
}

function buildEmailPrompt(trace, crmContext) {
  const ctx = crmContext || trace?.crm_context || {};
  const customer = extractCustomerFirstName(trace);
  const issue = extractIssueSummary(trace);
  const nextStep = extractNextStep(trace);
  const toolCalls = (trace?.tool_calls || [])
    .map(c => `- ${c.name}: ${c.summary || ''}`)
    .join('\n');
  const userMessage = [
    `Customer first name: ${customer}`,
    `Customer full name: ${trace?.participant || customer}`,
    `Shop / account: ${ctx.shop_name || trace?.company || 'our shop'}`,
    `Dispatcher: ${ctx.agent_name || 'the on-call dispatcher'}`,
    `Customer tier: ${ctx.tier || 'standard'}`,
    `Address: ${ctx.address || 'on file'}`,
    `Call outcome: ${trace?.outcome || 'in progress'}`,
    `Customer sentiment: ${trace?.sentiment || 'neutral'}`,
    '',
    `Issue (caller's own words): ${issue}`,
    '',
    `Commitment from dispatcher: ${nextStep}`,
    '',
    `Tool calls during the call:`,
    toolCalls || '- (none recorded)',
    '',
    `Draft the follow-up email now.`,
  ].join('\n');
  return {
    system: FOLLOWUP_SYSTEM_PROMPT,
    user: userMessage,
    customer_first_name: customer,
    issue_summary: issue,
    next_step: nextStep,
  };
}

function mockLlmCompose(prompt) {
  // Deterministic stand-in for a real LLM. Real wiring (when we drop
  // the mock) lives behind /api/llm; the surface is the same
  // {subject, body} shape, so the composer doesn't care.
  const customer = prompt?.customer_first_name || 'there';
  const issue = prompt?.issue_summary || 'the issue you described';
  const nextStep = prompt?.next_step || 'a teammate will follow up shortly';
  // Pull the shop + dispatcher names out of the rendered user prompt.
  const shopMatch = /Shop \/ account: (.+)/.exec(prompt?.user || '');
  const dispatcherMatch = /Dispatcher: (.+)/.exec(prompt?.user || '');
  const shop = (shopMatch && shopMatch[1]) || 'our shop';
  const dispatcher = (dispatcherMatch && dispatcherMatch[1]) || 'the on-call team';
  const subject = `Following up on your call to ${shop}`;
  const body = [
    `Hi ${customer},`,
    '',
    `Thanks for calling ${shop} tonight — I'm glad you got through. To recap what you shared: ${issue}`,
    '',
    `Here's where we left it: ${nextStep}`,
    '',
    `I'll keep an eye on the dispatch and let you know if anything shifts. If anything changes in the meantime (the symptom gets worse, you smell gas, the breaker keeps tripping), call us back right away.`,
    '',
    `Talk soon,`,
    `${dispatcher}`,
    `${shop}`,
  ].join('\n');
  return { subject, body };
}

function composeFollowupEmail(trace, crmContext = undefined) {
  const prompt = buildEmailPrompt(trace, crmContext);
  const { subject, body } = mockLlmCompose(prompt);
  return {
    subject,
    body,
    customer_name: trace?.participant || prompt.customer_first_name,
    customer_first_name: prompt.customer_first_name,
    to: (crmContext || trace?.crm_context || {}).primary_contact_email || null,
    prompt,
    schema: 'gtm-ops.email-followup.v1',
    source_call_id: trace?.call_id || null,
    source_trace_schema: trace?.schema || null,
    composed_at: new Date().toISOString(),
  };
}

window.FOLLOWUP_SYSTEM_PROMPT = FOLLOWUP_SYSTEM_PROMPT;
window.buildEmailPrompt = buildEmailPrompt;
window.mockLlmCompose = mockLlmCompose;
window.composeFollowupEmail = composeFollowupEmail;
