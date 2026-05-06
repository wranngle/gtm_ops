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

type CspReportLegacy = {
  'csp-report'?: {
    'document-uri'?: string;
    referrer?: string;
    'violated-directive'?: string;
    'effective-directive'?: string;
    'original-policy'?: string;
    disposition?: string;
    'blocked-uri'?: string;
    'line-number'?: number;
    'column-number'?: number;
    'source-file'?: string;
    'status-code'?: number;
    'script-sample'?: string;
  };
};

type CspReportModern = {
  type?: string;
  url?: string;
  body?: {
    documentURL?: string;
    referrer?: string;
    blockedURL?: string;
    effectiveDirective?: string;
    originalPolicy?: string;
    sourceFile?: string;
    sample?: string;
    disposition?: string;
    statusCode?: number;
    lineNumber?: number;
    columnNumber?: number;
  };
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
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

function summarizeReport(report: unknown): string {
  if (!report || typeof report !== 'object') return 'malformed';
  if (Array.isArray(report)) {
    const first = report[0] as CspReportModern | undefined;
    const directive = first?.body?.effectiveDirective ?? 'unknown-directive';
    const blocked = first?.body?.blockedURL ?? 'unknown-source';
    return `${directive} blocked ${blocked}`;
  }
  const legacy = (report as CspReportLegacy)['csp-report'];
  if (!legacy) return 'malformed';
  const directive = legacy['effective-directive'] ?? legacy['violated-directive'] ?? 'unknown-directive';
  const blocked = legacy['blocked-uri'] ?? 'unknown-source';
  return `${directive} blocked ${blocked}`;
}
