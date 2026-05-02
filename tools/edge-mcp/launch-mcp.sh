#!/usr/bin/env bash
# launch-mcp.sh — exec @playwright/mcp with a CDP endpoint that resolves
# the Windows host IP at start time, so the WSL→Windows route works
# regardless of the current vEthernet allocation.
#
# Used as the `command` in mcp.json so the MCP server picks the right
# loopback path on every Claude Code session.
#
# Env knobs:
#   EDGE_DEBUG_PORT             default 9222
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

debug_port=${EDGE_DEBUG_PORT:-9222}
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prefer the candidate the launcher already proved works.
candidates=()
host_ip=$(ip route | awk '/default/ {print $3; exit}' || true)
[[ -n "$host_ip" ]] && candidates+=("http://${host_ip}:${debug_port}")
candidates+=("http://127.0.0.1:${debug_port}" "http://[::1]:${debug_port}")

selected=""
for url in "${candidates[@]}"; do
  if curl -fsS --max-time 1 "${url}/json/version" >/dev/null 2>&1; then
    selected="$url"
    break
  fi
done

if [[ -z "$selected" ]]; then
  printf 'edge-debug not reachable on any candidate URL; run tools/edge-mcp/edge-debug-launch.sh first\n' >&2
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
