#!/usr/bin/env bash
# smoke.sh — launch two isolated ops-console instances and verify both answer.
#
# Env:
#   OPS_CONSOLE_SMOKE_PORT_RANGE  default 18501-18520

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helper="$script_dir/ops-console.sh"
tmp_root=$(mktemp -d)
port_range=${OPS_CONSOLE_SMOKE_PORT_RANGE:-18501-18520}

cleanup() {
  OPS_CONSOLE_RUNTIME_DIR="$tmp_root/a/runtime" "$helper" stop >/dev/null 2>&1 || true
  OPS_CONSOLE_RUNTIME_DIR="$tmp_root/b/runtime" "$helper" stop >/dev/null 2>&1 || true
  rm -rf "$tmp_root"
}
trap cleanup EXIT

start_one() {
  local name=$1
  mkdir -p "$tmp_root/$name"
  env \
    OPS_CONSOLE_RUNTIME_DIR="$tmp_root/$name/runtime" \
    OPS_CONSOLE_WORKTREE_ID="ops-smoke-$name" \
    OPS_CONSOLE_PORT_RANGE="$port_range" \
    "$helper" start \
    > "$tmp_root/$name/url.txt" \
    2> "$tmp_root/$name/stderr.log" &
}

start_one a
pid_a=$!
start_one b
pid_b=$!

status_a=0
status_b=0
wait "$pid_a" || status_a=$?
wait "$pid_b" || status_b=$?

if ((status_a != 0 || status_b != 0)); then
  printf 'ops-console smoke start failed: a=%s b=%s\n' "$status_a" "$status_b" >&2
  sed -n '1,160p' "$tmp_root/a/stderr.log" >&2 || true
  sed -n '1,160p' "$tmp_root/b/stderr.log" >&2 || true
  exit 1
fi

url_a=$(awk 'NR == 1 {print $1}' "$tmp_root/a/url.txt")
url_b=$(awk 'NR == 1 {print $1}' "$tmp_root/b/url.txt")

runtime_a="$tmp_root/a/runtime/ops-console.json"
runtime_b="$tmp_root/b/runtime/ops-console.json"
port_a=$(jq -r '.port' "$runtime_a")
port_b=$(jq -r '.port' "$runtime_b")
log_a=$(jq -r '.log_path' "$runtime_a")
log_b=$(jq -r '.log_path' "$runtime_b")

if [[ "$port_a" == "$port_b" ]]; then
  printf 'expected distinct ports, got %s and %s\n' "$port_a" "$port_b" >&2
  exit 1
fi

if [[ "$log_a" == "$log_b" ]]; then
  printf 'expected distinct log paths, got %s\n' "$log_a" >&2
  exit 1
fi

for url in "$url_a" "$url_b"; do
  if ! curl -fsS --max-time 5 "$url" | grep -qi 'streamlit'; then
    printf 'expected Streamlit response from %s\n' "$url" >&2
    exit 1
  fi
done

jq -n \
  --arg url_a "$url_a" \
  --arg url_b "$url_b" \
  --arg log_a "$log_a" \
  --arg log_b "$log_b" \
  --argjson port_a "$port_a" \
  --argjson port_b "$port_b" \
  '{
    pass: true,
    instances: [
      {name: "a", url: $url_a, port: $port_a, log_path: $log_a},
      {name: "b", url: $url_b, port: $port_b, log_path: $log_b}
    ]
  }'
