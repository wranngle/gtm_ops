# Execution Plan: Build Flagship Monorepo

Status: Active
Owner: wranngle
Created: 2026-04-30

## Goal

Build the first runnable public-safe proof for the ElevenLabs-aligned GTM engine.

## Scope

- `packages/agent-evals`
- `packages/data-reconciliation`
- `apps/ops-console`
- `fixtures`
- `workflows`
- `docs`

## Acceptance Criteria

- `packages/agent-evals` contains synthetic ElevenLabs eval fixtures and contract tests.
- `packages/data-reconciliation` contains Python CLI, local DuckDB or SQLite fixtures, SQL models, and pytest coverage.
- `apps/ops-console` runs locally without external services.
- README includes run commands, architecture diagram, and an ops-console screenshot.
- `scripts/validate-knowledge-base.sh` passes.
- Public-safety scan finds no live IDs, numbers, URLs, credentials, or private repo history.

## Decision Log

- Use one flagship monorepo instead of multiple public repos for sprint feasibility.
- Use DuckDB or SQLite before Postgres to keep reviewer setup friction low.
- Use Streamlit unless FastAPI+Jinja2 becomes clearly more appropriate.

