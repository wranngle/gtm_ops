# observability

Local Vector + Victoria{Logs,Metrics,Traces} stack so agents can query
the harness with LogsQL / PromQL / TraceQL — per the Harness Engineering
post's "give Codex a full observability stack in local dev" loop
(image #2 in `docs/references/`).

## Run

```bash
cd tools/observability
docker compose up -d
docker compose ps           # all services healthy?
docker compose logs vector  # check Vector wired up cleanly (no WARN/ERROR)
./smoke.sh                  # end-to-end round-trip check

# tear down (volumes preserved):
docker compose down

# tear down + nuke volumes (start fresh):
docker compose down -v
```

Per-worktree isolation: `OBSERVABILITY_PROJECT=<name>` namespaces
containers, networks, AND volumes. Verify with:

```bash
OBSERVABILITY_PROJECT=foo docker compose -p foo config \
  | grep -E "(name|container_name):"
```

Default project is `wranngle-obs`.

## Endpoints (host-localhost)

- VictoriaLogs:    `http://127.0.0.1:9428` — LogsQL via `/select/logsql/query`
- VictoriaMetrics: `http://127.0.0.1:8428` — PromQL via `/api/v1/query`
- VictoriaTraces:  `http://127.0.0.1:10428` — TraceQL / Jaeger via `/select/jaeger/api`
- OTLP HTTP intake (for apps): `http://127.0.0.1:4318` (POST + protobuf only)

## Wiring apps to emit

### `packages/agent-evals` (TypeScript)

The package already emits ECS-jsonl via `LogSink`. Two routes:

1. **File sink** (default in CI / dev): `AGENT_EVALS_LOG_FILE=.logs/events.jsonl`,
   then Vector tails `.logs/*.jsonl` and ships to VictoriaLogs.
2. **OTLP HTTP** (when running against the stack): future slice — add an
   `OtlpHttpSink` that POSTs to `http://127.0.0.1:4318/v1/logs`.

### `apps/ops-console` (Python)

Future slice — add Streamlit's `st.cache_data` + custom logger that writes
ECS-jsonl to a file Vector tails, plus OTLP metrics for evaluation render
counts.

### `tools/symphony-elixir`

Future slice — `:logger` backend that writes ECS-jsonl to
`.symphony/logs/symphony.jsonl` (Vector already tails this path).

## Sample queries

```bash
# Recent Symphony events (LogQL)
curl -s 'http://127.0.0.1:9428/select/logsql/query' \
  --data 'query={service.name="wranngle-local-symphony"}' | head

# Eval failures over time (PromQL — once metrics emit)
curl -s 'http://127.0.0.1:8428/api/v1/query' \
  --data-urlencode 'query=rate(agent_evals_findings_failed_total[5m])'
```

## Staged delivery

This is the docker-compose chassis. Live wiring of each emitter lands in
follow-up slices (TD-002 sub-tasks). Until those land, Vector tails
whatever JSONL files the existing scripts already produce
(`.symphony/logs/symphony.jsonl`).

## Notes

- VictoriaTraces is newer; if the `v0.4.1` image tag is broken on your host,
  bump it. The compose stack tolerates a missing traces backend (Vector
  still ships logs and metrics).
- Volumes survive `docker compose down`. Use `down -v` to truly reset.
- Network access: only host-localhost. No external publishing.
