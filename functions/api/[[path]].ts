// Catch-all for /api/* routes with no dedicated Pages Function. Replaces the
// old `_redirects` wildcard (`/api/* → /fixtures/:splat.json 302`), which
// fired on the production host too and turned every unported route into a
// 200 of demo data. Policy lives in lib/api-fallback.ts: preview hosts still
// get fixtures; production gets an honest JSON 404. Dedicated functions
// (health.ts, history.ts, …) always win over this catch-all in Pages routing.

import {resolveApiFallback} from '../../lib/api-fallback.js';
import {jsonResponse, type Env} from '../_lib/respond';

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const decision = resolveApiFallback(url.pathname, url.hostname, context.request.method);

  if (decision.kind === 'fixture' && context.env.ASSETS) {
    const fixture = await context.env.ASSETS.fetch(
      new URL(decision.fixturePath, url.origin).toString(),
    );
    if (fixture.ok) {
      return jsonResponse(await fixture.json(), {
        headers: {'X-GTM-Source': 'fixture-fallback'},
      });
    }
  }

  return jsonResponse(
    {
      error: `No live handler for ${url.pathname} on this host`,
      hint: 'Ported routes are served by functions/api/*; this one is not. The Express runtime (bun run start) serves the full /api surface.',
    },
    {status: 404},
  );
};
