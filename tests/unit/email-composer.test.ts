/**
 * AI follow-up email composer contract.
 *
 * The composer lives in apps/ops-console/console/email-composer.tsx and
 * pulls its prompt logic from apps/ops-console/console/email-prompt.ts.
 * It consumes a call trace shaped like `gtm-ops.call-trace.v1` — the
 * same schema round-1 PR #173 emitted from the exportable trace button.
 *
 * The ops-console TSX is served as Babel-standalone in the browser, so
 * this test follows the convention used by simulator-widget.test.ts and
 * vertical-switcher.test.ts: assert against the source text + fixture
 * data + the pure helpers in email-prompt.ts (re-loaded via require)
 * rather than spinning up a JSDOM render.
 *
 * Behavior under test:
 *   1. Fixture exists, parses as `gtm-ops.call-trace.v1`, has ≥3
 *      transcript turns + participant + crm_context.
 *   2. email-prompt.ts builds a deterministic prompt + mock-LLM
 *      compose returns {subject, body} containing the customer name.
 *   3. email-composer.tsx wires the preview pane (subject, body,
 *      customer-name test ids).
 *   4. Route + sidebar + index.html wiring is in place.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturePath = resolve(root, 'apps/ops-console/fixtures/call-trace-followup.json');
const promptPath = resolve(root, 'apps/ops-console/console/email-prompt.ts');
const composerPath = resolve(root, 'apps/ops-console/console/email-composer.tsx');
const appPath = resolve(root, 'apps/ops-console/console/app.tsx');
const shellPath = resolve(root, 'apps/ops-console/console/shell.tsx');
const indexPath = resolve(root, 'apps/ops-console/console/index.html');

const fixtureRaw = readFileSync(fixturePath, 'utf8');
const fixture = JSON.parse(fixtureRaw);

const promptSrc = readFileSync(promptPath, 'utf8');
const composerSrc = readFileSync(composerPath, 'utf8');
const appSrc = readFileSync(appPath, 'utf8');
const shellSrc = readFileSync(shellPath, 'utf8');
const indexSrc = readFileSync(indexPath, 'utf8');

/**
 * The ts source attaches functions to `window` and is consumed by the
 * browser via Babel-standalone. To exercise the pure helpers from
 * vitest we strip the `window.X = X;` lines, wrap the rest in a `new
 * Function('window', src)` factory, and call it with a minimal stub
 * window so we get the real `buildEmailPrompt` / `mockLlmCompose` /
 * `composeFollowupEmail` back. This is the same trick the
 * vertical-switcher test uses to assert behavior without a bundler.
 */
function loadHelpers() {
  const stripped = promptSrc
    .replace(/^window\.[^=]+=\s*[^;]+;\s*$/gm, '')
    .replace(/^const\s+/gm, 'var ');
  const factory = new Function(
    'window',
    stripped + '\nreturn { buildEmailPrompt, mockLlmCompose, composeFollowupEmail, FOLLOWUP_SYSTEM_PROMPT };',
  ) as (w: Record<string, unknown>) => {
    buildEmailPrompt: (t: unknown, c?: unknown) => any;
    mockLlmCompose: (p: any) => { subject: string; body: string };
    composeFollowupEmail: (t: unknown, c?: unknown) => any;
    FOLLOWUP_SYSTEM_PROMPT: string;
  };
  return factory({});
}

const helpers = loadHelpers();

describe('email composer: call-trace fixture', () => {
  it('parses as gtm-ops.call-trace.v1 with a customer + transcript', () => {
    expect(fixture.schema).toBe('gtm-ops.call-trace.v1');
    expect(typeof fixture.participant).toBe('string');
    expect(fixture.participant.length).toBeGreaterThan(0);
    expect(Array.isArray(fixture.transcript)).toBe(true);
    expect(fixture.transcript.length).toBeGreaterThanOrEqual(3);
    for (const turn of fixture.transcript) {
      expect(typeof turn.ts).toBe('number');
      expect(['agent', 'caller']).toContain(turn.role);
      expect(typeof turn.text).toBe('string');
      expect(turn.text.length).toBeGreaterThan(0);
    }
  });

  it('carries crm_context with a primary contact email', () => {
    expect(fixture.crm_context).toBeTruthy();
    expect(typeof fixture.crm_context.primary_contact_email).toBe('string');
    expect(fixture.crm_context.primary_contact_email).toMatch(/@/);
  });
});

describe('email composer: prompt builder + mock LLM', () => {
  it('extracts the customer first name from the trace participant', () => {
    const prompt = helpers.buildEmailPrompt(fixture);
    expect(prompt.customer_first_name).toBe('John');
    expect(prompt.user).toContain('John Doe');
  });

  it('renders the issue summary using the first caller line', () => {
    const prompt = helpers.buildEmailPrompt(fixture);
    expect(prompt.issue_summary.toLowerCase()).toContain('furnace');
    expect(prompt.user).toContain(prompt.issue_summary);
  });

  it('renders the commitment using the last agent line', () => {
    const prompt = helpers.buildEmailPrompt(fixture);
    expect(prompt.next_step.toLowerCase()).toContain('mike');
    expect(prompt.user).toContain(prompt.next_step);
  });

  it('includes the system instruction header', () => {
    const prompt = helpers.buildEmailPrompt(fixture);
    expect(prompt.system).toContain('post-call follow-up email');
    expect(prompt.system).toContain('first name');
  });

  it('mockLlmCompose returns a {subject, body} pair that names the customer', () => {
    const prompt = helpers.buildEmailPrompt(fixture);
    const draft = helpers.mockLlmCompose(prompt);
    expect(typeof draft.subject).toBe('string');
    expect(typeof draft.body).toBe('string');
    expect(draft.subject.length).toBeGreaterThan(0);
    expect(draft.body).toContain('John');
    expect(draft.body.toLowerCase()).toContain('furnace');
    expect(draft.subject.toLowerCase()).toContain('banyan');
  });

  it('composeFollowupEmail bundles the full preview shape', () => {
    const composed = helpers.composeFollowupEmail(fixture);
    expect(composed.schema).toBe('gtm-ops.email-followup.v1');
    expect(composed.source_call_id).toBe(fixture.call_id);
    expect(composed.source_trace_schema).toBe('gtm-ops.call-trace.v1');
    expect(composed.customer_name).toBe(fixture.participant);
    expect(composed.customer_first_name).toBe('John');
    expect(composed.to).toBe(fixture.crm_context.primary_contact_email);
    expect(composed.subject.length).toBeGreaterThan(0);
    expect(composed.body).toContain('John');
  });

  it('composeFollowupEmail accepts an explicit CRM context override', () => {
    const override = { ...fixture.crm_context, agent_name: 'Riley', shop_name: 'Banyan HVAC' };
    const composed = helpers.composeFollowupEmail(fixture, override);
    expect(composed.body).toContain('Riley');
    expect(composed.body).toContain('Banyan HVAC');
  });
});

describe('email composer: widget source', () => {
  it('declares the EmailComposer component', () => {
    expect(composerSrc).toMatch(/function EmailComposer\s*\(/);
  });

  it('declares the EmailComposerPage page component', () => {
    expect(composerSrc).toMatch(/function EmailComposerPage\s*\(/);
  });

  it('reads the call-trace-followup fixture URL', () => {
    expect(composerSrc).toMatch(/fixtures\/call-trace-followup\.json/);
  });

  it('renders the customer name in both source + preview test ids', () => {
    expect(composerSrc).toMatch(/data-testid="emailc-source-customer"/);
    expect(composerSrc).toMatch(/data-testid="emailc-preview-customer"/);
  });

  it('renders the subject + body in the preview pane', () => {
    expect(composerSrc).toMatch(/data-testid="emailc-preview-subject"/);
    expect(composerSrc).toMatch(/data-testid="emailc-preview-body"/);
  });

  it('invokes composeFollowupEmail via the window global', () => {
    expect(composerSrc).toMatch(/window\.composeFollowupEmail/);
  });

  it('exports EmailComposer + EmailComposerPage on window for app.tsx', () => {
    expect(composerSrc).toMatch(/window\.EmailComposer\s*=\s*EmailComposer/);
    expect(composerSrc).toMatch(/window\.EmailComposerPage\s*=\s*EmailComposerPage/);
  });
});

describe('email composer: route + sidebar wiring', () => {
  it('email-composer is in the ROUTES allow-list', () => {
    const match = appSrc.match(/const ROUTES\s*=\s*\[([^\]]+)\]/);
    expect(match, 'ROUTES constant should be in app.tsx').toBeTruthy();
    expect(match![1]).toMatch(/'email-composer'/);
  });

  it('app.tsx mounts EmailComposerPage on the email-composer route', () => {
    expect(appSrc).toMatch(/route === 'email-composer'\s*&&\s*<EmailComposerPage/);
  });

  it('sidebar includes an email-composer nav item', () => {
    expect(shellSrc).toMatch(/id\s*:\s*'email-composer'/);
  });

  it('index.html loads email-prompt.ts before email-composer.tsx, both before app.tsx', () => {
    const promptIdx = indexSrc.indexOf('email-prompt.ts');
    const widgetIdx = indexSrc.indexOf('email-composer.tsx');
    const appIdx = indexSrc.indexOf('app.tsx"');
    expect(promptIdx).toBeGreaterThan(0);
    expect(widgetIdx).toBeGreaterThan(promptIdx);
    expect(appIdx).toBeGreaterThan(widgetIdx);
  });
});
