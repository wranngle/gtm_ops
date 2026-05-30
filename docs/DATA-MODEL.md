# Data model

`gtm_ops` is a multi-tenant SaaS runtime, and its persistence layer is plain
SQL — no ORM hiding the schema. This document is the map of that schema and the
query patterns that run against it.

Two engines, one schema shape:

- **PostgreSQL** for the canonical relational model (`migrations/001_initial_schema.sql`)
  — UUID primary keys, typed enums, JSONB columns, foreign keys, and indexes.
- **SQLite / Cloudflare D1** for the edge runtime (`lib/db.ts` + the Cloudflare
  Pages Functions in `functions/api/`), which reads from D1 first and falls back
  to bundled fixtures when D1 is empty.

A third SQL file, `config/schema_v3.sql`, holds the configuration-as-data tables
(extraction templates, classification taxonomies, validation rules) that drive
the LLM extraction pipeline without code changes.

## Core relational schema (PostgreSQL)

`migrations/001_initial_schema.sql` (359 lines, with a matching `.down.sql`)
defines the tenancy and execution model:

| Table | Role |
|---|---|
| `users` | Identity (Clerk-linked), soft-deletable via `deleted_at` |
| `workspaces` | Tenant boundary — slug-addressed, plan-tiered, JSONB `settings`, branding columns |
| `workspace_members` | User↔workspace join with role |
| `projects` | Work units, scoped to a workspace |
| `executions` | Pipeline runs, status-tracked |
| `artifacts` | Versioned outputs of executions (proposals, PDFs) |
| `usage_events` | Metered events for billing/limits |
| `webhooks` / `webhook_deliveries` | Outbound webhook registry + per-attempt delivery log |
| `audit_logs` | Append-only, hash-chained audit trail (see below) |
| `user_consents` | GDPR consent records |
| `subscriptions` | Plan/billing state |

Typed enums keep status columns honest at the database layer:

```sql
CREATE TYPE user_role         AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE subscription_plan AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE execution_status  AS ENUM ('running', 'completed', 'failed');
CREATE TYPE webhook_status    AS ENUM ('pending', 'success', 'failed');
```

Design choices worth calling out:

- **Multi-tenancy** — every tenant-scoped row hangs off `workspaces`; the schema
  enables `pgcrypto` and a row-level-security helper so isolation is enforced in
  the database, not just the application.
- **Soft deletes** — `deleted_at TIMESTAMP WITH TIME ZONE` instead of hard
  `DELETE`, so history and audit survive removal.
- **Referential integrity** — foreign keys use explicit `ON DELETE RESTRICT` /
  cascade rules rather than orphaning rows.
- **JSONB for open-ended config** — `settings JSONB DEFAULT '{}'` keeps
  per-workspace configuration flexible without schema churn.
- **Indexes on every lookup path** — e.g. `idx_users_email`,
  `idx_users_clerk_id`, and the `schema_v3` key indexes on
  `template_key` / `taxonomy_key` / `schema_key`.

## Tamper-evident audit log

`lib/audit.ts` writes an append-only audit table where each row carries a `hash`
and a `previous_hash`, forming a chain. On startup it reads the tail to resume
the chain:

```sql
SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1;
```

Each new entry hashes its payload together with the prior row's hash, so any
in-place edit or deletion breaks the chain and is detectable — a SQL-native
integrity guarantee rather than a trust-the-app assumption.

## Query discipline

All queries in `lib/` are **parameterized** — values are bound, never string-
interpolated — which closes off SQL injection. Representative patterns:

```sql
-- Scoped fetch (lib/history.ts)
SELECT * FROM projects WHERE client_slug = ? AND project_slug = ?;

-- Versioned artifacts (lib/history.ts)
SELECT id, version FROM artifacts WHERE ... ORDER BY version DESC;

-- Metered usage aggregation, dynamically filtered (lib/usage.ts)
SELECT COUNT(*) AS total FROM usage_events <whereClause>;

-- Audit retrieval with append-only ordering (lib/audit.ts)
SELECT * FROM audit_logs ORDER BY id ASC LIMIT ?;
```

The edge runtime adds the operational tables the platform needs in production —
`metric_daily` / `metric_buckets` (rollups), `activity_feed`, `health_snapshots`,
`integrations`, `invitations`, `deletion_requests`, `export_jobs`, and
`data_processing` (GDPR) — all reached through the same parameterized,
soft-delete-aware query layer in `lib/`.

## Where to look

| Concern | File |
|---|---|
| Canonical relational schema | `migrations/001_initial_schema.sql` |
| Config-as-data (extraction/validation) | `config/schema_v3.sql` |
| Seed data | `config/seed_presales.sql` |
| Connection + query helpers | `lib/db.ts` |
| Hash-chained audit | `lib/audit.ts` |
| Usage metering / aggregation | `lib/usage.ts` |
| Versioned history reads | `lib/history.ts` |
