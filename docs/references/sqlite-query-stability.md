# SQLite query stability

Rules for writing SQL against `node-sqlite3` (the runtime in `lib/admin.ts`,
`lib/usage.ts`, `lib/audit.ts`, `lib/gdpr.ts`, `lib/webhooks.ts`,
`lib/history.ts`, `lib/research-db.ts`, `lib/integration-research.ts`).

The runtime is the async callback API. Three subtle failure modes recur
under fast sequential writes — the rules below are all corrections that
have shown up as test flakes that I'd otherwise be re-debugging weekly.

## 1. Every `ORDER BY <ts> DESC` needs `, rowid DESC` after it

When two rows share the same timestamp (which happens any time two
`await db.run(INSERT ... created_at = Date.now())` calls land in the
same millisecond — common in tests, plausible in bursty production),
SQLite's row order on the tie is implementation-defined. Without a
tiebreaker, a `LIMIT 1` query returns either row at random.

```sql
-- BAD: race-prone, fails 1-2/10 in tests
SELECT * FROM activity_feed WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1

-- GOOD: tied timestamps fall back to insert order
SELECT * FROM activity_feed WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1
```

`rowid` is SQLite's implicit monotonically-increasing key. It is
auto-assigned per INSERT and never reused. For `INTEGER PRIMARY KEY`
tables, `rowid` IS the primary key; for `TEXT PRIMARY KEY` tables (like
`activity_feed`, `health_snapshots`, `audit_logs`) it is a separate
hidden column you can still `SELECT` and `ORDER BY`.

This rule is enforced patch-by-patch (already applied in
`getActivityFeed`, `getHealthHistory`, `getSystemHealth`, and the usage
event paginator). When you write a NEW query that orders by a
timestamp, add the `, rowid DESC` immediately — don't wait for a flake
to surface it.

## 2. `created_at < end` needs `end = Date.now() + 1`

Period filters (THIS_MONTH / THIS_WEEK / TODAY in
`lib/admin.ts#getTimestampRange`) compute `end = Date.now()` at SELECT
time. Each `logActivity` records `created_at = Date.now()` at INSERT
time. Strict less-than means rows where `created_at == end` are
excluded — and they tie any time the SELECT and the most recent INSERT
land on the same millisecond.

The `+ 1` makes `created_at < end` behave like `created_at <= now` at
the boundary. New range-computing helpers should follow the same
pattern. Don't compensate at the SQL site (`<=` everywhere) — keep the
fix in the range builder so every consumer benefits.

## 3. The residual cache-visibility race

Even with rules 1 and 2 applied, 3-4 awaited writes within the same
millisecond occasionally produce a SELECT that sees rows out of order
(the most recent INSERT not yet visible). Confirmed heisenbug:
**any** synchronous instrumentation in the write path (a single
`fs.appendFileSync` call) makes it disappear, because it serializes
the JS event loop just enough that the SQLite callback queue drains
before the next call enters.

Two responses:

- **Tactical, in tests**: wrap the affected describe in
  `{ retry: 2 }`. See `tests/unit/admin.test.ts` `[P1] Analytics`,
  `[P1] System Health`, and `tests/unit/usage.test.ts`
  `[P0] UsageTracker - Event Tracking` for the canonical shape — every
  retry decorator should carry a comment naming the race and pointing
  at the migration ticket.
- **Strategic, in code**: migrate off `node-sqlite3` (callback-async,
  races possible) to `better-sqlite3` (synchronous API, race
  impossible by construction). Tracked in
  [#52](https://github.com/wranngle/gtm_ops/issues/52).

## 4. PRIMARY KEY collision under burst writes

`logActivity()` and `recordHealthSnapshot()` both generate IDs as
`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` —
six chars of base36 random. With four awaited inserts in the same ms,
the collision probability is ~ 1 in 360 million per pair, low but not
zero. PK collisions surface as silent rejection of the duplicate INSERT
because the rest of the call rides through the catch-and-retry pattern
in `_runRaw`.

Switch new ID generation to `crypto.randomUUID()` (16 bytes of entropy,
collision-impossible in any practical horizon). Existing call sites
keep the legacy 6-char shape until #52 lands, since changing the ID
format alone doesn't fix the heisenbug.

## See also

- [`lib/admin.ts`](../../lib/admin.ts) — applied rules 1+2 in
  `getActivityFeed`, `getSystemHealth`, `getHealthHistory`, +
  `getTimestampRange`
- [`lib/usage.ts`](../../lib/usage.ts) — applied rule 1 in
  `getUsageDetail`, retry shim in test
- [`tests/unit/admin.test.ts`](../../tests/unit/admin.test.ts),
  [`tests/unit/usage.test.ts`](../../tests/unit/usage.test.ts) —
  canonical retry-shim shape
