#!/usr/bin/env bash
# ops-console.sh — per-worktree Streamlit boot/status/stop helper.
#
# Usage:
#   tools/ops-console/ops-console.sh start [results.json]
#   tools/ops-console/ops-console.sh restart [results.json]
#   tools/ops-console/ops-console.sh status
#   tools/ops-console/ops-console.sh stop
#   tools/ops-console/ops-console.sh url
#
# Env:
#   OPS_CONSOLE_PORT_RANGE    default 8501-8599
#   OPS_CONSOLE_RUNTIME_DIR   default <repo>/.symphony/runtime
#   OPS_CONSOLE_RUNTIME_FILE  default $OPS_CONSOLE_RUNTIME_DIR/ops-console.json
#   OPS_CONSOLE_PORT_FILE     default $OPS_CONSOLE_RUNTIME_DIR/ops-console-port
#   OPS_CONSOLE_WORKTREE_ID   default basename of this worktree
#   OPS_CONSOLE_RESULTS       default apps/ops-console/fixtures/evaluation-results.json
#   OPS_CONSOLE_WAIT_SECONDS  default 30
#   OPS_CONSOLE_PYTHON        default python3

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
service_name=ops-console
ops_python=${OPS_CONSOLE_PYTHON:-python3}

usage() {
  sed -n '2,16p' "$0"
}

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    printf 'jq is required for %s runtime files\n' "$service_name" >&2
    exit 1
  fi
}

slugify() {
  local value=$1
  value=$(printf '%s' "$value" | tr -cs 'A-Za-z0-9._-' '-')
  value=${value#-}
  value=${value%-}
  printf '%s' "${value:-worktree}"
}

short_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | awk '{print substr($1,1,8)}'
  else
    printf '%s' "$1" | cksum | awk '{print $1}'
  fi
}

parse_port_range() {
  local range=$1
  if [[ "$range" =~ ^([0-9]+)-([0-9]+)$ ]]; then
    port_start=${BASH_REMATCH[1]}
    port_end=${BASH_REMATCH[2]}
  elif [[ "$range" =~ ^[0-9]+$ ]]; then
    port_start=$range
    port_end=$range
  else
    printf 'invalid port range: %s\n' "$range" >&2
    exit 2
  fi

  if ((port_start < 1 || port_end > 65535 || port_start > port_end)); then
    printf 'invalid port range: %s\n' "$range" >&2
    exit 2
  fi
}

abs_path() {
  case "$1" in
    /*) printf '%s' "$1" ;;
    *) printf '%s/%s' "$PWD" "$1" ;;
  esac
}

runtime_field() {
  local field=$1
  if [[ -s "$runtime_file" ]] && command -v jq >/dev/null 2>&1; then
    jq -r "$field // empty" "$runtime_file" 2>/dev/null
  fi
}

read_saved_port() {
  if [[ -s "$port_file" ]]; then
    awk 'NR == 1 {print $1}' "$port_file"
    return
  fi
  runtime_field '.port'
}

port_in_range() {
  local port=$1
  [[ "$port" =~ ^[0-9]+$ ]] && ((port >= port_start && port <= port_end))
}

port_in_use() {
  local port=$1
  timeout 0.5 bash -c "</dev/tcp/127.0.0.1/${port}" >/dev/null 2>&1
}

acquire_port_lock() {
  local lock_name lock_root
  lock_root=${OPS_CONSOLE_PORT_LOCK_DIR:-${TMPDIR:-/tmp}/agent-worktree-port-locks}
  lock_name=$(slugify "ops-console-${port_start}-${port_end}")
  mkdir -p "$lock_root"
  lock_path="$lock_root/${lock_name}.lock"

  if command -v flock >/dev/null 2>&1; then
    exec 8>"$lock_path"
    flock 8
    lock_mode=flock
    return
  fi

  lock_mode=mkdir
  while ! mkdir "$lock_path" 2>/dev/null; do
    sleep 0.2
  done
  trap '[[ "${lock_mode:-}" == "mkdir" ]] && rmdir "$lock_path" 2>/dev/null || true' EXIT
}

select_port() {
  local saved_port candidate
  saved_port=$(read_saved_port)

  if [[ -n "$saved_port" ]] && port_in_range "$saved_port" && ! port_in_use "$saved_port"; then
    printf '%s' "$saved_port"
    return
  fi

  for ((candidate = port_start; candidate <= port_end; candidate++)); do
    if ! port_in_use "$candidate"; then
      printf '%s' "$candidate"
      return
    fi
  done

  printf 'no free ops-console port in %s-%s\n' "$port_start" "$port_end" >&2
  exit 1
}

pid_alive() {
  local pid=$1
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

url_healthy() {
  local url=$1
  [[ -n "$url" ]] && curl -fsS --max-time 2 "$url" >/dev/null 2>&1
}

running_status() {
  local pid url
  pid=$(runtime_field '.pid')
  url=$(runtime_field '.url')
  if pid_alive "$pid" && url_healthy "$url"; then
    printf 'running'
  elif [[ -s "$runtime_file" ]]; then
    printf 'stale'
  else
    printf 'missing'
  fi
}

write_runtime() {
  local status=$1 pid=$2 port=$3 url=$4 results_path=$5 log_path=$6
  mkdir -p "$runtime_dir"
  printf '%s\n' "$port" > "$port_file"
  jq -n \
    --arg service "$service_name" \
    --arg status "$status" \
    --arg repo_root "$repo_root" \
    --arg worktree_id "$worktree_id" \
    --arg worktree_key "$worktree_key" \
    --arg url "$url" \
    --arg results_path "$results_path" \
    --arg log_path "$log_path" \
    --arg runtime_file "$runtime_file" \
    --arg port_file "$port_file" \
    --arg started_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson pid "$pid" \
    --argjson port "$port" \
    '{
      service: $service,
      status: $status,
      repo_root: $repo_root,
      worktree_id: $worktree_id,
      worktree_key: $worktree_key,
      pid: $pid,
      port: $port,
      url: $url,
      results_path: $results_path,
      log_path: $log_path,
      runtime_file: $runtime_file,
      port_file: $port_file,
      started_at: $started_at
    }' > "$runtime_file"
}

stop_runtime() {
  local pid args
  pid=$(runtime_field '.pid')

  if pid_alive "$pid"; then
    args=$(ps -p "$pid" -o args= 2>/dev/null || true)
    if [[ "$args" == *streamlit* ]]; then
      kill "$pid" 2>/dev/null || true
      for _ in {1..25}; do
        if ! pid_alive "$pid"; then
          break
        fi
        sleep 0.2
      done
      if pid_alive "$pid"; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    else
      printf 'refusing to kill pid %s; command is not streamlit: %s\n' "$pid" "$args" >&2
    fi
  fi

  rm -f "$runtime_file" "$port_file" 2>/dev/null || true
}

print_status() {
  local state
  state=$(running_status)
  if [[ -s "$runtime_file" ]] && command -v jq >/dev/null 2>&1; then
    jq --arg status "$state" '.status = $status' "$runtime_file"
  else
    printf '{"service":"%s","status":"%s","runtime_file":"%s"}\n' "$service_name" "$state" "$runtime_file"
  fi
}

start_runtime() {
  local existing_status port url pid log_path app_dir app_file results_path wait_seconds deadline
  require_jq

  existing_status=$(running_status)
  if [[ "$existing_status" == "running" ]]; then
    runtime_field '.url'
    return
  fi

  if [[ "$existing_status" == "stale" ]]; then
    stop_runtime
  fi

  if ! "$ops_python" -c 'import streamlit' >/dev/null 2>&1; then
    printf 'streamlit is not installed for %s; run: %s -m pip install -e apps/ops-console\n' "$ops_python" "$ops_python" >&2
    exit 1
  fi

  acquire_port_lock
  port=$(select_port)
  url="http://127.0.0.1:${port}"
  app_dir="$repo_root/apps/ops-console"
  app_file="$app_dir/main.py"
  results_path=${requested_results_path:-${OPS_CONSOLE_RESULTS:-$repo_root/apps/ops-console/fixtures/evaluation-results.json}}
  results_path=$(abs_path "$results_path")
  log_path="$log_dir/ops-console-${worktree_key}-${port}.log"
  wait_seconds=${OPS_CONSOLE_WAIT_SECONDS:-30}

  mkdir -p "$log_dir"
  : > "$log_path"

  (
    exec 8>&- 2>/dev/null || true
    cd "$app_dir"
    exec "$ops_python" -m streamlit run \
      --server.address 127.0.0.1 \
      --server.port "$port" \
      --server.headless true \
      --browser.gatherUsageStats false \
      "$app_file" \
      -- "$results_path"
  ) >> "$log_path" 2>&1 &
  pid=$!

  write_runtime starting "$pid" "$port" "$url" "$results_path" "$log_path"

  deadline=$((SECONDS + wait_seconds))
  while ((SECONDS < deadline)); do
    if ! pid_alive "$pid"; then
      printf 'ops-console exited before becoming ready; log: %s\n' "$log_path" >&2
      tail -n 40 "$log_path" >&2 || true
      exit 1
    fi
    if url_healthy "$url"; then
      write_runtime running "$pid" "$port" "$url" "$results_path" "$log_path"
      printf '%s\n' "$url"
      return
    fi
    sleep 0.5
  done

  printf 'ops-console did not become ready within %ss; log: %s\n' "$wait_seconds" "$log_path" >&2
  tail -n 40 "$log_path" >&2 || true
  stop_runtime
  exit 1
}

case "$ops_python" in
  */*) ops_python=$(abs_path "$ops_python") ;;
esac

cmd=${1:-status}
if [[ $# -gt 0 ]]; then
  shift
fi

port_range=${OPS_CONSOLE_PORT_RANGE:-8501-8599}
requested_results_path=${OPS_CONSOLE_RESULTS:-}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port-range)
      port_range=${2:-}
      shift 2
      ;;
    --results)
      requested_results_path=${2:-}
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$requested_results_path" ]]; then
        requested_results_path=$1
        shift
      else
        printf 'unknown arg: %s\n' "$1" >&2
        exit 2
      fi
      ;;
  esac
done

parse_port_range "$port_range"
worktree_id=${OPS_CONSOLE_WORKTREE_ID:-${SYMPHONY_WORKTREE_ID:-$(basename "$repo_root")}}
worktree_id=$(slugify "$worktree_id")
worktree_key="${worktree_id}-$(short_hash "$repo_root")"
runtime_dir=${OPS_CONSOLE_RUNTIME_DIR:-$repo_root/.symphony/runtime}
runtime_file=${OPS_CONSOLE_RUNTIME_FILE:-$runtime_dir/ops-console.json}
port_file=${OPS_CONSOLE_PORT_FILE:-$runtime_dir/ops-console-port}
log_dir=${OPS_CONSOLE_LOG_DIR:-$runtime_dir/logs}

case "$cmd" in
  start)
    start_runtime
    ;;
  restart)
    stop_runtime
    start_runtime
    ;;
  status)
    print_status
    ;;
  stop)
    stop_runtime
    printf 'stopped %s\n' "$service_name"
    ;;
  url)
    if [[ "$(running_status)" == "running" ]]; then
      runtime_field '.url'
    else
      printf 'ops-console is not running for this worktree\n' >&2
      exit 1
    fi
    ;;
  -h|--help)
    usage
    ;;
  *)
    printf 'unknown command: %s\n' "$cmd" >&2
    usage >&2
    exit 2
    ;;
esac
