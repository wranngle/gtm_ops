#!/usr/bin/env bash
set -euo pipefail
symphony_repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.."&&pwd)";cd "$symphony_repository_root"
symphony_workflow_file_path="${SYMPHONY_WORKFLOW_FILE:-WORKFLOW.md}"
symphony_now_utc(){ date -u +%Y-%m-%dT%H:%M:%SZ;}
symphony_json_escape(){ local raw="${1:-}";raw="${raw//\\/\\\\}";raw="${raw//\"/\\\"}";raw="${raw//$'\n'/\\n}";printf '%s' "$raw";}
symphony_workflow_value(){ local key="$1" default="${2:-}";awk -v k="$key" 'BEGIN{i=0}NR==1&&$0=="---"{i=1;next}i&&$0=="---"{exit}i{line=$0;sub(/^[[:space:]]*/,"",line);if(index(line,k ":")==1){sub("^[^:]+:[[:space:]]*","",line);gsub(/^["'\'']|["'\'']$/,"",line);print line;exit}}' "$symphony_workflow_file_path" 2>/dev/null||printf '%s' "$default";}
symphony_tracker_kind="$(symphony_workflow_value tracker_kind local_markdown)"
symphony_issues_root="$(symphony_workflow_value issues_root .symphony/issues)"
symphony_active_states_csv="$(symphony_workflow_value active_states todo,in_progress)"
symphony_terminal_states_csv="$(symphony_workflow_value terminal_states done,cancelled,duplicate)"
symphony_handoff_state="$(symphony_workflow_value handoff_state human_review)"
symphony_workspace_root="$(symphony_workflow_value workspace_root .symphony/workspaces)"
symphony_log_path="$(symphony_workflow_value log_path .symphony/logs/symphony.jsonl)"
symphony_agent_command_configured="$(symphony_workflow_value agent_command scripts/bin/llm.sh)"
symphony_max_concurrent_agents="$(symphony_workflow_value max_concurrent_agents 1)"
symphony_require_explicit_agent_run="$(symphony_workflow_value require_explicit_agent_run true)"
symphony_emit_log(){ local level="$1" action="$2" outcome="$3" detail="${4:-}" issue="${5:-}";mkdir -p "$(dirname "$symphony_log_path")";local json;json="{\"@timestamp\":\"$(symphony_now_utc)\",\"log.level\":\"$(symphony_json_escape "$level")\",\"event.action\":\"$(symphony_json_escape "$action")\",\"event.outcome\":\"$(symphony_json_escape "$outcome")\",\"service.name\":\"wranngle-local-symphony\",\"issue.identifier\":\"$(symphony_json_escape "$issue")\",\"message\":\"$(symphony_json_escape "$detail")\"}";printf '%s\n' "$json" >&2;printf '%s\n' "$json" >> "$symphony_log_path";}
symphony_fail(){ symphony_emit_log error "$1" failure "${2:-}" "${3:-}";exit 1;}
symphony_contains_csv_value(){ local csv="$1" value="$2" item;IFS=',' read -r -a symphony_csv_items <<< "$csv";for item in "${symphony_csv_items[@]}";do [[ "${item// /}" == "$value" ]]&&return 0;done;return 1;}
symphony_sanitize_workspace_key(){ local raw="$1";printf '%s' "$raw"|sed -E 's/[^A-Za-z0-9._-]+/_/g;s/^_+//;s/_+$//';}
symphony_issue_identifier_from_file(){ basename "$1" .md;}
symphony_issue_state_from_file(){ basename "$(dirname "$1")";}
symphony_issue_front_matter_value(){ local file="$1" key="$2" default="${3:-}";awk -v k="$key" 'BEGIN{i=0}NR==1&&$0=="---"{i=1;next}i&&$0=="---"{exit}i{line=$0;sub(/^[[:space:]]*/,"",line);if(index(line,k ":")==1){sub("^[^:]+:[[:space:]]*","",line);print line;exit}}' "$file" 2>/dev/null||printf '%s' "$default";}
symphony_issue_title_from_file(){ awk '/^# /{sub(/^# /,"");print;exit}' "$1";}
symphony_issue_description_from_file(){ awk 'BEGIN{seen=0}/^---$/{f++;next}f>=2{print}' "$1";}
symphony_issue_priority_from_file(){ local value;value="$(symphony_issue_front_matter_value "$1" priority 999)";[[ "$value" =~ ^[0-9]+$ ]]&&printf '%s' "$value"||printf '999';}
symphony_issue_blocked_by_csv_from_file(){ symphony_issue_front_matter_value "$1" blocked_by ""|tr -d ' ';}
symphony_issue_file_for_identifier(){ local identifier="$1";find "$symphony_issues_root" -mindepth 2 -maxdepth 2 -type f -name "$identifier.md" 2>/dev/null|head -n 1;}
symphony_blocker_is_open(){ local blocker="$1" file state;[[ -z "$blocker" ]]&&return 1;file="$(symphony_issue_file_for_identifier "$blocker")";[[ -z "$file" ]]&&return 1;state="$(symphony_issue_state_from_file "$file")";symphony_contains_csv_value "$symphony_terminal_states_csv" "$state"&&return 1||return 0;}
symphony_issue_is_blocked(){ local file="$1" blockers blocker;blockers="$(symphony_issue_blocked_by_csv_from_file "$file")";[[ -z "$blockers" ]]&&return 1;IFS=',' read -r -a symphony_blocker_items <<< "$blockers";for blocker in "${symphony_blocker_items[@]}";do symphony_blocker_is_open "$blocker"&&return 0;done;return 1;}
symphony_candidate_issue_files(){ local state;IFS=',' read -r -a symphony_active_state_items <<< "$symphony_active_states_csv";for state in "${symphony_active_state_items[@]}";do state="${state// /}";find "$symphony_issues_root/$state" -maxdepth 1 -type f -name '*.md' 2>/dev/null;done|while read -r file;do printf '%09d %s\n' "$(symphony_issue_priority_from_file "$file")" "$file";done|sort -n|cut -d' ' -f2-;}
symphony_resolved_agent_command(){ case "$symphony_agent_command_configured" in /*)printf '%s' "$symphony_agent_command_configured";;*)printf '%s/%s' "$symphony_repository_root" "$symphony_agent_command_configured";;esac;}
symphony_validate(){ [[ -f "$symphony_workflow_file_path" ]]||symphony_fail symphony.workflow_missing "missing $symphony_workflow_file_path";[[ "$symphony_tracker_kind" == "local_markdown" ]]||symphony_fail symphony.unsupported_tracker "tracker_kind=$symphony_tracker_kind";[[ "$symphony_max_concurrent_agents" =~ ^[0-9]+$ ]]||symphony_fail symphony.invalid_concurrency "max_concurrent_agents=$symphony_max_concurrent_agents";[[ -d "$symphony_issues_root" ]]||symphony_fail symphony.issues_root_missing "$symphony_issues_root";mkdir -p "$symphony_workspace_root" "$(dirname "$symphony_log_path")";[[ -x "$(symphony_resolved_agent_command)" ]]||symphony_fail symphony.agent_command_missing "$(symphony_resolved_agent_command)";symphony_emit_log info symphony.validate success "workflow=$symphony_workflow_file_path tracker=$symphony_tracker_kind issues=$symphony_issues_root workspace=$symphony_workspace_root";}
symphony_list(){ local file identifier state title priority blocked;while IFS= read -r file;do identifier="$(symphony_issue_identifier_from_file "$file")";state="$(symphony_issue_state_from_file "$file")";title="$(symphony_issue_title_from_file "$file")";priority="$(symphony_issue_priority_from_file "$file")";blocked=no;symphony_issue_is_blocked "$file"&&blocked=yes;printf '%s\tstate=%s\tpriority=%s\tblocked=%s\t%s\n' "$identifier" "$state" "$priority" "$blocked" "$title";done < <(symphony_candidate_issue_files);}
symphony_render_prompt(){ local file="$1" identifier state title description attempt workspace;identifier="$(symphony_issue_identifier_from_file "$file")";state="$(symphony_issue_state_from_file "$file")";title="$(symphony_issue_title_from_file "$file")";description="$(symphony_issue_description_from_file "$file")";attempt="${2:-}";workspace="${3:-}";cat <<PROMPT
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
symphony_run_issue(){ local file="$1" dry_run="$2" identifier workspace_key workspace output_file agent_command;identifier="$(symphony_issue_identifier_from_file "$file")";symphony_issue_is_blocked "$file"&&{ symphony_emit_log info symphony.issue_blocked success "blocked_by=$(symphony_issue_blocked_by_csv_from_file "$file")" "$identifier";return 0;};workspace_key="$(symphony_sanitize_workspace_key "$identifier")";workspace="$symphony_workspace_root/$workspace_key";mkdir -p "$workspace";output_file="$workspace/agent-output-$(date -u +%Y%m%dT%H%M%SZ).md";symphony_emit_log info symphony.dispatch success "workspace=$workspace dry_run=$dry_run" "$identifier";if [[ "$dry_run" == true ]];then symphony_render_prompt "$file" "" "$workspace" > "$workspace/rendered-prompt.md";symphony_emit_log info symphony.dry_run success "rendered_prompt=$workspace/rendered-prompt.md" "$identifier";return 0;fi;if [[ "$symphony_require_explicit_agent_run" == true && "${SYMPHONY_ALLOW_AGENT_RUN:-0}" != 1 ]];then symphony_fail symphony.agent_run_not_allowed "set SYMPHONY_ALLOW_AGENT_RUN=1 to execute agent_command" "$identifier";fi;agent_command="$(symphony_resolved_agent_command)";(cd "$workspace"&&symphony_render_prompt "$file" "" "$workspace"|"$agent_command") > "$output_file";symphony_emit_log info symphony.agent_completed success "output=$output_file" "$identifier";}
symphony_once(){ local dry_run="$1" limit="${2:-1}" count=0 file;while IFS= read -r file;do ((count>=limit))&&break;symphony_run_issue "$file" "$dry_run";count=$((count+1));done < <(symphony_candidate_issue_files);[[ "$count" -gt 0 ]]||symphony_emit_log info symphony.no_candidates success "no active issue files found";}
symphony_usage(){ cat <<'USAGE'
Usage:
  scripts/symphony.sh validate
  scripts/symphony.sh list
  scripts/symphony.sh once [--dry-run] [--limit N]

Default tracker: local Markdown files under .symphony/issues.
Default agent command: scripts/bin/llm.sh.
Actual agent execution requires SYMPHONY_ALLOW_AGENT_RUN=1.
USAGE
}
symphony_command="${1:-help}";shift||true
case "$symphony_command" in
  validate)symphony_validate;;
  list)symphony_validate >/dev/null;symphony_list;;
  once)symphony_dry_run=false;symphony_limit=1;while [[ $# -gt 0 ]];do case "$1" in --dry-run)symphony_dry_run=true;shift;;--limit)symphony_limit="$2";shift 2;;*)symphony_fail symphony.unknown_arg "$1";;esac;done;symphony_validate >/dev/null;symphony_once "$symphony_dry_run" "$symphony_limit";;
  help|-h|--help)symphony_usage;;
  *)symphony_usage >&2;exit 2;;
esac

