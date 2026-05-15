#!/usr/bin/env bun
/**
 * Route coverage probe (SYM-010)
 *
 * Extracts every fetch(...) path from the ops-console HTML pages, substitutes
 * `${...}` placeholders with deterministic sentinels, sends each request to
 * a locally running server using the verb declared in the fetch options, and
 * emits a markdown table mapping:
 *
 *   UI fetch path  ->  server.ts registration line  ->  HTTP status
 *
 * Usage:
 *   bun scripts/route-coverage-probe.js                  # assumes server already running on :3000
 *   bun scripts/route-coverage-probe.js --start          # starts `bun --env-file=.env server.ts` itself
 *   bun scripts/route-coverage-probe.js --out docs/route-coverage.md
 *
 * Notes:
 *   - DEMO_MODE friendly: no live API keys are required. Routes that depend on
 *     them should degrade gracefully; this script reports whatever status the
 *     server returns without asserting on it.
 *   - Mutating verbs (POST/PUT/PATCH/DELETE) are sent with an empty JSON body
 *     purely as a route-existence probe. A 4xx from handler-level validation
 *     is expected; a 404 still uniquely indicates "no such route".
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const HTML_FILES = [
  'apps/ops-console/index.html',
  'apps/ops-console/evaluation/index.html',
  'apps/ops-console/eval-runs/index.html',
];

const SERVER_FILE = 'server.ts';
const HOST = process.env.PROBE_HOST || 'http://localhost:3000';
const SENTINELS = {
  execId: 'demo-exec',
  id: 'demo-id',
  v1: '1',
  v2: '2',
  version: '1',
  type: 'pdf',
  jobId: 'demo-job',
  userId: 'demo-user',
  period: '30d',
  domain: 'example.com',
  pageSize: '10',
  offset: '0',
};

function parseArgs(argv) {
  const args = { start: false, out: 'docs/route-coverage.md' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--start') args.start = true;
    else if (a === '--out') args.out = argv[++i];
  }
  return args;
}

function substitutePlaceholders(rawPath) {
  // Replace ${expr} with a sentinel chosen by either the trailing identifier
  // (`${execId}` -> `demo-exec`) or a generic fallback (`default`).
  return rawPath.replace(/\$\{([^}]+)\}/g, (_, expr) => {
    const ident = expr.trim().split(/[^a-zA-Z0-9_]/).pop();
    if (ident && SENTINELS[ident] !== undefined) return SENTINELS[ident];
    if (/encodeURIComponent/i.test(expr)) return 'example.com';
    return 'default';
  });
}

function sliceOptionsBlob(src, fromIdx) {
  // Starting just after `fetch(<quoted-path>`, find `, {` and walk a
  // brace-balanced window so we capture the full options object even when
  // it spans multiple lines and contains nested `{...}` (e.g. JSON.stringify).
  let i = fromIdx;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  if (src[i] !== ',') return '';
  i += 1;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  if (src[i] !== '{') return '';
  let depth = 0;
  const start = i;
  for (; i < src.length; i += 1) {
    const c = src[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
    if (i - start > 2048) break; // safety bail-out
  }
  return '';
}

async function extractFetchPaths() {
  const re = /fetch\(\s*['"`]([^'"`]+)['"`]/g;
  const methodRe = /\bmethod\s*:\s*['"`]([A-Za-z]+)['"`]/;
  const seen = new Map(); // key (method+resolved) -> { raw, resolved, method }
  for (const rel of HTML_FILES) {
    const abs = path.join(REPO_ROOT, rel);
    const src = await fs.readFile(abs, 'utf8');
    let m;
    while ((m = re.exec(src)) !== null) {
      const raw = m[1];
      if (!raw.startsWith('/')) continue;
      const optsBlob = sliceOptionsBlob(src, re.lastIndex);
      const methodMatch = methodRe.exec(optsBlob);
      const method = (methodMatch ? methodMatch[1] : 'GET').toUpperCase();
      const resolved = substitutePlaceholders(raw);
      const key = `${method} ${resolved}`;
      if (!seen.has(key)) seen.set(key, { raw, resolved, method });
    }
  }
  return [...seen.values()].sort((a, b) => {
    const r = a.resolved.localeCompare(b.resolved);
    return r === 0 ? a.method.localeCompare(b.method) : r;
  });
}

async function buildRouteIndex() {
  const src = await fs.readFile(path.join(REPO_ROOT, SERVER_FILE), 'utf8');
  const lines = src.split(/\r?\n/);
  const routes = []; // { method, pattern, line }
  const re = /^\s*app\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]/;
  for (const [i, line] of lines.entries()) {
    const m = re.exec(line);
    if (!m) continue;
    const [, method, pattern] = m;
    routes.push({ method: method.toUpperCase(), pattern, line: i + 1 });
  }
  return routes;
}

function patternToRegex(pattern) {
  // Translate Express path patterns (':param', optional '?') into a RegExp
  // anchored to the full pathname.
  const escaped = pattern
    .replace(/[.+^$|(){}[\]\\]/g, String.raw`\$&`)
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)\??/g, '[^/?]+');
  return new RegExp(`^${escaped}$`);
}

function findRouteMatch(routes, method, pathname) {
  const exact = routes.find(
    (r) => r.method === method && r.pattern === pathname,
  );
  if (exact) return exact;
  return routes.find(
    (r) => r.method === method && patternToRegex(r.pattern).test(pathname),
  );
}

async function probe(url, method = 'GET') {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: ['POST', 'PUT', 'PATCH'].includes(method) ? '{}' : undefined,
    });
    return { status: res.status };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

async function waitForServer(maxMs = 20_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${HOST}/health`);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function startServer() {
  const proc = spawn('bun', ['--env-file=.env', 'server.ts'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '3000' },
  });
  proc.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  proc.stderr.on('data', (d) => process.stderr.write(`[server-err] ${d}`));
  const ready = await waitForServer();
  if (!ready) {
    proc.kill('SIGTERM');
    throw new Error('Server failed to become ready within 20s');
  }
  return proc;
}

function renderTable(rows) {
  const header = [
    '| UI fetch path | Method | server.ts route | Line | HTTP |',
    '| --- | --- | --- | --- | --- |',
  ];
  const body = rows.map(
    (r) =>
      `| \`${r.raw}\` | ${r.method} | ${
        r.match ? `\`${r.match.pattern}\`` : '_no match_'
      } | ${r.match ? r.match.line : '—'} | ${r.status} |`,
  );
  return [...header, ...body].join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const fetchPaths = await extractFetchPaths();
  const routes = await buildRouteIndex();

  let proc = null;
  if (args.start) proc = await startServer();
  else if (!(await waitForServer(2000))) {
    throw new Error(
      `No server reachable at ${HOST}. Re-run with --start or boot one manually.`,
    );
  }

  const rows = [];
  try {
    for (const entry of fetchPaths) {
      const url = `${HOST}${entry.resolved}`;
      const { status } = await probe(url, entry.method);
      const pathname = new URL(url).pathname;
      const match = findRouteMatch(routes, entry.method, pathname);
      rows.push({ ...entry, match, status });
    }
  } finally {
    if (proc) proc.kill('SIGTERM');
  }

  const noMatches = rows.filter((r) => !r.match);
  const routeMissing = rows.filter((r) => r.status === 404 && !r.match);
  const resourceMissing = rows.filter((r) => r.status === 404 && r.match);

  const md = [
    '# Route coverage (SYM-010)',
    '',
    `Generated by \`scripts/route-coverage-probe.js\` against \`${HOST}\` in DEMO_MODE.`,
    'Every UI `fetch()` call in `apps/ops-console/{index,evaluation/index,eval-runs/index}.html`',
    // eslint-disable-next-line no-template-curly-in-string -- literal `${...}` in markdown documentation
    'is enumerated, the `${...}` placeholders are filled with deterministic',
    'sentinel values, and the URL is hit with the HTTP verb declared in the',
    'fetch options object (defaulting to GET).',
    '',
    'How to read the **HTTP** column:',
    '',
    '- **200 / 204** — happy-path GETs / route exists.',
    '- **400 / 422** — handler is registered; payload-validation rejection',
    '  from the empty `{}` body sent for write verbs (route is fine).',
    '- **404 with a matched route** — handler is registered but the sentinel',
    '  ID (e.g. `demo-job`, `demo-exec`) does not resolve to an existing',
    '  resource. **Not** a route 404.',
    '- **404 with no matched route** — true route 404 to fix.',
    '',
    `- UI fetch paths discovered: **${rows.length}**`,
    `- True route 404s (no static-analysis match): **${routeMissing.length}**`,
    `- Resource-not-found 404s (route exists, sentinel ID missing): **${resourceMissing.length}**`,
    `- Paths without any static-analysis match: **${noMatches.length}**`,
    '',
    renderTable(rows),
    '',
  ].join('\n');

  const outAbs = path.resolve(REPO_ROOT, args.out);
  await fs.mkdir(path.dirname(outAbs), { recursive: true });
  await fs.writeFile(outAbs, md, 'utf8');
  console.log(`Wrote ${outAbs}`);
  console.log(
    `Summary: ${rows.length} paths, true route 404s = ${routeMissing.length}, resource 404s = ${resourceMissing.length}.`,
  );
  if (routeMissing.length > 0) {
    for (const r of routeMissing) {
      console.log(`  ROUTE 404: ${r.method} ${r.raw}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
