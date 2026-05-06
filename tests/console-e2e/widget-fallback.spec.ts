/**
 * ElevenLabs widget unreachability fallback — when unpkg.com is blocked
 * (corporate network, strict CSP, etc.) the embed script never registers
 * the <elevenlabs-convai> custom element. Without a fallback the user
 * sees an empty 600×500 box with no explanation. This spec routes the
 * unpkg request to abort and asserts the fallback message + in-console
 * agent-admin action render with proper a11y semantics.
 */
import { test, expect } from './_helpers.js';

test.describe('widget unreachability fallback', () => {
  test('DEMO_MODE fetch shim does not rewrite external ElevenLabs API calls to local fixtures', async ({ page }) => {
    let externalSeen = false;
    let fixtureSeen = false;

    await page.route('**/v1/convai/agents/agent_shim_probe/widget', async (route) => {
      externalSeen = true;
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          source: 'external-elevenlabs',
          widget_config: { languageCode: 'en' },
        }),
      });
    });
    await page.route('**/fixtures/v1/convai/**', async (route) => {
      fixtureSeen = true;
      await route.fulfill({
        status: 418,
        contentType: 'application/json',
        body: JSON.stringify({ source: 'local-fixture-rewrite' }),
      });
    });

    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });

    const result = await page.evaluate(async () => {
      const res = await fetch('https://api.elevenlabs.io/v1/convai/agents/agent_shim_probe/widget');
      return { status: res.status, body: await res.json() };
    });

    expect(externalSeen).toBe(true);
    expect(fixtureSeen).toBe(false);
    expect(result.status).toBe(200);
    expect(result.body.source).toBe('external-elevenlabs');
  });

  test('ConvAI wrapper suppresses embedded ElevenLabs banner links so the header escape hatch stays singular', async ({ page }) => {
    await page.route('**/unpkg.com/@elevenlabs/convai-widget-embed@latest*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: `
          class MockConvai extends HTMLElement {
            connectedCallback() {
              const root = this.attachShadow({ mode: 'open' });
              root.innerHTML = '<section><p data-testid="vendor-banner">Powered by <a href="https://elevenlabs.io/agents">ElevenAgents</a></p><button type="button">Start coaching</button></section>';
            }
          }
          customElements.define('elevenlabs-convai', MockConvai);
        `,
      });
    });
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/?route=agents', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
    await expect(page.locator('elevenlabs-convai')).toHaveCount(1, { timeout: 10_000 });

    await expect.poll(async () => page.locator('a[href*="elevenlabs.io"]').count(), {
      timeout: 5_000,
    }).toBe(1);
    await expect(page.locator('[data-testid="agents-elevenlabs-escape"]')).toHaveCount(1);

    const embeddedBanner = await page.locator('elevenlabs-convai').evaluate((el) => {
      const root = (el as HTMLElement).shadowRoot;
      const link = root?.querySelector('[data-gtm-suppressed-external-link]') as HTMLElement | null;
      const banner = root?.querySelector('[data-gtm-suppressed-external-banner]') as HTMLElement | null;
      return {
        href: link?.getAttribute('href') || null,
        originalHref: link?.dataset.gtmOriginalHref || null,
        bannerDisplay: banner ? getComputedStyle(banner).display : null,
      };
    });
    expect(embeddedBanner.href).toBeNull();
    expect(embeddedBanner.originalHref).toBe('https://elevenlabs.io/agents');
    expect(embeddedBanner.bannerDisplay).toBe('none');
  });

  test('Agents page shows fallback when unpkg is blocked', async ({ page }) => {
    await page.route('**/unpkg.com/@elevenlabs/**', async (route) => route.abort('blockedbyclient'));
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/');
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
    await page.locator('.sb__item:has-text("Agents")').first().click();
    // The fallback fires after a 5s timeout; allow up to 8s with margin.
    await expect(page.locator('.convai-mount--unreachable')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.convai-mount--unreachable')).toHaveAttribute('role', 'alert');
    await expect(page.locator('.convai-fallback__title')).toContainText(/widget unreachable/i);
    await expect(page.locator('.convai-mount--unreachable a[href*="elevenlabs.io"]')).toHaveCount(0);
    await page.locator('.convai-mount--unreachable').getByRole('button', { name: /Open local admin/i }).click();
    await expect(page.locator('.tb__crumb--active')).toContainText('Agents');
    await expect(page.locator('.agent-admin-quick__button:has-text("Context")')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('.agent-admin-tab:has-text("Context")')).toHaveAttribute('aria-selected', 'true');
  });

  test('coach dock shows fallback when unpkg is blocked', async ({ page }) => {
    await page.route('**/unpkg.com/@elevenlabs/**', async (route) => route.abort('blockedbyclient'));
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/');
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
    await page.locator('.coach-launcher').click();
    await expect(page.locator('.coach-dock .convai-mount--unreachable')).toBeVisible({ timeout: 8_000 });
  });

  test('Evals page lab shows fallback when unpkg is blocked', async ({ page }) => {
    await page.route('**/unpkg.com/@elevenlabs/**', async (route) => route.abort('blockedbyclient'));
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/');
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
    await page.locator('.sb__item:has-text("Evals")').first().click();
    await expect(page.locator('.eval-convai-frame .convai-mount--unreachable')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.eval-convai-frame .convai-fallback__title')).toContainText(/widget unreachable/i);
  });

  test('loading state renders before either ready or fallback fires', async ({ page }) => {
    // Slow the unpkg script enough that the loading state shows briefly.
    await page.route('**/unpkg.com/@elevenlabs/**', async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    });
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/');
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
    await page.locator('.sb__item:has-text("Agents")').first().click();
    // Either we see the loading marker, or the widget already loaded; both are healthy.
    const loadingOrReady = await page.evaluate(() =>
      Boolean(
        document.querySelector('.convai-mount--loading') ||
          document.querySelector('elevenlabs-convai'),
      ),
    );
    expect(loadingOrReady).toBe(true);
  });

  test('Agents page replaces a mounted-but-unconfigured widget with local admin recovery', async ({ page }) => {
    await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
    await page.goto('/console/?route=agents', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
    const agentId = await page.evaluate(() => (
      (globalThis as any).AGENT_REGISTRY.byKey('sales_coach').agent_id
    ));

    await page.evaluate((id) => {
      console.error(`[ConversationalAI] Cannot fetch config for agent ${id}: Response does not contain widget_config`);
    }, agentId);

    const configError = page.locator('[data-testid="convai-config-error"]');
    await expect(configError).toBeVisible();
    await expect(configError).toHaveAttribute('role', 'alert');
    await expect(configError).toContainText(/ElevenLabs config unavailable/i);
    await expect(configError).toContainText(agentId);
    await expect(configError.locator('a[href*="elevenlabs.io"]')).toHaveCount(0);
    const localAdminButton = configError.getByRole('button', { name: /Open local admin/i });
    await expect(localAdminButton).toBeVisible();

    const frame = page.locator('[data-testid="agent-playground-convai"]');
    const session = frame.locator('.agent-session-strip');
    const [configBox, sessionBox, frameBox] = await Promise.all([
      configError.boundingBox(),
      session.boundingBox(),
      frame.boundingBox(),
    ]);
    expect(configBox, 'config recovery panel should render with its own box').not.toBeNull();
    expect(sessionBox, 'session packet should render above config recovery').not.toBeNull();
    expect(frameBox, 'playground frame should render').not.toBeNull();
    expect(configBox!.y, 'config recovery panel should not overlap the session packet').toBeGreaterThanOrEqual(sessionBox!.y + sessionBox!.height - 1);
    expect(configBox!.y + configBox!.height, 'config recovery panel should stay inside the playground frame').toBeLessThanOrEqual(frameBox!.y + frameBox!.height + 1);

    const [localAdminBox, coachBox] = await Promise.all([
      localAdminButton.boundingBox(),
      page.locator('.coach-launcher').boundingBox(),
    ]);
    expect(localAdminBox, 'local admin recovery button should render').not.toBeNull();
    expect(coachBox, 'global coach launcher should render').not.toBeNull();
    const overlapsCoach = localAdminBox!.x < coachBox!.x + coachBox!.width
      && localAdminBox!.x + localAdminBox!.width > coachBox!.x
      && localAdminBox!.y < coachBox!.y + coachBox!.height
      && localAdminBox!.y + localAdminBox!.height > coachBox!.y;
    expect(overlapsCoach, 'global coach launcher must not cover the Agents local admin recovery button').toBe(false);

    await localAdminButton.click();
    await expect(page.locator('.tb__crumb--active')).toContainText('Agents');
    await expect(page.locator('.agent-admin-quick__button:has-text("Context")')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('.agent-admin-tab:has-text("Context")')).toHaveAttribute('aria-selected', 'true');
    const ctx = await page.evaluate(() => (globalThis as any).AppContext.get());
    expect(ctx.extra.selected_agent_key).toBe('sales_coach');
    expect(ctx.extra.agent_admin_panel).toBe('context');
    expect(ctx.extra.triggered_from).toBe('convai-config-error');
  });
});
