# Execution Plan: Build Flagship Monorepo

Status: Active (showcase work, **on hold pending stack canonicalization**)
Owner: wranngle
Created: 2026-04-30
Last reviewed: 2026-05-01

## Goal

Build the first runnable public-safe proof for the showcase product on top of
the canonical stack.

## Relationship to other plans

This plan is **paused** while plan
[003-stack-canonicalization.md](003-stack-canonicalization.md) finishes the
Symphony Elixir daemon, Edge MCP wiring, and full local observability stack
per the owner directive (2026-04-30):

> The harness/symphony machinery comes first to enable proper development of
> the actual project. Avoid polluting the harness/symphony stack with the
> project-specific. … If you wrap all that up then and only then can you begin
> the showcase project.

Closed slices below remain valid; pending slices are deferred until plan 003
closes.

## Scope

- `packages/agent-evals` (DONE — layered package + tests + CLI runnable)
- `apps/ops-console` (PARTIAL — Streamlit stub + pure-Python `domain.py` + pytest)
- `packages/data-reconciliation` (DEFERRED — directory not yet created)
- `fixtures/` (DEFERRED — currently inlined per-package)
- `workflows/` (DEFERRED — sanitized n8n examples)
- `docs/` (CONTINUOUS — updated as slices land)

## Acceptance Criteria

- [x] `packages/agent-evals` contains synthetic ElevenLabs-style eval fixtures and contract tests.
- [ ] `packages/data-reconciliation` contains Python CLI, local DuckDB or SQLite fixtures, SQL models, and pytest coverage.
- [partial] `apps/ops-console` runs locally without external services (Streamlit stub does; full UI not yet).
- [ ] README includes run commands, architecture diagram, and an ops-console screenshot.
- [x] `scripts/validate-knowledge-base.sh` passes.
- [x] Public-safety scan finds no live IDs, numbers, URLs, credentials, or private repo history.

## Decision Log

- Use one flagship monorepo instead of multiple public repos for sprint feasibility.
- Use DuckDB or SQLite before Postgres to keep reviewer setup friction low.
- Use Streamlit unless FastAPI+Jinja2 becomes clearly more appropriate.
- Pause showcase-only slices until the canonical stack closes (per plan 003 directive 2026-04-30).

