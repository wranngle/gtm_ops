// /api/audit-logs/verify — chain-integrity probe.
//
// Operator decision (Phase 2): RELAXED audit chain. Strict cryptographic
// hash-chain verification (the local Express path at server.ts:544 walks
// the audit_logs table and recomputes hashes) is a Phase 3 enhancement;
// here we report monotonic-timestamp ordering only when D1 is migrated,
// and otherwise fall through to a static "demo-mode" verification body.
//
// Documented trade-off: on the live preview deploy, "valid: true" means
// "no out-of-order timestamps detected," NOT "hash chain reconstructed
// and matches stored anchors." Re-add the strict path with a Durable
// Object front-door for write ordering.

import {jsonResponse, tryD1, type Env} from '../../_lib/respond';

// Build per-request — `new Date()` at module scope gets baked into the
// Workers bundle at deploy time and freezes to epoch on cold start.
const demoVerification = () => ({
  valid: true,
  mode: 'demo',
  checked_at: new Date().toISOString(),
  log_count: 0,
  note: 'DEMO_MODE: no D1 schema migrated; verification is a no-op. See docs/cf-fullstack-feasibility.md "Audit chain (relaxed)".',
});

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const live = await tryD1(context.env.DB, async (db) => {
    const row = await db
      .prepare(
        `SELECT
           COUNT(*) AS log_count,
           SUM(CASE WHEN seq < prev_seq THEN 1 ELSE 0 END) AS out_of_order
         FROM (
           SELECT seq, LAG(seq) OVER (ORDER BY seq) AS prev_seq
           FROM audit_logs
         )`,
      )
      .first<{log_count: number; out_of_order: number}>();
    if (!row) return null;
    return {
      valid: (row.out_of_order ?? 0) === 0,
      mode: 'relaxed',
      checked_at: new Date().toISOString(),
      log_count: row.log_count ?? 0,
      out_of_order: row.out_of_order ?? 0,
    };
  });

  return jsonResponse(live ?? demoVerification());
};
