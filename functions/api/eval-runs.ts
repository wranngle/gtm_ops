// /api/eval-runs — alias of /api/eval/runs; both serve the evaluation
// run history. D1-backed when schema is migrated (Phase 2.5:
// lib/evaluation/corpus.js evaluation_runs table); otherwise falls
// through to apps/ops-console/fixtures/eval-runs.json.

import evalRunsFixture from '../../apps/ops-console/fixtures/eval-runs.json';
import {jsonResponse, tryD1, type Env} from '../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const limit = Math.min(
    Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50,
    200,
  );

  const live = await tryD1(context.env.DB, async (db) => {
    const {results} = await db
      .prepare(
        `SELECT id, case_study_id, status, pipeline_version,
                scores_json, flaws_detected, duration_ms, created_at
         FROM evaluation_runs
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all();
    return results;
  });

  return jsonResponse(live ?? evalRunsFixture);
};
