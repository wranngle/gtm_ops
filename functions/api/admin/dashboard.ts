// /api/admin/dashboard — operator dashboard counters.
// D1-backed when schema is migrated (Phase 2.5: lib/admin.ts:133 metric_*
// tables); otherwise falls through to fixtures/admin/dashboard.json.

import dashboardFixture from '../../../apps/ops-console/fixtures/admin/dashboard.json';
import {jsonResponse, tryD1, type Env} from '../../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const workspaceId = url.searchParams.get('workspace_id') ?? 'default';
  const period = url.searchParams.get('period') ?? 'this_month';

  const live = await tryD1(context.env.DB, async (db) => {
    const docs = await db
      .prepare(
        `SELECT COUNT(*) AS created FROM activity_feed
         WHERE workspace_id = ? AND action = 'document.created'`,
      )
      .bind(workspaceId)
      .first<{created: number}>();
    if (!docs || typeof docs.created !== 'number') return null;
    return {period, workspace_id: workspaceId, documents: docs};
  });

  return jsonResponse(live ?? dashboardFixture);
};
