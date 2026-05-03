// /api/usage/costs — cost breakdown by event_type.
// D1-backed when schema is migrated (Phase 2.5: lib/usage.js:90
// usage_events); otherwise falls through to fixtures/usage/costs.json.

import costsFixture from '../../../apps/ops-console/fixtures/usage/costs.json';
import {jsonResponse, tryD1, type Env} from '../../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const workspaceId = url.searchParams.get('workspace_id') ?? 'default';

  const live = await tryD1(context.env.DB, async (db) => {
    const {results} = await db
      .prepare(
        `SELECT event_type, SUM(cost_usd) AS cost_usd, COUNT(*) AS count
         FROM usage_events
         WHERE workspace_id = ?
         GROUP BY event_type
         ORDER BY cost_usd DESC`,
      )
      .bind(workspaceId)
      .all();
    return results;
  });

  return jsonResponse(live ?? costsFixture);
};
