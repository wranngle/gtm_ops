# Repository knowledge base

Product runtime documentation. The system of record is here, in this repo — if a decision is not encoded here, future agents cannot see it.

## Top-level

- [`README.md`](../README.md) — product frame and how to run it
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — product layers (intake → enrichment → voice → post-call → presales → ops-console)
- [`DESIGN.md`](../DESIGN.md) — brand system (long-form)
- [`AGENTS.md`](../AGENTS.md) — agent operating map
- [`eval-harness-contract.md`](eval-harness-contract.md) — boundary between this app and `voice_ai_agent_evals`
- [`DATA-MODEL.md`](DATA-MODEL.md) — the SQL schema surfaced: Postgres + SQLite/D1 shapes, table-by-table
- [`api.md`](api.md) — the HTTP `/api/*` surface (Express + Pages Functions)
- [`pipeline-internals.md`](pipeline-internals.md) — presales pipeline architecture deep-dive

## Audits & dated snapshots

- [`cf-fullstack-feasibility.md`](cf-fullstack-feasibility.md) — Cloudflare Pages full-stack feasibility audit (2026-05-03)
- [`route-coverage.md`](route-coverage.md) — route coverage probe output (SYM-010)
- [`lighthouse-baseline.md`](lighthouse-baseline.md) — Lighthouse baseline (stale-marked; pre-polish commit)
- [`typecheck-triage.md`](typecheck-triage.md) — typecheck error triage (resolved — historical; typecheck is CI-gated clean)
- [`branch-dispositions.md`](branch-dispositions.md) — 2026-07-02 audit of every `origin/*` branch ahead of main: landed / archived / superseded, with rationale

## Subdirectories

- [`generated/`](generated/README.md) — generated schemas, reports, inventories
- [`product-specs/`](product-specs/index.md) — product and operator specs
- [`references/`](references/README.md) — stack contracts encoded for agents

## References

- [`references/layered-domain-architecture.md`](references/layered-domain-architecture.md) — per-domain import-direction rule, enforced by `scripts/lint-layered-architecture.sh`
- [`references/pdf-generation.md`](references/pdf-generation.md) — PyMuPDF proposal rendering contract and install path
- [`references/sqlite-query-stability.md`](references/sqlite-query-stability.md) — `ORDER BY` tiebreaker rule, range-end +1ms fix, retry-shim convention for the residual `node-sqlite3` cache-visibility race, and the planned `better-sqlite3` migration
- [`references/security-tooling.md`](references/security-tooling.md) — RBAC coverage lint, `audit:verify` CLI, audit metadata redaction, dev auth shim resolution order, CSP report Pages Function, Express response-header middleware
- [`references/doc-gardener.md`](references/doc-gardener.md) — weekly markdown staleness + broken-link scan contract (`scripts/gardener.sh`)
