// Build-provenance payload for /api/version. Sibling to lib/health.ts:
// /api/health answers "are we up?", /api/version answers "what is up?".
// Mirrors PR #169 (ticker) by exposing the same lib-shared shape to both
// the Express server.ts route and the Cloudflare Pages function so local
// dev and prod return identical JSON.

import packageJson from '../package.json' with {type: 'json'};

export type VersionPayload = {
  version: string;
  commit: string;
  node_version: string;
  deps: Record<string, string>;
};

const RUNTIME_DEPS = Object.keys(
  (packageJson as {dependencies?: Record<string, string>}).dependencies ?? {},
).sort();

/**
 * Build the /api/version response. Pure function — env + proc are
 * parameterised so tests can inject deterministic values.
 *
 *  - `commit` is the short (7-char) git sha, sourced from one of
 *    GIT_SHA / CF_PAGES_COMMIT_SHA / "unknown".
 *  - `node_version` comes from proc.version (e.g. "v22.12.0"). Workers
 *    runtime returns its own string; both are acceptable identifiers.
 *  - `deps` is restricted to the runtime dependency tree (not
 *    devDependencies) so consumers can correlate prod behaviour with
 *    a specific resolved set.
 */
export function buildVersionPayload(
  env: Record<string, string | undefined> = process.env,
  proc: {version?: string} = process,
): VersionPayload {
  const sha = env?.GIT_SHA || env?.CF_PAGES_COMMIT_SHA || 'unknown';
  const deps = (packageJson as {dependencies?: Record<string, string>}).dependencies ?? {};
  const filtered: Record<string, string> = {};
  for (const name of RUNTIME_DEPS) {
    filtered[name] = deps[name];
  }
  return {
    version: (packageJson as {version?: string}).version ?? '0.0.0',
    commit: sha.slice(0, 7),
    node_version: proc?.version ?? 'unknown',
    deps: filtered,
  };
}

export {RUNTIME_DEPS};
