# Cloudflare Pages full-stack feasibility — gtm_ops

Audit date: 2026-05-03
Scope: read-only assessment of porting the live `server.ts` runtime to Cloudflare Pages Functions + D1/KV/R2 (no migration to Fly.io / Render / Railway).

## Verdict: YELLOW (trending RED on full parity)

A subset of routes — the GET reads and small-table CRUD — port cleanly to Pages Functions + D1 in roughly a day. The pillar route `/api/generate` (LLM extract → render → PDF → write to `output/`) does **not** port without a separate non-Pages component, because it depends on PyMuPDF through a Python subprocess and synchronous filesystem writes throughout `lib/pipeline.ts` (3028 lines, 23 `fs.*` call sites). Audit-log hash-chain integrity and the SSE `/api/stream` log tail also require architectural rewrites (Durable Objects), not direct ports.

A pragmatic hybrid is the recommendation: ship the read/CRUD routes on Pages Functions now, route `/api/generate` to either Cloudflare Browser Rendering (paid binding) or a separate generator host. A single-tier Pages-only port at full parity is **not feasible inside the original 90-minute budget** and would be a 3–5-day rewrite even with focused effort.

## Phase 1 inventory

### Route inventory — `server.ts` (52 API routes + 4 health/static)

Total routes (incl. middleware and static mounts): 62 `app.*` registrations.
Total `/api/*` + `/health` + `/ready` handlers: 52.

| Bucket | Count | Examples | Port complexity |
|---|---|---|---|
| Health/ready (no DB) | 4 | `/health`, `/ready`, `/api/health`, `/api/admin/health` | Trivial — minutes |
| GET reads of small relational data | 22 | `/api/history`, `/api/usage/{summary,detail,costs}`, `/api/audit-logs`, `/api/webhooks`, `/api/branding`, `/api/admin/dashboard`, `/api/roles`, `/api/eval/{stats,runs,runs/:id,cases}`, `/api/eval-runs`, `/api/workspace/:id/users`, `/api/gdpr/consent`, `/api/documents/:executionId/versions{,/:version}`, `/api/documents/:executionId/diff/:v1/:v2`, `/api/audit-logs/{export,verify,:logId}`, `/api/webhooks/{:id,:id/deliveries}`, `/api/gdpr/export/:jobId`, `/api/branding/domain/verify` | D1 query rewrite, 1–2 hrs each |
| POST mutations on small tables | 11 | `/api/webhooks` (create), `/api/webhooks/:id` (PATCH), `/api/webhooks/:id` (DELETE), `/api/webhooks/:id/test`, `/api/branding` (POST), `/api/users/:id/role`, `/api/workspace/:id/invite`, `/api/workspace/:wid/users/:uid` (DELETE), `/api/gdpr/{consent,export,delete,delete/cancel}`, `/api/documents/:executionId/rollback/:version`, `/api/audit-logs/cleanup` | D1 + arktype validation; portable |
| Multipart upload | 1 | `/api/branding/logo` | Needs R2 + Workers `request.formData()` rewrite |
| File streaming | 2 | `/api/gdpr/export/:jobId/download`, `/api/artifacts/:executionId`, `/api/logs/:executionId` | Move to R2 + signed URLs |
| Audit-log hash chain | 1 | `/api/audit-logs/verify` (GET) — depends on append-only ordering | Needs Durable Object or schema relaxation |
| SSE log tail | 1 | `/api/stream` — in-process `EventEmitter` + `setInterval` heartbeat | Architectural rewrite (DO + WebSocket or polling) |
| Synthetic input fixture | 1 | `/api/sample` — reads `examples/*` | Bundle as imports; trivial after that |
| Live generator (the product) | 1 | `/api/generate` — LLM → render → PDF → disk write | **BLOCKED** (PyMuPDF subprocess + fs); biggest single piece of work |
| Process control | 1 | `/api/restart` — `child_process.spawn` of new Node process | **Delete** — no Workers equivalent; not needed on Pages |
| Static file mounts | 3 | `/output`, `/old`, `/exports` (`express.static`) | Move to R2 OR keep generator off-edge |

Full verb+path list (alphabetised, deduped): see appendix below.

### Dependency inventory — `package.json`

Tagged against Workers runtime compatibility (`compatibility_flags = ["nodejs_compat"]` assumed available).

| Dependency | Version | Status | Notes |
|---|---|---|---|
| `@google/genai` | ^2.6.0 | GREEN | Pure HTTP; works on Workers fetch |
| `ajv` | 8.20.0 | GREEN | Pure JS, ESM-compatible |
| `ajv-formats` | ^3.0.1 | GREEN | Pure JS |
| `arktype` | 2.2.0 | GREEN | Pure JS; replaced `zod` for runtime validation |
| `dotenv` | ^16.3.1 | YELLOW | Not needed — Pages reads env from bindings/`wrangler.toml`; remove from runtime path |
| `eventsource` | ^4.1.0 | GREEN | Client-side SSE; only relevant if Workers-as-client |
| `express` | ^4.18.2 | RED | Replace per-route with `PagesFunction` handler shape |
| `mustache` | ^4.2.0 | GREEN | Pure JS templating |
| PyMuPDF (`requirements.txt`) | >=1.27.2,<1.28 | **RED (blocker)** | Python/native MuPDF renderer; no Workers path. Keep generation on a Node/Python host or call a separate generator service |
| `sql.js` | ^1.13.0 | YELLOW | WASM SQLite; runs on Workers but bundle size + no persistence make it unsuitable for prod |
| `sqlite3` | ^6.0.1 | **RED (blocker)** | Native addon; will not load. Replace with D1 binding |
| `uuid` | ^14.0.0 | GREEN | Pure JS; or use `crypto.randomUUID()` |

Dropped since this doc was last refreshed (no longer in the runtime graph):

- ~~`cors`~~ — removed in #204 (never imported anywhere; YELLOW handler-header pivot moot).
- ~~`express-rate-limit`~~ — removed in #204 (never imported anywhere; RED in-memory rate-limit pivot moot).
- ~~`open`~~ — removed in #203 (never imported anywhere; RED CLI-only path moot).
- ~~`zod`~~ — replaced by `arktype` 2.2.0 (per `feat: TypeScript regime alignment + zod→arktype + generate-route CI fix`, #143). Same GREEN feasibility.

DevDependencies (`@playwright/test`, `vitest`, `tsx`, `xo`, `typescript`, `@faker-js/faker`, `bun-types`, `eslint-config-xo-typescript`) are out of the runtime bundle and don't affect feasibility.

**Hard blockers in production code paths (not just deps):**

| Pattern | Where | Count | Workers impact |
|---|---|---|---|
| `import sqlite3 from 'sqlite3'` | `lib/db.ts`, `lib/audit.ts`, `lib/branding.ts`, `lib/admin.ts`, `lib/gdpr.ts`, `lib/usage.ts`, `lib/rbac.ts` | 7+ files | Native addon — won't bundle; rewrite to D1 |
| `child_process.spawn` to `scripts/render-pdf-pymupdf.py` | `lib/pdf-generator.ts` | 1 bridge | Python/native MuPDF renderer — no Workers equivalent |
| `fs.{readFileSync,writeFileSync,existsSync,statSync,mkdirSync}` | `lib/pipeline.ts`, `lib/pdf-generator.ts`, `lib/extract.ts`, `lib/gdpr.ts`, `lib/file-utils.ts`, `lib/versioning.ts`, `lib/integration-research.ts`, `lib/health.ts`, `lib/validate.ts`, `lib/html-polish.ts`, `lib/estimate.ts`, `lib/pricing-calculator.ts` | 12+ files, 80+ call sites | Workers has no `fs` — replace with bundled imports / R2 / KV |
| `child_process.spawn` | `server.ts:/api/restart`, `lib/pipeline.ts` | 2 sites | No Workers equivalent — delete the route, rework pipeline subprocess pattern |
| `EventEmitter` + `setInterval` SSE | `server.ts:/api/stream` | 1 site | Doesn't survive across isolates — needs DO + WebSocket |
| Append-only file hash chain | `lib/audit.ts` | hash chain integrity | Needs DO ordering or schema relaxation |

## Top 3 architectural concerns

1. **PyMuPDF PDF generation has no Workers runtime path.** `lib/pdf-generator.ts` shells to `scripts/render-pdf-pymupdf.py`, which imports native PyMuPDF/MuPDF and writes to disk. The Pages Functions path must either call a separate generator host (Fly.io / Railway / VPS / container) or move PDF generation behind a service boundary. A pure Worker rewrite would mean giving up the current HTML-to-PDF renderer contract.

2. **Five separate SQLite databases use the `sqlite3` callback API, not prepared-statement style.** `lib/db.ts` (presales), `lib/audit.ts` (audit), `lib/branding.ts` (branding), plus admin and GDPR each instantiate their own `new sqlite3.Database(...)`. SQL DDL/DML ports to D1 directly, but the *call sites* are written in callback/promisified style, not D1's `env.DB.prepare(...).bind(...).first()/all()/run()` shape. Each manager class needs a top-to-bottom rewrite. Additionally, `lib/audit.ts` writes append-only hash-chained records — preserving hash-chain integrity on D1 alone requires either a Durable Object front-door for ordering, or explicit acceptance that the integrity proof becomes "best-effort monotonic timestamp."

3. **The pipeline's filesystem habit is the deepest port hazard.** `lib/pipeline.ts` is 3028 lines with 23 `fs.*` call sites that read templates from `templates/`, write outputs to `output/`, persist intermediate JSON, append logs. Plus `child_process.spawn` for the restart route, plus an in-process `EventEmitter` (`logEmitter`) feeding `/api/stream` SSE with `setInterval` heartbeats. SSE itself works on Workers, but the in-process EventEmitter pattern doesn't survive across isolates — log streaming needs a Durable Object or queue. The `/api/restart` route literally exec's a new Node process and must simply be deleted.

## Migration path (if operator chooses to proceed)

The recommended path is **hybrid, in three layers**:

1. **Pages Functions + D1 — read/CRUD layer (~1 day).** Port the 22 GET reads and 11 small-table mutations. Replace `sqlite3` with D1 bindings. If/when rate limiting is reintroduced, use Cloudflare Rate Limiting (don't bring back `express-rate-limit`). Delete `/api/restart`. Move `/api/branding/logo` upload to R2. Move `/output`, `/exports` to R2 with signed URLs.

2. **Durable Objects — ordering-sensitive layer (~1 day).** Reimplement audit-log hash-chain append on a single DO instance (serializes writes, preserves chain integrity). Reimplement `/api/stream` via DO + WebSocket fan-out, OR drop SSE and switch UI to short-polling.

3. **Generator layer — strategic decision (1–3 days depending on choice).** Keep `server.ts` running on a separate Node/Python generator host (Fly.io / Railway / a single VPS / container) and have Pages Functions call it via fetch for `/api/generate`, or define a new renderer contract explicitly. The current PyMuPDF path is intentionally not a Worker-native dependency.

### One-time D1/KV/R2 setup (when operator approves)

```bash
# from repo root
wrangler d1 create gtm-ops-presales
wrangler d1 create gtm-ops-audit
wrangler d1 create gtm-ops-branding
wrangler d1 create gtm-ops-admin
wrangler d1 create gtm-ops-gdpr

# Schemas need extraction first — currently inline in lib/*.js manager classes,
# not in standalone .sql files. Only config/seed_presales.sql exists today.

wrangler d1 execute gtm-ops-presales --file=config/seed_presales.sql
# (and equivalent .sql per DB after extraction)

wrangler r2 bucket create gtm-ops-output
wrangler r2 bucket create gtm-ops-branding-logos

wrangler kv:namespace create TEMPLATES
```

Then update `wrangler.toml` to add `[[d1_databases]]`, `[[r2_buckets]]`, `[[kv_namespaces]]`, and `compatibility_flags = ["nodejs_compat"]`.

**Note:** the existing `config/*.db` files in the repo are sqlite binaries — D1 cannot import them directly. Schema must be extracted from each `lib/*.js` manager's `CREATE TABLE` strings into standalone `.sql` files before the migration script can run. There are also 12+ stale `*_test_*.db` artifacts in `config/` that should be cleaned up before any migration work.

## Open questions for operator

1. **Is full feature parity required, or is "all GETs live + `/api/generate` async via Browser Rendering" enough?** The hybrid is a 1-day job; full parity is 3–5 days.
2. **Do you accept Cloudflare Browser Rendering (paid binding, separate billing) for PDFs?** If no, PDF fidelity is gone and the proposal output needs re-authoring against `pdf-lib` primitives.
3. **Audit-log hash-chain integrity — keep it (Durable Object) or relax to "best-effort ordered" (D1 + monotonic timestamp)?**
4. **`/api/stream` SSE — drop, or rebuild on Durable Object + WebSocket?** The UI uses it for live log tailing during generate.
5. **Should the `config/*_test_*.db` leftovers be deleted** before any migration work? There are 12+ stale artifacts.

## Appendix — full route list

```
get  /health
get  /ready
get  /api/health
get  /api/admin/health
get  /api/admin/dashboard
get  /api/history
get  /api/logs/:executionId
get  /api/artifacts/:executionId
get  /api/usage/summary
get  /api/usage/detail
get  /api/usage/costs
get  /api/webhooks
post /api/webhooks
get  /api/webhooks/:id
patch /api/webhooks/:id
delete /api/webhooks/:id
post /api/webhooks/:id/test
get  /api/webhooks/:id/deliveries
get  /api/documents/:executionId/versions
get  /api/documents/:executionId/versions/:version
post /api/documents/:executionId/rollback/:version
get  /api/documents/:executionId/diff/:v1/:v2
get  /api/audit-logs
get  /api/audit-logs/export
get  /api/audit-logs/verify
get  /api/audit-logs/:logId
post /api/audit-logs/cleanup
get  /api/branding
post /api/branding
post /api/branding/logo
get  /api/branding/domain/verify
get  /api/gdpr/consent
post /api/gdpr/consent
post /api/gdpr/export
get  /api/gdpr/export/:jobId
get  /api/gdpr/export/:jobId/download
post /api/gdpr/delete
post /api/gdpr/delete/cancel
get  /api/roles
get  /api/workspace/:id/users
post /api/users/:id/role
post /api/workspace/:id/invite
delete /api/workspace/:wid/users/:uid
get  /api/stream
get  /api/sample
post /api/restart
post /api/generate
get  /api/eval/stats
get  /api/eval/runs
get  /api/eval-runs
get  /api/eval/runs/:id
get  /api/eval/cases
```

## Phase 2 status — Option C (fixture-fallback) shipped

The operator selected Option C: port a subset of GET routes to Pages Functions, with each handler calling D1 first and falling back to the bundled fixture JSON when D1 returns empty / unbound / throws. This preserves the demo-mode contract that already works at `gtm-ops.pages.dev` and gives the preview branch real-feeling data while the Phase 2.5 schema extraction work is queued.

### Fallback model

Every ported handler follows the same shape (see `functions/_lib/respond.ts`):

```ts
const live = await tryD1(context.env.DB, async (db) => {
  const {results} = await db.prepare(SQL).bind(...).all();
  return results;
});
return jsonResponse(live ?? bundledFixture);
```

`tryD1` returns the query result if D1 is bound AND the result is non-empty (arrays must have ≥1 row, objects ≥1 key); else `null`. Every error path — unbound DB, missing table, query throw — folds into `null` so the route never 500s in front of the user. Fixture imports use `import x from '../../apps/ops-console/fixtures/X.json'`, with JSON resolution enabled by `tsconfig.json`'s `resolveJsonModule: true`, so cold-start is fast and there's a single source of truth for the demo data.

### Subset ported (12 routes, all GETs)

| UI fetch path | Pages Function | Disposition |
|---|---|---|
| `GET /api/health` | `functions/api/health.ts` | Stateless — no D1 needed |
| `GET /api/sample` | `functions/api/sample.ts` | Fixture-only (matches DEMO_MODE shim) |
| `GET /api/history` | `functions/api/history.ts` | D1 → `history.json` |
| `GET /api/eval-runs` | `functions/api/eval-runs.ts` | D1 → `eval-runs.json` |
| `GET /api/eval/runs` | `functions/api/eval/runs.ts` | D1 → `eval-runs.json` |
| `GET /api/admin/dashboard` | `functions/api/admin/dashboard.ts` | D1 → `admin/dashboard.json` |
| `GET /api/usage/summary` | `functions/api/usage/summary.ts` | D1 → `usage/summary.json` |
| `GET /api/usage/costs` | `functions/api/usage/costs.ts` | D1 → `usage/costs.json` |
| `GET /api/webhooks` | `functions/api/webhooks.ts` | D1 → `webhooks.json` |
| `GET /api/branding` | `functions/api/branding.ts` | D1 → `branding.json` |
| `GET /api/audit-logs/verify` | `functions/api/audit-logs/verify.ts` | RELAXED — monotonic-seq check, demo-mode no-op |
| `GET /api/workspace/:id/users` | `functions/api/workspace/[id]/users.ts` | D1 → `workspace/default/users.json` |

Routes not covered by the static UI fall through to the existing `_redirects` rule (`/api/*` → `/fixtures/:splat.json`), which preserves the DEMO_MODE behaviour for any consumer hitting an unported path.

### Audit chain (relaxed)

Operator decision: relaxed audit verification. `functions/api/audit-logs/verify.ts` reports monotonic-timestamp ordering when D1 is migrated, otherwise returns a static `mode: "demo"` no-op body. Strict cryptographic hash-chain reconstruction (the local Express path at `server.ts:544`) requires Durable Object write-side ordering and is queued as Phase 3.

### Phase 2.5 punch list — D1 schema extraction

The 12 ported routes go live as fixture-served the moment the Pages preview deploys. To flip each one to "real data," the corresponding `CREATE TABLE` (currently inline in a manager class) needs to be extracted to a `migrations/NNN_<table>.sql` file and run via `scripts/migrate-d1.sh`. References:

| Manager | File:line | Tables |
|---|---|---|
| history | `lib/history.ts:21` | `projects`, `executions`, `artifacts` |
| admin | `lib/admin.ts:133` | `metric_buckets`, `metric_daily`, `activity_feed`, `health_snapshots` |
| usage | `lib/usage.ts:90` | `usage_events` |
| webhooks | `lib/webhooks.ts:84` | `webhooks`, `webhook_deliveries` |
| branding | `lib/branding.ts:213` | `workspace_branding`, `custom_domains`, `domain_verification_logs` |
| audit | `lib/audit.ts:87` | `audit_logs` |
| gdpr | `lib/gdpr.ts:93` | `user_consents`, `export_jobs`, `deletion_requests`, `legal_documents`, `data_processing`, `access_requests` |
| rbac | `lib/rbac.ts:559` | `workspace_users`, `invitations` |
| evaluation | `lib/evaluation/corpus.js` | `evaluation_runs`, `case_studies` |

Total: 23 runtime tables. Plus seed data per table for any read route to return non-empty (otherwise `tryD1` returns `null` and the fallback fixture is served — preview is functional either way).

Also queued as Phase 2.5: every POST/PATCH/DELETE the static UI calls (webhook CRUD, branding update, role assignment, GDPR ops, doc rollback, generate). Until ported, `_redirects` returns a 302 to a fixture, which the DEMO_MODE shim already handles client-side as a no-op for mutating verbs.

## Operator action items (one-time)

Run these in order from the repo root. The first six are Cloudflare-account-interactive; the seventh is the migration; the eighth is the preview deploy.

```bash
# 1. Cloudflare login (browser OAuth — covers everything below)
wrangler login

# 2. Create the Pages project (once per Cloudflare account)
wrangler pages project create gtm-ops --production-branch main

# 3. Create the D1 database; paste the returned database_id into wrangler.toml
wrangler d1 create presales-d1

# 4. Create the KV namespace; paste the returned id into wrangler.toml
wrangler kv:namespace create TEMPLATES

# 5-6. Set secrets (NOT in wrangler.toml — Cloudflare-stored only)
wrangler pages secret put GEMINI_API_KEY --project-name=gtm-ops
wrangler pages secret put N8N_WEBHOOK_SECRET --project-name=gtm-ops

# 7. Seed the config tables (labor_rates, pricing_rules, etc.)
bash scripts/migrate-d1.sh

# 8. Deploy to the preview branch (NOT main — operator promotes after smoke)
bun run deploy:preview
```

Browser Rendering binding (for the Phase 2.5 `/api/generate` PDF path): enable in the Cloudflare dashboard under the gtm-ops Pages project's "Functions" → "Browser Rendering" toggle. The `[browser]` binding in `wrangler.toml` activates automatically once enabled.

## What this Phase 2 ship did NOT do

- No commits to `main` — preview branch only; operator promotes.
- No D1 schema extraction beyond `config/seed_presales.sql` (existed already; covers config tables only). See Phase 2.5 punch list.
- No write-side route ports (POST/PATCH/DELETE). Phase 2.5.
- No `/api/generate` Browser Rendering port. Phase 2.5.
- No SSE/Durable Object work — `/api/stream` falls through to the redirect catch-all and is intentionally not ported.
