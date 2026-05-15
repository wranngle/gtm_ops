// /api/webhooks — list configured webhook endpoints.
// D1-backed when schema is migrated (Phase 2.5: lib/webhooks.ts:84
// webhooks table); otherwise falls through to fixtures/webhooks.json.
//
// POST/PATCH/DELETE for this resource are NOT yet ported — they require
// the webhooks D1 schema migration plus zod validation. Phase 2.5.

import webhooksFixture from '../../apps/ops-console/fixtures/webhooks.json';
import {jsonResponse, tryD1, type Env} from '../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const live = await tryD1(context.env.DB, async (db) => {
    const {results} = await db
      .prepare(
        `SELECT id, name, url, events, enabled, created_at,
                last_delivery_at, delivery_count
         FROM webhooks
         ORDER BY created_at DESC`,
      )
      .all();
    return results;
  });

  return jsonResponse(live ?? webhooksFixture);
};
