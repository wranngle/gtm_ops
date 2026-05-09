/**
 * Proposal generation flow — exercise the Generate page UI end-to-end:
 *   - Use sample brief populates the textarea with the Acme HVAC fixture
 *   - Run sequence is gated on input
 *   - Submitting fires a POST /api/generate (caught by the demo fetch shim)
 */
import { test, expect } from './_helpers.js';

test('Generate page · auto-sample populates input', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  const textarea = page.locator('.generate-brief').first();
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveValue('');
  await page.getByRole('button', { name: /Use sample brief/i }).click();
  // Either the fixture loads, or the canned fallback sets the same Acme HVAC string.
  await expect(textarea).toHaveValue(/HVAC|Acme|CLIENT:/, { timeout: 5_000 });
});

test('Generate page · topbar proposal run pre-fills even when Generate is already mounted', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  const textarea = page.locator('.generate-brief').first();
  await expect(textarea).toHaveValue('');

  await page.locator('.tb__actions').getByRole('button', { name: /New run/i }).click();
  await page.locator('.pop__row').filter({ hasText: /^Generate proposal/ }).click();

  const banner = page.locator('[data-testid="generate-new-run-banner"]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/New proposal run seeded from CALL-2419/i);
  await expect(banner).toContainText(/Banyan Health/i);
  await expect(textarea).toHaveValue(/Buyer proof carried from the call:/i);
  await expect(textarea).toHaveValue(/CALL-2419/i);
  await expect(textarea).toHaveValue(/meeting-booked/i);
  await expect(page.locator('[data-testid="generate-step-01"]')).toHaveAttribute('data-state', 'ready');
});

test('Generate page · handoff review packet follows the source buyer, not the Acme sample default', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  await page.locator('.tb__actions').getByRole('button', { name: /New run/i }).click();
  await page.locator('.pop__row').filter({ hasText: /^Generate proposal/ }).click();

  await expect(page.locator('[data-testid="generate-new-run-banner"]')).toContainText(/Banyan Health/i);
  await page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i }).click();
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete: artifact_id=run_banyan_health/i, { timeout: 20_000 });
  await expect(page.locator('.toast').first()).toContainText(/Banyan Health/i);

  await page.locator('.generate-review-card').getByRole('button', { name: /Preview draft PDF/i }).click();
  const drawer = page.getByRole('region', { name: /Proposal artifact review drawer/i });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(/Banyan Health proposal draft/i);
  await expect(drawer.locator('[data-testid="generate-artifact-id"]')).toContainText(/run_banyan_health/);
  await expect(drawer).toContainText(/Demo-generated Banyan Health packet/i);
  await expect(drawer).not.toContainText(/Demo-generated Acme HVAC packet/i);

  await page.getByRole('button', { name: /Close proposal artifact review drawer/i }).click();
  await page.locator('.generate-review-card').getByRole('button', { name: /^Review in Proposals$/i }).click();
  await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
  const detailCard = page.locator('.split--2 > .vstack > .card').first();
  await expect(detailCard.locator('.card__title')).toContainText('PR-2041');
  await expect(detailCard).toContainText(/Banyan Health/i);

  const ctx = await page.evaluate(() => (globalThis as any).AppContext.get());
  expect(ctx.extra.generated_artifact_id).toBe('run_banyan_health');
});

test('Generate page · empty input disables draft actions and points to buyer proof', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  const textarea = page.locator('.generate-brief').first();

  const topDraft = page.locator('.ph__actions').getByRole('button', { name: /^Add buyer proof first$/i });
  const lowerDraft = page.locator('.generate-actions').getByRole('button', { name: /^Add buyer proof first$/i });
  await expect(topDraft).toBeDisabled();
  await expect(lowerDraft).toBeDisabled();
  await expect(topDraft).toHaveAttribute('aria-describedby', 'generate-brief-required-note');
  await expect(page.locator('#generate-brief-required-note')).toContainText(/Buyer proof is required/i);
  await expect(page.locator('.toast', { hasText: /Input required/i })).toHaveCount(0);

  await page.locator('.generate-review-card').getByRole('button', { name: /Add buyer proof/i }).click();
  await expect(textarea).toBeFocused();
  await expect(textarea).toHaveAttribute('aria-invalid', 'false');

  await page.getByRole('button', { name: /Use sample brief/i }).click();
  await expect(page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i })).toBeEnabled();
  await expect(page.locator('.generate-actions').getByRole('button', { name: /^Generate review draft$/i })).toBeEnabled();
  await expect(page.locator('#generate-brief-required-note')).toHaveCount(0);
});

test('Generate proposal flow explains the review gate and destination before execution', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  await expect(page.locator('[data-testid="generate-step-03"]')).toContainText(/Review packet locally/);
  await expect(page.locator('[data-testid="generate-step-03"]')).toContainText(/open Proposals/);
  await expect(page.locator('.generate-review-card .artifact-review__packet')).toContainText(/local artifact previews/i);
  await expect(page.locator('.generate-review-card .artifact-review__packet')).toContainText(/Proposals/i);
  await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/Artifact/i);
  await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/Local sample preview/i);
  await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/Review/i);
  await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/Draft gate locked/i);
  await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/Send/i);
  await expect(page.locator('[data-testid="generate-review-path"]')).toContainText(/Buyer send blocked until approved/i);
  const reviewPathLayout = await page.locator('[data-testid="generate-review-path"]').evaluate((el) => {
    const pathBox = el.getBoundingClientRect();
    const stepBoxes = Array.from(el.children).map(child => child.getBoundingClientRect());
    return {
      stepCount: stepBoxes.length,
      allStepsShareRow: stepBoxes.every(box => Math.abs(box.top - stepBoxes[0].top) < 2),
      allStepsReadable: stepBoxes.every(box => box.width >= pathBox.width * 0.28),
    };
  });
  expect(reviewPathLayout).toEqual({
    stepCount: 3,
    allStepsShareRow: true,
    allStepsReadable: true,
  });
  await expect(page.locator('.generate-review-card').getByRole('button', { name: /^Review in Proposals$/i })).toBeDisabled();
});

test('Generate page · demo trace names the active buyer handoff instead of the canned sample', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  await page.locator('.tb__actions').getByRole('button', { name: /New run/i }).click();
  await page.locator('.pop__row').filter({ hasText: /^Generate proposal/ }).click();
  await expect(page.locator('[data-testid="generate-new-run-banner"]')).toContainText(/Banyan Health/i);

  await page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i }).click();
  const panel = page.locator('.console-panel');
  await expect(panel).toContainText(/extract\.client: Banyan Health/i, { timeout: 20_000 });
  await expect(panel).toContainText(/CALL-2419/i);
  await expect(panel).not.toContainText(/extract\.client: Acme HVAC Services/i);

  await page.locator('.generate-review-card').getByRole('button', { name: /Inspect draft source/i }).click();
  const drawer = page.getByRole('region', { name: /Proposal artifact review drawer/i });
  await expect(drawer).toContainText(/Banyan Health source evidence bundle/i);
  await expect(drawer).toContainText(/Banyan Health review metadata/i);
  await expect(drawer).not.toContainText(/bundled Acme fixture/i);
  const sourceJson = drawer.locator('[data-testid="generate-artifact-source-json"]');
  await expect(sourceJson).toContainText(/"buyer": "Banyan Health"/i);
  await expect(sourceJson).toContainText(/CALL-2419/i);
  await expect(sourceJson).toContainText(/handoff_review_source/i);
  await expect(sourceJson).not.toContainText(/Acme HVAC/i);
});

test('Generate page · sequence rail reflects the real review gate state', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  const sequence = page.locator('[data-testid="generate-sequence"]');
  await expect(sequence).toBeVisible();
  await expect(page.locator('[data-testid="generate-step-01"]')).toHaveAttribute('data-state', 'missing');
  await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'waiting');
  await expect(page.locator('[data-testid="generate-step-03"]')).toHaveAttribute('data-state', 'locked');

  await page.getByRole('button', { name: /Use sample brief/i }).click();
  await expect(page.locator('[data-testid="generate-step-01"]')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('[data-testid="generate-step-02"]')).toContainText(/Ready to extract/i);

  await page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i }).click();
  await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'running');
  await expect(page.locator('[data-testid="generate-step-03"]')).toHaveAttribute('data-state', 'locked');
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete/i, { timeout: 20_000 });
  await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'complete');
  await expect(page.locator('[data-testid="generate-step-03"]')).toHaveAttribute('data-state', 'ready');
});

test('Generate page · DEMO_MODE replay unlocks review even if POST never resolves', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  await page.getByRole('button', { name: /Use sample brief/i }).click();

  await page.evaluate(() => {
    const orig = globalThis.fetch.bind(globalThis);
    globalThis.fetch = function (input: any, init: any) {
      const url = typeof input === 'string' ? input : (input?.url) || '';
      const method = ((init?.method) || (input?.method) || 'GET').toUpperCase();
      if (url.includes('/api/generate') && method === 'POST') {
        return new Promise(() => {});
      }
      return orig(input, init);
    } as any;
  });

  await page.locator('.generate-actions').getByRole('button', { name: /^Generate review draft$/i }).click();
  await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'running');
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.complete/i, { timeout: 20_000 });
  await expect(page.locator('[data-testid="generate-step-02"]')).toHaveAttribute('data-state', 'complete');
  await expect(page.locator('[data-testid="generate-step-03"]')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByRole('button', { name: /^Review in Proposals$/i })).toBeEnabled();
});

test('Generate page · sequence init dispatches the pipeline', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  await page.getByRole('button', { name: /Use sample brief/i }).click();
  await page.waitForTimeout(200);
  // The demo-mode fetch shim short-circuits /api POSTs, so we patch fetch
  // AFTER the page loads (re-wrapping the shim itself) to capture the call.
  await page.evaluate(() => {
    // @ts-expect-error window-injected
    globalThis.__seenApiGenerate = [];
    const orig = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async function (input: any, init: any) {
      const url = typeof input === 'string' ? input : (input?.url) || '';
      const method = ((init?.method) || (input?.method) || 'GET').toUpperCase();
      if (url.includes('/api/generate') && method === 'POST') {
        // @ts-expect-error window-injected
        globalThis.__seenApiGenerate.push(url);
      }
      return orig(input, init);
    } as any;
  });
  await page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i }).click();
  await expect(page.locator('.toast').first()).toContainText(/Sequence Initializing/i);
  const seen = await page.evaluate(() => (globalThis as any).__seenApiGenerate || []);
  expect(seen.length, 'POST /api/generate should fire from handleGenerate').toBeGreaterThan(0);
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.start/i);
});

test('Generate page · live console panel mounts', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  const panel = page.locator('.console-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.console-panel__hd')).toContainText(/pipeline\.stream/);
  await expect(panel.locator('[data-testid="console-panel-count"]')).toContainText('0 lines');
  await expect(panel).toContainText(/ready/i);
  await expect(panel).not.toContainText(/stream\.error/i);
  await expect(panel.locator('[data-testid="console-panel-copy"]')).toBeDisabled();
  await expect(panel.locator('[data-testid="console-panel-clear"]')).toBeDisabled();
});

test('Generate page · sequence trace header keeps status controls inside the card', async ({ openConsole, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  const panel = page.locator('.generate-grid .console-panel').first();
  await expect(panel).toBeVisible();

  const headerFits = await panel.evaluate((node) => {
    const panelBox = node.getBoundingClientRect();
    const header = node.querySelector('.console-panel__hd');
    const controls = node.querySelector('.console-panel__hd-right');
    if (!header || !controls) return false;
    const headerBox = header.getBoundingClientRect();
    const controlsBox = controls.getBoundingClientRect();
    const slack = 1;
    return headerBox.left >= panelBox.left - slack
      && headerBox.right <= panelBox.right + slack
      && controlsBox.left >= panelBox.left - slack
      && controlsBox.right <= panelBox.right + slack;
  });
  expect(headerFits, 'trace header controls should wrap instead of clipping at the card edge').toBe(true);
});

test('Generate page · lower draft controls stay reachable on a laptop viewport', async ({ openConsole, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  const editor = page.locator('.generate-brief').first();
  const actions = page.locator('.generate-actions').first();
  const lowerGenerate = actions.getByRole('button', { name: /^Add buyer proof first$/i });

  await expect(editor).toBeVisible();
  await expect(lowerGenerate).toBeVisible();
  await expect(lowerGenerate).toBeDisabled();

  const [editorBox, actionsBox] = await Promise.all([
    editor.boundingBox(),
    actions.boundingBox(),
  ]);
  expect(editorBox, 'buyer brief editor should render').not.toBeNull();
  expect(actionsBox, 'lower generate action row should render').not.toBeNull();

  expect(editorBox!.height, 'brief editor should not consume the whole first viewport').toBeLessThanOrEqual(270);
  expect(actionsBox!.y + actionsBox!.height, 'lower draft controls should be reachable without scrolling at 1280x720').toBeLessThan(720);
});

test('Generate page · local static console starts in DEMO_MODE without a transport error', async ({ page }) => {
  await page.goto('/console/?route=generate', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (globalThis as any).DEMO_MODE)).toBe(true);

  const panel = page.locator('.console-panel');
  await expect(panel.locator('[data-testid="console-panel-count"]')).toContainText('0 lines');
  await expect(panel).toContainText(/ready/i);
  await expect(panel).not.toContainText(/stream\.error/i);
});

test('Generate page · review packet is visible and opens local artifact drawers', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  const reviewCard = page.locator('.generate-review-card');
  await expect(reviewCard).toBeVisible();
  await expect(reviewCard).toContainText(/review packet/i);

  const reviewBox = await reviewCard.boundingBox();
  expect(reviewBox, 'artifact review card should have a rendered box').not.toBeNull();
  expect(reviewBox!.y, 'artifact review should not be buried below the first viewport').toBeLessThan(620);

  await reviewCard.getByRole('button', { name: /PDF/i }).click();
  const drawer = page.getByRole('region', { name: /Proposal artifact review drawer/i });
  await expect(drawer).toBeVisible();
  await expect.poll(
    async () => (await drawer.boundingBox())?.y ?? 9999,
    { timeout: 5_000 },
  ).toBeLessThan(160);
  await expect(drawer).toContainText(/Acme HVAC sample proposal packet/i);
  await expect(drawer.locator('.workflow-popout__title')).not.toContainText(/proposal draft/i);
  await expect(drawer.locator('iframe[title="Sample proposal PDF review preview"]')).toBeVisible();
  await expect(drawer).toContainText(/review packet id/i);
  await expect(drawer.locator('[data-testid="generate-artifact-id"]')).toContainText(/run_acme_hvac/);
  await expect(drawer.locator('[data-testid="generate-artifact-mode"]')).toContainText(/demo sequence/i);
  await expect(drawer.locator('[data-testid="generate-artifact-review-path"]')).toContainText(/Artifact/i);
  await expect(drawer.locator('[data-testid="generate-artifact-review-path"]')).toContainText(/Review/i);
  await expect(drawer.locator('[data-testid="generate-artifact-review-path"]')).toContainText(/Send/i);
  await expect(drawer).toContainText(/Synthetic Acme HVAC review packet/i);
  await expect(drawer).toContainText(/sequence_required/i);
  await expect(drawer.locator('.artifact-drawer__path')).toContainText(/sample-proposal\.pdf/);
  await expect(drawer.getByRole('link', { name: /Open raw artifact/i })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: /Copy review packet ID/i })).toBeVisible();

  await reviewCard.getByRole('button', { name: /source/i }).click();
  await expect(drawer).toContainText(/sample source evidence packet/i);
  const sourceJson = drawer.locator('[data-testid="generate-artifact-source-json"]');
  await expect(sourceJson).toContainText(/blocked_until_operator_review/i);
  await expect(sourceJson).toContainText(/prop_demo_001/i);
  await expect(sourceJson).toContainText(/Acme HVAC — Voice Agent Pilot Proposal/i);
  await expect(sourceJson).not.toContainText(/"client": "Acme HVAC Services"/i);
});

test('Generate page · artifact query opens the sample packet inside the console', async ({ page }) => {
  await page.addInitScript(() => { (globalThis as any).DEMO_MODE = true; });
  await page.goto('/console/?route=generate&artifact=pdf', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });

  await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
  await expect(page).toHaveURL(/\/console\/\?route=generate$/);

  const drawer = page.getByRole('region', { name: /Proposal artifact review drawer/i });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(/Acme HVAC sample proposal packet/i);
  await expect(drawer.locator('.workflow-popout__title')).not.toContainText(/proposal draft/i);
  await expect(drawer).toContainText(/sample packet/i);
  await expect(drawer).toContainText(/sequence_required/i);
  await expect(drawer.locator('iframe[title="Sample proposal PDF review preview"]')).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Open raw artifact/i })).toHaveCount(0);
});

test('Generate page · review path is visible but muted until the draft is ready', async ({ openConsole, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  const reviewCard = page.locator('.generate-review-card');
  const reviewHeader = reviewCard.locator('.card__hd');
  const previewButton = reviewCard.getByRole('button', { name: /PDF/i });
  const sourceButton = reviewCard.getByRole('button', { name: /source/i });
  const reviewButton = reviewHeader.getByRole('button', { name: /^Review in Proposals$/i });
  await expect(reviewButton).toBeDisabled();

  const [previewBox, sourceBox, reviewBox] = await Promise.all([
    previewButton.boundingBox(),
    sourceButton.boundingBox(),
    reviewButton.boundingBox(),
  ]);
  expect(previewBox, 'PDF preview button should render').not.toBeNull();
  expect(sourceBox, 'source inspection button should render').not.toBeNull();
  expect(reviewBox, 'proposal review button should render').not.toBeNull();
  expect(Math.abs(previewBox!.y - sourceBox!.y), 'artifact inspection buttons should share a compact desktop row').toBeLessThan(2);
  expect(reviewBox!.y + reviewBox!.height, 'proposal review path should sit in the card header above artifact inspection actions').toBeLessThan(previewBox!.y);
  expect(reviewBox!.y + reviewBox!.height, 'disabled review CTA should not be clipped at the viewport edge').toBeLessThan(900);

  const coachBox = await page.locator('.coach-launcher').boundingBox();
  expect(coachBox, 'global coach launcher should render').not.toBeNull();
  const overlapsCoach = reviewBox!.x < coachBox!.x + coachBox!.width
    && reviewBox!.x + reviewBox!.width > coachBox!.x
    && reviewBox!.y < coachBox!.y + coachBox!.height
    && reviewBox!.y + reviewBox!.height > coachBox!.y;
  expect(overlapsCoach, 'global coach launcher must not cover the proposal review CTA').toBe(false);

  const disabledStyle = await reviewButton.evaluate((node) => {
    const style = getComputedStyle(node as HTMLElement);
    return {
      backgroundImage: style.backgroundImage,
      cursor: style.cursor,
      opacity: Number(style.opacity),
    };
  });
  expect(disabledStyle.cursor).toBe('not-allowed');
  expect(disabledStyle.backgroundImage).toBe('none');
  expect(disabledStyle.opacity, 'disabled primary CTA should not look like an active orange action').toBeLessThan(0.75);
});

test('Generate page · artifact review card is not cramped at 1280px desktop width', async ({ openConsole, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  const reviewCard = page.locator('.generate-review-card');
  const title = reviewCard.locator('.card__title');
  const reviewButton = reviewCard.getByRole('button', { name: /^Review in Proposals$/i });
  const packet = reviewCard.locator('.artifact-review__packet');
  const coach = page.locator('.coach-launcher');

  const [titleBox, reviewBox, cardBox, packetBox, coachBox] = await Promise.all([
    title.boundingBox(),
    reviewButton.boundingBox(),
    reviewCard.boundingBox(),
    packet.boundingBox(),
    coach.boundingBox(),
  ]);
  expect(titleBox, 'artifact review title should render').not.toBeNull();
  expect(reviewBox, 'proposal review CTA should render').not.toBeNull();
  expect(cardBox, 'artifact review card should render').not.toBeNull();
  expect(packetBox, 'review packet should render').not.toBeNull();
  expect(coachBox, 'global coach launcher should render').not.toBeNull();

  expect(cardBox!.width, 'artifact review card should not be the leftover narrow column').toBeGreaterThanOrEqual(320);
  expect(titleBox!.height, 'artifact review title should stay on one line at desktop width').toBeLessThan(24);
  expect(reviewBox!.x + reviewBox!.width, 'review CTA should stay inside the card header').toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);

  const coachOverlapsPacket = packetBox!.x < coachBox!.x + coachBox!.width
    && packetBox!.x + packetBox!.width > coachBox!.x
    && packetBox!.y < coachBox!.y + coachBox!.height
    && packetBox!.y + packetBox!.height > coachBox!.y;
  expect(coachOverlapsPacket, 'coach launcher should not cover the review packet copy').toBe(false);
});

test('Generate page · artifact inspection controls stay visible before the checklist', async ({ openConsole, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  const reviewCard = page.locator('.generate-review-card');
  const reviewPath = reviewCard.locator('[data-testid="generate-review-path"]');
  const links = reviewCard.locator('.artifact-review__links');
  const quality = reviewCard.locator('.artifact-review__quality');
  await expect(reviewCard.getByRole('button', { name: /Review PDF sample/i })).toBeVisible();
  await expect(reviewCard.getByRole('button', { name: /Inspect sample source/i })).toBeVisible();
  await expect(reviewPath).toContainText(/Local sample preview/i);

  const [reviewPathBox, linksBox, qualityBox] = await Promise.all([
    reviewPath.boundingBox(),
    links.boundingBox(),
    quality.boundingBox(),
  ]);
  expect(reviewPathBox, 'proposal review path should render').not.toBeNull();
  expect(linksBox, 'artifact inspection row should render').not.toBeNull();
  expect(qualityBox, 'artifact quality checklist should render').not.toBeNull();
  expect(reviewPathBox!.y, 'proposal review path should be visible before artifact inspection').toBeLessThan(linksBox!.y);
  expect(reviewPathBox!.y + reviewPathBox!.height, 'proposal review path should stay above the first laptop fold').toBeLessThan(720);
  expect(linksBox!.y, 'PDF/source inspection should appear before the checklist').toBeLessThan(qualityBox!.y);
  expect(linksBox!.y + linksBox!.height, 'artifact inspection row should fit in the first laptop viewport').toBeLessThan(720);
});

test('Generate page · artifact inspection is not buried on short desktop viewports', async ({ openConsole, page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  const reviewCard = page.locator('.generate-review-card');
  const links = reviewCard.locator('.artifact-review__links');
  const packet = reviewCard.locator('.artifact-review__packet');
  await expect(reviewCard.getByRole('button', { name: /Review PDF sample/i })).toBeVisible();
  await expect(reviewCard.getByRole('button', { name: /Inspect sample source/i })).toBeVisible();

  const [linksBox, packetBox] = await Promise.all([
    links.boundingBox(),
    packet.boundingBox(),
  ]);
  expect(linksBox, 'artifact inspection row should render').not.toBeNull();
  expect(packetBox, 'review packet copy should render').not.toBeNull();
  expect(linksBox!.y, 'PDF/source inspection should come before explanatory packet copy').toBeLessThan(packetBox!.y);
  expect(linksBox!.y + linksBox!.height, 'artifact inspection row should fit above the fold at 1280x640').toBeLessThan(640);
});

test('Generate page · mobile keeps the review gate ahead of the long composer and trace', async ({ openConsole, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  const reviewCard = page.locator('.generate-review-card');
  const briefCard = page.locator('.generate-brief-card');
  const traceCard = page.locator('.generate-trace-card');
  const reviewButton = reviewCard.getByRole('button', { name: /^Review in Proposals$/i });
  const coach = page.locator('.coach-launcher');

  const [reviewBox, briefBox, traceBox, reviewButtonBox, coachBox] = await Promise.all([
    reviewCard.boundingBox(),
    briefCard.boundingBox(),
    traceCard.boundingBox(),
    reviewButton.boundingBox(),
    coach.boundingBox(),
  ]);
  expect(reviewBox, 'mobile review gate should render').not.toBeNull();
  expect(briefBox, 'mobile buyer brief should render').not.toBeNull();
  expect(traceBox, 'mobile trace card should render').not.toBeNull();
  expect(reviewButtonBox, 'mobile proposal review CTA should render').not.toBeNull();
  expect(coachBox, 'mobile coach launcher should render').not.toBeNull();

  expect(reviewBox!.y, 'review gate should be visible after the sequence explanation, not buried behind the composer').toBeLessThan(700);
  expect(reviewBox!.y, 'review gate should appear before the long buyer brief composer on mobile').toBeLessThan(briefBox!.y);
  expect(briefBox!.y, 'buyer brief should appear before the trace stream on mobile').toBeLessThan(traceBox!.y);
  expect(reviewButtonBox!.y + reviewButtonBox!.height, 'disabled review CTA should be visible in the first mobile viewport').toBeLessThan(844);

  const coachOverlapsReview = reviewBox!.x < coachBox!.x + coachBox!.width
    && reviewBox!.x + reviewBox!.width > coachBox!.x
    && reviewBox!.y < coachBox!.y + coachBox!.height
    && reviewBox!.y + reviewBox!.height > coachBox!.y;
  expect(coachOverlapsReview, 'mobile coach launcher should stay in the rail instead of covering the review gate').toBe(false);
});

test('Generate page · locked mobile review gate jumps to buyer proof', async ({ openConsole, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  const reviewCard = page.locator('.generate-review-card');
  const jumpButton = reviewCard.getByRole('button', { name: /Add buyer proof/i });
  const textarea = page.locator('.generate-brief').first();
  await expect(jumpButton).toBeVisible();

  const startingScroll = await page.evaluate(() => document.querySelector('main.scroll')?.scrollTop || 0);
  await jumpButton.click();
  await expect(textarea).toBeFocused();
  await expect.poll(
    async () => page.evaluate(() => document.querySelector('main.scroll')?.scrollTop || 0),
    { timeout: 5_000 },
  ).toBeGreaterThan(startingScroll + 100);

  await expect.poll(
    async () => textarea.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0));
    }),
    { timeout: 5_000 },
  ).toBeGreaterThan(120);
});

test('Generate page · coach launcher does not cover the review packet on short desktop viewports', async ({ openConsole, page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  await expect(page.locator('html')).toHaveAttribute('data-console-route', 'generate');
  const packet = page.locator('.artifact-review__packet');
  const coach = page.locator('.coach-launcher');
  await expect(packet).toBeVisible();
  await expect(coach).toBeVisible();

  const [packetBox, coachBox] = await Promise.all([
    packet.boundingBox(),
    coach.boundingBox(),
  ]);
  expect(packetBox, 'review packet should render').not.toBeNull();
  expect(coachBox, 'coach launcher should render').not.toBeNull();

  const overlapsPacket = packetBox!.x < coachBox!.x + coachBox!.width
    && packetBox!.x + packetBox!.width > coachBox!.x
    && packetBox!.y < coachBox!.y + coachBox!.height
    && packetBox!.y + packetBox!.height > coachBox!.y;
  expect(overlapsPacket, 'global coach launcher must not cover the Generate review packet on laptop-height viewports').toBe(false);
});

test('Generate page · DEMO_MODE streams a canned pipeline trace and resets the button', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  await page.getByRole('button', { name: /Use sample brief/i }).click();
  await page.waitForTimeout(150);
  const initBtn = page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i });
  await initBtn.click();
  // Button switches while the canned trace replays.
  await expect(page.locator('.ph__actions').getByRole('button', { name: /Generating draft/i })).toBeVisible({ timeout: 1000 });
  // The canned trace should produce visible OK lines in the console panel —
  // at least the three from the demo stream (enrichment.icp, audit.signed,
  // pipeline.done). New events (request.response 200, pipeline.complete)
  // may add more; assert a lower bound, not equality.
  await expect.poll(
    async () => page.locator('.console-panel .cl-ok').count(),
    { timeout: 10_000 },
  ).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i);
  await expect(page.locator('.console-panel')).toContainText(/request\.response: HTTP 200/i);
  await expect(page.locator('.console-panel')).toContainText(/request\.posting: POST \/api\/generate/i);
  await expect(page.locator('.console-panel__status')).toContainText(/complete/i, { timeout: 20_000 });
  // Button resets with honest copy: the next click replaces the ready draft.
  await expect(page.locator('.ph__actions').getByRole('button', { name: /^Regenerate review draft$/i })).toBeVisible({ timeout: 5000 });
  // Final confirmation toast.
  await expect(page.locator('.toast').first()).toContainText(/Proposal generated/i);
});

test('Generate page · regenerating closes stale artifact drawers while the new sequence runs', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  await page.getByRole('button', { name: /Use sample brief/i }).click();

  await page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i }).click();
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, { timeout: 10_000 });
  await expect(page.locator('.ph__actions').getByRole('button', { name: /^Regenerate review draft$/i })).toBeVisible();

  await page.locator('.generate-review-card').getByRole('button', { name: /Inspect draft source/i }).click();
  await expect(page.getByRole('region', { name: /Proposal artifact review drawer/i })).toBeVisible();

  await page.locator('.ph__actions').getByRole('button', { name: /^Regenerate review draft$/i }).click();

  await expect(page.getByRole('region', { name: /Proposal artifact review drawer/i })).toHaveCount(0);
  await expect(page.locator('.generate-review-card')).toContainText(/Run the sequence to unlock the proposal review gate/i);
  await expect(page.locator('.generate-review-card').getByRole('button', { name: /^Review in Proposals$/i })).toBeDisabled();
  await expect(page.locator('.ph__actions').getByRole('button', { name: /^Generating draft$/i })).toBeVisible();
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.start/i);
});

test('Generate page · editing buyer proof after draft ready locks stale review artifacts', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  await page.getByRole('button', { name: /Use sample brief/i }).click();

  const reviewCard = page.locator('.generate-review-card');
  const reviewButton = reviewCard.getByRole('button', { name: /^Review in Proposals$/i });
  await page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i }).click();
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, { timeout: 10_000 });
  await expect(reviewButton).toBeEnabled({ timeout: 5_000 });

  await reviewCard.getByRole('button', { name: /Inspect draft source/i }).click();
  await expect(page.getByRole('region', { name: /Proposal artifact review drawer/i })).toBeVisible();

  const textarea = page.locator('.generate-brief').first();
  const existingBrief = await textarea.inputValue();
  await textarea.fill(`${existingBrief}\n\nNEW BUYER PROOF: CFO requested a revised security appendix before approval.`);

  await expect(page.getByRole('region', { name: /Proposal artifact review drawer/i })).toHaveCount(0);
  await expect(reviewButton).toBeDisabled();
  await expect(reviewCard).toContainText(/Run the sequence to unlock the proposal review gate/i);
  await expect(reviewCard.getByRole('button', { name: /Review PDF sample/i })).toBeVisible();
  await expect(page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i })).toBeVisible();
  await expect(page.locator('.toast').first()).toContainText(/Draft review reset/i);
});

test('Generate page · completed draft routes to proposal review', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  await page.getByRole('button', { name: /Use sample brief/i }).click();

  const reviewButton = page.locator('.generate-review-card').getByRole('button', { name: /^Review in Proposals$/i });
  await expect(reviewButton).toBeDisabled();

  await page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i }).click();
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, { timeout: 10_000 });
  await expect(reviewButton).toBeEnabled({ timeout: 5_000 });
  await expect(page.locator('.generate-review-card').getByRole('button', { name: /Preview draft PDF/i })).toBeVisible();
  await page.locator('.generate-review-card').getByRole('button', { name: /Preview draft PDF/i }).click();
  const drawer = page.getByRole('region', { name: /Proposal artifact review drawer/i });
  await expect(drawer.locator('iframe[title="Generated proposal PDF review preview"]')).toBeVisible();
  await expect(drawer.locator('[data-testid="generate-artifact-mode"]')).toContainText(/demo sequence/i);
  await expect(drawer).toContainText(/Demo-generated Acme HVAC packet/i);
  await page.getByRole('button', { name: /Close proposal artifact review drawer/i }).click();
  await page.locator('.generate-review-card').getByRole('button', { name: /Inspect draft source/i }).click();
  await expect(drawer).toContainText(/operator_review/i);
  await expect(drawer).toContainText(/Demo evidence bundle/i);
  const sourceJson = drawer.locator('[data-testid="generate-artifact-source-json"]');
  await expect(sourceJson).toContainText(/prop_demo_001/i);
  await expect(sourceJson).toContainText(/"_demo_note"/i);
  await reviewButton.click();

  await expect(page.locator('.tb__crumb--active')).toContainText(/Proposals/i);
  await expect(page.locator('.ph__title').first()).toContainText(/Proposals/i);
  await expect(page.locator('.card__title').filter({ hasText: /detail/i }).first()).toContainText(/acme|PR-2041/i);
});

test('Proposals page · normal nav keeps the detail pane aligned with the visible list', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Proposals")').first().click();

  const firstProposal = await page.evaluate(() => {
    const first = (globalThis as any).GTM.proposals[0];
    return { id: first.id, co: first.co };
  });
  const firstRow = page.locator('[data-testid="proposal-row"]').first();
  const detailCard = page.locator('.split--2 > .vstack > .card').first();

  await expect(firstRow).toHaveAttribute('data-active', 'true');
  await expect(firstRow).toContainText(firstProposal.id);
  await expect(detailCard.locator('.card__title')).toContainText(firstProposal.id);
  await expect(detailCard).toContainText(firstProposal.co);

  await page.locator('[data-testid="proposal-row"]').filter({ hasText: /acme-hvac-r3/i }).first().click();
  await expect(detailCard).toContainText(/Acme HVAC Services/i);
  await page.locator('.ph__actions').getByRole('button', { name: /^Open$/i }).click();
  await expect(page.locator('[data-testid="proposal-row"][data-active="true"]')).not.toContainText(/acme-hvac-r3/i);
  await expect(detailCard).not.toContainText(/Acme HVAC Services/i);
});

test('Generate proposal v3 from Calls carries call metadata into Generate, pre-fills the brief, shows the handoff banner', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Calls")').first().click();

  // Capture the active call from the GTM fixture so the assertions mirror real data.
  const activeCall = await page.evaluate(() => {
    const D = (globalThis as any).GTM;
    const ctx = (globalThis as any).AppContext.get();
    const id = ctx?.selection?.type === 'call' ? ctx.selection.id : 'CALL-2419';
    return (D.calls || []).find((c: any) => c.id === id) || (D.calls || [])[0];
  });
  expect(activeCall.id).toBeTruthy();
  expect(activeCall.co).toBeTruthy();

  await page.locator('[data-testid="call-generate-proposal-v3"]').click();

  // The control should do navigation and state handoff, not a toast-only signal.
  await expect(page.locator('.toast', { hasText: new RegExp(`Proposal v3 generator opened · ${activeCall.id}`) })).toHaveCount(0);

  // Land on Generate; the handoff banner names the call.
  await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
  const banner = page.locator('[data-testid="generate-proposal-v3-banner"]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(new RegExp(`Generating proposal v3 from ${activeCall.id}`));
  await expect(banner).toContainText(new RegExp(activeCall.co));
  const summary = page.locator('[data-testid="generate-proposal-v3-summary"]');
  await expect(summary).toContainText(new RegExp(activeCall.outcome));

  // Brief textarea pre-filled with the call context.
  const brief = page.locator('.generate-brief');
  const briefValue = (await brief.inputValue()).trim();
  expect(briefValue).toContain(activeCall.id);
  expect(briefValue).toContain(activeCall.co);
  expect(briefValue).toContain(activeCall.outcome);
  expect(briefValue).toMatch(/Call signal/i);

  // Dismiss banner removes it without clearing the textarea.
  await page.locator('[data-testid="generate-proposal-v3-dismiss"]').click();
  await expect(banner).toHaveCount(0);
  expect((await brief.inputValue()).length).toBeGreaterThan(0);
});

test('Address blockers is disabled on a zero-blocker proposal — no fake toast-only operation', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Proposals")').first().click();
  // Find a proposal that ships with NO blockers — PR-2040 (Verdant) and PR-2038 (Thornfield) qualify.
  const target = await page.evaluate(() => {
    const proposals = ((globalThis as any).GTM.proposals || []) as Array<{ id: string; co: string; blockers?: string[] }>;
    return proposals.find(p => !Array.isArray(p.blockers) || p.blockers.length === 0);
  });
  if (!target) return; // Every proposal has blockers — nothing to test.
  await page.locator('.inspectable[role="button"]').filter({ hasText: target.id }).first().click();

  // Button should be a real disabled control, not a clickable action that
  // only produces a toast.
  const btn = page.locator('[data-testid="proposal-address-blockers"]');
  await expect(btn).toHaveAttribute('data-blocker-count', '0');
  await expect(btn).toBeDisabled();
  await expect(btn).toContainText(/^No blockers to address$/);
  await expect(page.locator('.toast', { hasText: new RegExp(`${target.id} has no open blockers`) })).toHaveCount(0);

  await page.locator('.card:has(.card__title:has-text("detail")) .btn:has-text("Review packet")').click();
  const reviewPanel = page.locator('[data-testid="proposal-review-panel"]');
  await expect(reviewPanel).toBeVisible();
  const reviewHandoff = reviewPanel.locator('[data-testid="proposal-review-address-blockers"]');
  await expect(reviewHandoff).toHaveAttribute('data-blocker-count', '0');
  await expect(reviewHandoff).toBeDisabled();
  await expect(reviewHandoff).toContainText(/^No blockers to address$/);

  await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
  await expect(page.locator('[data-testid="generate-address-blockers-banner"]')).toHaveCount(0);
});

test('Address blockers from Proposals carries the blocker list into Generate, pre-fills the brief, shows the handoff banner', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Proposals")').first().click();

  // Pick a proposal that has blockers — PR-2041 (Banyan) ships with ['Liability cap', 'Auto-renewal'].
  await page.locator('.inspectable[role="button"]').filter({ hasText: 'PR-2041' }).first().click();

  const liveBlockers = await page.evaluate(() => {
    const D = (globalThis as any).GTM;
    const p = (D.proposals || []).find((x: any) => x.id === 'PR-2041');
    return Array.isArray(p?.blockers) ? p.blockers : [];
  });
  expect(liveBlockers.length).toBeGreaterThan(0);

  await page.locator('[data-testid="proposal-address-blockers"]').click();

  // The control should move directly into the Generate handoff banner.
  await expect(page.locator('.toast', { hasText: /Drafting PR-2041 v-next/i })).toHaveCount(0);
  await expect(page.locator('.toast', { hasText: new RegExp(`${liveBlockers.length} blocker`) })).toHaveCount(0);

  // Land on Generate; the handoff banner names the proposal and lists each blocker.
  await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
  const banner = page.locator('[data-testid="generate-address-blockers-banner"]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/Addressing blockers from PR-2041/);
  for (const b of liveBlockers) {
    await expect(banner.locator('[data-testid="generate-address-blockers-list"]')).toContainText(b);
  }

  // Brief textarea is pre-filled with the blocker context — proves the click delivered, not just navigated.
  const brief = page.locator('.generate-brief');
  const briefValue = (await brief.inputValue()).trim();
  expect(briefValue).toContain('PR-2041');
  for (const b of liveBlockers) {
    expect(briefValue).toContain(b);
  }
  expect(briefValue).toMatch(/OUTSTANDING BLOCKERS/i);

  // Dismiss banner removes it without clearing the textarea.
  await page.locator('[data-testid="generate-address-blockers-dismiss"]').click();
  await expect(banner).toHaveCount(0);
  expect((await brief.inputValue()).length).toBeGreaterThan(0);
});

test('Address blockers handoff banner auto-clears once the review draft is ready — no stale handoff label after the work is done', async ({ openConsole }) => {
  const page = await openConsole();
  // Trigger the handoff from Proposals → Generate.
  await page.locator('.sb__item:has-text("Proposals")').first().click();
  await page.locator('.inspectable[role="button"]').filter({ hasText: 'PR-2041' }).first().click();
  await page.locator('[data-testid="proposal-address-blockers"]').click();

  // Land on Generate with the banner visible — handoff is fresh.
  await expect(page.locator('.tb__crumb--active')).toContainText('Generate');
  const banner = page.locator('[data-testid="generate-address-blockers-banner"]');
  await expect(banner).toBeVisible();

  // Run the demo pipeline; once it completes, reviewReady becomes true
  // and the handoff banner should auto-clear (the operator's brief is no
  // longer just-a-handoff — they've produced a draft from it).
  await page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i }).click();
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, { timeout: 10_000 });
  await expect(banner).toHaveCount(0);
});

test('Review in Proposals routes to the proposal whose buyer matches the most recent handoff — not the hardcoded Acme/Banyan default', async ({ openConsole }) => {
  const page = await openConsole();
  // Trigger the address-blockers handoff from PR-2041 (Banyan). The
  // hardcoded fallback in the previous version would also land on PR-2041
  // because Acme isn't in the seed proposals — making this test pass for
  // the wrong reason. So we explicitly pick a NON-Acme buyer (Banyan)
  // and verify the routing follows the handoff.
  await page.locator('.sb__item:has-text("Proposals")').first().click();
  await page.locator('.inspectable[role="button"]').filter({ hasText: 'PR-2041' }).first().click();
  await page.locator('[data-testid="proposal-address-blockers"]').click();
  await expect(page.locator('.tb__crumb--active')).toContainText('Generate');

  // Run the demo pipeline so reviewReady becomes true and the handoff
  // banner auto-clears (per the prior fix). The lastHandoffRef should
  // still hold the PR-2041/Banyan context.
  await page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i }).click();
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, { timeout: 10_000 });

  // Click Review in Proposals — should route to PR-2041 (the handoff
  // origin) because the lastHandoffRef survived the banner auto-clear.
  await page.locator('.generate-review-card').getByRole('button', { name: /^Review in Proposals$/i }).click();
  await expect(page.locator('.tb__crumb--active')).toContainText('Proposals');
  const detailCard = page.locator('.split--2 > .vstack > .card').first();
  await expect(detailCard.locator('.card__title')).toContainText('PR-2041');
  await expect(detailCard).toContainText(/Banyan/i);
});

test('Generate page · lower Generate review draft button streams immediately', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  await page.getByRole('button', { name: /Use sample brief/i }).click();
  await page.waitForTimeout(150);
  await page.locator('.generate-actions').getByRole('button', { name: /^Generate review draft$/i }).click();
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.start/i);
  await expect(page.locator('.console-panel')).toContainText(/intake\.received/i, { timeout: 3000 });
});

test('Generate page · ConsolePanel surfaces the full pipeline log with scrollable body, line count, copy + clear', async ({ openConsole, context }) => {
  // Clipboard read needs a permission grant; copy still works without it
  // (it just falls through to the toast assertion).
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();
  await page.getByRole('button', { name: /Use sample brief/i }).click();
  await page.waitForTimeout(120);

  const panel = page.locator('.generate-grid .console-panel');
  const body = panel.locator('[data-testid="console-panel-body"]');

  // Body is a real scrollable region with role="log" so screen readers see it.
  await expect(body).toHaveAttribute('role', 'log');
  await expect(body).toHaveAttribute('aria-live', 'polite');
  const overflowY = await body.evaluate((el) => getComputedStyle(el as HTMLElement).overflowY);
  expect(overflowY).toBe('auto');

  // Copy / Clear are disabled when the panel has no lines.
  const copyBtn = panel.locator('[data-testid="console-panel-copy"]');
  const clearBtn = panel.locator('[data-testid="console-panel-clear"]');
  await expect(copyBtn).toBeDisabled();
  await expect(clearBtn).toBeDisabled();

  await page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i }).click();

  // Expanded surface shows the new request envelope events the user
  // previously couldn't see at all.
  await expect(panel).toContainText(/pipeline\.start/i, { timeout: 5000 });
  await expect(panel).toContainText(/request\.posting: POST \/api\/generate/i, { timeout: 5000 });
  await expect(panel).toContainText(/request\.response: HTTP 200/i, { timeout: 5000 });
  await expect(panel).toContainText(/pipeline\.done/i, { timeout: 20_000 });
  await expect(panel).toContainText(/pipeline\.complete: artifact_id=run_acme_hvac/i, { timeout: 20_000 });

  // Line count >= 14 (1 start + 1 posting + 1 response + 11 demo + 1 complete).
  const count = await panel.locator('[data-testid="console-panel-count"]').textContent();
  expect(parseInt((count || '0').trim(), 10)).toBeGreaterThanOrEqual(14);

  // Copy is now enabled and toasts a confirmation including the line count.
  await expect(copyBtn).toBeEnabled();
  await copyBtn.click();
  await expect(page.locator('.toast', { hasText: /Log copied to clipboard/i })).toBeVisible();

  // Clear empties the panel and disables the buttons again.
  await clearBtn.click();
  await expect(panel).not.toContainText(/pipeline\.start/i);
  await expect(copyBtn).toBeDisabled();
});

test('Generate page · per-step log feed reveals 11 stepIds of fixture entries on completion', async ({ openConsole }) => {
  const page = await openConsole();
  await page.locator('.sb__item:has-text("Generate")').first().click();

  const feed = page.locator('[data-testid="generate-log-feed"]');
  await expect(feed).toBeVisible();
  await expect(page.locator('[data-testid="generate-log-feed-empty"]')).toBeVisible();
  await expect(page.locator('[data-testid="generate-log-feed-status"]')).toContainText(/awaiting sequence start/i);

  await page.getByRole('button', { name: /Use sample brief/i }).click();
  await page.locator('.ph__actions').getByRole('button', { name: /^Generate review draft$/i }).click();

  // Wait for the demo replay to finish so every stepId has been activated.
  await expect(page.locator('.console-panel')).toContainText(/pipeline\.done/i, { timeout: 20_000 });

  const lines = page.locator('[data-testid="generate-log-feed-line"]');
  await expect.poll(async () => lines.count(), { timeout: 5_000 }).toBeGreaterThanOrEqual(11);

  const stepIds = await lines.evaluateAll(nodes =>
    Array.from(new Set(nodes.map(n => (n as HTMLElement).getAttribute('data-step-id') || ''))).filter(Boolean),
  );
  expect(stepIds.length, `expected 11 distinct stepIds covered by the feed, saw [${stepIds.join(', ')}]`).toBe(11);
  await expect(page.locator('[data-testid="generate-log-feed-status"]')).toContainText(/streaming · step pipeline\.done/i);
});
