---
id: STACK-072
priority: 3
labels: stack,observability,ops-console,dashboards
blocked_by: STACK-070
---
# Wire the ops-console to render live LogsQL/PromQL/TraceQL panels

The Harness Engineering post's observability loop ends with "Codex queries → correlates → reasons → implements change → restarts app → re-runs workload → tests UI journey → loops". Today, the queries are documented in `docs/references/local-observability.md` as `curl` invocations, but the human-readable dashboard surface that closes the loop is a stub: `apps/ops-console/` reads static `EvaluationResult[]` JSON and does not query the live Victoria* services.

## Why now

The bash adapter, the Elixir daemon, and the agent-evals package all emit the right wire formats. Once STACK-070 lands, all three signal types (logs, metrics, traces) will be live. The remaining gap is a per-issue dashboard that an operator (or, eventually, an agent-as-operator) can open to see "is the agent dispatch loop healthy right now?" without remembering the LogsQL/PromQL syntax.

## Acceptance criteria

- New `apps/ops-console/domain/observability_client.py` (or equivalent) with three methods:
  - `recent_events(service, limit)` — issues a LogsQL query to `/select/logsql/query` and returns parsed events.
  - `series(metric, range)` — issues a PromQL `query_range` and returns a pandas-friendly DataFrame.
  - `slow_spans(service, threshold_ms)` — issues a TraceQL/Jaeger query and returns the top-N slowest spans.
- A new Streamlit page (e.g., `apps/ops-console/pages/02_Observability.py`) that:
  - Lists the last N Symphony events for the selected service.
  - Renders a line chart of `agent_evals_evaluations_total` rate over the last hour.
  - Lists the slowest 10 spans (when STACK-070 lands).
- The page links back to the corresponding LogsQL/PromQL/TraceQL queries in `docs/references/local-observability.md` so an operator can drop into raw `curl` for follow-up investigation.
- Unit tests for `ObservabilityClient` use the in-memory `unittest.mock` to verify URL construction; no live HTTP calls.
- The page degrades gracefully when the stack is down: each panel shows "stack offline (start `tools/observability/docker compose up -d`)" instead of crashing.

## Out of scope

- A "Grafana-style" full panel/dashboard library; this is a single page with three panels.
- Authentication / authorization on the panels. The stack is localhost-only by design.
- Real-time streaming via Vector's API; periodic poll on Streamlit auto-refresh is enough.

## References

- `docs/references/openai_harness_engineering_original_spec.txt` lines 49-51 (the loop)
- `docs/references/local-observability.md` (the queries this page invokes)
- `apps/ops-console/` (current Streamlit chassis)
- STACK-070 (provides the traces leg this issue depends on)
