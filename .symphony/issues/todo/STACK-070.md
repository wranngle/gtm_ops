---
id: STACK-070
priority: 2
labels: stack,observability,tracing,symphony-elixir
blocked_by:
---
# Emit OTLP traces from Symphony Elixir for the agent-dispatch user journey

The Harness Engineering post explicitly mentions "no span in these four critical user journeys exceeds two seconds" as a query an agent should be able to make against the local observability stack. Today, only the logs and metrics legs of `tools/observability/` are populated end-to-end; the traces leg is wired from Vector to VictoriaTraces but no application emits OTLP spans, so `tools/observability/smoke.sh traces` reports SKIP and the cookbook's TraceQL queries return empty.

## Why now

The Symphony Elixir daemon is the natural producer for the first user journey: every issue dispatch produces a `turn/start` and a matching `turn/completed` event in the orchestrator. Those two events bracket a measurable user journey (the agent dispatch loop) and span boundaries map cleanly onto them.

## Acceptance criteria

- New module `tools/symphony-elixir/lib/symphony/tracing.ex` (or equivalent) that:
  - Lazily initializes an OTLP HTTP exporter pointing at `${OTLP_HTTP_ENDPOINT:-http://127.0.0.1:4318/v1/traces}`.
  - Exposes `Symphony.Tracing.span(name, attrs, fun)` that wraps a function in a span and records start/end times.
  - Reports failure spans with `status_code: error` when the wrapped fun raises or returns `{:error, _}`.
- `Symphony.Orchestrator` (and/or the future JSON-RPC adapter) wraps each `turn/start` → `turn/completed` window in `Symphony.Tracing.span("symphony.turn", %{user.journey: "agent-dispatch", issue.identifier: id}, fn -> ... end)`.
- `tools/observability/smoke.sh traces` is updated to:
  - Emit one synthetic OTLP span via the new `Symphony.Tracing` module (a `--smoke` mix task is fine), wait, query the Jaeger API, and assert the span landed.
  - Move from SKIP to PASS when the round-trip works.
- `docs/references/local-observability.md` TraceQL section is updated from "PLANNED" to "Live" with example queries that match the actual span attributes.
- Backwards compatibility: if the OTLP endpoint is unreachable, the orchestrator must NOT crash. Tracing is best-effort, just like the existing `Symphony.Logging` sink.

## Progress

- 2026-05-02: Added `Symphony.Tracing` with a small OTLP/HTTP protobuf
  exporter, `Symphony.Tracing.span/4`, and `mix symphony.trace_smoke`.
  The Elixir worker now wraps agent turns in a best-effort
  `symphony.turn` span, and `tools/observability/smoke.sh traces`
  emits + queries a real `symphony.trace_smoke` span. Live smoke passes
  against VictoriaTraces' direct OTLP insert endpoint.
- Remaining caveat: Vector 0.55 accepts the OTLP trace request at
  `:4318/v1/traces`, but its decoded trace event is not currently
  forwarded to VictoriaTraces as a valid `resourceSpans` envelope.
  Until that forwarding slice is fixed, set
  `OTLP_HTTP_ENDPOINT=http://127.0.0.1:10428/insert/opentelemetry/v1/traces`
  when you need `symphony.turn` spans to land locally.

## Out of scope

- Tracing the bash one-shot adapter (`scripts/symphony.sh`); that is a separate effort and harder because there is no long-lived process to amortize the span-buffer flush against. File a follow-up if needed.
- Multi-service distributed tracing across `packages/agent-evals` ↔ Symphony Elixir; do that once the JSON-RPC adapter exists (see TD-007).

## References

- `docs/references/openai_harness_engineering_original_spec.txt` lines 49-51 ("no span exceeds 2s")
- `docs/references/openai_symphony_harness_engineering_stack_diagrams_explained.txt` lines 91-205
- `tools/observability/vector.yaml` — the OTLP traces sink is already wired to `http://victoriatraces:10428/insert/opentelemetry/v1/traces`
- `tools/observability/smoke.sh` — the SKIP message in the traces leg names this issue by id
