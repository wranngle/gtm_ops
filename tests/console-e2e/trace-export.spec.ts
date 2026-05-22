/**
 * Trace export — operators review the active call trace packet before a
 * portable JSON download with the four canonical arrays
 * (transcript, tool_calls, latency_legs, audit_log). The shape is
 * pinned so downstream replay/grading consumers stay stable.
 */
import { test, expect } from './helpers.js';
import { promises as fs } from 'node:fs';

test.describe('call-trace export', () => {
  test('Trace action opens a review packet before JSON export', async ({ openConsole }) => {
    const page = await openConsole();
    await page.goto('/console/?route=calls', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="call-trace-review"]')), null, { timeout: 30_000 });

    const reviewButton = page.locator('[data-testid="call-trace-review"]');
    await expect(reviewButton).toBeVisible();
    await expect(reviewButton).toHaveAttribute('aria-expanded', 'false');
    await reviewButton.click();

    const panel = page.locator('[data-testid="call-trace-review-panel"]');
    await expect(panel).toBeVisible();
    await expect(reviewButton).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toContainText('trace artifact review');
    await expect(panel).toContainText('gtm-ops.call-trace.v1');
    await expect(panel.locator('[data-testid="call-trace-json-preview"]')).toContainText('"transcript"');
    await expect(page.locator('[data-testid="call-trace-receipt"]')).toContainText(/trace prepared/i);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      panel.locator('[data-testid="call-trace-download"]').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^trace-CALL-\d+\.json$/);
    await expect(page.locator('[data-testid="call-trace-receipt"]')).toContainText(/trace downloaded/i);

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
