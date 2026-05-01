#!/usr/bin/env bash
# launch-mcp.sh — exec @playwright/mcp with a CDP endpoint that resolves
# the Windows host IP at start time, so the WSL→Windows route works
# regardless of the current vEthernet allocation.
#
# Used as the `command` in mcp.json so the MCP server picks the right
# loopback path on every Claude Code session.

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

exec npx -y "@playwright/mcp@latest" --browser msedge --cdp-endpoint "$selected"
