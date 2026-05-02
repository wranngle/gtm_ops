#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

workflow_file="${SYMPHONY_WORKFLOW_FILE:-WORKFLOW.md}"
gh_bin="${SYMPHONY_GH_BIN:-gh}"
git_bin="${SYMPHONY_GIT_BIN:-git}"

workflow_value(){
  local path="$1" default="${2:-}" top key value
  if [[ "$path" == *.* ]]; then
    top="${path%%.*}"
    key="${path#*.}"
  else
    top=""
    key="$path"
  fi
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
        gsub(/^["'\''"]|["'\''"]$/, "", line)
        print line
        exit
      }
    }
  ' "$workflow_file" 2>/dev/null || true)"
  [[ -n "$value" ]] && printf '%s' "$value" || printf '%s' "$default"
}

default_base="$(workflow_value pr_shepherd.default_base main)"
merge_policy="$(workflow_value pr_shepherd.merge_policy opt_in)"
merge_env="$(workflow_value pr_shepherd.merge_env SYMPHONY_ALLOW_PR_MERGE)"
reviewers_env="$(workflow_value pr_shepherd.reviewers_env SYMPHONY_PR_REVIEWERS)"

usage(){
  cat <<'USAGE'
Usage:
  scripts/symphony-pr-shepherd.sh <command> [options]

Commands:
  open              gh pr create with repo defaults
  update            gh pr edit for title/body/base changes
  request-review    request reviewers from --reviewers or SYMPHONY_PR_REVIEWERS
  review-comments   print PR comments/reviews for agent triage
  checks            print PR check status
  failed-logs       fetch failed run logs, or parse a fixture
  rebase-main       fetch origin and rebase current branch on the base branch
  rerun-failed      rerun failed jobs for a run id; requires --reason
  ready-comment     post a readiness comment, usually with review-packet path
  merge             merge or enable auto-merge; gated by explicit env policy

Common options:
  --pr N            Pull request number or URL
  --base BRANCH     Base branch (default from WORKFLOW.md pr_shepherd.default_base)
  --body-file PATH  Markdown file for PR body/comment

Set SYMPHONY_GH_BIN to a fake gh executable in tests. Merge is refused unless
WORKFLOW.md pr_shepherd.merge_policy is not "never" and the configured merge
environment variable is set to 1 (default: SYMPHONY_ALLOW_PR_MERGE=1).
USAGE
}

fail(){
  printf 'symphony-pr-shepherd: %s\n' "$1" >&2
  exit 1
}

require_gh(){
  command -v "$gh_bin" >/dev/null 2>&1 || fail "gh executable not found: $gh_bin"
}

require_pr(){
  [[ -n "${pr:-}" ]] || fail "--pr is required"
}

split_csv(){
  printf '%s' "$1" | tr ',' '\n' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' | sed '/^$/d'
}

cmd_open(){
  local title="" body_file="" base="$default_base" draft="false"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --title) title="$2"; shift 2 ;;
      --body-file) body_file="$2"; shift 2 ;;
      --base) base="$2"; shift 2 ;;
      --draft) draft="true"; shift ;;
      *) fail "open: unknown argument: $1" ;;
    esac
  done
  [[ -n "$title" ]] || fail "open: --title is required"
  [[ -n "$body_file" && -f "$body_file" ]] || fail "open: --body-file must point to a file"
  require_gh
  local args=(pr create --base "$base" --title "$title" --body-file "$body_file")
  [[ "$draft" == "true" ]] && args+=(--draft)
  "$gh_bin" "${args[@]}"
}

cmd_update(){
  local pr="" title="" body_file="" base=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pr) pr="$2"; shift 2 ;;
      --title) title="$2"; shift 2 ;;
      --body-file) body_file="$2"; shift 2 ;;
      --base) base="$2"; shift 2 ;;
      *) fail "update: unknown argument: $1" ;;
    esac
  done
  require_pr
  require_gh
  local args=(pr edit "$pr")
  [[ -n "$title" ]] && args+=(--title "$title")
  [[ -n "$body_file" ]] && args+=(--body-file "$body_file")
  [[ -n "$base" ]] && args+=(--base "$base")
  (( ${#args[@]} > 3 )) || fail "update: provide --title, --body-file, or --base"
  "$gh_bin" "${args[@]}"
}

cmd_request_review(){
  local pr="" reviewers="${!reviewers_env-}"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pr) pr="$2"; shift 2 ;;
      --reviewers) reviewers="$2"; shift 2 ;;
      *) fail "request-review: unknown argument: $1" ;;
    esac
  done
  require_pr
  [[ -n "$reviewers" ]] || fail "request-review: set --reviewers or $reviewers_env"
  require_gh
  local args=(pr edit "$pr")
  while IFS= read -r reviewer; do
    args+=(--add-reviewer "$reviewer")
  done < <(split_csv "$reviewers")
  "$gh_bin" "${args[@]}"
}

cmd_review_comments(){
  local pr=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pr) pr="$2"; shift 2 ;;
      *) fail "review-comments: unknown argument: $1" ;;
    esac
  done
  require_pr
  require_gh
  "$gh_bin" pr view "$pr" --comments
}

cmd_checks(){
  local pr="" watch="false"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pr) pr="$2"; shift 2 ;;
      --watch) watch="true"; shift ;;
      *) fail "checks: unknown argument: $1" ;;
    esac
  done
  require_pr
  require_gh
  if [[ "$watch" == "true" ]]; then
    "$gh_bin" pr checks "$pr" --watch
  else
    "$gh_bin" pr checks "$pr"
  fi
}

cmd_failed_logs(){
  local run_id="" fixture="" output_dir=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run-id) run_id="$2"; shift 2 ;;
      --fixture) fixture="$2"; shift 2 ;;
      --output-dir) output_dir="$2"; shift 2 ;;
      *) fail "failed-logs: unknown argument: $1" ;;
    esac
  done
  if [[ -n "$fixture" ]]; then
    [[ -f "$fixture" ]] || fail "failed-logs: fixture not found: $fixture"
    if command -v jq >/dev/null 2>&1; then
      jq -r '.checks[] | select((.state // .conclusion // "") | test("fail|failure|failed"; "i")) | "## " + (.name // "unnamed") + "\n" + (.log // .summary // "no fixture log") + "\n"' "$fixture"
    else
      sed -n '1,200p' "$fixture"
    fi
    return 0
  fi
  [[ -n "$run_id" ]] || fail "failed-logs: --run-id or --fixture is required"
  require_gh
  if [[ -n "$output_dir" ]]; then
    mkdir -p "$output_dir"
    "$gh_bin" run view "$run_id" --log-failed > "$output_dir/run-$run_id-failed.log"
    printf '%s\n' "$output_dir/run-$run_id-failed.log"
  else
    "$gh_bin" run view "$run_id" --log-failed
  fi
}

cmd_rebase_main(){
  local base="$default_base" remote="origin"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --base) base="$2"; shift 2 ;;
      --remote) remote="$2"; shift 2 ;;
      *) fail "rebase-main: unknown argument: $1" ;;
    esac
  done
  "$git_bin" fetch "$remote" "$base"
  "$git_bin" rebase "$remote/$base"
}

cmd_rerun_failed(){
  local run_id="" reason=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run-id) run_id="$2"; shift 2 ;;
      --reason) reason="$2"; shift 2 ;;
      *) fail "rerun-failed: unknown argument: $1" ;;
    esac
  done
  [[ -n "$run_id" ]] || fail "rerun-failed: --run-id is required"
  [[ -n "$reason" ]] || fail "rerun-failed: --reason is required to avoid blind retries"
  require_gh
  printf 'rerun reason: %s\n' "$reason" >&2
  "$gh_bin" run rerun "$run_id" --failed
}

cmd_ready_comment(){
  local pr="" packet="" body_file=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pr) pr="$2"; shift 2 ;;
      --packet) packet="$2"; shift 2 ;;
      --body-file) body_file="$2"; shift 2 ;;
      *) fail "ready-comment: unknown argument: $1" ;;
    esac
  done
  require_pr
  require_gh
  if [[ -n "$body_file" ]]; then
    [[ -f "$body_file" ]] || fail "ready-comment: body file not found: $body_file"
    "$gh_bin" pr comment "$pr" --body-file "$body_file"
  else
    [[ -n "$packet" ]] || fail "ready-comment: --packet or --body-file is required"
    "$gh_bin" pr comment "$pr" --body "Ready for review. Review packet: \`$packet\`"
  fi
}

cmd_merge(){
  local pr="" method="squash" auto="false" delete_branch="false"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pr) pr="$2"; shift 2 ;;
      --method) method="$2"; shift 2 ;;
      --auto) auto="true"; shift ;;
      --delete-branch) delete_branch="true"; shift ;;
      *) fail "merge: unknown argument: $1" ;;
    esac
  done
  require_pr
  [[ "$merge_policy" != "never" ]] || fail "merge disabled by WORKFLOW.md pr_shepherd.merge_policy=never"
  [[ "${!merge_env-}" == "1" ]] || fail "merge refused; set $merge_env=1 for this command only"
  require_gh
  local args=(pr merge "$pr")
  case "$method" in
    merge|squash|rebase) args+=("--$method") ;;
    *) fail "merge: --method must be merge, squash, or rebase" ;;
  esac
  [[ "$auto" == "true" ]] && args+=(--auto)
  [[ "$delete_branch" == "true" ]] && args+=(--delete-branch)
  "$gh_bin" "${args[@]}"
}

command_name="${1:-help}"
shift || true
case "$command_name" in
  open) cmd_open "$@" ;;
  update) cmd_update "$@" ;;
  request-review) cmd_request_review "$@" ;;
  review-comments) cmd_review_comments "$@" ;;
  checks) cmd_checks "$@" ;;
  failed-logs) cmd_failed_logs "$@" ;;
  rebase-main) cmd_rebase_main "$@" ;;
  rerun-failed) cmd_rerun_failed "$@" ;;
  ready-comment) cmd_ready_comment "$@" ;;
  merge) cmd_merge "$@" ;;
  help|-h|--help) usage ;;
  *) usage >&2; exit 2 ;;
esac
