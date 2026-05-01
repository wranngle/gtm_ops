#!/usr/bin/env bash
set -euo pipefail
symphony_repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$symphony_repository_root"
symphony_workflow_file_path="${SYMPHONY_WORKFLOW_FILE:-WORKFLOW.md}"

symphony_now_utc(){ date -u +%Y-%m-%dT%H:%M:%SZ; }
symphony_json_escape(){ local raw="${1:-}";raw="${raw//\\/\\\\}";raw="${raw//\"/\\\"}";raw="${raw//$'\n'/\\n}";printf '%s' "$raw"; }

# symphony_workflow_value reads dotted YAML paths from WORKFLOW.md front matter.
symphony_workflow_value(){
  local path="$1" default="${2:-}" top key
  if [[ "$path" == *.* ]]; then top="${path%%.*}"; key="${path#*.}"; else top=""; key="$path"; fi
  local value
  value="$(awk -v top="$top" -v k="$key" '
    BEGIN { in_fm = 0; in_block = (top == "") }
    NR == 1 && $0 == "---" { in_fm = 1; next }
    in_fm && $0 == "---" { exit }
    !in_fm { next }
    {
      if (top != "") {
        if (match($0, "^" top ":[[:space:]]*$")) { in_block = 1; next }
        if (match($0, /^[A-Za-z_]/)) { in_block = 0 }
      }
      if (!in_block) next
      line = $0
      sub(/^[[:space:]]+/, "", line)
      if (top == "" && match($0, /^[[:space:]]/)) next
      if (index(line, k ":") == 1) {
        sub("^[^:]+:[[:space:]]*", "", line)
        gsub(/^["'\'']|["'\'']$/, "", line)
        print line
        exit
      }
    }
  ' "$symphony_workflow_file_path" 2>/dev/null)"
  if [[ -n "$value" ]]; then printf '%s' "$value"; else printf '%s' "$default"; fi
}

symphony_tracker_kind="$(symphony_workflow_value tracker.kind local_markdown)"
symphony_issues_root="$(symphony_workflow_value tracker.issues_root .symphony/issues)"
symphony_issues_repo="$(symphony_workflow_value tracker.repo "")"
symphony_active_states_csv="$(symphony_workflow_value tracker.active_states todo,in_progress)"
symphony_terminal_states_csv="$(symphony_workflow_value tracker.terminal_states done,cancelled,duplicate)"
symphony_handoff_state="$(symphony_workflow_value tracker.handoff_state human_review)"
symphony_workspace_root="$(symphony_workflow_value workspace.root .symphony/workspaces)"
symphony_log_path="$(symphony_workflow_value log_path .symphony/logs/symphony.jsonl)"
symphony_agent_command_configured="$(symphony_workflow_value agent.command scripts/bin/llm.sh)"
symphony_max_concurrent_agents="$(symphony_workflow_value agent.max_concurrent_agents 1)"
symphony_require_explicit_agent_run="$(symphony_workflow_value agent.require_explicit_run true)"

symphony_emit_log(){
  local level="$1" action="$2" outcome="$3" detail="${4:-}" issue="${5:-}"
  mkdir -p "$(dirname "$symphony_log_path")"
  local json
  json="{\"@timestamp\":\"$(symphony_now_utc)\",\"log.level\":\"$(symphony_json_escape "$level")\",\"event.action\":\"$(symphony_json_escape "$action")\",\"event.outcome\":\"$(symphony_json_escape "$outcome")\",\"service.name\":\"wranngle-local-symphony\",\"issue.identifier\":\"$(symphony_json_escape "$issue")\",\"message\":\"$(symphony_json_escape "$detail")\"}"
  printf '%s\n' "$json" >&2
  printf '%s\n' "$json" >> "$symphony_log_path"
}
symphony_fail(){ symphony_emit_log error "$1" failure "${2:-}" "${3:-}"; exit 1; }
symphony_contains_csv_value(){
  local csv="$1" value="$2" item
  IFS=',' read -r -a symphony_csv_items <<< "$csv"
  for item in "${symphony_csv_items[@]}"; do [[ "${item// /}" == "$value" ]] && return 0; done
  return 1
}
symphony_sanitize_workspace_key(){ local raw="$1"; printf '%s' "$raw" | sed -E 's/[^A-Za-z0-9._-]+/_/g; s/^_+//; s/_+$//'; }
symphony_resolved_agent_command(){ case "$symphony_agent_command_configured" in /*) printf '%s' "$symphony_agent_command_configured" ;; *) printf '%s/%s' "$symphony_repository_root" "$symphony_agent_command_configured" ;; esac; }

# ========== local_markdown adapter ==========

symphony_lm_issue_identifier_from_ref(){ basename "$1" .md; }
symphony_lm_issue_state_from_ref(){ basename "$(dirname "$1")"; }
symphony_lm_issue_front_matter_value(){
  local file="$1" key="$2" default="${3:-}"
  awk -v k="$key" 'BEGIN{i=0}NR==1&&$0=="---"{i=1;next}i&&$0=="---"{exit}i{line=$0;sub(/^[[:space:]]*/,"",line);if(index(line,k ":")==1){sub("^[^:]+:[[:space:]]*","",line);print line;exit}}' "$file" 2>/dev/null \
    || printf '%s' "$default"
}
symphony_lm_issue_title_from_ref(){ awk '/^# /{sub(/^# /,"");print;exit}' "$1"; }
symphony_lm_issue_description_from_ref(){ awk 'BEGIN{seen=0}/^---$/{f++;next}f>=2{print}' "$1"; }
symphony_lm_issue_priority_from_ref(){
  local value
  value="$(symphony_lm_issue_front_matter_value "$1" priority 999)"
  [[ "$value" =~ ^[0-9]+$ ]] && printf '%s' "$value" || printf '999'
}
symphony_lm_issue_blocked_by_csv_from_ref(){ symphony_lm_issue_front_matter_value "$1" blocked_by "" | tr -d ' '; }
symphony_lm_issue_file_for_identifier(){ find "$symphony_issues_root" -mindepth 2 -maxdepth 2 -type f -name "$1.md" 2>/dev/null | head -n 1; }
symphony_lm_blocker_is_open(){
  local blocker="$1" file state
  [[ -z "$blocker" ]] && return 1
  file="$(symphony_lm_issue_file_for_identifier "$blocker")"
  [[ -z "$file" ]] && return 1
  state="$(symphony_lm_issue_state_from_ref "$file")"
  symphony_contains_csv_value "$symphony_terminal_states_csv" "$state" && return 1 || return 0
}
symphony_lm_candidate_refs(){
  local state
  IFS=',' read -r -a symphony_lm_active_state_items <<< "$symphony_active_states_csv"
  for state in "${symphony_lm_active_state_items[@]}"; do
    state="${state// /}"
    find "$symphony_issues_root/$state" -maxdepth 1 -type f -name '*.md' 2>/dev/null
  done | while read -r file; do
    printf '%09d %s\n' "$(symphony_lm_issue_priority_from_ref "$file")" "$file"
  done | sort -n | cut -d' ' -f2-
}
symphony_lm_validate(){
  [[ -d "$symphony_issues_root" ]] || symphony_fail symphony.issues_root_missing "$symphony_issues_root"
}

# ========== github_issues adapter ==========

# Cache the gh issue list payload for the duration of one symphony invocation
# so we make at most one API call per command.
symphony_gh_candidates_cache=""
symphony_gh_state_label_csv="symphony:todo,symphony:in-progress,symphony:human-review,symphony:cancelled,symphony:duplicate"

symphony_gh_validate(){
  command -v gh >/dev/null 2>&1 || symphony_fail symphony.gh_missing "gh CLI not on PATH"
  gh auth status >/dev/null 2>&1 || symphony_fail symphony.gh_auth_missing "run \`gh auth login\`"
  [[ -n "$symphony_issues_repo" ]] || symphony_fail symphony.gh_repo_missing "set tracker.repo in WORKFLOW.md"
}
symphony_gh_load_candidates(){
  [[ -n "$symphony_gh_candidates_cache" ]] && return
  symphony_gh_candidates_cache="$(gh issue list \
    --repo "$symphony_issues_repo" \
    --state open \
    --limit 200 \
    --json number,title,body,labels,state 2>/dev/null || printf '[]')"
}
symphony_gh_issue_field(){
  local num="$1" jq_expr="$2"
  symphony_gh_load_candidates
  printf '%s' "$symphony_gh_candidates_cache" | jq -r --argjson n "$num" \
    "(.[] | select(.number == \$n) | $jq_expr) // empty" 2>/dev/null
}
symphony_gh_issue_state_from_ref(){
  local labels
  labels="$(symphony_gh_issue_field "$1" '.labels[].name')"
  while IFS= read -r label; do
    case "$label" in
      symphony:todo)         printf 'todo'; return ;;
      symphony:in-progress)  printf 'in_progress'; return ;;
      symphony:human-review) printf 'human_review'; return ;;
      symphony:cancelled)    printf 'cancelled'; return ;;
      symphony:duplicate)    printf 'duplicate'; return ;;
    esac
  done <<< "$labels"
  printf 'todo'
}
symphony_gh_issue_priority_from_ref(){
  local labels label
  labels="$(symphony_gh_issue_field "$1" '.labels[].name')"
  while IFS= read -r label; do
    if [[ "$label" =~ ^priority:([0-9]+)$ ]]; then printf '%s' "${BASH_REMATCH[1]}"; return; fi
  done <<< "$labels"
  printf '999'
}
symphony_gh_issue_title_from_ref(){ symphony_gh_issue_field "$1" '.title'; }
symphony_gh_issue_body_from_ref(){ symphony_gh_issue_field "$1" '.body'; }
symphony_gh_issue_blocked_by_csv_from_ref(){
  local body
  body="$(symphony_gh_issue_body_from_ref "$1")"
  printf '%s' "$body" \
    | grep -iE '^[[:space:]]*Blocked-by:[[:space:]]*#?[0-9]' \
    | head -n 1 \
    | grep -oE '#?[0-9]+' \
    | sed 's/^#//' \
    | paste -sd ',' - 2>/dev/null || true
}
symphony_gh_blocker_is_open(){
  local blocker="$1" gh_state
  [[ -z "$blocker" ]] && return 1
  gh_state="$(gh issue view "$blocker" --repo "$symphony_issues_repo" --json state --jq '.state' 2>/dev/null || true)"
  [[ "$gh_state" == "OPEN" ]]
}
symphony_gh_candidate_refs(){
  symphony_gh_load_candidates
  printf '%s' "$symphony_gh_candidates_cache" \
    | jq -r '.[] | .number' 2>/dev/null \
    | while read -r num; do
        local state
        state="$(symphony_gh_issue_state_from_ref "$num")"
        if symphony_contains_csv_value "$symphony_active_states_csv" "$state"; then
          printf '%09d %s\n' "$(symphony_gh_issue_priority_from_ref "$num")" "$num"
        fi
      done | sort -n | cut -d' ' -f2-
}

# ========== adapter dispatch ==========

symphony_issue_identifier_from_ref(){
  case "$symphony_tracker_kind" in
    local_markdown) symphony_lm_issue_identifier_from_ref "$1" ;;
    github_issues)  printf 'gh-%s' "$1" ;;
  esac
}
symphony_issue_state_from_ref(){
  case "$symphony_tracker_kind" in
    local_markdown) symphony_lm_issue_state_from_ref "$1" ;;
    github_issues)  symphony_gh_issue_state_from_ref "$1" ;;
  esac
}
symphony_issue_title_from_ref(){
  case "$symphony_tracker_kind" in
    local_markdown) symphony_lm_issue_title_from_ref "$1" ;;
    github_issues)  symphony_gh_issue_title_from_ref "$1" ;;
  esac
}
symphony_issue_description_from_ref(){
  case "$symphony_tracker_kind" in
    local_markdown) symphony_lm_issue_description_from_ref "$1" ;;
    github_issues)  symphony_gh_issue_body_from_ref "$1" ;;
  esac
}
symphony_issue_priority_from_ref(){
  case "$symphony_tracker_kind" in
    local_markdown) symphony_lm_issue_priority_from_ref "$1" ;;
    github_issues)  symphony_gh_issue_priority_from_ref "$1" ;;
  esac
}
symphony_issue_blocked_by_csv_from_ref(){
  case "$symphony_tracker_kind" in
    local_markdown) symphony_lm_issue_blocked_by_csv_from_ref "$1" ;;
    github_issues)  symphony_gh_issue_blocked_by_csv_from_ref "$1" ;;
  esac
}
symphony_blocker_is_open(){
  case "$symphony_tracker_kind" in
    local_markdown) symphony_lm_blocker_is_open "$1" ;;
    github_issues)  symphony_gh_blocker_is_open "$1" ;;
  esac
}
symphony_candidate_refs(){
  case "$symphony_tracker_kind" in
    local_markdown) symphony_lm_candidate_refs ;;
    github_issues)  symphony_gh_candidate_refs ;;
  esac
}

symphony_issue_is_blocked(){
  local ref="$1" blockers blocker
  blockers="$(symphony_issue_blocked_by_csv_from_ref "$ref")"
  [[ -z "$blockers" ]] && return 1
  IFS=',' read -r -a symphony_blocker_items <<< "$blockers"
  for blocker in "${symphony_blocker_items[@]}"; do
    symphony_blocker_is_open "$blocker" && return 0
  done
  return 1
}

symphony_validate(){
  [[ -f "$symphony_workflow_file_path" ]] || symphony_fail symphony.workflow_missing "missing $symphony_workflow_file_path"
  [[ "$symphony_max_concurrent_agents" =~ ^[0-9]+$ ]] || symphony_fail symphony.invalid_concurrency "agent.max_concurrent_agents=$symphony_max_concurrent_agents"
  case "$symphony_tracker_kind" in
    local_markdown) symphony_lm_validate ;;
    github_issues)  symphony_gh_validate ;;
    *) symphony_fail symphony.unsupported_tracker "tracker.kind=$symphony_tracker_kind (supported: local_markdown, github_issues)" ;;
  esac
  mkdir -p "$symphony_workspace_root" "$(dirname "$symphony_log_path")"
  [[ -x "$(symphony_resolved_agent_command)" ]] || symphony_fail symphony.agent_command_missing "$(symphony_resolved_agent_command)"
  symphony_emit_log info symphony.validate success "workflow=$symphony_workflow_file_path tracker=$symphony_tracker_kind workspace=$symphony_workspace_root"
}

symphony_list(){
  local ref identifier state title priority blocked
  while IFS= read -r ref; do
    [[ -z "$ref" ]] && continue
    identifier="$(symphony_issue_identifier_from_ref "$ref")"
    state="$(symphony_issue_state_from_ref "$ref")"
    title="$(symphony_issue_title_from_ref "$ref")"
    priority="$(symphony_issue_priority_from_ref "$ref")"
    blocked=no
    symphony_issue_is_blocked "$ref" && blocked=yes
    printf '%s\tstate=%s\tpriority=%s\tblocked=%s\t%s\n' "$identifier" "$state" "$priority" "$blocked" "$title"
  done < <(symphony_candidate_refs)
}

symphony_render_prompt(){
  local ref="$1" attempt="${2:-}" workspace="${3:-}"
  local identifier state title description
  identifier="$(symphony_issue_identifier_from_ref "$ref")"
  state="$(symphony_issue_state_from_ref "$ref")"
  title="$(symphony_issue_title_from_ref "$ref")"
  description="$(symphony_issue_description_from_ref "$ref")"
  cat <<PROMPT
Issue: $identifier
State: $state
Title: $title
Attempt: ${attempt:-first}
Repository: $symphony_repository_root
Workspace: $workspace
Handoff state: $symphony_handoff_state

Task description:
$description

Workflow contract:
$(awk 'f{print}/^---$/{c++;if(c==2)f=1}' "$symphony_workflow_file_path")
PROMPT
}

symphony_run_issue(){
  local ref="$1" dry_run="$2"
  local identifier workspace_key workspace output_file agent_command
  identifier="$(symphony_issue_identifier_from_ref "$ref")"
  if symphony_issue_is_blocked "$ref"; then
    symphony_emit_log info symphony.issue_blocked success "blocked_by=$(symphony_issue_blocked_by_csv_from_ref "$ref")" "$identifier"
    return 0
  fi
  workspace_key="$(symphony_sanitize_workspace_key "$identifier")"
  workspace="$symphony_workspace_root/$workspace_key"
  mkdir -p "$workspace"
  output_file="$workspace/agent-output-$(date -u +%Y%m%dT%H%M%SZ).md"
  symphony_emit_log info symphony.dispatch success "workspace=$workspace dry_run=$dry_run" "$identifier"
  if [[ "$dry_run" == true ]]; then
    symphony_render_prompt "$ref" "" "$workspace" > "$workspace/rendered-prompt.md"
    symphony_emit_log info symphony.dry_run success "rendered_prompt=$workspace/rendered-prompt.md" "$identifier"
    return 0
  fi
  if [[ "$symphony_require_explicit_agent_run" == true && "${SYMPHONY_ALLOW_AGENT_RUN:-0}" != 1 ]]; then
    symphony_fail symphony.agent_run_not_allowed "set SYMPHONY_ALLOW_AGENT_RUN=1 to execute agent.command" "$identifier"
  fi
  agent_command="$(symphony_resolved_agent_command)"
  (cd "$workspace" && symphony_render_prompt "$ref" "" "$workspace" | "$agent_command") > "$output_file"
  symphony_emit_log info symphony.agent_completed success "output=$output_file" "$identifier"
}

symphony_once(){
  local dry_run="$1" limit="${2:-1}" count=0 ref
  while IFS= read -r ref; do
    [[ -z "$ref" ]] && continue
    (( count >= limit )) && break
    symphony_run_issue "$ref" "$dry_run"
    count=$((count + 1))
  done < <(symphony_candidate_refs)
  [[ "$count" -gt 0 ]] || symphony_emit_log info symphony.no_candidates success "no active candidates from tracker.kind=$symphony_tracker_kind"
}

symphony_usage(){
  cat <<'USAGE'
Usage:
  scripts/symphony.sh validate
  scripts/symphony.sh list
  scripts/symphony.sh once [--dry-run] [--limit N]

Tracker kinds (set via tracker.kind in WORKFLOW.md):
  local_markdown  — files under tracker.issues_root (default)
  github_issues   — gh CLI against tracker.repo (requires gh + gh auth)

Default agent command: scripts/bin/llm.sh.
Actual agent execution requires SYMPHONY_ALLOW_AGENT_RUN=1.
USAGE
}

symphony_command="${1:-help}"; shift || true
case "$symphony_command" in
  validate) symphony_validate ;;
  list) symphony_validate >/dev/null; symphony_list ;;
  once)
    symphony_dry_run=false; symphony_limit=1
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --dry-run) symphony_dry_run=true; shift ;;
        --limit) symphony_limit="$2"; shift 2 ;;
        *) symphony_fail symphony.unknown_arg "$1" ;;
      esac
    done
    symphony_validate >/dev/null
    symphony_once "$symphony_dry_run" "$symphony_limit"
    ;;
  help|-h|--help) symphony_usage ;;
  *) symphony_usage >&2; exit 2 ;;
esac
