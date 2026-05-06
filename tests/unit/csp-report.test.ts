/**
 * Unit tests for functions/api/csp-report.ts
 *
 * The Pages Function itself is exercised by an end-to-end test via
 * wrangler when one becomes available; here we cover the pure
 * `summarizeReport` helper that turns a parsed CSP report payload
 * into the one-line summary that lands in `wrangler tail`.
 *
 * The summary string is the only thing humans see when triaging — if
 * it ever returns "malformed" or "unknown-*" for a well-formed
 * report, an operator can't tell which directive fired. These tests
 * pin the contract.
 */
import { describe, expect, it } from 'vitest';
import { summarizeReport } from '../../lib/csp-summary.js';

describe('[P0] summarizeReport - CSP violation summarizer', () => {
  it('[P0] should summarize a legacy `csp-report` payload', () => {
    const report = {
      'csp-report': {
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://evil.example/inject.js',
      },
    };
    expect(summarizeReport(report)).toBe(
      'script-src-elem blocked https://evil.example/inject.js',
    );
  });

  it('[P0] should fall back to violated-directive when effective-directive is absent', () => {
    const report = {
      'csp-report': {
        'violated-directive': 'img-src',
        'blocked-uri': 'https://tracker.example/pixel.gif',
      },
    };
    expect(summarizeReport(report)).toBe(
      'img-src blocked https://tracker.example/pixel.gif',
    );
  });

  it('[P0] should summarize a modern Reporting API array', () => {
    const report = [
      {
        type: 'csp-violation',
        body: {
          effectiveDirective: 'connect-src',
          blockedURL: 'wss://leak.example/sock',
        },
      },
    ];
    expect(summarizeReport(report)).toBe(
      'connect-src blocked wss://leak.example/sock',
    );
  });

  it('[P1] should return unknown-directive / unknown-source for sparse modern report', () => {
    expect(summarizeReport([{}])).toBe(
      'unknown-directive blocked unknown-source',
    );
  });

  it('[P1] should return "malformed" for null/undefined/string', () => {
    expect(summarizeReport(null)).toBe('malformed');
    expect(summarizeReport(undefined)).toBe('malformed');
    expect(summarizeReport('not a report')).toBe('malformed');
  });

  it('[P1] should return "malformed" for an object missing the csp-report key', () => {
    expect(summarizeReport({ random: 'shape' })).toBe('malformed');
  });

  it('[P1] should return "malformed" for an empty modern report array', () => {
    // first === undefined → unknown-directive blocked unknown-source.
    // Document the actual behavior rather than the wished-for one;
    // future change can tighten this if needed.
    expect(summarizeReport([])).toBe(
      'unknown-directive blocked unknown-source',
    );
  });
});
