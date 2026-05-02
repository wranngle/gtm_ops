#!/usr/bin/env bash
# launch-mcp.sh — exec @playwright/mcp with a CDP endpoint that resolves
# the Windows host IP at start time, so the WSL→Windows route works
# regardless of the current vEthernet allocation.
#
# Used as the `command` in mcp.json so the MCP server picks the right
# loopback path on every Claude Code session.
#
# Env knobs:
#   EDGE_DEBUG_PORT             fixed port override
#   EDGE_DEBUG_PORT_RANGE       default 9222-9322 when no runtime file exists
#   EDGE_DEBUG_RUNTIME_DIR      default <repo>/.symphony/runtime
#   EDGE_DEBUG_PORT_FILE        default $EDGE_DEBUG_RUNTIME_DIR/edge-port
#   EDGE_DEBUG_RUNTIME_FILE     default $EDGE_DEBUG_RUNTIME_DIR/edge-debug.json
#   EDGE_DEBUG_ENDPOINT         explicit CDP endpoint override
#   EDGE_MCP_NO_UNSAFE_TOOLS    default "1". When enabled, run @playwright/mcp
#                               through filter-unsafe-tools.mjs so
#                               browser_run_code_unsafe is hidden from
#                               tools/list and rejected before it reaches the
#                               upstream MCP server. Set to "0" only for
#                               deliberate local investigation.
#   EDGE_MCP_CONSOLE_LEVEL      pass-through to --console-level
#                               (error|warning|info|debug)
#   EDGE_MCP_EXTRA_ARGS         extra args appended verbatim, e.g.
#                               "--blocked-origins https://*.example.com"

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
runtime_dir=${EDGE_DEBUG_RUNTIME_DIR:-$repo_root/.symphony/runtime}
port_file=${EDGE_DEBUG_PORT_FILE:-$runtime_dir/edge-port}
runtime_file=${EDGE_DEBUG_RUNTIME_FILE:-$runtime_dir/edge-debug.json}

range_start() {
  local range=${EDGE_DEBUG_PORT_RANGE:-9222-9322}
  if [[ "$range" =~ ^([0-9]+)-([0-9]+)$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  elif [[ "$range" =~ ^[0-9]+$ ]]; then
    printf '%s' "$range"
  else
    printf '9222'
  fi
}

read_runtime_field() {
  local field=$1
  if [[ -s "$runtime_file" ]] && command -v jq >/dev/null 2>&1; then
    jq -r "$field // empty" "$runtime_file" 2>/dev/null
  fi
}

debug_port=${EDGE_DEBUG_PORT:-}
if [[ -z "$debug_port" && -s "$port_file" ]]; then
  debug_port=$(awk 'NR == 1 {print $1}' "$port_file")
fi
if [[ -z "$debug_port" ]]; then
  debug_port=$(read_runtime_field '.port')
fi
debug_port=${debug_port:-$(range_start)}

if ! [[ "$debug_port" =~ ^[0-9]+$ ]]; then
  printf 'invalid Edge debug port "%s"; check %s\n' "$debug_port" "$port_file" >&2
  exit 1
fi

candidates=()
if [[ -n "${EDGE_DEBUG_ENDPOINT:-}" ]]; then
  candidates+=("${EDGE_DEBUG_ENDPOINT%/}")
fi
runtime_endpoint=$(read_runtime_field '.cdp_endpoint')
if [[ -n "$runtime_endpoint" ]]; then
  candidates+=("${runtime_endpoint%/}")
fi
host_ip=$(ip route | awk '/default/ {print $3; exit}' || true)
[[ -n "$host_ip" ]] && candidates+=("http://${host_ip}:${debug_port}")
candidates+=("http://127.0.0.1:${debug_port}" "http://[::1]:${debug_port}")

selected=""
seen=" "
for url in "${candidates[@]}"; do
  if [[ "$seen" == *" $url "* ]]; then
    continue
  fi
  seen="${seen}${url} "
  if curl -fsS --max-time 1 "${url}/json/version" >/dev/null 2>&1; then
    selected="$url"
    break
  fi
done

if [[ -z "$selected" ]]; then
  printf 'edge-debug not reachable for port %s; run tools/edge-mcp/edge-debug-launch.sh first\n' "$debug_port" >&2
  printf 'looked at runtime file: %s\n' "$runtime_file" >&2
  exit 1
fi

extra_args=()
if [[ -n "${EDGE_MCP_CONSOLE_LEVEL:-}" ]]; then
  extra_args+=("--console-level" "$EDGE_MCP_CONSOLE_LEVEL")
fi
if [[ -n "${EDGE_MCP_EXTRA_ARGS:-}" ]]; then
  # shellcheck disable=SC2206  # intentional word-split for pass-through args
  extra_args+=( $EDGE_MCP_EXTRA_ARGS )
fi

cmd=(
  npx -y "@playwright/mcp@latest"
  --browser msedge
  --cdp-endpoint "$selected"
  "${extra_args[@]}"
)

if [[ "${EDGE_MCP_NO_UNSAFE_TOOLS:-1}" == "1" ]]; then
  exec node "$script_dir/filter-unsafe-tools.mjs" -- "${cmd[@]}"
fi

printf 'launch-mcp: EDGE_MCP_NO_UNSAFE_TOOLS=0 leaves browser_run_code_unsafe exposed. Use only for deliberate local investigation.\n' >&2
exec "${cmd[@]}"
