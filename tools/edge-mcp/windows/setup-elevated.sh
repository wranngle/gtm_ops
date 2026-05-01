#!/usr/bin/env bash
# setup-elevated.sh — apply both Windows-side requirements (netsh portproxy
# v4tov6 + firewall allow rule) for the Edge DevTools MCP loop. Triggers a
# UAC prompt; the owner's "yes" click is the only interactive step.
#
# Idempotent: re-runs replace existing rules.

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
windows_user=$(powershell.exe -NoProfile -Command '$env:USERNAME' 2>/dev/null | tr -d '\r')

if [[ -z "$windows_user" ]]; then
  printf 'could not detect Windows username\n' >&2
  exit 1
fi

# Stage the cmd files into the Windows user profile so cmd.exe can read them
# regardless of where this repo lives in WSL.
stage_dir="/mnt/c/Users/${windows_user}"
cp "$(dirname "${BASH_SOURCE[0]}")/edge-mcp-portproxy.cmd" "$stage_dir/edge-mcp-portproxy.cmd"
cp "$(dirname "${BASH_SOURCE[0]}")/edge-mcp-firewall.cmd"  "$stage_dir/edge-mcp-firewall.cmd"

log_path="$stage_dir/edge-mcp-fix.log"
rm -f "$log_path" 2>/dev/null

powershell.exe -NoProfile -Command "
  Start-Process -FilePath cmd.exe -ArgumentList '/c', 'C:\\Users\\${windows_user}\\edge-mcp-portproxy.cmd' -Verb RunAs -Wait;
  Start-Process -FilePath cmd.exe -ArgumentList '/c', 'C:\\Users\\${windows_user}\\edge-mcp-firewall.cmd'  -Verb RunAs -Wait
" 2>&1 | tr -d '\r'

if [[ ! -f "$log_path" ]]; then
  printf 'no log produced — UAC may have been declined\n' >&2
  exit 1
fi

printf 'applied. log:\n'
cat "$log_path"

printf '\nverifying...\n'
host_ip=$(ip route | awk '/default/ {print $3; exit}')
if curl -fsS --max-time 3 "http://${host_ip}:9222/json/version" >/dev/null 2>&1; then
  printf 'WSL → Edge CDP reachable at http://%s:9222\n' "$host_ip"
else
  printf 'still not reachable; ensure Edge is running via tools/edge-mcp/edge-debug-launch.sh\n' >&2
  exit 1
fi
