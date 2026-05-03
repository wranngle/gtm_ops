// POST /api/leads — landing-form intake.
//
// Forwards the lead to the configured n8n webhook when N8N_LEADS_WEBHOOK and
// N8N_WEBHOOK_SECRET are bound. When neither is bound (the default preview
// state) it acknowledges as a no-op so the landing form is still safe to
// click — the page surfaces "demo mode acknowledged" to the visitor.
//
// Also persists to D1 (`leads_intake`) when DB is bound; ignores write
// failures so a missing table never blocks a marketing-page submission.

import {jsonResponse, type Env} from '../_lib/respond';

type LeadsEnv = Env & {
  N8N_LEADS_WEBHOOK?: string;
  N8N_WEBHOOK_SECRET?: string;
};

type LeadPayload = {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  industry?: unknown;
  primary_pain?: unknown;
  intake_source?: unknown;
  referrer?: unknown;
  page?: unknown;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export const onRequestOptions: PagesFunction<LeadsEnv> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });

export const onRequestGet: PagesFunction<LeadsEnv> = async (context) => {
  // Existing /api/leads GET is the fixture list (browse leads); preserve it
  // by rewriting to the bundled fixture rather than handling a DB query here.
  const url = new URL(context.request.url);
  url.pathname = '/fixtures/leads.json';
  return Response.redirect(url.toString(), 302);
};

export const onRequestPost: PagesFunction<LeadsEnv> = async (context) => {
  let body: LeadPayload;
  try {
    body = (await context.request.json()) as LeadPayload;
  } catch {
    return jsonResponse({ok: false, error: 'invalid_json'}, {status: 400});
  }

  const name = clean(body.name, 120);
  const email = clean(body.email, 200);
  const company = clean(body.company, 200);
  const industry = clean(body.industry, 80);
  const primaryPain = clean(body.primary_pain, 1000);
  const intakeSource = clean(body.intake_source, 40) ?? 'landing_form';
  const referrer = clean(body.referrer, 500);
  const page = clean(body.page, 500);

  if (!name || !email) {
    return jsonResponse({ok: false, error: 'missing_required_fields'}, {status: 400});
  }
  if (!EMAIL_RE.test(email)) {
    return jsonResponse({ok: false, error: 'invalid_email'}, {status: 400});
  }

  const leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const submittedAt = new Date().toISOString();
  const record = {
    id: leadId,
    name,
    email,
    company,
    industry,
    primary_pain: primaryPain,
    intake_source: intakeSource,
    referrer,
    page,
    submitted_at: submittedAt,
  };

  let persisted = false;
  if (context.env.DB) {
    try {
      await context.env.DB
        .prepare(
          'INSERT INTO leads_intake (id, name, email, company, industry, primary_pain, intake_source, referrer, page, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          leadId,
          name,
          email,
          company,
          industry,
          primaryPain,
          intakeSource,
          referrer,
          page,
          submittedAt,
        )
        .run();
      persisted = true;
    } catch (error: unknown) {
      console.warn(
        '[api/leads] D1 insert failed, continuing:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  let forwarded = false;
  const webhook = context.env.N8N_LEADS_WEBHOOK;
  if (webhook) {
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(context.env.N8N_WEBHOOK_SECRET
            ? {'X-Wranngle-Secret': context.env.N8N_WEBHOOK_SECRET}
            : {}),
        },
        body: JSON.stringify(record),
      });
      forwarded = response.ok;
    } catch (error: unknown) {
      console.warn(
        '[api/leads] webhook forward failed:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const demo = !persisted && !forwarded;
  return jsonResponse({
    ok: true,
    success: true,
    id: leadId,
    persisted,
    forwarded,
    demo,
  });
};
