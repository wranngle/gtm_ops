# Security tooling

Reference for the security and ops surfaces that PRs #98–#110 stood up.
Each tool below has a single fixed entry point so future agents and
operators don't have to re-derive what runs where.

## RBAC coverage lint

`bash scripts/lint-rbac-coverage.sh` — fails CI when a route in
`server.ts` is missing `requireRole(...)`. Wired into the
`static checks` job in `.github/workflows/test.yml`.

What it flags:

- Every `app.<method>('/path', ...)` for method ∈ {`post`, `patch`,
  `put`, `delete`} (the mutation routes).
- Every `app.get('/path', ...)` whose path starts with one of these
  sensitive prefixes:
  `/api/audit-logs/`, `/api/admin/`, `/api/usage/`,
  `/api/gdpr/export/`, `/api/branding/domain/`.

Exit codes: `0` clean, `1` at least one missing role, `2` invocation
error (target file missing).

The prefix list is a manually-curated heuristic — sensitive GETs not
matching any prefix (e.g. ad-hoc reports) are still a per-route policy
decision. Edit `sensitive_get_prefix_re` when the API grows.

Tests: `tests/unit/lint-rbac-coverage.test.ts` (13 cases including a
smoke check that real `server.ts` passes).

## Audit hash chain CLI

`bun run audit:verify` — walks the audit log hash chain in
`config/audit.db` (override with `--db=/path/to.db`) and emits a
single JSON line on stdout: `{ ok, db_path, checked, invalid_at }`.

Exit codes:

- `0` — chain intact.
- `1` — tamper detected (`invalid_at` is the offending `log_id`).
- `2` — invocation error (DB missing / unreadable / open failed).

Use it to spot-check a customer-pulled DB without writing one-off
scripts. Source: `scripts/audit-verify.mjs`. Tests:
`tests/unit/audit-verify-cli.test.ts`.

## Audit metadata redaction

`AuditLogger.log()` in `lib/audit.ts` runs every metadata payload
through `redactSecretsDeep()` (from `lib/security.ts`) before both the
hash computation and the SQLite INSERT. The redacted shape is what
gets persisted, hashed, and round-tripped through `verifyIntegrity`,
so `audit:verify` continues to report the chain as intact after
redaction.

Patterns caught: Gemini, Groq, Anthropic, xAI, Stripe (live + test),
OpenAI, GitHub PATs, Slack tokens, AWS access key IDs. Source list is
maintained in `lib/security.ts#maskApiKeysInText`. Adding a new
pattern requires no audit-side change — `redactSecretsDeep` walks
arbitrary JSON-shaped values and applies the masker to every string.

Tests: `tests/unit/security.test.ts` (4 covering structural redaction)
and `tests/unit/audit.test.ts` (2 covering end-to-end persistence +
chain integrity).

## Dev auth shim

`lib/rbac.ts#resolveDevAuthRole(headers, env)` is the pure function
that resolves the effective role for an inbound request. Resolution
order:

1. `X-User-Role` header (curl/Postman convenience).
2. `WRANNGLE_AUTH_DEFAULT_ROLE` env var (operator-set fallback).
3. Environment-aware default:
   - `NODE_ENV=production` → `viewer` (least privilege; mutation
     routes 403 unless an explicit role is supplied).
   - Otherwise → `owner` (preserves the local dev workflow).

Invalid `WRANNGLE_AUTH_DEFAULT_ROLE` values are ignored — the
function falls through to the env-aware default and emits a
one-shot `console.warn` listing the valid set. This prevents the
"every request is INVALID_ROLE" footgun when an operator typos the
env var (the prior shape that broke #105).

`server.ts` calls `resolveDevAuthRole` once per request and stores
the result on `req.user_role`. `requireRole(...)` checks the same
field; any future real-auth flow (OAuth, JWT, session cookie) only
needs to populate `req.user_role` before the route handlers run.

Tests: `tests/unit/rbac.test.ts` (the `Dev auth shim` describe block
has 9 cases covering precedence, defaults, invalid values, and
one-shot warning behavior).

## CSP violation reporting

`functions/api/csp-report.ts` (Cloudflare Pages Function) receives
browser-issued CSP violation reports via the `report-uri` directive
in `apps/ops-console/_headers`. Real reports are tiny; the function
caps inbound payloads at 16 KB (`MAX_CSP_REPORT_BYTES`) and replies
204 either way so browsers don't retry on body errors.

Summary helper: `lib/csp-summary.ts#summarizeReport()` — a pure
function that turns either the legacy `report-uri` shape or the
modern Reporting API array into a single grep-friendly line. Tests:
`tests/unit/csp-report.test.ts`.

## Express response headers

`lib/security.ts#securityHeadersMiddleware` is wired in front of
every Express response. It mirrors the static-deploy `_headers`
contract from `apps/ops-console/_headers`:

- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 0` (modern OWASP guidance — the legacy auditor
  this once gated was removed and `1; mode=block` re-introduced
  cross-site leaks)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `Permissions-Policy:
  camera=(), microphone=(), geolocation=(), payment=(), usb=(),
  interest-cohort=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-site`

`apiNoStoreMiddleware` — scoped to `/api/*` — adds
`Cache-Control: no-store` and `Pragma: no-cache` so role-aware API
responses can't be persisted by browser caches or shared CDNs.
Routes that need a different policy (e.g. the SSE log stream) can
still set `Cache-Control` later — Express overwrites on the second
write, so the route handler wins.

Tests: `tests/unit/security.test.ts` (header set, override-still-wins,
and CORS allow-list pinning the methods + custom headers needed by
the dev shim).

## CI surface

The static-checks job at `.github/workflows/test.yml#test` chains:

1. `bash scripts/validate-knowledge-base.sh`
2. `bash scripts/lint-layered-architecture.sh`
3. `bash scripts/lint-rbac-coverage.sh`
4. `gitleaks/gitleaks-action` (secret scan)

The `unit` job adds `bun audit --audit-level=high`, `bun run
typecheck`, and `bun run test:run`.

## Adding a new sensitive route

When you add a new mutation or sensitive read route to `server.ts`:

1. Apply `requireRole(...)` as the first middleware after the path
   string. Use `Role.OWNER, Role.ADMIN` for workspace-config and
   admin-tier data; `Role.MEMBER` for content; `Role.VIEWER` for
   user-self actions only.
2. Run `bash scripts/lint-rbac-coverage.sh` locally — CI will run it
   too.
3. If the new route is a sensitive GET under a path prefix not
   already in the lint's `sensitive_get_prefix_re`, extend the
   regex (and add a test in `tests/unit/lint-rbac-coverage.test.ts`).
