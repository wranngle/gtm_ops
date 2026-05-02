#!/usr/bin/env bash
# edge-debug-launch.sh — launch Microsoft Edge on Windows with a remote
# debugging port wired up, from inside WSL, without stealing focus.
#
# Behavior:
#   - Stops any existing msedge.exe instance using this worktree's debug
#     profile, leaving other worktrees and the user's main browser alone.
#   - Launches a fresh msedge.exe with --remote-debugging-port and a dedicated
#     per-worktree debug user-data-dir so browser state never crosses worktrees.
#   - Positions the new window offscreen via --window-position so it does not
#     steal focus from the active Windows window.
#   - Records the chosen port and endpoint in a worktree-local runtime file.
#   - Prints the debug URL on stdout when reachable; emits ECS-jsonl events on
#     stderr.
#
# Env:
#   EDGE_DEBUG_PORT          fixed port override; otherwise allocated from range
#   EDGE_DEBUG_PORT_RANGE    default 9222-9322
#   EDGE_DEBUG_RUNTIME_DIR   default <repo>/.symphony/runtime
#   EDGE_DEBUG_PORT_FILE     default $EDGE_DEBUG_RUNTIME_DIR/edge-port
#   EDGE_DEBUG_RUNTIME_FILE  default $EDGE_DEBUG_RUNTIME_DIR/edge-debug.json
#   EDGE_DEBUG_WORKTREE_ID   default basename of this worktree
#   EDGE_DEBUG_PROFILE       explicit profile override; otherwise per-worktree
#   EDGE_DEBUG_KILL_SCOPE    profile (default) or all
#   EDGE_EXE_PATH            default /mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe
#   EDGE_DEBUG_FRESH_PROFILE if set to 1, wipe this worktree's debug profile before launch
#
# Exit codes:
#   0  Edge launched, debug endpoint reachable
#   1  Edge missing or launch failed
#   2  invocation error

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
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

usage() {
  sed -n '2,33p' "$0"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

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
    emit_event error edge.invalid-port-range failure "EDGE_DEBUG_PORT_RANGE=$range"
    exit 2
  fi

  if ((port_start < 1 || port_end > 65535 || port_start > port_end)); then
    emit_event error edge.invalid-port-range failure "EDGE_DEBUG_PORT_RANGE=$range"
    exit 2
  fi
}

read_saved_port() {
  if [[ -s "$edge_port_file" ]]; then
    awk 'NR == 1 {print $1}' "$edge_port_file"
    return
  fi

  if [[ -s "$edge_runtime_file" ]] && command -v jq >/dev/null 2>&1; then
    jq -r '.port // empty' "$edge_runtime_file" 2>/dev/null
  fi
}

port_in_range() {
  local port=$1
  [[ "$port" =~ ^[0-9]+$ ]] && ((port >= port_start && port <= port_end))
}

detect_host_ip() {
  local ip_addr
  ip_addr=$(ip route | awk '/default/ {print $3; exit}' 2>/dev/null)
  if [[ -z "$ip_addr" ]]; then
    ip_addr=$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf 2>/dev/null)
  fi
  printf '%s' "$ip_addr"
}

build_probe_urls() {
  local port=$1
  probe_urls=()
  if [[ "${EDGE_DEBUG_USE_LOCALHOST:-0}" == "1" ]]; then
    probe_urls+=("http://127.0.0.1:${port}/json/version")
    probe_urls+=("http://[::1]:${port}/json/version")
    return
  fi

  [[ -n "$host_ip" ]] && probe_urls+=("http://${host_ip}:${port}/json/version")
  probe_urls+=("http://127.0.0.1:${port}/json/version")
  probe_urls+=("http://[::1]:${port}/json/version")
}

port_has_cdp() {
  local port=$1 url
  build_probe_urls "$port"
  for url in "${probe_urls[@]}"; do
    if curl -fsS --max-time 0.75 "$url" >/dev/null 2>&1; then
      return 0
    fi
  done
  return 1
}

acquire_port_lock() {
  local lock_name lock_root
  lock_root=${EDGE_DEBUG_PORT_LOCK_DIR:-${TMPDIR:-/tmp}/agent-worktree-port-locks}
  lock_name=$(slugify "edge-${port_start}-${port_end}")
  mkdir -p "$lock_root"
  lock_path="$lock_root/${lock_name}.lock"

  if command -v flock >/dev/null 2>&1; then
    exec 9>"$lock_path"
    flock 9
    lock_mode=flock
    return
  fi

  lock_mode=mkdir
  while ! mkdir "$lock_path" 2>/dev/null; do
    sleep 0.2
  done
  trap '[[ "${lock_mode:-}" == "mkdir" ]] && rmdir "$lock_path" 2>/dev/null || true' EXIT
}

stop_current_profile() {
  local quoted_profile=$1

  case "${EDGE_DEBUG_KILL_SCOPE:-profile}" in
    profile)
      emit_event info edge.kill-existing success "stopping msedge.exe for profile=$debug_profile_winpath"
      powershell.exe -NoProfile -Command "
        \$profile = '${quoted_profile}';
        Get-CimInstance Win32_Process -Filter \"name = 'msedge.exe'\" |
          Where-Object { \$_.CommandLine -and \$_.CommandLine.Contains(\$profile) } |
          ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }
      " 2>/dev/null || true
      ;;
    all)
      emit_event warn edge.kill-existing success "EDGE_DEBUG_KILL_SCOPE=all; killing all msedge.exe instances"
      powershell.exe -NoProfile -Command \
        'Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force' \
        2>/dev/null || true
      ;;
    *)
      emit_event error edge.invalid-kill-scope failure "EDGE_DEBUG_KILL_SCOPE=${EDGE_DEBUG_KILL_SCOPE}"
      exit 2
      ;;
  esac

  sleep 0.5
}

select_debug_port() {
  local saved_port candidate

  if [[ -n "${EDGE_DEBUG_PORT:-}" ]]; then
    if ! [[ "$EDGE_DEBUG_PORT" =~ ^[0-9]+$ ]] || ((EDGE_DEBUG_PORT < 1 || EDGE_DEBUG_PORT > 65535)); then
      emit_event error edge.invalid-port failure "EDGE_DEBUG_PORT=$EDGE_DEBUG_PORT"
      exit 2
    fi
    if port_has_cdp "$EDGE_DEBUG_PORT"; then
      emit_event error edge.port-in-use failure "EDGE_DEBUG_PORT=$EDGE_DEBUG_PORT already has a CDP endpoint"
      exit 1
    fi
    printf '%s' "$EDGE_DEBUG_PORT"
    return
  fi

  saved_port=$(read_saved_port)
  if [[ -n "$saved_port" ]] && port_in_range "$saved_port" && ! port_has_cdp "$saved_port"; then
    printf '%s' "$saved_port"
    return
  fi

  for ((candidate = port_start; candidate <= port_end; candidate++)); do
    if ! port_has_cdp "$candidate"; then
      printf '%s' "$candidate"
      return
    fi
  done

  emit_event error edge.no-free-port failure "no free CDP port in ${port_start}-${port_end}"
  exit 1
}

write_runtime_files() {
  local status=$1 selected_url=${2:-}
  mkdir -p "$edge_runtime_dir"
  printf '%s\n' "$debug_port" > "$edge_port_file"

  jq -n \
    --arg status "$status" \
    --arg service "$service_name" \
    --arg repo_root "$repo_root" \
    --arg worktree_id "$worktree_id" \
    --arg worktree_key "$worktree_key" \
    --arg profile "$debug_profile" \
    --arg profile_winpath "$debug_profile_winpath" \
    --arg cdp_endpoint "${selected_url%/json/version}" \
    --arg cdp_version_url "$selected_url" \
    --arg port_file "$edge_port_file" \
    --arg runtime_file "$edge_runtime_file" \
    --arg updated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson port "$debug_port" \
    '{
      service: $service,
      status: $status,
      repo_root: $repo_root,
      worktree_id: $worktree_id,
      worktree_key: $worktree_key,
      port: $port,
      cdp_endpoint: $cdp_endpoint,
      cdp_version_url: $cdp_version_url,
      profile: $profile,
      profile_winpath: $profile_winpath,
      port_file: $port_file,
      runtime_file: $runtime_file,
      updated_at: $updated_at
    }' > "$edge_runtime_file"
}

edge_exe=${EDGE_EXE_PATH:-/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe}
port_range=${EDGE_DEBUG_PORT_RANGE:-9222-9322}
parse_port_range "$port_range"

worktree_id=${EDGE_DEBUG_WORKTREE_ID:-${SYMPHONY_WORKTREE_ID:-$(basename "$repo_root")}}
worktree_id=$(slugify "$worktree_id")
worktree_key="${worktree_id}-$(short_hash "$repo_root")"
edge_runtime_dir=${EDGE_DEBUG_RUNTIME_DIR:-$repo_root/.symphony/runtime}
edge_port_file=${EDGE_DEBUG_PORT_FILE:-$edge_runtime_dir/edge-port}
edge_runtime_file=${EDGE_DEBUG_RUNTIME_FILE:-$edge_runtime_dir/edge-debug.json}
host_ip=$(detect_host_ip)

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

debug_profile_default="/mnt/c/Users/${windows_user}/AppData/Local/EdgeDebugProfile-${worktree_key}"
debug_profile=${EDGE_DEBUG_PROFILE:-$debug_profile_default}
debug_profile_winpath=$(wslpath -w "$debug_profile" 2>/dev/null || true)
edge_exe_winpath=$(wslpath -w "$edge_exe" 2>/dev/null || true)

if [[ -z "$debug_profile_winpath" || -z "$edge_exe_winpath" ]]; then
  emit_event error edge.path-translation-failed failure "wslpath could not translate paths"
  exit 1
fi

quoted_profile_winpath=$(printf '%s' "$debug_profile_winpath" | sed "s/'/''/g")

acquire_port_lock
stop_current_profile "$quoted_profile_winpath"
debug_port=$(select_debug_port)

# Optional: nuke the profile dir for a clean session.
if [[ "${EDGE_DEBUG_FRESH_PROFILE:-0}" == "1" ]]; then
  emit_event info edge.profile-reset success "$debug_profile"
  rm -rf "$debug_profile" 2>/dev/null || true
fi
mkdir -p "$debug_profile"

# Launch with debug port + offscreen window so it doesn't steal focus.
# Position 30000,30000 is well outside any reasonable monitor; user can drag
# the window onscreen if they want to see it.
emit_event info edge.launch success "port=$debug_port profile=$debug_profile_winpath runtime=$edge_runtime_file"
write_runtime_files starting

# --remote-debugging-address=127.0.0.1 constrains the bind to loopback.
# Recent Edge builds can still choose the IPv6 loopback family; the elevated
# setup defaults to v4tov6 portproxy rules for that reason. Non-loopback
# overrides like 0.0.0.0 are silently dropped by Chromium.
(
  exec 9>&- 2>/dev/null || true
  cmd.exe /c start /B "" "$edge_exe_winpath" \
    --remote-debugging-port="$debug_port" \
    --remote-debugging-address=127.0.0.1 \
    --user-data-dir="$debug_profile_winpath" \
    --no-first-run \
    --no-default-browser-check \
    --disable-default-apps \
    --disable-features=msIPv6OnlyLoopback \
    --window-position=30000,30000 \
    --window-size=1280,800 \
    about:blank \
    >/dev/null 2>&1
) &

# Wait up to 30 seconds for the debug endpoint to come up. Edge cold-start
# on Windows is routinely 8-15 seconds; the previous 5s ceiling consistently
# fired before Edge bound the port.
#
# WSL2 in default (NAT) networking mode cannot reach Windows-internal
# 127.0.0.1; we probe via the Windows host IP from /etc/resolv.conf or the
# default-route gateway. With mirrored networking ($EDGE_DEBUG_USE_LOCALHOST=1
# set after enabling mirrored mode in ~/.wslconfig), 127.0.0.1 works directly.
# Build a list of candidate URLs to probe. Edge's CDP binding varies:
#   - Mirrored networking: 127.0.0.1 and [::1] both work directly
#   - Default NAT mode: needs the Windows host IP from /etc/resolv.conf or
#     the default-route gateway, AND a netsh portproxy on Windows
candidates=()
build_probe_urls "$debug_port"
candidates=("${probe_urls[@]}")

wait_max_seconds=${EDGE_DEBUG_WAIT_SECONDS:-30}
deadline=$((SECONDS + wait_max_seconds))
while ((SECONDS < deadline)); do
  for url in "${candidates[@]}"; do
    if curl -fsS --max-time 1 "$url" >/dev/null 2>&1; then
      emit_event info edge.debug-ready success "$url"
      write_runtime_files running "$url"
      printf '%s\n' "$url"
      exit 0
    fi
  done
  sleep 0.5
done

emit_event error edge.debug-unreachable failure "no candidate URL responded within ${wait_max_seconds}s (tried: ${candidates[*]})"
exit 1
