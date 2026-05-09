// /api/usage/summary — aggregated usage counters.
// D1-backed when schema is migrated (Phase 2.5: lib/usage.ts:90
// usage_events); otherwise falls through to fixtures/usage/summary.json.

import summaryFixture from '../../../apps/ops-console/fixtures/usage/summary.json';
import {jsonResponse, tryD1, type Env} from '../../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const workspaceId = url.searchParams.get('workspace_id') ?? 'default';

  const live = await tryD1(context.env.DB, async (db) => {
    const row = await db
      .prepare(
        `SELECT
           COUNT(*) AS total_events,
           SUM(input_tokens) AS input_tokens,
           SUM(output_tokens) AS output_tokens,
           SUM(cost_usd) AS cost_usd
         FROM usage_events
         WHERE workspace_id = ?`,
      )
      .bind(workspaceId)
      .first();
    if (!row) return null;
    return {workspace_id: workspaceId, ...row};
  });

  return jsonResponse(live ?? summaryFixture);
};
