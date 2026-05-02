#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fail(){
  printf 'symphony-completion-helpers test failed: %s\n' "$1" >&2
  exit 1
}

assert_file(){
  [[ -f "$1" ]] || fail "missing file: $1"
}

assert_contains(){
  local file="$1" needle="$2"
  grep -Fq "$needle" "$file" || fail "$file does not contain: $needle"
}

issues_root="$tmp_dir/issues"
mkdir -p "$issues_root"/{todo,done,human_review,cancelled,duplicate,in_progress}
cat > "$issues_root/done/STACK-001.md" <<'ISSUE'
---
id: STACK-001
priority: 1
labels: stack,fixture
blocked_by:
---
# Source fixture

Completed source task.
ISSUE

created_path="$(
  scripts/symphony-follow-up.sh create \
    --issues-root "$issues_root" \
    --source STACK-001 \
    --title "Capture fixture follow-up" \
    --body "Preserve a focused out-of-scope discovery for later scheduling."
)"
assert_file "$created_path"
assert_contains "$created_path" "id: STACK-002"
assert_contains "$created_path" "labels: follow-up,agent-filed"
assert_contains "$created_path" "Source task: [STACK-001](../done/STACK-001.md)"

if scripts/symphony-follow-up.sh create \
  --issues-root "$issues_root" \
  --source STACK-001 \
  --title "Unsafe evidence" \
  --evidence docs/generated/README.md > "$tmp_dir/follow-up-unsafe.out" 2>&1; then
  fail "unsafe generated evidence path was accepted"
fi
grep -Fq "refusing unsafe input path" "$tmp_dir/follow-up-unsafe.out" \
  || fail "unsafe evidence rejection did not explain why"

workflow_file="$tmp_dir/WORKFLOW.md"
cat > "$workflow_file" <<WORKFLOW
---
workflow_name: helper-fixture

tracker:
  kind: local_markdown
  issues_root: $issues_root
  active_states: todo,in_progress
  terminal_states: done,cancelled,duplicate
  handoff_state: human_review

polling:
  interval_ms: 30000

workspace:
  root: $tmp_dir/workspaces

hooks:
  timeout_ms: 60000

agent:
  command: scripts/bin/llm.sh
  max_concurrent_agents: 1
  require_explicit_run: true

codex:
  command: scripts/bin/llm.sh

log_path: $tmp_dir/logs/symphony.jsonl
---
# Helper fixture workflow
WORKFLOW

SYMPHONY_WORKFLOW_FILE="$workflow_file" scripts/symphony.sh list > "$tmp_dir/list.out"
assert_contains "$tmp_dir/list.out" $'STACK-002\tstate=todo\tpriority=3\tblocked=no'

manifest="$(
  scripts/symphony-review-packet.sh create \
    --issue STACK-077 \
    --workspace-root "$tmp_dir/workspaces" \
    --source-worktree "$repo_root" \
    --command "printf helper-ok" \
    --ui-url "http://127.0.0.1:9/smoke" \
    --fixture-visual
)"
assert_file "$manifest"
packet_dir="$(dirname "$manifest")"
assert_file "$packet_dir/artifacts/after.svg"
assert_file "$packet_dir/artifacts/walkthrough.html"
assert_contains "$manifest" 'artifacts/after.svg'
assert_contains "$packet_dir/logs/command-1.log" 'helper-ok'

cat > "$tmp_dir/checks.json" <<'JSON'
{
  "checks": [
    {"name": "unit", "conclusion": "failure", "log": "unit failure log"},
    {"name": "lint", "conclusion": "success", "log": "lint passed"}
  ]
}
JSON
scripts/symphony-pr-shepherd.sh failed-logs --fixture "$tmp_dir/checks.json" > "$tmp_dir/failed-logs.out"
assert_contains "$tmp_dir/failed-logs.out" '## unit'
assert_contains "$tmp_dir/failed-logs.out" 'unit failure log'
if grep -Fq 'lint passed' "$tmp_dir/failed-logs.out"; then
  fail "successful check log leaked into failed-log output"
fi

fake_gh="$tmp_dir/fake-gh"
cat > "$fake_gh" <<'GH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${FAKE_GH_LOG:?}"
GH
chmod +x "$fake_gh"
export FAKE_GH_LOG="$tmp_dir/gh.log"

if SYMPHONY_GH_BIN="$fake_gh" scripts/symphony-pr-shepherd.sh merge --pr 12 > "$tmp_dir/merge.out" 2> "$tmp_dir/merge.err"; then
  fail "merge succeeded without explicit opt-in"
fi
assert_contains "$tmp_dir/merge.err" 'merge refused'

SYMPHONY_GH_BIN="$fake_gh" SYMPHONY_ALLOW_PR_MERGE=1 \
  scripts/symphony-pr-shepherd.sh merge --pr 12 --method squash --auto
assert_contains "$FAKE_GH_LOG" 'pr merge 12 --squash --auto'

printf 'symphony completion helper smoke passed\n'
