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
#   EDGE_MCP_NO_UNSAFE_TOOLS    if "1", emit a stderr warning that the
#                               browser_run_code_unsafe tool is RCE-equivalent
#                               and gating must be enforced at the MCP client
#                               layer (Claude Code permission denylist) —
#                               @playwright/mcp@latest has no native flag to
#                               drop a single tool. See
#                               docs/references/edge-devtools-mcp.md
#                               "Security" for the gating mechanisms.
#   EDGE_MCP_CONSOLE_LEVEL      pass-through to --console-level
#                               (error|warning|info|debug)
#   EDGE_MCP_EXTRA_ARGS         extra args appended verbatim, e.g.
#                               "--blocked-origins https://*.example.com"

set -euo pipefail

debug_port=${EDGE_DEBUG_PORT:-9222}

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

if [[ "${EDGE_MCP_NO_UNSAFE_TOOLS:-0}" == "1" ]]; then
  printf 'launch-mcp: EDGE_MCP_NO_UNSAFE_TOOLS=1 is a marker only — @playwright/mcp@latest has no flag to disable browser_run_code_unsafe. Enforce the gate at the MCP client (Claude Code permission denylist on tool name "edge-devtools:browser_run_code_unsafe") or wrap launch-mcp.sh with a JSON-RPC filter. See docs/references/edge-devtools-mcp.md "Security".\n' >&2
fi

exec npx -y "@playwright/mcp@latest" \
  --browser msedge \
  --cdp-endpoint "$selected" \
  "${extra_args[@]}"
