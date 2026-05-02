#!/usr/bin/env bash
# setup-elevated.sh — apply Windows-side requirements (netsh portproxy +
# firewall allow rule) for the Edge DevTools MCP loop. Triggers a UAC prompt;
# the owner's "yes" click is the only interactive step.
#
# Idempotent: re-runs replace existing rules.
#
# Usage:
#   tools/edge-mcp/windows/setup-elevated.sh [--port-range 9222-9322]
#
# Env:
#   EDGE_DEBUG_PORT_RANGE                 default 9222-9322
#   EDGE_MCP_PORTPROXY_MODE               default v4tov6
#   EDGE_MCP_PORTPROXY_CONNECT_ADDRESS    default ::1

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
port_range=${EDGE_DEBUG_PORT_RANGE:-9222-9322}
portproxy_mode=${EDGE_MCP_PORTPROXY_MODE:-v4tov6}
portproxy_connect_address=${EDGE_MCP_PORTPROXY_CONNECT_ADDRESS:-::1}

usage() {
  sed -n '2,15p' "$0"
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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port-range)
      port_range=${2:-}
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'unknown arg: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

parse_port_range "$port_range"

case "$portproxy_mode" in
  v4tov4|v4tov6) ;;
  *)
    printf 'unsupported EDGE_MCP_PORTPROXY_MODE=%s (expected v4tov4 or v4tov6)\n' "$portproxy_mode" >&2
    exit 2
    ;;
esac

windows_user=$(powershell.exe -NoProfile -Command '$env:USERNAME' 2>/dev/null | tr -d '\r')

if [[ -z "$windows_user" ]]; then
  printf 'could not detect Windows username\n' >&2
  exit 1
fi

# Stage the cmd files into the Windows user profile so cmd.exe can read them
# regardless of where this repo lives in WSL.
stage_dir="/mnt/c/Users/${windows_user}"
portproxy_cmd="$stage_dir/edge-mcp-portproxy.cmd"
firewall_cmd="$stage_dir/edge-mcp-firewall.cmd"
setup_cmd="$stage_dir/edge-mcp-setup-range.cmd"
cp "$(dirname "${BASH_SOURCE[0]}")/edge-mcp-portproxy.cmd" "$portproxy_cmd"
cp "$(dirname "${BASH_SOURCE[0]}")/edge-mcp-firewall.cmd"  "$firewall_cmd"

log_path="$stage_dir/edge-mcp-fix.log"
rm -f "$log_path" 2>/dev/null

portproxy_cmd_win=$(wslpath -w "$portproxy_cmd")
firewall_cmd_win=$(wslpath -w "$firewall_cmd")
setup_cmd_win=$(wslpath -w "$setup_cmd")
log_path_win=$(wslpath -w "$log_path")

{
  printf '@echo off\r\n'
  printf 'call "%s" %s %s "%s" %s %s\r\n' "$portproxy_cmd_win" "$port_start" "$port_end" "$log_path_win" "$portproxy_mode" "$portproxy_connect_address"
  printf 'call "%s" %s %s "%s"\r\n' "$firewall_cmd_win" "$port_start" "$port_end" "$log_path_win"
} > "$setup_cmd"

powershell.exe -NoProfile -Command "
  Start-Process -FilePath cmd.exe -ArgumentList '/c ""${setup_cmd_win}""' -Verb RunAs -Wait
" 2>&1 | tr -d '\r'

if [[ ! -f "$log_path" ]]; then
  printf 'no log produced — UAC may have been declined\n' >&2
  exit 1
fi

printf 'applied. log:\n'
cat "$log_path"

printf '\nverifying...\n'
host_ip=$(ip route | awk '/default/ {print $3; exit}')
reachable_port=""
for ((port = port_start; port <= port_end; port++)); do
  if curl -fsS --max-time 1 "http://${host_ip}:${port}/json/version" >/dev/null 2>&1; then
    reachable_port=$port
    break
  fi
done

printf 'configured Edge MCP Windows rules for ports %s-%s (%s -> %s)\n' \
  "$port_start" "$port_end" "$portproxy_mode" "$portproxy_connect_address"
if [[ -n "$reachable_port" ]]; then
  printf 'WSL -> Edge CDP reachable at http://%s:%s\n' "$host_ip" "$reachable_port"
else
  printf 'no live Edge CDP endpoint found yet; run tools/edge-mcp/edge-debug-launch.sh to verify a selected port\n'
fi
