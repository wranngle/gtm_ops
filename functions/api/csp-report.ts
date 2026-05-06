// /api/csp-report — receives Content-Security-Policy violation reports
// from browsers when a directive blocks a load. Logged via console.log
// (visible in Cloudflare Workers tail / dashboard) so we can spot
// directive misconfigurations before they show up as user complaints.
//
// Browsers POST one of two body shapes:
//   1. Legacy `report-uri`: { "csp-report": { ... } } as application/csp-report
//   2. Modern `report-to` / Reporting API: array of { type, url, body, ... }
//      as application/reports+json
// Both are accepted; we log the raw body and a parsed summary.
//
// Response is 204 — browsers don't care about the body, and we don't
// want to feed back any state to the page that just violated CSP.

import {type Env} from '../_lib/respond';
import {
  summarizeReport,
  type CspReportLegacy,
  type CspReportModern,
} from '../../lib/csp-summary';

// Real CSP reports are tiny — a few hundred bytes for legacy
// `csp-report` payloads, low single-digit KB even for the modern
// reporting-API array shape. Anything over 16 KB is either a
// misconfigured client or a flood attempt; reject early so we don't
// burn Worker CPU parsing junk and don't write garbage into the log
// stream.
const MAX_CSP_REPORT_BYTES = 16 * 1024;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  // Reject obviously oversized payloads before reading the body —
  // Content-Length is advisory, but cheap to check and prunes the
  // common flood-attempt shape. Reply 204 either way so the browser
  // doesn't retry on its reporting back-off.
  const declaredLength = Number.parseInt(
    context.request.headers.get('content-length') ?? '0',
    10,
  );
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CSP_REPORT_BYTES) {
    console.log('[csp-violation]', JSON.stringify({
      ts: new Date().toISOString(),
      ua: context.request.headers.get('user-agent') ?? null,
      ip: context.request.headers.get('cf-connecting-ip') ?? null,
      summary: 'rejected-oversized',
      declared_length: declaredLength,
    }));
    return new Response(null, {status: 204});
  }

  let parsed: CspReportLegacy | CspReportModern[] | unknown;
  try {
    parsed = await context.request.json();
  } catch {
    parsed = await context.request.text().catch(() => '<unparseable>');
  }

  // Compact one-line log so it's grep-friendly in `wrangler tail`.
  // Includes the directive that fired + the blocked URI when present.
  const summary = summarizeReport(parsed);
  console.log('[csp-violation]', JSON.stringify({
    ts: new Date().toISOString(),
    ua: context.request.headers.get('user-agent') ?? null,
    ip: context.request.headers.get('cf-connecting-ip') ?? null,
    summary,
    raw: parsed,
  }));

  return new Response(null, {status: 204});
};

