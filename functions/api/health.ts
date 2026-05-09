// /api/health — stateless health probe; no D1 dependency.
// Mirrors the local Express response shape from server.ts:726.
// Includes deploy provenance (commit + branch) so an operator looking at
// a bug report can confirm which build is actually live.

import {jsonResponse, type Env} from '../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const dbBound = Boolean(context.env.DB);
  const sha = context.env.CF_PAGES_COMMIT_SHA;
  return jsonResponse({
    status: 'ok',
    timestamp: new Date().toISOString(),
    runtime: 'cloudflare-pages-functions',
    db_bound: dbBound,
    demo_mode: !dbBound,
    commit: sha ? sha.slice(0, 7) : 'unknown',
    branch: context.env.CF_PAGES_BRANCH || 'unknown',
  });
};
