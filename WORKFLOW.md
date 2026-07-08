---
workflow_name: project-symphony

tracker:
  kind: local_markdown
  issues_root: .symphony/issues
  active_states:
    - todo
    - in_progress
  terminal_states:
    - done
    - cancelled
    - duplicate

polling:
  interval_ms: 30000

workspace:
  root: .symphony/workspaces

agent:
  command: scripts/bin/llm.sh
  max_concurrent_agents: 1

codex:
  command: scripts/bin/llm.sh
  read_timeout_ms: 5000
  turn_timeout_ms: 3600000
---
# Project Symphony Workflow — gtm_ops

You are operating inside `gtm_ops`, an agent-first GTM operations repo. Complete the assigned task using the repository's local knowledge base and validation loops. Repository-local knowledge is the system of record; if a decision is not encoded here, assume future agents cannot see it.

## Required reading (progressive disclosure)

1. `README.md` — product frame
2. `ARCHITECTURE.md` — product layers; required reading before changing code layout, package boundaries, or dependency direction
3. `DESIGN.md` — brand system; required reading before any UI/PDF/email change
4. `docs/index.md` — knowledge-base index
5. `docs/references/layered-domain-architecture.md` — per-domain import direction rule, enforced by `scripts/lint-layered-architecture.sh`

## Tech stack

- Runtime: Bun + Express; persistence via `node-sqlite3` (`lib/db.ts`, see `docs/references/sqlite-query-stability.md`), with sql.js only in the pricing/estimate config readers; vitest for tests
- Operator UI: `apps/ops-console/` (static + live modes), deployed to Cloudflare Pages (`wrangler.toml`, `_headers`, `_redirects`)
- Domain libs under `lib/`: intake, enrichment, post-call, extraction, pdf, branding, audit, evaluation
- Entrypoints: `server.ts`, `cli.ts`

## Core rules

- Respect the layered-domain architecture rule in `docs/references/layered-domain-architecture.md`; do not introduce inbound imports that violate per-domain direction.
- DEMO_MODE constraint: `apps/ops-console/` must work without API keys. Never make the static console depend on live credentials; gate live integrations behind explicit env flags.
- Parse and validate data at boundaries. Do not build on guessed JSON shapes.
- Keep public artifacts synthetic. Nothing copied verbatim from private operational repos.
- Update docs in the same change as behavior when docs would otherwise become false.

## Validation gates (run before declaring done)

```bash
bash scripts/validate-knowledge-base.sh
bash scripts/lint-layered-architecture.sh
bash scripts/gardener.sh           # markdown staleness + broken links
bun run lint                       # xo
bun run typecheck                  # tsc --noEmit
bun run test:run                   # vitest unit
bun run test:console               # Playwright UI suite (when touching apps/ops-console/console/)
```

`bun run test:e2e` (Playwright PDF / report suite) is needed only when touching `templates/` or the proposal-generation surface.

## Commit message style

Match recent history (`git log --oneline | head -5`): conventional-commit prefix + scope + concise imperative summary, e.g. `feat(deploy): ...`, `fix(tests): ...`, `chore(lint): ...`. Prefer one focused commit per logical change.
