# Contributing

This repo is the unified runtime for a voice-AI-led GTM motion. Contributions should preserve:

1. The product surface: `lib/`, `server.ts`, `cli.ts`, `apps/ops-console/`, `templates/`, `prompts/`.
2. The agent-legibility layer: short `AGENTS.md`, repo-local docs as the source of truth, mechanical lint checks, knowledge-base validation.

## Local Setup

```bash
git clone <repo-url>
cd <repo-dir>
bun install                                # or `npm install`
bash scripts/validate-knowledge-base.sh    # smoke check
```

## Running Tests

Before submitting changes, run the checks that exist for the surfaces you touched.

```bash
bash scripts/validate-knowledge-base.sh    # required-files + AGENTS.md size guard
bash scripts/lint-layered-architecture.sh  # forward-only import direction
bash scripts/lint-rbac-coverage.sh         # requireRole on every mutation route + sensitive GET
bash scripts/gardener.sh                   # markdown staleness + broken links
bun run typecheck                          # tsc --noEmit
bun run test:run                           # vitest unit (~10s, 2,366 tests)
bun run test:console                       # Playwright UI suite (100+ tests)
bun run test:e2e                           # Playwright PDF / report suite
bun run audit:verify                       # walks the audit hash chain in config/audit.db
```

CI runs `static`, `unit`, and `console-e2e` jobs on every PR — see `.github/workflows/test.yml`. The doc gardener also runs as a non-blocking check via `.github/workflows/knowledge-base.yml`.

## Code Style

Keep the repo legible to future agents:

- Update docs in the same PR as behavior changes when the docs would otherwise become false.
- Keep `AGENTS.md` short; move detailed rules into `docs/`.
- Use synthetic fixtures only.
- Do not copy private repo history or live operational details.
- Parse data at boundaries instead of relying on guessed shapes.

## Stack-specific conventions

Stack-specific rules live in `docs/references/` so the doc is co-located with what enforces it. Read these before touching the relevant surface:

- [`docs/references/layered-domain-architecture.md`](docs/references/layered-domain-architecture.md) — per-domain import-direction rule (enforced by `scripts/lint-layered-architecture.sh`).
- [`docs/references/sqlite-query-stability.md`](docs/references/sqlite-query-stability.md) — every `ORDER BY <ts> DESC` needs `, rowid DESC`; range builders use `Date.now() + 1`; `node-sqlite3` cache-visibility race + retry-shim convention.
- [`apps/ops-console/_headers`](apps/ops-console/_headers) — CSP discipline. New external script/style/font/image/media/connect destinations must be added to the explicit allowlists. `connect-src` and `media-src` are deliberately scoped (no `https:` wildcards). CSP violations log to `/api/csp-report`.
- [`lib/security.ts#maskApiKeysInText`](lib/security.ts) — extend the prefix list when adopting a new API provider. Test fixtures use synthetic placeholders that don't trip GitHub Push Protection.
- [`tests/unit/audit.test.ts > Hash Chain Integrity`](tests/unit/audit.test.ts) — three negative-path tests (UPDATE / DELETE / hash-mutate) cover every realistic tamper vector. Add a new test if you change `lib/audit.ts#computeHash` or the chain shape.
- [`docs/references/security-tooling.md`](docs/references/security-tooling.md) — RBAC coverage lint (`scripts/lint-rbac-coverage.sh`), `audit:verify` CLI, audit metadata redaction, dev-mode auth shim resolution order, CSP report Pages Function, Express response-header middleware. Read before adding a new mutation route or sensitive GET — adding either without `requireRole(...)` will fail CI.

## Filing a Pull Request

1. Create a branch from `main`.
2. Make the change.
3. Run validation.
4. Fill out the PR template with summary, change type, test notes, and related issue or plan.

## Asking Questions

Open an issue for bug reports or feature requests. Do not include secrets, live customer data, production webhook URLs, phone numbers, or private operational details in public issues.
