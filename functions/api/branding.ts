// /api/branding — workspace branding (logo, colors, font).
// D1-backed when schema is migrated (Phase 2.5: lib/branding.js:213
// workspace_branding table); otherwise falls through to
// fixtures/branding.json.
//
// POST is NOT yet ported — Phase 2.5.

import brandingFixture from '../../apps/ops-console/fixtures/branding.json';
import {jsonResponse, tryD1, type Env} from '../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const workspaceId = url.searchParams.get('workspace_id') ?? 'default';

  const live = await tryD1(context.env.DB, async (db) => {
    const row = await db
      .prepare(
        `SELECT workspace_id, logo_url, primary_color, secondary_color,
                background_color, text_color, font_family, updated_at
         FROM workspace_branding
         WHERE workspace_id = ?`,
      )
      .bind(workspaceId)
      .first();
    return row;
  });

  return jsonResponse(live ?? brandingFixture);
};
