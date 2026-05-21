/**
 * Pins the Sales Coach launcher to bottom-right across persistent work routes.
 * Original ask: punch-list item #20 (May 5 04:22 UTC) — "Move Sales
 * coach widget to bottom right." A later media-query override moved
 * the launcher to top-right on /generate, /proposals, /evals, and
 * /agents (the four routes operators spend the most time on), so
 * three out of every four sessions saw the wrong dock corner. This
 * test asserts the override is gone and the base rule stays bottom-
 * right.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cssPath = resolve(root, 'apps', 'ops-console', 'console', 'app.css');

describe('apps/ops-console coach launcher position', () => {
  const css = readFileSync(cssPath, 'utf8');

  it('base .coach-launcher rule docks bottom-right', () => {
    const match = css.match(/^\.coach-launcher\s*\{([^}]*)\}/m);
    expect(match, 'base .coach-launcher rule should exist').toBeTruthy();
    const body = match![1];
    expect(body).toMatch(/position\s*:\s*fixed/);
    expect(body).toMatch(/bottom\s*:\s*\d+px/);
    expect(body).toMatch(/right\s*:\s*\d+px/);
  });

  it('only Generate may move the launcher above dense artifact actions', () => {
    expect(css).toMatch(/\.app\[data-route="generate"\]\s*~\s*\.coach-launcher[^}]*bottom\s*:\s*auto/s);

    // Persistent review/admin routes must keep the launcher bottom-right.
    expect(css).not.toMatch(/html\[data-console-route=[^\]]+\]\s*\.coach-launcher/);
    expect(css).not.toMatch(/\.app\[data-route="(?:proposals|evals|agents)"\]\s*~\s*\.coach-launcher[^}]*bottom\s*:\s*auto/s);
  });
});
