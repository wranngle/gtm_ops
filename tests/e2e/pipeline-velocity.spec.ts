/**
 * E2E: pipeline-velocity widget on the ops-console Pipeline page.
 *
 * Asserts that the data-testid="pipeline-velocity-card" element renders
 * a numeric percentage in DEMO_MODE, and that the displayed ratio matches
 * the fixture proposals' closed-won / sent denominator computed by the
 * same predicate as lib/admin.ts#getPipelineVelocity.
 *
 * Spins up the same Bun static server the console-e2e suite uses, on a
 * unique port so this test can run inside the default `tests/e2e`
 * Playwright config without colliding with playwright.console.config.ts.
 */
import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PIPELINE_VELOCITY_PORT || 4191);
const STATIC_SERVER = resolve(HERE, '..', 'console-e2e', 'static-server.ts');

let server: ChildProcess | null = null;

test.beforeAll(async () => {
  server = spawn('bun', [STATIC_SERVER, String(PORT)], { stdio: 'pipe' });
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://localhost:${PORT}/console/`);
      if (res.ok) return;
    } catch (_) { /* retry */ }
    await wait(250);
  }
  throw new Error(`static server never came up on :${PORT}`);
});

test.afterAll(async () => {
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await wait(150);
    if (!server.killed) server.kill('SIGKILL');
  }
});

test('pipeline-velocity card renders numeric percentage in DEMO_MODE', async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as Record<string, unknown>).DEMO_MODE = true;
  });
  await page.goto(`http://localhost:${PORT}/console/?route=pipeline`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });

  const card = page.locator('[data-testid="pipeline-velocity-card"]');
  await expect(card).toBeVisible({ timeout: 15_000 });

  const percentText = await page.locator('[data-testid="pipeline-velocity-percent"]').textContent();
  expect(percentText).toMatch(/^\d+\.\d%$/);

  // Deterministic fixture math (apps/ops-console/console/data.js seeds
  // + apps/ops-console/fixtures/history.json merged by app.tsx):
  //  - 4 seed proposals: 1 'signed' (Thornfield) + 3 sent (review/redlines/legal).
  //  - 8 history rows: 6 'completed' → stage 'signed' (sent + won),
  //                    1 'failed'    → stage 'closed lost' (not in SENT_STAGES),
  //                    1 'running'   → stage 'drafting'    (not sent).
  //  Sent  = 4 + 6 = 10. Closed-won = 1 + 6 = 7. Velocity = 7/10 = 70.0%.
  expect(percentText).toBe('70.0%');

  const ratio = await card.getAttribute('data-velocity-ratio');
  const closedWon = await card.getAttribute('data-velocity-closed-won');
  const sent = await card.getAttribute('data-velocity-sent');
  expect(Number(ratio)).toBeCloseTo(0.7, 4);
  expect(closedWon).toBe('7');
  expect(sent).toBe('10');
});
