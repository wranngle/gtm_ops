/**
 * UI action coverage — catches visible controls that click successfully but do
 * not do anything observable. This complements smoke-click: smoke-click guards
 * against crashes; this spec guards against fake/dead affordances.
 */
import { type Page } from '@playwright/test';
import { test, expect } from './helpers.js';

const ROUTES = ['home', 'generate', 'pipeline', 'calls', 'proposals', 'evals', 'agents', 'settings'] as const;

const ROUTE_LABELS: Record<(typeof ROUTES)[number], string> = {
  home: 'Mission Control',
  generate: 'Generate',
  pipeline: 'Pipeline',
  calls: 'Calls',
  proposals: 'Proposals',
  evals: 'Evals',
  agents: 'Agents',
  settings: 'Settings',
};

const ACTIONABLE_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="menuitem"]',
].join(',');

type ActionTarget = {
  index: number;
  probeId: string;
  tag: string;
  role: string;
  name: string;
  group: string;
  href: string;
  active: boolean;
  disabled: boolean;
  formControl: boolean;
};

type ResolvedActionTarget = {
  target: ActionTarget;
  locator: ReturnType<Page['locator']>;
};

function normalizeActionName(name: string) {
  return name
    .replace(/\s+/g, ' ')
    .replace(/\bCALL-\d+\b.*$/u, 'CALL-* row')
    .replace(/\bPR-\d+\b.*$/u, 'PR-* row')
    .replace(/^Open .+ in pipeline$/u, 'Open lead in pipeline')
    .replace(/^Add coaching note at .+$/u, 'Add coaching note')
    .replace(/^Re-run .+$/u, 'Re-run eval suite')
    .trim();
}

async function goToRoute(page: Page, route: (typeof ROUTES)[number]) {
  if (await page.locator('.app').count() === 0) {
    await page.goto('/console/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('.app')), null, { timeout: 30_000 });
  }

  await page.keyboard.press('Escape').catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});

  const currentRoute = await page.evaluate(() => (globalThis as any).AppContext?.get?.().route || 'home');
  if (currentRoute !== route) {
    const label = ROUTE_LABELS[route].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const routeButton = page.getByRole('link', { name: new RegExp(`^${label}(?:\\s+\\d+)?$`, 'i') }).first();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await routeButton.click({ timeout: 5_000 });
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await page.waitForTimeout(150);
      }
    }
    await expect.poll(async () => page.evaluate(() => (globalThis as any).AppContext?.get?.().route || 'home')).toBe(route);
  }

  await page.waitForTimeout(150);
  await page.evaluate(() => {
    if ((globalThis as any).__uiActionFetchWrapped) return;
    (globalThis as any).__uiActionEvents = [];
    const originalFetch = globalThis.fetch.bind(globalThis);
    (globalThis as any).fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      (globalThis as any).__uiActionEvents.push(`${method} ${url}`);
      return originalFetch(input, init);
    };
    (globalThis as any).__uiActionFetchWrapped = true;
  });
}

async function visibleActionTargets(page: Page): Promise<ActionTarget[]> {
  const rawTargets = await page.locator(ACTIONABLE_SELECTOR).evaluateAll((elements: Element[]) => {
    const isVisible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (element: Element) => {
      const input = element as HTMLInputElement;
      const pieces = [
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('placeholder'),
        input.value && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') ? input.value : '',
        (element as HTMLElement).innerText,
        element.textContent,
        element.getAttribute('href'),
      ];
      return pieces.find(piece => piece && piece.trim())?.trim().replace(/\s+/g, ' ') || element.tagName.toLowerCase();
    };

    return elements
      .map((element, index) => {
        const probeId = element.getAttribute('data-ui-action-probe') || `probe-${index}-${Math.random().toString(36).slice(2)}`;
        element.setAttribute('data-ui-action-probe', probeId);
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute('role') || '';
        const href = element.getAttribute('href') || '';
        const active =
          element.getAttribute('aria-current') === 'page' ||
          element.getAttribute('aria-pressed') === 'true' ||
          element.getAttribute('aria-selected') === 'true' ||
          element.getAttribute('data-active') === 'true';
        const disabled =
          element.hasAttribute('disabled') ||
          element.getAttribute('aria-disabled') === 'true';
        return {
          index,
          probeId,
          tag,
          role,
          name: labelFor(element),
          href,
          active,
          disabled,
          formControl: ['input', 'select', 'textarea'].includes(tag),
          visible: isVisible(element),
          ignored:
            Boolean(element.closest('.coach-launcher')) ||
            Boolean(element.closest('elevenlabs-convai')) ||
            Boolean(element.closest('.twk-btn, .twk-toggle, .twk-x')),
        };
      })
      .filter((target: { visible: boolean; ignored: boolean }) => target.visible && !target.ignored);
  }) as Array<Omit<ActionTarget, 'group'> & { visible: boolean; ignored: boolean }>;

  return rawTargets.map(target => ({
    ...target,
    group: `${target.role || target.tag}:${normalizeActionName(target.name)}`,
  }));
}

async function actionFingerprint(page: Page) {
  return page.evaluate((selector: string) => {
    const normalizeText = (text: string) => text
      .replace(/\d{2}:\d{2}:\d{2}/gu, 'TIME')
      .replace(/\d{13,}/gu, 'ID')
      .replace(/\s+/gu, ' ')
      .trim();
    const controlState = Array.from(document.querySelectorAll(selector)).map(element => {
      const input = element as HTMLInputElement;
      const label = [
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        (element as HTMLElement).innerText,
        element.textContent,
      ].find(Boolean) || element.tagName.toLowerCase();
      const inputType = element.tagName === 'INPUT' ? (input.type || '').toLowerCase() : '';
      const isToggle = inputType === 'checkbox' || inputType === 'radio';
      return [
        element.tagName.toLowerCase(),
        String(label).trim().replace(/\s+/g, ' '),
        element.getAttribute('aria-current') || '',
        element.getAttribute('aria-pressed') || '',
        element.getAttribute('aria-selected') || '',
        element.getAttribute('aria-expanded') || '',
        element.getAttribute('data-active') || '',
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) ? input.value : '',
        // Checkbox/radio toggles only flip `checked` — `value` is constant —
        // so probing them was being mis-flagged as "no observable effect".
        isToggle ? (input.checked ? 'checked' : 'unchecked') : '',
      ].join('|');
    });

    return JSON.stringify({
      href: location.href,
      route: (globalThis as any).AppContext?.get?.().route || null,
      selection: (globalThis as any).AppContext?.get?.().selection || null,
      theme: document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || localStorage.getItem('gtm-theme') || '',
      controls: controlState,
      text: normalizeText(document.body.innerText || ''),
      events: (globalThis as any).__uiActionEvents || [],
    });
  }, ACTIONABLE_SELECTOR);
}

async function resolveActionTarget(page: Page, target: ActionTarget): Promise<ResolvedActionTarget | null> {
  const locator = page.locator(`[data-ui-action-probe="${target.probeId}"]`).first();
  if (await locator.count() > 0) {
    return {target, locator};
  }

  const refreshedTargets = await visibleActionTargets(page);
  const refreshed = refreshedTargets.find(candidate => (
    candidate.group === target.group &&
    !candidate.active &&
    !candidate.disabled
  ));

  if (!refreshed) {
    return null;
  }

  return {
    target: refreshed,
    locator: page.locator(`[data-ui-action-probe="${refreshed.probeId}"]`).first(),
  };
}

async function clickActionTarget(page: Page, target: ActionTarget) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const resolved = await resolveActionTarget(page, target);
    if (!resolved) {
      return false;
    }

    try {
      await resolved.locator.evaluate((element: HTMLElement) => {
        element.click();
      });
      return true;
    } catch {
      await page.waitForTimeout(100);
    }
  }

  return false;
}

async function exerciseTarget(page: Page, target: ActionTarget) {
  let resolved = await resolveActionTarget(page, target);
  if (!resolved) {
    return {covered: true, reason: 'target no longer present'};
  }

  if (resolved.target.href && resolved.target.href !== '#' && !resolved.target.href.startsWith('javascript:')) {
    return { covered: true, reason: `link target ${resolved.target.href}` };
  }

  const before = await actionFingerprint(page);
  resolved = await resolveActionTarget(page, resolved.target);
  if (!resolved) {
    return {covered: true, reason: 'target no longer present'};
  }
  const {locator} = resolved;

  if (resolved.target.formControl) {
    if (resolved.target.tag === 'select') {
      const changed = await locator.evaluate((element: HTMLSelectElement) => {
        const next = Array.from(element.options).find(option => option.value !== element.value);
        if (!next) return false;
        element.value = next.value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      });
      if (!changed) return { covered: true, reason: 'single-option select' };
    } else {
      // Checkbox/radio inputs cannot be filled — toggle them instead.
      // Playwright .fill() on a checkbox throws "Input of type checkbox
      // cannot be filled" and the entire coverage scan halts.
      const inputType = await locator.evaluate((element: HTMLInputElement) =>
        element.tagName === 'INPUT' ? (element.type || '').toLowerCase() : ''
      );
      if (inputType === 'checkbox' || inputType === 'radio') {
        const clicked = await clickActionTarget(page, resolved.target);
        if (!clicked) return { covered: true, reason: 'checkbox detached during probe' };
      } else {
        await locator.fill('__ui_action_probe__');
      }
    }
  } else {
    const clicked = await clickActionTarget(page, resolved.target);
    if (!clicked) {
      return {covered: true, reason: 'target detached during probe'};
    }
  }

  await page.waitForTimeout(300);
  const after = await actionFingerprint(page);
  return { covered: before !== after, reason: before === after ? 'no observable effect' : 'state changed' };
}

async function currentAppRoute(page: Page) {
  return page.evaluate(() => (globalThis as any).AppContext?.get?.().route || null);
}

async function clearTransientUi(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('.toast-host .toast').forEach(toast => toast.remove());
  }).catch(() => {});
}

for (const route of ROUTES) {
  test(`ui action coverage · ${route}`, async ({ openConsole }) => {
    test.setTimeout(90_000);
    const page = await openConsole();
    await goToRoute(page, route);
    const inventory = await visibleActionTargets(page);

    const representativeGroups = [...new Set(inventory.map(target => target.group))];
    const deadActions: string[] = [];

    for (const group of representativeGroups) {
      await page.keyboard.press('Escape').catch(() => {});
      await clearTransientUi(page);
      if (await currentAppRoute(page) !== route) {
        await goToRoute(page, route);
      }
      const targets = await visibleActionTargets(page);
      const target = targets.find(candidate => candidate.group === group && !candidate.active && !candidate.disabled);
      if (!target) {
        continue;
      }

      const result = await exerciseTarget(page, target);
      if (!result.covered) {
        deadActions.push(`${target.group} (${target.name})`);
      }
    }

    expect(deadActions, `${route} controls without observable behavior`).toEqual([]);
  });
}
