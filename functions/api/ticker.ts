// /api/ticker — anonymized booking-telemetry feed for the live-social-proof
// widget on the landing page and README hero block.
//
// Returns the last 10 booking events as [{ts, vertical, value_bucket, region}].
// Contract: PII-free by construction. See lib/ticker.ts for the storage +
// fixture-fallback model and tests/ticker.test.ts for the invariant check.

import {getTickerEvents, type TickerEnv} from '../../lib/ticker.js';
import {jsonResponse, type Env} from '../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const events = await getTickerEvents(context.env as Env & TickerEnv);
  return jsonResponse(events, {
    headers: {
      // 30s edge cache: the feed is anonymized aggregate data, refreshes
      // are cheap, and bursty README/landing traffic should not stampede D1.
      'Cache-Control': 'public, max-age=30, s-maxage=30',
    },
  });
};
