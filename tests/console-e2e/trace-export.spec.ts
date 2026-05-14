/**
 * Trace export — operators click "trace" on the active call card and a
 * portable JSON downloads with the four canonical arrays
 * (transcript, tool_calls, latency_legs, audit_log). The shape is
 * pinned so downstream replay/grading consumers stay stable.
 */
import { test, expect } from './helpers.js';
import { promises as fs } from 'node:fs';

test.describe('call-trace export', () => {
  test('Download trace button writes a JSON with the canonical arrays', async ({ openConsole }) => {
    const page = await openConsole();
    await page.goto('/console/?route=calls', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="call-trace-download"]')), null, { timeout: 30_000 });

    const button = page.locator('[data-testid="call-trace-download"]');
    await expect(button).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      button.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^trace-CALL-\d+\.json$/);

    const path = await download.path();
    expect(path).toBeTruthy();
    const raw = await fs.readFile(path as string, 'utf8');
    const trace = JSON.parse(raw);

    expect(trace.schema).toBe('gtm-ops.call-trace.v1');
    expect(typeof trace.call_id).toBe('string');
    expect(trace.call_id).toMatch(/^CALL-\d+$/);
    expect(typeof trace.exported_at).toBe('string');
    expect(() => new Date(trace.exported_at).toISOString()).not.toThrow();

    for (const key of ['transcript', 'tool_calls', 'latency_legs', 'audit_log']) {
      expect(Array.isArray(trace[key]), `${key} must be an array`).toBe(true);
    }
    expect(trace.transcript.length).toBeGreaterThan(0);
    expect(trace.latency_legs.length).toBeGreaterThan(0);
    expect(trace.audit_log.length).toBeGreaterThan(0);

    for (const turn of trace.transcript) {
      expect(turn).toHaveProperty('ts');
      expect(turn).toHaveProperty('role');
      expect(turn).toHaveProperty('text');
      expect(['agent', 'caller']).toContain(turn.role);
    }
    for (const leg of trace.latency_legs) {
      expect(leg).toHaveProperty('leg');
      expect(typeof leg.value).toBe('number');
    }
    for (const entry of trace.audit_log) {
      expect(entry).toHaveProperty('actor');
      expect(entry).toHaveProperty('event');
    }
  });
});
