// /api/generate — deliberately NOT ported to Pages Functions: the presales
// pipeline needs long-running LLM calls and big-memory PDF rendering, which
// stay on the Express host (`bun run start`). This function exists so the
// live Pages host answers POSTs with an honest 501 instead of an HTML 404
// (or, worse, the old fixture-200) that the console would misread as
// success. The Generate page gates its review-ready state on res.ok.

import {jsonResponse, type Env} from '../_lib/respond';

export const onRequestPost: PagesFunction<Env> = async () =>
  jsonResponse(
    {
      error: 'Proposal generation is not available on this host',
      hint: 'POST /api/generate runs on the Express runtime (bun run start). The *.pages.dev preview replays a canned trace client-side in DEMO_MODE.',
      code: 'generate_not_ported',
    },
    {status: 501},
  );
