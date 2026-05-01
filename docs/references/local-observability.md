# Local Observability — Query Cookbook

Reference queries an agent (or human) can run against the local
Vector + Victoria* stack defined in
[`tools/observability/`](../../tools/observability/). Every query is a
`curl` invocation so no client SDK is required.

> **Requires**: `cd tools/observability && docker compose up -d`. All
> endpoints are localhost-only by default.

## Endpoints

| Service          | URL                       | Query language |
|------------------|---------------------------|----------------|
| VictoriaLogs     | `http://127.0.0.1:9428`   | LogsQL         |
| VictoriaMetrics  | `http://127.0.0.1:8428`   | PromQL         |
| VictoriaTraces   | `http://127.0.0.1:10428`  | TraceQL        |
| OTLP HTTP intake | `http://127.0.0.1:4318`   | (push only)    |

## Smoke tests (run after `docker compose up -d`)

```bash
# 1. All services responding?
curl -fsS http://127.0.0.1:9428/health   && echo " VictoriaLogs ok"
curl -fsS http://127.0.0.1:8428/health   && echo " VictoriaMetrics ok"
curl -fsS http://127.0.0.1:10428/health  && echo " VictoriaTraces ok"
# Vector exposes its API on its container; healthcheck is via `docker inspect`.
docker inspect "$(docker compose ps -q vector)" --format '{{.State.Health.Status}}'

# 2. End-to-end log path: write one ECS-jsonl line and confirm it lands.
echo '{"@timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","log.level":"info","event.action":"observability.smoke","service.name":"wranngle-local-symphony","message":"hello"}' \
  >> .symphony/logs/symphony.jsonl
sleep 3   # Vector tail interval
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query={service.name="wranngle-local-symphony"} | last 1' | head

# 3. End-to-end metrics path: emit one OTLP counter via agent-evals.
AGENT_EVALS_OTLP_ENDPOINT=http://127.0.0.1:4318/v1/metrics \
  bun --cwd packages/agent-evals run src/runtime/cli.ts \
  packages/agent-evals/fixtures/conversations.json >/dev/null
sleep 3
curl -s 'http://127.0.0.1:8428/api/v1/query' \
  --data-urlencode 'query=agent_evals_evaluations_total' | head
```

## LogsQL — Symphony orchestrator events

```bash
# Last 50 events from the bash one-shot adapter.
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query={service.name="wranngle-local-symphony"} | last 50'

# Only failures.
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query={service.name="wranngle-local-symphony"} event.outcome="failure" | last 50'

# Dispatch decisions in the last hour.
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query={service.name="wranngle-local-symphony"} event.action="symphony.dispatch" _time:1h'

# All events for one specific issue.
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query={service.name="wranngle-local-symphony"} issue.identifier="WGTE-001"'
```

## LogsQL — agent-evals + ops-console events

```bash
# Most recent agent-evals stderr-jsonl events.
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query={service.name="agent-evals"} | last 50'

# Failed evaluations only.
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query={service.name="agent-evals"} message:"evaluator.done" failed:>0'
```

## PromQL — agent-evals counters

The OTLP HTTP intake (`http://127.0.0.1:4318/v1/metrics`) accepts the
JSON shape produced by
[`packages/agent-evals/src/providers/metrics.ts`](../../packages/agent-evals/src/providers/metrics.ts).
Counters are cumulative monotonic.

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
```

## TraceQL — Symphony spans (planned)

The Elixir daemon's snapshot interface exposes per-tick `last_tick_at`
and per-issue `turn_count`, but **no spans are emitted yet**. When the
Codex app-server JSON-RPC adapter lands (TD-007 follow-on), it will
emit one span per `turn/start` → `turn/completed` window via OTLP HTTP
to the traces intake.

Once that ships, useful TraceQL queries will include:

```bash
# All spans for one issue.
curl -fsS 'http://127.0.0.1:10428/select/jaeger/api/traces' \
  --data-urlencode 'service=wranngle-local-symphony' \
  --data-urlencode 'tags={"issue.identifier":"WGTE-001"}'

# Slowest 10 turns in the last hour.
# (TraceQL syntax depends on the VictoriaTraces version; placeholder.)
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
  `docker compose up -d` to namespace containers and volumes.
  Default is `wranngle-obs`.
- **Reset state**: `docker compose down -v` nukes both containers and
  volumes; data is gone. Use `docker compose down` (no `-v`) to keep
  the data warehouse across restarts.
- **Tear down everything**: `docker compose down -v && docker volume prune`
  if you also want to clear orphaned volumes.
- **Vector tail buffer**: by default Vector reads
  `.symphony/logs/*.jsonl` from a 1s tail. New events surface within
  3-5 seconds.

## Where these queries get exercised

- The bash one-shot Symphony adapter (`scripts/symphony.sh`) emits ECS-jsonl
  to `.symphony/logs/symphony.jsonl` on every `validate`, `list`,
  `once` invocation. Vector tails this file.
- The Elixir daemon (`tools/symphony-elixir/`) emits via
  `Symphony.Logging.Sink {:file, "<path>"}`. Point the path at
  `.symphony/logs/symphony.jsonl` (or any other path Vector tails).
- `packages/agent-evals` writes ECS-jsonl to a configured sink
  (default stderr). Set `AGENT_EVALS_LOG_FILE` to a path under
  `.symphony/logs/` to feed it into the same pipeline.
- `apps/ops-console` does not emit logs/metrics yet (planned).

## Related references

- [`tools/observability/README.md`](../../tools/observability/README.md): chassis overview + endpoints
- [`tools/observability/docker-compose.yml`](../../tools/observability/docker-compose.yml): the compose chassis
- [`tools/observability/vector.yaml`](../../tools/observability/vector.yaml): Vector config (file tail + OTLP intake → Victoria sinks)
- [`docs/references/harness-engineering.md`](harness-engineering.md): the source loop this stack implements
