#!/usr/bin/env bash
# gardener.sh — scan repo-local docs for staleness markers.
#
# This is the script a recurring "doc-gardening" agent should invoke (per the
# Harness Engineering post). It does not modify files; it reports.
#
# Exit codes:
#   0  no staleness found
#   1  staleness found (an agent should follow up with a fix-up PR)
#   2  invocation error
#
# Stdout is human-readable. Stderr is ECS-jsonl events for orchestration.

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

run_id=${DOTFILES_BOOTSTRAP_RUN_ID:-$(uuidgen 2>/dev/null || printf '%s-%s' "$(date +%s%N)" "$RANDOM")}
service_name=doc-gardener
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

scan_targets=(
  "AGENTS.md"
  "ARCHITECTURE.md"
  "WORKFLOW.md"
  "README.md"
  "docs"
  "packages"
  "apps"
)

# Marker patterns: (regex, human label, severity)
declare -a markers=(
  'TODO\|TKTK\|FIXME\|XXX|todo-marker|info'
  'placeholder|placeholder-prose|info'
  'coming soon|coming-soon|info'
  'TBD|tbd|info'
)

emit_event info gardener.start success "scanning ${#scan_targets[@]} targets"

excluded_dirs=(
  --exclude-dir=node_modules
  --exclude-dir=.git
  --exclude-dir=.claude
  --exclude-dir=dist
  --exclude-dir=build
  --exclude-dir=__pycache__
  --exclude-dir=.venv
  --exclude-dir=.symphony
)

findings=0
for marker_spec in "${markers[@]}"; do
  IFS='|' read -r pattern label severity <<<"$marker_spec"
  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    findings=$((findings + 1))
    printf '[%s] %s: %s\n' "$severity" "$label" "$hit"
  done < <(grep -RIn "${excluded_dirs[@]}" -E "$pattern" "${scan_targets[@]}" 2>/dev/null \
    | grep -v 'docs/exec-plans/active/' \
    | grep -v 'scripts/gardener.sh' \
    | grep -v 'docs/references/doc-gardener.md' \
    || true)
done

# Broken intra-repo doc links: ](relative/path) where the target file does not exist.
while IFS= read -r broken; do
  [[ -z "$broken" ]] && continue
  findings=$((findings + 1))
  printf '[warn] broken-link: %s\n' "$broken"
done < <(
  grep -RInE "${excluded_dirs[@]}" '\]\(([^)]+\.md)\)' \
    docs/ AGENTS.md ARCHITECTURE.md README.md WORKFLOW.md 2>/dev/null \
    | grep -v 'docs/references/doc-gardener.md' \
    | while IFS=: read -r file line content; do
        target=$(printf '%s' "$content" | sed -nE 's/.*\]\(([^)]+\.md)\).*/\1/p' | head -n 1)
        [[ -z "$target" ]] && continue
        case "$target" in
          http://*|https://*) continue ;;
        esac
        target_path=$(realpath -m "$(dirname "$file")/$target")
        if [[ ! -f "$target_path" ]]; then
          printf '%s:%s -> %s\n' "$file" "$line" "$target"
        fi
      done
)

if (( findings > 0 )); then
  emit_event warn gardener.findings failure "count=$findings"
  printf '\n%s staleness finding(s); a gardener agent should open a fix-up PR\n' "$findings"
  exit 1
fi

emit_event info gardener.clean success ""
printf 'gardener: clean\n'
exit 0
