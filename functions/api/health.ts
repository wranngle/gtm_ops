// /api/health — stateless health probe; no D1 dependency.
// Mirrors the local Express response shape from server.js:726.

import {jsonResponse, type Env} from '../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const dbBound = Boolean(context.env.DB);
  return jsonResponse({
    status: 'ok',
    timestamp: new Date().toISOString(),
    runtime: 'cloudflare-pages-functions',
    db_bound: dbBound,
    demo_mode: !dbBound,
  });
};
