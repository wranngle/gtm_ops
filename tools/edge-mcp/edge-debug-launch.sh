#!/usr/bin/env bash
# edge-debug-launch.sh — launch Microsoft Edge on Windows with a remote
# debugging port wired up, from inside WSL, without stealing focus.
#
# Behavior:
#   - Force-kills any existing msedge.exe (per owner directive: kill freely).
#   - Launches a fresh msedge.exe with --remote-debugging-port and a dedicated
#     debug user-data-dir so the user's main browser profile is untouched.
#   - Positions the new window offscreen via --window-position so it does not
#     steal focus from the active Windows window.
#   - Prints the debug URL on stdout when reachable; emits ECS-jsonl events
#     on stderr.
#
# Env:
#   EDGE_DEBUG_PORT      default 9222
#   EDGE_DEBUG_PROFILE   default /mnt/c/Users/<user>/AppData/Local/EdgeDebugProfile
#   EDGE_EXE_PATH        default /mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe
#   EDGE_DEBUG_FRESH_PROFILE  if set to 1, wipe the debug profile before launch
#
# Exit codes:
#   0  Edge launched, debug endpoint reachable
#   1  Edge missing or launch failed
#   2  invocation error

set -uo pipefail

run_id=${DOTFILES_BOOTSTRAP_RUN_ID:-$(uuidgen 2>/dev/null || printf '%s-%s' "$(date +%s%N)" "$RANDOM")}
service_name=edge-debug-launch
sequence=0

emit_event() {
  local level=$1 action=$2 outcome=$3 detail=${4:-} ts
  sequence=$((sequence + 1))
  ts=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  jq -nc \
    --arg ts "$ts" --arg l "$level" --arg a "$action" --arg o "$outcome" \
    --arg svc "$service_name" --arg detail "$detail" --arg trace "$run_id" \
    --arg eid "${run_id}-${sequence}" \
    '{"@timestamp":$ts,"log.level":$l,"event.action":$a,"event.outcome":$o,"event.id":$eid,"trace.id":$trace,"service.name":$svc,"message":$detail}' \
    >&2
}

debug_port=${EDGE_DEBUG_PORT:-9222}
edge_exe=${EDGE_EXE_PATH:-/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe}

if [[ ! -x "$edge_exe" ]]; then
  emit_event error edge.exe-missing failure "EDGE_EXE_PATH=$edge_exe"
  exit 1
fi

# Detect Windows username from the WSL mount path layout.
windows_user=$(powershell.exe -NoProfile -Command '$env:USERNAME' 2>/dev/null | tr -d '\r')
if [[ -z "$windows_user" ]]; then
  emit_event error edge.user-detect-failed failure "could not query Windows username"
  exit 1
fi

debug_profile_default="/mnt/c/Users/${windows_user}/AppData/Local/EdgeDebugProfile"
debug_profile=${EDGE_DEBUG_PROFILE:-$debug_profile_default}
debug_profile_winpath=$(wslpath -w "$debug_profile" 2>/dev/null || true)
edge_exe_winpath=$(wslpath -w "$edge_exe" 2>/dev/null || true)

if [[ -z "$debug_profile_winpath" || -z "$edge_exe_winpath" ]]; then
  emit_event error edge.path-translation-failed failure "wslpath could not translate paths"
  exit 1
fi

# Optional: nuke the profile dir for a clean session.
if [[ "${EDGE_DEBUG_FRESH_PROFILE:-0}" == "1" ]]; then
  emit_event info edge.profile-reset success "$debug_profile"
  rm -rf "$debug_profile" 2>/dev/null || true
fi
mkdir -p "$debug_profile"

# Force-kill any existing msedge.exe processes (owner directive: allowed any time).
emit_event info edge.kill-existing success "killing prior msedge.exe instances"
powershell.exe -NoProfile -Command \
  'Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force' \
  2>/dev/null || true
sleep 0.5

# Launch with debug port + offscreen window so it doesn't steal focus.
# Position 30000,30000 is well outside any reasonable monitor; user can drag
# the window onscreen if they want to see it.
emit_event info edge.launch success "port=$debug_port profile=$debug_profile_winpath"

cmd.exe /c start /B "" "$edge_exe_winpath" \
  --remote-debugging-port="$debug_port" \
  --user-data-dir="$debug_profile_winpath" \
  --no-first-run \
  --no-default-browser-check \
  --disable-default-apps \
  --window-position=30000,30000 \
  --window-size=1280,800 \
  about:blank \
  >/dev/null 2>&1 &

# Wait up to 5 seconds for the debug endpoint to come up.
debug_url="http://127.0.0.1:${debug_port}/json/version"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 1 "$debug_url" >/dev/null 2>&1; then
    emit_event info edge.debug-ready success "$debug_url"
    printf '%s\n' "$debug_url"
    exit 0
  fi
  sleep 0.5
done

emit_event error edge.debug-unreachable failure "$debug_url did not respond within 5s"
exit 1
