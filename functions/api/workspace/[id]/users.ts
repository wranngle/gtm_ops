// /api/workspace/:id/users — list users for a workspace.
// D1-backed when schema is migrated (Phase 2.5: lib/rbac.ts:559
// workspace_users); otherwise falls through to
// fixtures/workspace/default/users.json.
//
// POST /api/workspace/:id/invite and DELETE /api/workspace/:wid/users/:uid
// are NOT yet ported — Phase 2.5.

import usersFixture from '../../../../apps/ops-console/fixtures/workspace/default/users.json';
import {jsonResponse, tryD1, type Env} from '../../../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const workspaceId = context.params.id as string;

  const live = await tryD1(context.env.DB, async (db) => {
    const {results} = await db
      .prepare(
        `SELECT user_id, email, role, created_at
         FROM workspace_users
         WHERE workspace_id = ?
         ORDER BY created_at DESC`,
      )
      .bind(workspaceId)
      .all();
    return results;
  });

  return jsonResponse(live ?? usersFixture);
};
