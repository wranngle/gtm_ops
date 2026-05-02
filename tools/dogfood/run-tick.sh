#!/usr/bin/env bash
# run-tick.sh — single tick of the self-feeding stack-improvement loop.
#
# Each invocation:
#   1. Verifies the tree is clean (otherwise STOP and report).
#   2. Picks the highest-priority unblocked Symphony issue whose mtime is
#      older than DOGFOOD_MIN_AGE_SECONDS (default 300s) — the age guard
#      avoids racing with parallel auditors that just filed STACK-NNN
#      issues.
#   3. Dispatches the issue via `scripts/symphony.sh once --limit 1` with
#      SYMPHONY_ALLOW_AGENT_RUN=1 and a tight LLM chain.
#   4. Runs the full validator suite against the resulting tree.
#   5. If green: commits + pushes, moves the issue to .symphony/issues/done/.
#      If red: moves the issue to .symphony/issues/human_review/ with the
#      failure log saved next to it.
#   6. Scans the agent-output for "follow-up TODOs" it identified and
#      creates STACK-NNN.md files for each (so the loop stays self-feeding).
#   7. Emits one ECS-jsonl event per tick on stderr (and to .symphony/logs/).
#
# Env knobs:
#   DOGFOOD_LLM_CHAIN          default: claude:claude-haiku-4-5,claude:claude-sonnet-4-6
#   DOGFOOD_LLM_TIMEOUT        default: 180
#   DOGFOOD_MIN_AGE_SECONDS    default: 300 (5 min — race guard)
#   DOGFOOD_DRY_RUN            if "1", do everything except real LLM dispatch
#   DOGFOOD_FOLLOWUP_PREFIX    default: STACK
#   SYMPHONY_WORKFLOW_FILE     defaults to repo's WORKFLOW.md
#
# Exit codes:
#   0  tick completed (issue moved, commit pushed, OR backlog empty)
#   1  tick blocked on a dirty tree (operator action required)
#   2  validators failed after the agent landed work (issue moved to human_review/)
#   3  no eligible issue this tick (all blocked, or all newer than the age guard)

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

dogfood_log_path=".symphony/logs/dogfood.jsonl"
mkdir -p "$(dirname "$dogfood_log_path")"

run_id=${DOTFILES_BOOTSTRAP_RUN_ID:-$(uuidgen 2>/dev/null || printf '%s-%s' "$(date +%s%N)" "$RANDOM")}
sequence=0

emit_event() {
  local level=$1 action=$2 outcome=$3 detail=${4:-} ts json
  sequence=$((sequence + 1))
  ts=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  json=$(jq -nc \
    --arg ts "$ts" --arg l "$level" --arg a "$action" --arg o "$outcome" \
    --arg svc "wranngle-dogfood" --arg detail "$detail" --arg trace "$run_id" \
    --arg eid "${run_id}-${sequence}" \
    '{"@timestamp":$ts,"log.level":$l,"event.action":$a,"event.outcome":$o,"event.id":$eid,"trace.id":$trace,"service.name":$svc,"message":$detail}')
  printf '%s\n' "$json" >&2
  printf '%s\n' "$json" >> "$dogfood_log_path"
}

# ============== Step 1: tree must be clean ==============

dirty=$(git status --short 2>/dev/null)
if [[ -n "$dirty" ]]; then
  emit_event warn dogfood.tree_dirty failure "$(printf '%s' "$dirty" | head -c 400)"
  printf 'tree dirty — refusing to dispatch. paths:\n%s\n' "$dirty" >&2
  exit 1
fi

# ============== Step 2: pick the next eligible issue ==============

# Source LLM API keys from agents env if present.
if [[ -f "$HOME/.agents/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HOME/.agents/.env"
  set +a
fi

min_age_seconds=${DOGFOOD_MIN_AGE_SECONDS:-300}
followup_prefix=${DOGFOOD_FOLLOWUP_PREFIX:-STACK}

# Candidate selection: the bash adapter sorts by priority asc; we additionally
# require mtime older than the age guard so we don't pick up an issue another
# auditor just filed.
now_epoch=$(date +%s)
selected_ref=""
selected_priority=""

while IFS= read -r ref; do
  [[ -z "$ref" ]] && continue
  mtime=$(stat -c %Y "$ref" 2>/dev/null || echo 0)
  age=$((now_epoch - mtime))
  if (( age < min_age_seconds )); then
    continue
  fi
  selected_ref="$ref"
  break
done < <(scripts/symphony.sh list 2>/dev/null \
  | awk -F'\t' '/state=todo/ && /blocked=no/ {print}' \
  | awk -F'\t' '{
      priority = "999";
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^priority=/) { gsub(/priority=/, "", $i); priority = $i; }
      }
      printf "%09d %s\n", priority, $1;
    }' \
  | sort -n \
  | awk '{ printf ".symphony/issues/todo/%s.md\n", $2 }')

if [[ -z "$selected_ref" ]]; then
  emit_event info dogfood.no_eligible success "no unblocked issue past the ${min_age_seconds}s age guard"
  printf 'no eligible issue (backlog may be empty or all too fresh)\n'
  exit 3
fi

selected_id=$(basename "$selected_ref" .md)
emit_event info dogfood.selected success "id=${selected_id} ref=${selected_ref}" "$selected_id"

# ============== Step 3: dispatch via Symphony ==============

if [[ "${DOGFOOD_DRY_RUN:-0}" == "1" ]]; then
  emit_event info dogfood.dry_run success "DOGFOOD_DRY_RUN=1; skipping real dispatch" "$selected_id"
  scripts/symphony.sh once --dry-run --limit 1 >/dev/null 2>&1 || true
  exit 0
fi

llm_chain=${DOGFOOD_LLM_CHAIN:-claude:claude-sonnet-4-6,claude:claude-opus-4-7,claude:claude-haiku-4-5}
llm_timeout=${DOGFOOD_LLM_TIMEOUT:-300}
min_diff_lines=${DOGFOOD_MIN_DIFF_LINES:-5}

emit_event info dogfood.dispatch_start success "chain=${llm_chain} timeout=${llm_timeout}" "$selected_id"

if ! SYMPHONY_ALLOW_AGENT_RUN=1 \
     LLM_CHAIN="$llm_chain" \
     LLM_TIMEOUT="$llm_timeout" \
     scripts/symphony.sh once --limit 1; then
  emit_event warn dogfood.dispatch_failed failure "symphony.sh once exited non-zero" "$selected_id"
  workspace_key=$(printf '%s' "$selected_id" | sed -E 's/[^A-Za-z0-9._-]+/_/g; s/^_+//; s/_+$//')
  failure_dir=".symphony/issues/human_review"
  mkdir -p "$failure_dir"
  mv "$selected_ref" "$failure_dir/"
  printf '\n## Dogfood failure (%s)\n\nSymphony dispatch exited non-zero. See workspace: .symphony/workspaces/%s/\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$workspace_key" \
    >> "$failure_dir/$(basename "$selected_ref")"
  exit 2
fi

# ============== Step 3.5: meaningful-diff guard ==============
#
# Tick 1 of the previous run closed STACK-010 with a 26-line "implementation
# plan" agent-output and zero source changes. Validators passed against an
# unchanged tree, the runner pushed an empty rename, and the issue was
# marked done without the actual JSON-RPC adapter being built.
#
# Two complementary guards now:
#   (a) Sentinel-phrase scan over the agent-output. If the response reads
#       like a planning document instead of executed work, route to
#       human_review/ regardless of what the validators say.
#   (b) Real-diff insertions+deletions threshold against HEAD. Excludes
#       .symphony/ noise (the issue rename, workspace artifacts, log files)
#       so it measures actual source/doc changes.

workspace_key=$(printf '%s' "$selected_id" | sed -E 's/[^A-Za-z0-9._-]+/_/g; s/^_+//; s/_+$//')
latest_output=$(ls -1t ".symphony/workspaces/$workspace_key/agent-output-"*.md 2>/dev/null | head -n 1)

planning_sentinels=(
  'I.?ve completed the planning phase'
  'Implementation Plan Summary'
  'What needs to be built'
  'I would implement'
  'Here.?s the implementation plan'
  'I would create'
  '^# Implementation Plan'
  '^## Plan$'
)

if [[ -n "$latest_output" && -f "$latest_output" ]]; then
  for sentinel in "${planning_sentinels[@]}"; do
    if grep -qiE "$sentinel" "$latest_output" 2>/dev/null; then
      emit_event warn dogfood.planning_doc_rejected failure "matched=${sentinel}" "$selected_id"
      mkdir -p .symphony/issues/human_review
      mv "$selected_ref" .symphony/issues/human_review/
      printf '\n## Dogfood failure (%s)\n\nAgent produced a planning document instead of executing the work (sentinel matched: `%s`). See: %s\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$sentinel" "$latest_output" \
        >> ".symphony/issues/human_review/$(basename "$selected_ref")"
      exit 2
    fi
  done
fi

# Excludes .symphony/ — that's the issue rename + workspace artifacts the
# runner itself produces, not work the agent did.
diff_lines=$(git diff HEAD --numstat -- . ':(exclude).symphony/**' 2>/dev/null \
  | awk '{ adds += $1; dels += $2 } END { print (adds + 0) + (dels + 0) }')

if (( diff_lines < min_diff_lines )); then
  emit_event warn dogfood.empty_diff failure "diff_lines=${diff_lines} threshold=${min_diff_lines}" "$selected_id"
  mkdir -p .symphony/issues/human_review
  mv "$selected_ref" .symphony/issues/human_review/
  printf '\n## Dogfood failure (%s)\n\nAgent ran but produced only %s lines of meaningful diff outside `.symphony/` (threshold: %s). The agent likely returned a text response without using its file-edit tools. See: %s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$diff_lines" "$min_diff_lines" \
    "${latest_output:-no-agent-output-found}" \
    >> ".symphony/issues/human_review/$(basename "$selected_ref")"
  exit 2
fi

emit_event info dogfood.diff_check_ok success "diff_lines=${diff_lines}" "$selected_id"

# ============== Step 4: run validators ==============

emit_event info dogfood.validate_start success "" "$selected_id"

validator_log=$(mktemp)
trap 'rm -f "$validator_log"' EXIT

run_validator() {
  local name=$1
  shift
  printf '\n=== %s ===\n' "$name" >> "$validator_log"
  if "$@" >> "$validator_log" 2>&1; then
    return 0
  else
    return 1
  fi
}

validators_passed=true

run_validator 'bash -n' bash -n scripts/*.sh scripts/bin/*.sh tools/edge-mcp/*.sh tools/edge-mcp/windows/*.sh 2>/dev/null \
  || validators_passed=false
run_validator 'validate-knowledge-base' scripts/validate-knowledge-base.sh \
  || validators_passed=false
run_validator 'lint-layered-architecture' scripts/lint-layered-architecture.sh \
  || validators_passed=false
run_validator 'symphony validate' scripts/symphony.sh validate \
  || validators_passed=false
run_validator 'symphony dry-run' scripts/symphony.sh once --dry-run --limit 1 \
  || validators_passed=false

# Per-language tests if relevant trees changed.
changed=$(git diff --name-only HEAD)
if printf '%s' "$changed" | grep -q '^packages/agent-evals/'; then
  if command -v bun >/dev/null 2>&1; then
    run_validator 'bun test' bash -c 'cd packages/agent-evals && bun test' \
      || validators_passed=false
  fi
fi
if printf '%s' "$changed" | grep -q '^apps/ops-console/'; then
  if command -v python3 >/dev/null 2>&1; then
    run_validator 'pytest' python3 -m pytest apps/ops-console/tests/ -q \
      || validators_passed=false
  fi
fi
if printf '%s' "$changed" | grep -q '^tools/symphony-elixir/'; then
  if [[ -x "$HOME/.local/bin/mise" ]]; then
    run_validator 'mix test' bash -c 'eval "$(~/.local/bin/mise env -s bash)" && cd tools/symphony-elixir && mix test' \
      || validators_passed=false
  fi
fi

if ! $validators_passed; then
  emit_event error dogfood.validators_failed failure "$(tail -c 400 "$validator_log")" "$selected_id"
  failure_dir=".symphony/issues/human_review"
  mkdir -p "$failure_dir"
  mv "$selected_ref" "$failure_dir/"
  cp "$validator_log" "$failure_dir/$(basename "$selected_ref" .md).validator-failure.log"
  printf '\n## Dogfood failure (%s)\n\nValidators failed after agent landed work. See validator log next to this issue.\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >> "$failure_dir/$(basename "$selected_ref")"
  exit 2
fi

emit_event info dogfood.validators_ok success "" "$selected_id"

# ============== Step 5: move issue to done + commit + push ==============

mkdir -p .symphony/issues/done
mv "$selected_ref" .symphony/issues/done/
emit_event info dogfood.issue_done success "" "$selected_id"

# Stage + commit. Include the moved issue file plus any work the agent landed.
git add -A
commit_message="dogfood: ${selected_id} closed by agent

$(git diff --cached --stat | tail -n 5)

Auto-committed by tools/dogfood/run-tick.sh after validators passed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

if git diff --cached --quiet; then
  emit_event warn dogfood.empty_commit failure "no changes after dispatch" "$selected_id"
else
  if git commit -m "$commit_message" 2>/dev/null; then
    if git push origin main 2>/dev/null; then
      sha=$(git log -1 --pretty=%H)
      emit_event info dogfood.pushed success "sha=${sha:0:8}" "$selected_id"
    else
      emit_event warn dogfood.push_failed failure "git push exited non-zero" "$selected_id"
      exit 2
    fi
  else
    emit_event warn dogfood.commit_failed failure "git commit exited non-zero" "$selected_id"
    exit 2
  fi
fi

# ============== Step 6: extract follow-ups from agent-output ==============

workspace_key=$(printf '%s' "$selected_id" | sed -E 's/[^A-Za-z0-9._-]+/_/g; s/^_+//; s/_+$//')
latest_output=$(ls -1t ".symphony/workspaces/$workspace_key/agent-output-"*.md 2>/dev/null | head -n 1)

if [[ -n "$latest_output" && -f "$latest_output" ]]; then
  followup_count=0
  while IFS= read -r followup; do
    followup_count=$((followup_count + 1))
    next_n=$(ls .symphony/issues/todo/ .symphony/issues/done/ .symphony/issues/human_review/ 2>/dev/null \
      | grep -E "^${followup_prefix}-[0-9]+\.md$" \
      | sed -E "s/${followup_prefix}-([0-9]+)\.md/\1/" \
      | sort -n \
      | tail -n 1)
    next_n=$((${next_n:-0} + 1))
    next_id=$(printf '%s-%03d' "$followup_prefix" "$next_n")
    new_path=".symphony/issues/todo/${next_id}.md"
    cat > "$new_path" <<EOF
---
id: ${next_id}
priority: 3
labels: dogfood,followup
---
# Follow-up from ${selected_id}

Surfaced by the agent's output during the dogfood run. Original task:
${selected_id} (now in done/).

## Task

${followup}
EOF
    emit_event info dogfood.followup_filed success "id=${next_id}" "$selected_id"
  done < <(grep -E '^[[:space:]]*[-*][[:space:]]+TODO\(followup\):' "$latest_output" 2>/dev/null \
    | sed -E 's/^[[:space:]]*[-*][[:space:]]+TODO\(followup\):[[:space:]]*//')

  if (( followup_count > 0 )); then
    git add .symphony/issues/todo/${followup_prefix}-*.md
    if ! git diff --cached --quiet; then
      git commit -m "dogfood: ${followup_count} follow-up(s) filed by ${selected_id}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" 2>/dev/null \
        && git push origin main 2>/dev/null
    fi
  fi
fi

emit_event info dogfood.tick_done success "issue=${selected_id}" "$selected_id"
exit 0
