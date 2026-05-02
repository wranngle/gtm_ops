# Local Observability — Query Cookbook

Reference queries an agent (or human) can run against the local
Vector + Victoria* stack defined in
[`tools/observability/`](../../tools/observability/). Every query is a
`curl` invocation so no client SDK is required.

> **Requires**: `cd tools/observability && docker compose up -d`. All
> endpoints are localhost-only by default. Run `tools/observability/smoke.sh`
> first to confirm the stack is wired correctly end-to-end.

This cookbook implements the right-hand half of the Harness Engineering
"Giving Codex a full observability stack" diagram (image #2). The agent
queries → correlates → reasons → implements a change → restarts the app
→ re-runs the workload → tests the UI journey → and loops on the same
queries until the signal improves.

## Endpoints

| Service          | URL                       | Query language |
|------------------|---------------------------|----------------|
| VictoriaLogs     | `http://127.0.0.1:9428`   | LogsQL         |
| VictoriaMetrics  | `http://127.0.0.1:8428`   | PromQL         |
| VictoriaTraces   | `http://127.0.0.1:10428`  | TraceQL (Jaeger-compatible) |
| OTLP HTTP intake | `http://127.0.0.1:4318`   | (push only, protobuf) |

## Smoke tests

The fastest path is to run the canned smoke test:

```bash
tools/observability/smoke.sh           # all legs
tools/observability/smoke.sh logs      # just the logs leg
tools/observability/smoke.sh metrics
tools/observability/smoke.sh traces
```

It verifies each Victoria service health endpoint, writes one ECS-jsonl
event into `.symphony/logs/symphony-smoke.jsonl` and reads it back via
LogsQL, pushes one Prometheus exposition counter and reads it back via
PromQL, and probes the VictoriaTraces Jaeger API. The traces round-trip
is reported as **SKIP** until something in the codebase emits real OTLP
spans (see STACK-070).

For a manual probe:

```bash
# 1. All services responding?
curl -fsS http://127.0.0.1:9428/health   && echo " VictoriaLogs ok"
curl -fsS http://127.0.0.1:8428/health   && echo " VictoriaMetrics ok"
curl -fsS http://127.0.0.1:10428/health  && echo " VictoriaTraces ok"

# 2. Vector running and reachable on the OTLP intake? (POST returns 400
#    on a bad protobuf body — that's enough proof the listener is alive.)
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST http://127.0.0.1:4318/v1/logs \
  --header 'Content-Type: application/x-protobuf' \
  --data 'x'  # expect 400

# 3. End-to-end log path: write one ECS-jsonl line, then read it back.
echo '{"@timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","log.level":"info","event.action":"observability.smoke","service.name":"manual-smoke","message":"hello"}' \
  >> .symphony/logs/symphony.jsonl
sleep 5   # Vector tail + VictoriaLogs index latency
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query=service.name:"manual-smoke" | last 1'
```

## LogsQL — Symphony orchestrator events

VictoriaLogs uses **LogsQL**, NOT LogQL/Loki. The two key differences
that trip up cookbook queries:

- Field filters use `field:"value"`, not `{field="value"}`.
- The freetext message field is `_msg` (the Vector config sets this from
  `.message` on every ECS-jsonl event).

```bash
# Last 50 events from the bash one-shot adapter.
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query=service.name:"wranngle-local-symphony" | last 50'

# Only failures.
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query=service.name:"wranngle-local-symphony" AND event.outcome:"failure" | last 50'

# Dispatch decisions in the last hour.
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query=service.name:"wranngle-local-symphony" AND event.action:"symphony.dispatch" AND _time:1h'

# All events for one specific issue.
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query=service.name:"wranngle-local-symphony" AND issue.identifier:"WGTE-001"'

# Freetext search across the message body (uses _msg).
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query=service.name:"wranngle-local-symphony" AND _msg:"workspace"'
```

## LogsQL — agent-evals + ops-console events

```bash
# Most recent agent-evals stderr-jsonl events.
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query=service.name:"agent-evals" | last 50'

# Failed evaluations only.
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query=service.name:"agent-evals" AND _msg:"evaluator.done"'
```

## PromQL — agent-evals counters

The `packages/agent-evals` metrics provider emits **Prometheus
exposition format** (text), not OTLP/JSON. The function name
`createOtlpHttpMetricsSink` is preserved as a deprecated alias, but the
wire format is exposition because Vector's `opentelemetry` source and
VictoriaMetrics's OTLP intake both reject JSON-encoded OTLP payloads
in the form earlier slices were emitting. Point the sink at:

```text
http://127.0.0.1:8428/api/v1/import/prometheus
```

Counters are cumulative monotonic. **Important**: PromQL `instant`
queries against VictoriaMetrics return empty for ~15-25 seconds after a
sample is ingested because of the rolling staleness window. If a query
returns `result:[]` immediately after a push, wait and retry, or use
the `/api/v1/series` endpoint to confirm the series is in storage.

```bash
# Total evaluations run since service start.
curl -fsS 'http://127.0.0.1:8428/api/v1/query' \
  --data-urlencode 'query=agent_evals_evaluations_total'

# Failed-evaluation rate over the last 5m.
curl -fsS 'http://127.0.0.1:8428/api/v1/query' \
  --data-urlencode 'query=rate(agent_evals_evaluations_failed_total[5m])'

# Top 5 failing rules over the last hour.
curl -fsS 'http://127.0.0.1:8428/api/v1/query' \
  --data-urlencode 'query=topk(5, sum by (rule) (increase(agent_evals_findings_failed_total[1h])))'

# Range query: 1h window, 30s steps, for a Grafana-style chart.
curl -fsS 'http://127.0.0.1:8428/api/v1/query_range' \
  --data-urlencode 'query=rate(agent_evals_evaluations_total[5m])' \
  --data-urlencode "start=$(date -u -d '1 hour ago' +%s)" \
  --data-urlencode "end=$(date -u +%s)" \
  --data-urlencode 'step=30s'

# Diagnostic: confirm a series exists in storage (works immediately
# after ingest, even when the PromQL instant query is still empty).
curl -fsS 'http://127.0.0.1:8428/api/v1/series' \
  --data-urlencode 'match[]=agent_evals_evaluations_total'
```

## TraceQL — Symphony spans (PLANNED — no spans are emitted yet)

> **Status**: VictoriaTraces is running and the Vector OTLP traces sink
> is wired (see `tools/observability/vector.yaml`), but **nothing in
> the codebase emits OTLP spans yet**. Queries below are documented as
> placeholders so the path is obvious; until STACK-070 lands they will
> all return empty.

The Elixir daemon's snapshot interface exposes per-tick `last_tick_at`
and per-issue `turn_count`, but these are not yet shaped as OTLP spans.
STACK-070 designs a `Symphony.Tracing` module that emits one span per
`turn/start` → `turn/completed` window from the JSON-RPC adapter.

Once spans are flowing, the queries below become useful. VictoriaTraces
exposes a Jaeger-compatible API:

```bash
# List services (returns {} until spans exist).
curl -fsS 'http://127.0.0.1:10428/select/jaeger/api/services'

# All spans for one service.
curl -fsS 'http://127.0.0.1:10428/select/jaeger/api/traces' \
  --data-urlencode 'service=wranngle-local-symphony'

# Slowest 10 turns in the last hour (TraceQL-style; exact syntax depends
# on the VictoriaTraces version, see https://docs.victoriametrics.com/victoriatraces/).
```

## "Service startup completes in under 800ms" example

The Harness Engineering post calls out two concrete questions an agent
should be able to ask:

1. **"Ensure service startup completes in under 800ms."** — implement as
   a PromQL query against a `service_startup_duration_ms` histogram
   emitted by `Application.start/2`:
   ```bash
   curl -fsS 'http://127.0.0.1:8428/api/v1/query' \
     --data-urlencode 'query=histogram_quantile(0.95, sum(rate(service_startup_duration_ms_bucket[5m])) by (le, service))'
   ```
   Series doesn't exist yet — file a follow-up ticket to add a startup
   timer histogram to `Symphony.Application.start/2`.

2. **"No span in these four critical user journeys exceeds two seconds."** —
   implement as a TraceQL query that filters by `user_journey` tag and
   returns spans where `duration > 2s`:
   ```bash
   # Once STACK-070 lands and emits user-journey-tagged spans:
   curl -fsS 'http://127.0.0.1:10428/select/jaeger/api/traces' \
     --data-urlencode 'service=wranngle-local-symphony' \
     --data-urlencode 'tags={"user.journey":"agent-dispatch"}' \
     --data-urlencode 'minDuration=2s'
   ```

## ops-console wiring (planned)

The Streamlit ops-console at `apps/ops-console/` reads
`EvaluationResult[]` JSON today. A future slice will:

- Add a `domain.MetricsClient` that issues PromQL queries against
  `http://127.0.0.1:8428` for the four counters above.
- Render trend charts via Streamlit's `st.line_chart`.

That work is **outside the canonicalization in-scope** and lands
alongside showcase project work after the stack closes out.

## Operational notes

- **Per-worktree isolation**: set `OBSERVABILITY_PROJECT=<name>` before
  `docker compose up -d` to namespace containers, networks, AND volumes.
  Default is `wranngle-obs`. Verify with
  `OBSERVABILITY_PROJECT=foo docker compose -p foo config | grep -E "name|container_name"`.
- **Reset state**: `docker compose down -v` nukes both containers and
  volumes; data is gone. Use `docker compose down` (no `-v`) to keep
  the data warehouse across restarts.
- **Tear down everything**: `docker compose down -v && docker volume prune`
  if you also want to clear orphaned volumes.
- **Vector tail buffer**: by default Vector reads
  `.symphony/logs/*.jsonl` from a 1s tail. New events surface within
  3-10 seconds (Vector tail latency + VictoriaLogs index flush).
- **PromQL instant-query staleness**: VictoriaMetrics rolls a
  ~15-25 second staleness window before a freshly-pushed sample is
  visible to `/api/v1/query`. The series is visible to
  `/api/v1/series` immediately. The smoke test polls both.

## Where these queries get exercised

- The bash one-shot Symphony adapter (`scripts/symphony.sh`) emits ECS-jsonl
  to `.symphony/logs/symphony.jsonl` on every `validate`, `list`,
  `once` invocation. Vector tails this file.
- The Elixir daemon (`tools/symphony-elixir/`) emits via
  `Symphony.Logging.Sink {:file, "<path>"}`. The default in `:prod` is
  `.symphony/logs/symphony-elixir.jsonl` (Vector tails this path).
- `packages/agent-evals` writes ECS-jsonl to a configured sink
  (default stderr). Set `AGENT_EVALS_LOG_FILE` to a path under
  `.symphony/logs/` to feed it into the same pipeline.
- `apps/ops-console` does not emit logs/metrics yet (planned).

## Related references

- [`tools/observability/README.md`](../../tools/observability/README.md): chassis overview + endpoints
- [`tools/observability/docker-compose.yml`](../../tools/observability/docker-compose.yml): the compose chassis
- [`tools/observability/vector.yaml`](../../tools/observability/vector.yaml): Vector config (file tail + OTLP intake → Victoria sinks)
- [`tools/observability/smoke.sh`](../../tools/observability/smoke.sh): end-to-end smoke test
- [`docs/references/harness-engineering.md`](harness-engineering.md): the source loop this stack implements
