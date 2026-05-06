// Pure helper for summarizing a parsed CSP violation report into a
// single grep-friendly line. Lives under lib/ so the main TypeScript
// project picks it up via tsconfig.json's lib include, and so the
// Cloudflare Pages Function at functions/api/csp-report.ts can share
// the implementation with unit tests under tests/unit/.
//
// Two payload shapes are supported:
//   - Legacy report-uri POSTs (top-level "csp-report" key)
//   - Modern Reporting API POSTs (array of {type, body} entries)
//
// Anything else collapses to "malformed" so the upstream log line
// still shows up but is trivially filterable.

export type CspReportLegacy = {
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

export type CspReportModern = {
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

export function summarizeReport(report: unknown): string {
  if (!report || typeof report !== 'object') return 'malformed';
  if (Array.isArray(report)) {
    const first = report[0] as CspReportModern | undefined;
    const directive = first?.body?.effectiveDirective ?? 'unknown-directive';
    const blocked = first?.body?.blockedURL ?? 'unknown-source';
    return `${directive} blocked ${blocked}`;
  }

  const legacy = (report as CspReportLegacy)['csp-report'];
  if (!legacy) return 'malformed';
  const directive =
    legacy['effective-directive'] ?? legacy['violated-directive'] ?? 'unknown-directive';
  const blocked = legacy['blocked-uri'] ?? 'unknown-source';
  return `${directive} blocked ${blocked}`;
}
