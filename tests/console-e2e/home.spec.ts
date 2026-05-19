import {test, expect, seriousAxeViolations} from './helpers.js';

test('home · command center, range, refresh, and a11y baseline', async ({openConsole}) => {
  const page = await openConsole();

  await expect(page.locator('.page--home')).toBeVisible({timeout: 5000});
  await expect(page.getByTestId('home-command-center')).toBeVisible();
  await expect(page.getByTestId('home-command-center')).toContainText('missed calls today');
  await expect(page.getByTestId('home-command-center')).not.toContainText(/eval risk/i);
  await expect(page.getByTestId('home-command-center')).not.toContainText(/operator landing\s+surface/i);
  await expect(page.getByTestId('mission-stats')).toHaveAttribute('data-range', 'today');

  await page.getByRole('button', {name: /^7D$/i}).click();
  await expect(page.getByTestId('mission-stats')).toHaveAttribute('data-range', 'week');

  const refresh = page.getByTestId('mission-refresh');
  await refresh.click();
  await expect(refresh).toHaveAttribute('data-refreshing', 'true');
  await expect(refresh).toBeDisabled();
  await expect(refresh).toHaveAttribute('data-refreshing', 'false', {timeout: 2500});
  await expect(refresh).toBeEnabled();

  const violations = await seriousAxeViolations(page);
  expect(violations).toEqual([]);
});

test('home · command strip KPI labels are readable, not mystery ellipses', async ({openConsole, page}) => {
  await page.setViewportSize({width: 1280, height: 720});
  await openConsole();

  const facts = page.locator('.home-command-strip__facts .home-fact');
  await expect(facts).toHaveCount(5);
  await expect(facts.nth(1)).toContainText(/missed today/i);
  await expect(facts.nth(4)).toContainText(/returned <1h/i);

  const layout = await facts.evaluateAll(nodes => nodes.map(node => {
    const label = node.querySelector('span');
    const value = node.querySelector('strong');
    const box = node.getBoundingClientRect();
    return {
      labelFits: Boolean(label && label.scrollWidth <= label.clientWidth + 1),
      valueFits: Boolean(value && value.scrollWidth <= value.clientWidth + 1),
      width: box.width,
    };
  }));
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(horizontalOverflow, 'command-strip facts should not create page-level horizontal scroll').toBe(false);

  for (const item of layout) {
    expect(item.labelFits, `command-strip label clipped: ${JSON.stringify(item)}`).toBe(true);
    expect(item.valueFits, `command-strip value clipped: ${JSON.stringify(item)}`).toBe(true);
    expect(item.width, 'fact chip should have enough width for operator-facing labels').toBeGreaterThanOrEqual(96);
  }
});

test('home · KPI sparklines inspect the visible callback count, not a generic fixture total', async ({openConsole}) => {
  const page = await openConsole();

  const waitingStat = page.getByTestId('mission-stats').locator('.stat', {hasText: /^Waiting on you/}).first();
  await expect(waitingStat.locator('.stat__value')).toHaveText('2');

  const spark = waitingStat.locator('.spark-wrap');
  await spark.focus();
  const tooltip = spark.getByTestId('sparkline-tooltip');
  await expect(tooltip).toContainText(/Waiting on you trend/i);
  await expect(tooltip).toContainText(/hour · latest: 2 ·/i);
  await expect(tooltip).not.toContainText(/latest: 11/i);

  const latestPointLabel = await spark.locator('.spark-point').last().getAttribute('data-point-label');
  expect(latestPointLabel).toContain('hour · latest: 2');

  await page.keyboard.press('Home');
  await expect(tooltip).toContainText(/hours ago/i);
  await expect(tooltip).toContainText(/baseline/i);
});

test('home · attention snooze removes the active alert and exposes a restore button', async ({openConsole}) => {
  const page = await openConsole();

  const banner = page.getByTestId('attention-banner');
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('button', {name: /^snooze 1h$/i})).toBeEnabled();
  await expect(banner.getByRole('button', {name: /review now/i})).toBeEnabled();

  await page.getByTestId('attention-snooze-1h').click();
  await expect(page.getByTestId('attention-banner')).toHaveCount(0);
  const snoozed = page.getByTestId('attention-snoozed');
  await expect(snoozed).toBeVisible();
  await expect(snoozed.getByRole('button', {name: /^restore$/i})).toBeEnabled();

  await page.getByTestId('attention-unsnooze').click();
  await expect(page.getByTestId('attention-banner')).toBeVisible();
});

test('home · attention banner distinguishes handoffs from missed-call callbacks', async ({openConsole}) => {
  const page = await openConsole();

  const live = await page.evaluate(() => {
    const D = (globalThis as any).GTM;
    const pausedAgent = (D.agents || []).find((a: any) => a.status === 'paused');
    if (!pausedAgent) return null;
    const taskBlob = String(pausedAgent.currentTask || '').toLowerCase();
    const calls = (D.calls || []) as Array<any>;
    const matchedCall
      = calls.find(c => c.co_id && taskBlob.includes(String(c.co_id).toLowerCase()))
        || calls.find(c => c.co && taskBlob.includes(String(c.co).toLowerCase().split(' ')[0]))
        || calls.slice().sort((a, b) => (Number(b.flags || 0) + Number(b.deflections || 0)) - (Number(a.flags || 0) + Number(a.deflections || 0)))[0];
    const outcome = String(matchedCall?.outcome || '').toLowerCase();
    return {
      agentName: pausedAgent.name,
      callId: matchedCall?.id,
      companyName: matchedCall?.co,
      deflections: Number(matchedCall?.deflections || 0),
      flags: Number(matchedCall?.flags || 0),
      isMissed: matchedCall?.missed === true || ['voicemail', 'no-answer', 'dropped', 'missed'].includes(outcome),
      outcome: outcome.replace(/[-_]/g, ' '),
    };
  });

  if (!live) {
    await expect(page.getByTestId('attention-banner')).toHaveCount(0);
    return;
  }

  const banner = page.getByTestId('attention-banner');
  await expect(banner).toContainText(live.companyName);
  await expect(banner).toContainText(live.callId);

  if (live.isMissed) {
    await expect(banner).toContainText(/needs callback/i);
    await expect(banner).toContainText(/waiting on a callback/i);
    return;
  }

  await expect(banner).toContainText(/needs human review/i);
  await expect(banner).toContainText(live.agentName);
  await expect(banner).toContainText(new RegExp(`${live.deflections} handoff tr(?:y|ies)`, 'i'));
  await expect(banner).toContainText(new RegExp(`${live.flags} flags?`, 'i'));
  await expect(banner).not.toContainText(/receptionist (?:took|captured) a message/i);
  await expect(banner).not.toContainText(/waiting on a callback/i);

  await page.getByTestId('attention-snooze-1h').click();
  await expect(page.locator('.toast').first()).toContainText(/handoff snoozed · 1h/i);
  await expect(page.getByTestId('attention-snoozed')).toContainText(/handoff snoozed/i);
});

test('home · keyboard opening a recovery case routes to local evidence', async ({openConsole}) => {
  const page = await openConsole();

  const firstCase = page.getByTestId('recovery-case-row').first();
  const caseType = await firstCase.getAttribute('data-case-type');
  await firstCase.focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('.tb__crumb--active')).toContainText(caseType === 'proposal' ? 'Proposals' : 'Calls', {timeout: 5000});
  await expect.poll(async () => page.evaluate(() => (globalThis as any).AppContext.get().selection?.type)).toBe(caseType === 'proposal' ? 'proposal' : 'call');
});

test('home · call-back queue label and header action are sourced from missed calls', async ({openConsole}) => {
  const page = await openConsole();

  const queue = page.locator('.home-card--agents');
  await expect(queue.locator('.card__title')).toContainText(/missed .* call them back/i);
  await expect(queue.locator('.card__title')).not.toContainText(/callbacks due/i);
  await expect(queue.getByTestId('recovery-case-row').first()).toContainText(/voicemail|no answer|dropped|repair|leak/i);

  const firstCase = queue.getByTestId('recovery-case-row').first();
  const caseType = await firstCase.getAttribute('data-case-type');
  const caseId = await firstCase.getAttribute('data-case-id');

  await queue.getByRole('button', {name: /^open next/i}).click();
  await expect(page.locator('.tb__crumb--active')).toContainText('Calls', {timeout: 5000});
  const ctx = await page.evaluate(() => (globalThis as any).AppContext.get());
  expect(caseType).toBe('call');
  expect(ctx.selection).toEqual({type: 'call', id: caseId});
  expect(ctx.extra.triggered_from).toBe('today-recovery-next');
  await expect(page.getByTestId('call-human-review-panel')).toBeVisible();
});
