/**
 * Unit tests for lib/citations.ts — citation rendering used in the
 * Technical Approach section of presales proposals. Untested before
 * this file. The XSS-escape path is the most important: citation
 * URLs and titles flow through from LLM-extracted research, so the
 * `escapeHtml` step inside `generateFootnotesHtml` is the only thing
 * stopping a malicious source title from injecting `<script>` into
 * the rendered PDF/HTML.
 */
import { describe, expect, it, beforeEach } from 'vitest';

let generateFootnotesHtml: any;
let generateCitationRef: any;
let formatCitation: any;

beforeEach(async () => {
  const mod: any = await import('../../lib/citations.js');
  ({ generateFootnotesHtml, generateCitationRef, formatCitation } = mod);
});

describe('[P0] generateFootnotesHtml', () => {
  it('[P0] should return empty string for empty / non-array input', () => {
    expect(generateFootnotesHtml([])).toBe('');
    expect(generateFootnotesHtml(null as any)).toBe('');
    expect(generateFootnotesHtml(undefined as any)).toBe('');
  });

  it('[P0] should render an <ol> with one <li> per citation', () => {
    const html = generateFootnotesHtml([
      { id: 1, title: 'Stripe API Reference', url: 'https://stripe.com/docs', integration: 'Stripe' },
      { id: 2, title: 'GitHub REST API', url: 'https://docs.github.com/rest', integration: 'GitHub' },
    ]);
    expect(html).toContain('<ol class="footnotes-list">');
    expect(html).toMatch(/<li id="fn-1"[\s\S]*Stripe API Reference/);
    expect(html).toMatch(/<li id="fn-2"[\s\S]*GitHub REST API/);
    expect(html).toContain('href="https://stripe.com/docs"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('[P0] should HTML-escape attacker-controlled title and URL (XSS guard)', () => {
    // The masking pipeline can't catch every research-source field —
    // if a title contains `<script>`, the escape step is the last
    // line of defense before render.
    const html = generateFootnotesHtml([
      {
        id: 99,
        title: 'Evil "><script>alert(1)</script>',
        url: 'https://example.com/?q="><img src=x>',
      },
    ]);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
    // The escaped form should have replaced the brackets and quotes.
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;');
  });

  it('[P1] should fall back to title="Source" when no title or source is provided', () => {
    const html = generateFootnotesHtml([{ id: 1, url: 'https://example.com' }]);
    expect(html).toContain('>Source<');
  });

  it('[P1] should include integration label when integration is provided', () => {
    const html = generateFootnotesHtml([
      { id: 1, title: 'X', url: 'https://x.com', integration: 'Salesforce' },
    ]);
    expect(html).toContain('class="cite-integration">[Salesforce]</span>');
  });

  it('[P1] should append the (accessed YYYY-MM-DD) suffix when present', () => {
    const html = generateFootnotesHtml([
      { id: 1, title: 'X', url: 'https://x.com', accessed: '2026-01-15' },
    ]);
    expect(html).toContain('(accessed 2026-01-15)');
  });

  it('[P1] should fall back to id=0 when citation has no id', () => {
    const html = generateFootnotesHtml([{ title: 'X', url: 'https://x.com' }]);
    expect(html).toContain('id="fn-0"');
  });
});

describe('[P0] generateCitationRef', () => {
  it('[P0] should return inline superscript anchor pointing at the footnote id', () => {
    expect(generateCitationRef(7)).toBe('<sup class="cite-ref"><a href="#fn-7">[7]</a></sup>');
  });
});

describe('[P0] formatCitation - one-line text form', () => {
  it('[P0] should join present fields with ", " and quote the title', () => {
    expect(
      formatCitation({
        title: 'Stripe Docs',
        source: 'stripe.com',
        url: 'https://stripe.com/docs',
        accessed: '2026-01-15',
      }),
    ).toBe('"Stripe Docs", stripe.com, https://stripe.com/docs, accessed 2026-01-15');
  });

  it('[P1] should drop missing fields cleanly', () => {
    expect(formatCitation({ url: 'https://x.com' })).toBe('https://x.com');
    expect(formatCitation({ title: 'X' })).toBe('"X"');
  });

  it('[P1] should return empty string for null/undefined', () => {
    expect(formatCitation(null as any)).toBe('');
    expect(formatCitation(undefined)).toBe('');
  });
});
