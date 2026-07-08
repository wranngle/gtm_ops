/**
 * Unit tests for lib/evaluation/harvester.ts content fetching — the real
 * fetchPageContent that replaced the always-throwing "not implemented"
 * placeholder behind the exported harvestFromUrl/batchHarvest API. Network is
 * stubbed via the global fetch; htmlToText is pinned directly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPageContent, htmlToText } from '../../lib/evaluation/harvester.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('[P1] htmlToText', () => {
  it('[P1] strips script/style/comment noise and tags, keeps the prose', () => {
    const html = `
      <html><head><style>.a{color:red}</style><script>alert(1)</script></head>
      <body><!-- nav --><h1>Dental AI</h1><p>Cut no-shows by 40%.</p>
      <div>Booked 200 calls&nbsp;&amp; more.</div></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain('Dental AI');
    expect(text).toContain('Cut no-shows by 40%.');
    expect(text).toContain('Booked 200 calls & more.');
    expect(text).not.toContain('alert(1)');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('<');
  });

  it('[P1] preserves block boundaries as line breaks', () => {
    const text = htmlToText('<p>one</p><p>two</p><li>three</li>');
    expect(text.split('\n').map(l => l.trim()).filter(Boolean)).toEqual(['one', 'two', 'three']);
  });

  it('[P1] does not double-decode author-escaped entities (&amp; decodes last)', () => {
    // "&amp;lt;" is the author writing the literal text "&lt;" — it must NOT
    // collapse all the way to "<" (CodeQL js/double-escaping).
    expect(htmlToText('<p>use &amp;lt;br&amp;gt; here</p>')).toBe('use &lt;br&gt; here');
    expect(htmlToText('<p>a &amp; b &lt; c</p>')).toBe('a & b < c');
  });
});

describe('[P0] fetchPageContent', () => {
  it('[P0] fetches HTML and returns stripped text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><body><h1>Case Study</h1><p>Voice agent saved 12 hrs/week.</p></body></html>',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
    )));

    const text = await fetchPageContent('https://vendor.example/case-studies/dental');
    expect(text).toContain('Case Study');
    expect(text).toContain('Voice agent saved 12 hrs/week.');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('[P0] passes markdown/plain bodies through unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '# Case study\n\nPlain markdown body.',
      { status: 200, headers: { 'content-type': 'text/markdown' } }
    )));

    const text = await fetchPageContent('https://vendor.example/case.md');
    expect(text).toBe('# Case study\n\nPlain markdown body.');
  });

  it('[P0] throws with the status code on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(fetchPageContent('https://vendor.example/missing')).rejects.toThrow(/HTTP 404/);
  });

  it('[P1] throws a manual-fallback hint when the page yields no text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><body><script>renderApp()</script></body></html>',
      { status: 200, headers: { 'content-type': 'text/html' } }
    )));
    await expect(fetchPageContent('https://spa.example/case')).rejects.toThrow(/harvestFromContent/);
  });
});
