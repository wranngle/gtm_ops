// /api/health — stateless health probe; no D1 dependency.
// Mirrors the local Express response shape from server.ts:811.
// Includes deploy provenance (commit + branch) and a structured
// `checks` block (fixtures/db/model) so an external prober can see
// readiness without parsing prose. Cite PR #169 (ticker) for the
// shared-lib + Express + Pages triple-deploy pattern.

import {jsonResponse, type Env} from '../_lib/respond';
import {DEFAULT_MODEL_NAME} from '../../lib/health';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const dbBound = Boolean(context.env.DB);
  const sha = context.env.CF_PAGES_COMMIT_SHA;
  return jsonResponse({
    status: 'ok',
    ok: true,
    timestamp: new Date().toISOString(),
    runtime: 'cloudflare-pages-functions',
    db_bound: dbBound,
    demo_mode: !dbBound,
    commit: sha ? sha.slice(0, 7) : 'unknown',
    branch: context.env.CF_PAGES_BRANCH || 'unknown',
    checks: {
      fixtures: 'present',
      db: dbBound ? 'ok' : 'n/a',
      model: DEFAULT_MODEL_NAME,
    },
  });
};
