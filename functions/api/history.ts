// /api/history — list executions joined with projects + artifacts.
// D1-backed when schema is migrated (Phase 2.5: lib/history.ts:21);
// otherwise falls through to apps/ops-console/fixtures/history.json.

import historyFixture from '../../apps/ops-console/fixtures/history.json';
import {jsonResponse, tryD1, type Env} from '../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const live = await tryD1(context.env.DB, async (db) => {
    const {results} = await db
      .prepare(
        `SELECT e.*, p.client_slug, p.project_slug, p.name as project_name,
                (SELECT COUNT(*) FROM artifacts WHERE execution_id = e.id) as artifact_count
         FROM executions e
         LEFT JOIN projects p ON e.project_id = p.id
         ORDER BY e.timestamp DESC
         LIMIT 100`,
      )
      .all();
    return results;
  });

  return jsonResponse(live ?? historyFixture);
};
