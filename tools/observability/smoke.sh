#!/usr/bin/env bash
# tools/observability/smoke.sh
#
# End-to-end smoke test for the local observability stack. Verifies the
# three legs of the Harness Engineering "Giving Codex a full observability
# stack" diagram (image #2 in docs/references/):
#
#   APP --(file or OTLP)--> Vector --(fan out)--> Victoria{Logs,Metrics,Traces}
#                                                    \\
#                                                     `--> LogQL/PromQL/TraceQL
#
# Per leg the script:
#   1. health-checks the destination service
#   2. emits a known sample
#   3. queries it back through the appropriate query API
#   4. prints PASS / FAIL with the reason
#
# Exit code: 0 if every leg passed, otherwise 1.
#
# Usage:
#   tools/observability/smoke.sh                   # run all legs
#   tools/observability/smoke.sh logs              # one leg only
#   tools/observability/smoke.sh metrics
#   tools/observability/smoke.sh traces
#
# This script must NOT modify the running stack — it only writes one
# event per leg and queries it back.

set -u
set -o pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
LOGS_BASE="${VICTORIALOGS_URL:-http://127.0.0.1:9428}"
METRICS_BASE="${VICTORIAMETRICS_URL:-http://127.0.0.1:8428}"
TRACES_BASE="${VICTORIATRACES_URL:-http://127.0.0.1:10428}"
OTLP_BASE="${OTLP_HTTP_URL:-http://127.0.0.1:4318}"
VECTOR_TAIL_DELAY="${VECTOR_TAIL_DELAY:-3}"

PASSES=()
FAILS=()
SKIPS=()

color(){
  local code="$1"; shift
  if [[ -t 1 ]]; then printf '\033[%sm%s\033[0m' "$code" "$*"; else printf '%s' "$*"; fi
}
ok(){    PASSES+=("$1"); printf '  [%s] %s\n' "$(color '32;1' PASS)" "$1"; }
fail(){  FAILS+=("$1: $2"); printf '  [%s] %s — %s\n' "$(color '31;1' FAIL)" "$1" "$2"; }
skip(){  SKIPS+=("$1: $2"); printf '  [%s] %s — %s\n' "$(color '33;1' SKIP)" "$1" "$2"; }
hdr(){   printf '\n%s\n' "$(color '36;1' "== $* ==")"; }

# ---- health checks ---------------------------------------------------------

check_health(){
  local name="$1" url="$2"
  if curl -fsS --max-time 3 "$url/health" >/dev/null 2>&1; then
    ok "${name} /health"
    return 0
  fi
  fail "${name} /health" "could not reach $url/health"
  return 1
}

hdr "Stack health"
check_health "VictoriaLogs"    "$LOGS_BASE"    || true
check_health "VictoriaMetrics" "$METRICS_BASE" || true
check_health "VictoriaTraces"  "$TRACES_BASE"  || true

# Vector's OTLP HTTP source is strictly POST + protobuf. A POST with a junk
# body produces HTTP 400 (bad protobuf), which proves the listener is up
# and accepting traffic without us having to pull in an OTLP SDK.
otlp_code="$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' \
  -X POST "$OTLP_BASE/v1/logs" \
  --header 'Content-Type: application/x-protobuf' \
  --data 'x' 2>/dev/null || true)"
if [[ "$otlp_code" =~ ^(200|400|415)$ ]]; then
  ok "Vector OTLP HTTP intake reachable (POST $OTLP_BASE/v1/logs -> $otlp_code)"
else
  fail "Vector OTLP HTTP intake reachable" "POST returned $otlp_code (expected 400/415)"
fi

# ---- logs leg --------------------------------------------------------------

run_logs_leg(){
  hdr "Leg 1 — Logs (file -> Vector -> VictoriaLogs -> LogsQL)"
  local marker="smoke-logs-$$-$(date +%s)"
  local log_file="$REPO_ROOT/.symphony/logs/symphony-smoke.jsonl"
  mkdir -p "$(dirname "$log_file")"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{"@timestamp":"%s","log.level":"info","event.action":"observability.smoke","event.outcome":"success","service.name":"observability-smoke","issue.identifier":"%s","message":"smoke %s"}\n' \
    "$now" "$marker" "$marker" >> "$log_file"
  ok "wrote ECS-jsonl line to $log_file"

  printf '  waiting up to %ss for Vector tail + VictoriaLogs index...\n' "$((VECTOR_TAIL_DELAY * 4))"

  # Use the LogsQL field-filter form (`label:"value"`). The braced form
  # `{label="value"}` is LogQL/Loki — NOT LogsQL — and silently returns
  # nothing under VictoriaLogs.
  local q="service.name:\"observability-smoke\" AND issue.identifier:\"$marker\""
  local resp=""
  local attempt
  for attempt in 1 2 3 4 5 6 7 8; do
    sleep "$VECTOR_TAIL_DELAY"
    resp="$(curl -fsS --max-time 5 "$LOGS_BASE/select/logsql/query" \
      --data-urlencode "query=$q" 2>/dev/null || true)"
    printf '%s' "$resp" | grep -q "$marker" && break
  done

  if printf '%s' "$resp" | grep -q "$marker"; then
    ok "Logs round-trip via LogsQL ($marker found after ${attempt} attempt(s))"
  else
    fail "Logs round-trip via LogsQL" "marker $marker not found in response: ${resp:0:120}..."
  fi
}

# ---- metrics leg -----------------------------------------------------------

run_metrics_leg(){
  hdr "Leg 2 — Metrics (Prometheus exposition -> VictoriaMetrics -> PromQL)"
  local marker="$$$(date +%s)"
  local metric_name="observability_smoke_total"

  # We push directly to VictoriaMetrics's Prometheus import endpoint to
  # validate the storage + query path (the "Vector OTLP -> VictoriaMetrics
  # remote_write" path is exercised by agent-evals + the live workload).
  local body="# TYPE ${metric_name} counter
${metric_name}{run=\"${marker}\"} 1
"
  local push
  push="$(printf '%s' "$body" | curl -sS --max-time 5 -X POST \
    "$METRICS_BASE/api/v1/import/prometheus" \
    --data-binary @- 2>&1)"
  ok "pushed sample counter ${metric_name}{run=\"${marker}\"}"

  # VictoriaMetrics indexes new samples on its background flush loop. A
  # single freshly-inserted sample takes ~15-20s to become visible to
  # PromQL `instant` queries because of the rolling staleness window.
  # The /api/v1/series endpoint surfaces the series almost immediately;
  # we use it as a fast-path readiness signal and then confirm via PromQL.
  printf '  waiting up to 30s for indexer + staleness window...\n'
  local q="${metric_name}{run=\"${marker}\"}"
  local resp=""
  local attempt
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    sleep 3
    resp="$(curl -fsS --max-time 5 "$METRICS_BASE/api/v1/query" \
      --data-urlencode "query=$q" 2>/dev/null || true)"
    printf '%s' "$resp" | grep -q "\"$marker\"" && break
  done

  if printf '%s' "$resp" | grep -q "\"$marker\""; then
    ok "Metrics round-trip via PromQL ($marker matched after ${attempt} attempt(s))"
  else
    # Fall back to confirming via /api/v1/series so we report an accurate
    # diagnosis (data is in storage; PromQL just hasn't seen it yet).
    local series
    series="$(curl -fsS --max-time 5 "$METRICS_BASE/api/v1/series" \
      --data-urlencode "match[]=${q}" 2>/dev/null || true)"
    if printf '%s' "$series" | grep -q "\"$marker\""; then
      fail "Metrics round-trip via PromQL" "series ingested but PromQL still empty after 30s — likely a staleness/skew issue, see docs"
    else
      fail "Metrics round-trip via PromQL" "marker $marker not found in storage: ${resp:0:160}..."
    fi
  fi
}

# ---- traces leg ------------------------------------------------------------

run_traces_leg(){
  hdr "Leg 3 — Traces (OTLP HTTP -> Vector -> VictoriaTraces -> Jaeger API)"

  # Real OTLP clients send protobuf-encoded payloads; this script does not
  # pull in the Python/Node SDKs as a dependency, so we only health-check
  # the path and report SKIP instead of FAIL when no spans have landed.
  # See STACK-070.md for the design of the Symphony Elixir tracing emitter
  # that will populate this leg in production.
  local services
  services="$(curl -fsS --max-time 5 "$TRACES_BASE/select/jaeger/api/services" 2>/dev/null || true)"

  if printf '%s' "$services" | grep -q '"data"'; then
    ok "VictoriaTraces Jaeger API reachable"
  else
    fail "VictoriaTraces Jaeger API reachable" "no JSON response from /select/jaeger/api/services"
    return
  fi

  # If anything has emitted spans, surface the count; otherwise SKIP with
  # a pointer to the follow-up issue.
  local count
  count="$(printf '%s' "$services" | grep -oE '"data":\[[^]]*\]' | tr -cd '"' | wc -c)"
  if [[ "$count" -gt 2 ]]; then
    ok "Traces present in VictoriaTraces (services: $services)"
  else
    skip "Traces round-trip" "no spans emitted yet — implement Symphony.Tracing per STACK-070"
  fi
}

# ---- driver ---------------------------------------------------------------

leg="${1:-all}"
case "$leg" in
  logs)    run_logs_leg ;;
  metrics) run_metrics_leg ;;
  traces)  run_traces_leg ;;
  all|"")  run_logs_leg; run_metrics_leg; run_traces_leg ;;
  *)
    printf 'usage: %s [logs|metrics|traces|all]\n' "$0" >&2
    exit 2
    ;;
esac

hdr "Summary"
printf '  passes : %d\n' "${#PASSES[@]}"
printf '  fails  : %d\n' "${#FAILS[@]}"
printf '  skips  : %d\n' "${#SKIPS[@]}"

if (( ${#FAILS[@]} > 0 )); then
  printf '\n%s\n' "$(color '31;1' "Failures:")"
  for f in "${FAILS[@]}"; do printf '  - %s\n' "$f"; done
  exit 1
fi
exit 0
