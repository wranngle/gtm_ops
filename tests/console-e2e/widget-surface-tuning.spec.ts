/**
 * Per-surface ConvAI widget tuning — verifies the surface block from
 * agents-registry.js#surfaces actually lands on the rendered
 * <elevenlabs-convai> element, end-to-end.
 *
 * Each ConvaiWidget mount declares a surface key (coach_dock,
 * agent_playground, pipeline_intake, eval_lab); the wrapper merges
 * that surface block over the per-agent widget defaults. If a future
 * change re-introduces a per-call-site `dismissible={false}` etc., it
 * would silently flatten the dock-vs-playground nuance — this spec
 * catches that regression at the rendered DOM.
 */
import { test, expect } from './helpers.js';

// Reusable mock for the ElevenLabs embed script. The official script
// loads from unpkg (network) and registers the custom element; in CI
// we substitute a local stub so the spec doesn't hang on unpkg.
const MOCK_CONVAI_EMBED = `
  class MockConvai extends HTMLElement {
    connectedCallback() {
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = '<section data-mock="convai"><strong>mock</strong></section>';
    }
  }
  if (!customElements.get('elevenlabs-convai')) {
    customElements.define('elevenlabs-convai', MockConvai);
  }
`;

test.describe('per-surface widget tuning', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/unpkg.com/@elevenlabs/convai-widget-embed@latest*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: MOCK_CONVAI_EMBED,
      });
    });
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
  });

  test('coach dock on /home opens dismissible (it floats over every route)', async ({ page }) => {
    await page.goto('/console/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
    await page.locator('.coach-launcher').click();
    const widget = page.locator('.coach-dock elevenlabs-convai');
    await expect(widget).toHaveCount(1, { timeout: 10_000 });
    await expect(widget).toHaveAttribute('dismissible', 'true');
    await expect(widget).toHaveAttribute('data-agent-key', 'sales_coach');
    await expect(widget).toHaveAttribute('data-surface', 'coach_dock');
    // coach_dock surface delivers a dock-specific first message ("Coach is
    // docked. ...") distinct from the agent-default first message.
    await expect(widget).toHaveAttribute('override-first-message', /docked/i);
  });

  test('agents page playground is NOT dismissible (it is the page itself)', async ({ page }) => {
    await page.goto('/console/?route=agents', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
    const widget = page.locator('[data-testid="agent-playground-convai"] elevenlabs-convai');
    await expect(widget).toHaveCount(1, { timeout: 10_000 });
    await expect(widget).toHaveAttribute('data-surface', 'agent_playground');
    // dismissible attr is unset (or 'false'); it must NOT be 'true'.
    const dismissible = await widget.getAttribute('dismissible');
    expect(dismissible).not.toBe('true');
    // playground surface delivers an admin-tuning first message that is
    // distinct from the registry default and from the dock first message.
    await expect(widget).toHaveAttribute('syntax-highlight-theme', 'dark');
    await expect(widget).toHaveAttribute('override-first-message', /playground|tuning/i);
  });

  test('coach in dock vs coach in playground render with different surface markers', async ({ page }) => {
    // Same agent, different surface — proves the surface block is the
    // delta-driver, not the agent registry's `widget` block. Asserts on
    // both data-surface (the registry-driven label) and dismissible (the
    // floating-vs-page-bound delta).
    await page.goto('/console/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
    await page.locator('.coach-launcher').click();
    const dockWidget = page.locator('.coach-dock elevenlabs-convai');
    await expect(dockWidget).toHaveCount(1, { timeout: 10_000 });
    const dockSurface = await dockWidget.getAttribute('data-surface');
    const dockDismissible = await dockWidget.getAttribute('dismissible');

    await page.goto('/console/?route=agents', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
    const playgroundWidget = page.locator('[data-testid="agent-playground-convai"] elevenlabs-convai');
    await expect(playgroundWidget).toHaveCount(1, { timeout: 10_000 });
    const playgroundSurface = await playgroundWidget.getAttribute('data-surface');
    const playgroundDismissible = await playgroundWidget.getAttribute('dismissible');

    expect(dockSurface).toBe('coach_dock');
    expect(playgroundSurface).toBe('agent_playground');
    expect(dockSurface).not.toBe(playgroundSurface);
    expect(dockDismissible).toBe('true');
    expect(playgroundDismissible).not.toBe('true');
  });
});
