#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

issues_root="${SYMPHONY_ISSUES_ROOT:-.symphony/issues}"
state="todo"
prefix="STACK"
priority="3"
labels="follow-up,agent-filed"
blocked_by=""
source_task=""
title=""
body=""
body_file=""
evidence_path=""
dry_run="false"

usage(){
  cat <<'USAGE'
Usage:
  scripts/symphony-follow-up.sh create --source ISSUE --title TITLE [options]

Options:
  --issues-root PATH     Markdown tracker root (default: .symphony/issues)
  --prefix PREFIX        Issue id prefix (default: STACK)
  --priority N           Front-matter priority (default: 3)
  --labels CSV           Front-matter labels (default: follow-up,agent-filed)
  --blocked-by CSV       Front-matter blocked_by value
  --body TEXT            Markdown body for the follow-up
  --body-file PATH       Read Markdown body from a file
  --evidence PATH        Optional source evidence path, recorded after safety checks
  --dry-run              Print the issue path and content without writing it

The helper creates the next PREFIX-NNN issue under .symphony/issues/todo.
It is intentionally local_markdown-first; external tracker writes stay in the
agent toolchain with gh or the configured tracker CLI.
USAGE
}

fail(){
  printf 'symphony-follow-up: %s\n' "$1" >&2
  exit 1
}

trim_csv_spaces(){
  printf '%s' "$1" | tr -d ' '
}

unsafe_path_reason(){
  local path="$1" normalized
  [[ -z "$path" ]] && return 1
  normalized="$(realpath -m "$path")"
  case "$normalized" in
    "$repo_root"/*|"$repo_root") ;;
    *) printf 'outside repository'; return 0 ;;
  esac

  local rel="${normalized#$repo_root/}"
  case "$rel" in
    docs/generated/*|.symphony/logs/*|.symphony/runtime/*|.git/*|\
    */.git/*|node_modules/*|*/node_modules/*|vendor/*|*/vendor/*|\
    dist/*|*/dist/*|build/*|*/build/*|_build/*|*/_build/*|deps/*|*/deps/*)
      printf 'generated, build, dependency, or runtime output'
      return 0
      ;;
    *private*|*Private*|*.secret*|*secret*)
      printf 'path name suggests private or secret material'
      return 0
      ;;
  esac
  return 1
}

assert_safe_input_path(){
  local path="$1" reason
  [[ -z "$path" ]] && return 0
  [[ -e "$path" ]] || fail "path does not exist: $path"
  if reason="$(unsafe_path_reason "$path")"; then
    fail "refusing unsafe input path ($reason): $path"
  fi
}

find_issue_file(){
  local identifier="$1"
  find "$issues_root" -mindepth 2 -maxdepth 2 -type f -name "$identifier.md" 2>/dev/null | head -n 1
}

relative_link_from_todo(){
  local file="$1"
  [[ -n "$file" ]] || return 1
  printf '../%s/%s' "$(basename "$(dirname "$file")")" "$(basename "$file")"
}

next_issue_id(){
  local max_number=0 file base number
  while IFS= read -r file; do
    base="$(basename "$file" .md)"
    number="${base#"$prefix"-}"
    [[ "$number" =~ ^[0-9]+$ ]] || continue
    if (( 10#$number > max_number )); then
      max_number=$((10#$number))
    fi
  done < <(find "$issues_root" -mindepth 2 -maxdepth 2 -type f -name "$prefix-[0-9]*.md" 2>/dev/null)
  printf '%s-%03d' "$prefix" "$((max_number + 1))"
}

render_issue(){
  local identifier="$1" source_file="$2" source_link="" evidence_line=""
  if [[ -n "$source_file" ]]; then
    source_link="$(relative_link_from_todo "$source_file")"
  fi
  if [[ -n "$evidence_path" ]]; then
    evidence_line="Evidence: \`$evidence_path\`"
  fi

  cat <<ISSUE
---
id: $identifier
priority: $priority
labels: $labels
blocked_by: $blocked_by
source: $source_task
---
# $title

Source task: [$source_task](${source_link:-../unknown/$source_task.md})

${evidence_line}

$body
ISSUE
}

create_follow_up(){
  [[ -d "$issues_root" ]] || fail "issues root does not exist: $issues_root"
  [[ -n "$source_task" ]] || fail "--source is required"
  [[ -n "$title" ]] || fail "--title is required"
  [[ "$priority" =~ ^[0-9]+$ ]] || fail "--priority must be numeric"
  labels="$(trim_csv_spaces "$labels")"
  blocked_by="$(trim_csv_spaces "$blocked_by")"
  assert_safe_input_path "$body_file"
  assert_safe_input_path "$evidence_path"
  if [[ -n "$body_file" ]]; then
    body="$(<"$body_file")"
  fi

  local source_file identifier target rendered
  source_file="$(find_issue_file "$source_task")"
  [[ -n "$source_file" ]] || fail "source task not found under $issues_root: $source_task"
  identifier="$(next_issue_id)"
  target="$issues_root/$state/$identifier.md"
  [[ ! -e "$target" ]] || fail "target already exists: $target"
  rendered="$(render_issue "$identifier" "$source_file")"

  if [[ "$dry_run" == "true" ]]; then
    printf '# would write %s\n%s\n' "$target" "$rendered"
    return 0
  fi

  mkdir -p "$issues_root/$state"
  printf '%s\n' "$rendered" > "$target"
  printf '%s\n' "$target"
}

command="${1:-help}"
shift || true
case "$command" in
  create)
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --issues-root) issues_root="$2"; shift 2 ;;
        --prefix) prefix="$2"; shift 2 ;;
        --priority) priority="$2"; shift 2 ;;
        --labels) labels="$2"; shift 2 ;;
        --blocked-by) blocked_by="$2"; shift 2 ;;
        --source) source_task="$2"; shift 2 ;;
        --title) title="$2"; shift 2 ;;
        --body) body="$2"; shift 2 ;;
        --body-file) body_file="$2"; shift 2 ;;
        --evidence) evidence_path="$2"; shift 2 ;;
        --dry-run) dry_run="true"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) fail "unknown argument: $1" ;;
      esac
    done
    create_follow_up
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
