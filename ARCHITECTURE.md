# Architecture

`wranngle-gtm-engine` is a clean-room monorepo for a synthetic, public-safe GTM automation system. It should prove four things in one inspectable place:

1. ElevenLabs agent evaluation and webhook contracts.
2. GTM workflow orchestration with sanitized n8n examples.
3. Python-first internal operator tooling.
4. Python/SQL usage and revenue reconciliation.

## Target Layout

```text
apps/
  ops-console/              # Streamlit or FastAPI+Jinja2 operator UI
packages/
  agent-evals/              # Bun/TypeScript ElevenLabs eval harness
  data-reconciliation/      # Python CLI, DuckDB/SQLite fixtures, SQL models
  shared/                   # Shared schemas, test helpers, fixtures
workflows/                  # Sanitized n8n workflow examples
fixtures/                   # Synthetic leads, calls, transcripts, usage events
docs/                       # System of record for agents and humans
tests/                      # Cross-package smoke and contract tests
```

## Layer Rule

Each business domain should follow a small layered model:

```text
types -> config -> repo -> service -> runtime -> ui
providers -> service
utils -> providers
```

Rules:

- `types` defines parsed shapes and public contracts.
- `config` normalizes environment and runtime configuration.
- `repo` reads and writes storage or fixture-backed state.
- `service` owns business rules.
- `runtime` wires services to CLIs, webhooks, jobs, or servers.
- `ui` renders operator-facing views and must not bypass services.
- `providers` are explicit boundaries for cross-cutting integrations such as telemetry, clocks, secrets, external APIs, and filesystem access.
- `utils` must stay generic and must not import business domains.

When in doubt, add a small boundary parser instead of probing data by assumption.

## Package Responsibilities

### `packages/agent-evals`

Owns synthetic ElevenLabs Conversational AI evaluation flow:

- simulated conversation fixtures
- webhook contract tests
- transcript extraction tests
- golden transcript regressions
- eval summaries used by the ops console

### `packages/data-reconciliation`

Owns Python/SQL proof for GTM/Ops/Finance:

- local DuckDB or SQLite warehouse fixtures
- SQL models for lead pipeline and call economics
- Python CLI for reconciliation and markdown ops digest output
- tests around cost, usage, margin, and anomaly detection

### `apps/ops-console`

Owns internal tooling proof:

- synthetic lead inbox
- webhook replay controls
- eval run inspection
- usage/revenue reconciliation summary
- audit log view
- secret rotation workflow mock

Prefer Streamlit for first implementation unless FastAPI+Jinja2 is needed for clearer routing or HTML-level validation.

## Feedback Loops

This repo should become legible to agents through runnable feedback:

- unit and contract tests
- synthetic fixtures
- knowledge-base validation
- screenshots for UI changes once the ops console exists
- local logs and metrics once the app runtime exists

Do not rely on external chat, private repos, or human memory for behavior that future agents need to preserve.

