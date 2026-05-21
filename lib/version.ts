// Build-provenance payload for /api/version. Sibling to lib/health.ts:
// /api/health answers "are we up?", /api/version answers "what is up?".
// Mirrors PR #169 (ticker) by exposing the same lib-shared shape to both
// the Express server.ts route and the Cloudflare Pages function so local
// dev and prod return identical JSON.

const PACKAGE_METADATA = {
  version: '1.0.0',
  dependencies: {
    '@google/genai': '^1.0.0',
    ajv: '8.20.0',
    'ajv-formats': '^2.1.1',
    arktype: '2.2.0',
    cors: '2.8.6',
    dotenv: '^16.3.1',
    eventsource: '^4.1.0',
    express: '^4.18.2',
    'express-rate-limit': '8.5.2',
    mustache: '^4.2.0',
    open: '^10.0.0',
    'sql.js': '^1.13.0',
    sqlite3: '^6.0.1',
    uuid: '^14.0.0',
  },
} as const;

export type VersionPayload = {
  version: string;
  commit: string;
  node_version: string;
  deps: Record<string, string>;
};

const RUNTIME_DEPS = Object.keys(
  PACKAGE_METADATA.dependencies,
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
  const deps: Record<string, string> = PACKAGE_METADATA.dependencies;
  const filtered: Record<string, string> = {};
  for (const name of RUNTIME_DEPS) {
    filtered[name] = deps[name];
  }
  return {
    version: PACKAGE_METADATA.version,
    commit: sha.slice(0, 7),
    node_version: proc?.version ?? 'unknown',
    deps: filtered,
  };
}

export {RUNTIME_DEPS};
