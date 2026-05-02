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

# Marker patterns: regex, human label, and severity are parallel arrays because
# regexes themselves use `|`; packing all three fields into one delimited string
# silently disabled the TODO/FIXME/XXX scan.
declare -a marker_patterns=(
  'TODO|TKTK|FIXME|XXX'
  'placeholder'
  'coming soon'
  'TBD'
)
declare -a marker_labels=(
  'todo-marker'
  'placeholder-prose'
  'coming-soon'
  'tbd'
)
declare -a marker_severities=(
  'info'
  'info'
  'info'
  'info'
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

# Files that are read-only, checked-in upstream source authority. They legitimately
# contain placeholder words and relative links pointing outside this repo. Skipping
# them keeps the gardener focused on docs THIS repo owns.
upstream_source_excludes=(
  -e 'docs/references/openai_'
  -e 'docs/references/.*\.png'
)

filter_upstream_sources() {
  if [[ ${#upstream_source_excludes[@]} -eq 0 ]]; then
    cat
  else
    grep -v "${upstream_source_excludes[@]}"
  fi
}

findings=0
for i in "${!marker_patterns[@]}"; do
  pattern=${marker_patterns[$i]}
  label=${marker_labels[$i]}
  severity=${marker_severities[$i]}
  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    findings=$((findings + 1))
    printf '[%s] %s: %s\n' "$severity" "$label" "$hit"
  done < <(grep -RIn "${excluded_dirs[@]}" -E "$pattern" "${scan_targets[@]}" 2>/dev/null \
    | grep -v 'docs/exec-plans/active/' \
    | grep -v 'docs/exec-plans/completed/' \
    | grep -v 'scripts/gardener.sh' \
    | grep -v 'docs/references/doc-gardener.md' \
    | filter_upstream_sources \
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
    | filter_upstream_sources \
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

# Backtick-quoted repo-relative paths: `docs/foo.md`, `scripts/foo.sh`,
# `packages/domain/src/layer/file.ts`, etc. Fenced code blocks are skipped.
looks_like_repo_path() {
  local ref=$1
  [[ "$ref" == */* ]] || return 1
  case "$ref" in
    /*|./*|../*|~/*|http://*|https://*|mailto:*|*://*) return 1 ;;
    *[\"\':,\;\(\)\{\}\[\]\<\>\|]*|*\**|*\?*) return 1 ;;
  esac
  case "$ref" in
    docs/*|packages/*|apps/*|scripts/*|tools/*|demo/*|.github/*|.symphony/*) ;;
    *) return 1 ;;
  esac
  case "$ref" in
    *.md|*.txt|*.png|*.yml|*.yaml|*.json|*.jsonl|*.sh|*.py|*.ts|*.tsx|*.js|*.mjs|*.ex|*.exs|*.toml|*.tape|*.cmd|*.ps1|*.html|*.css) return 0 ;;
    scripts/*|.github/*|demo/*) return 0 ;;
    packages/*|apps/*)
      [[ "$ref" != */*/* ]] && return 0
      ;;
    .symphony/issues/*)
      return 0
      ;;
  esac
  return 1
}

while IFS=$'\t' read -r file line target; do
  [[ -z "$target" ]] && continue
  if ! looks_like_repo_path "$target"; then
    continue
  fi
  target_path=${target%%#*}
  [[ -z "$target_path" ]] && continue
  if [[ ! -e "$target_path" ]]; then
    findings=$((findings + 1))
    printf '[warn] broken-code-path: %s:%s -> %s\n' "$file" "$line" "$target"
  fi
done < <(
  find AGENTS.md ARCHITECTURE.md WORKFLOW.md README.md docs packages apps \
    \( -path '*/node_modules/*' -o -path '*/.git/*' -o -path '*/.claude/*' -o -path '*/dist/*' -o -path '*/build/*' -o -path '*/__pycache__/*' -o -path '*/.venv/*' -o -path '*/.symphony/*' -o -path 'docs/references/openai_*.txt' -o -path 'docs/references/*.png' -o -path 'docs/exec-plans/completed/*' -o -path 'docs/references/doc-gardener.md' \) -prune \
    -o -type f \( -name '*.md' -o -name '*.txt' \) -print 2>/dev/null \
    | sort \
    | while IFS= read -r file; do
        awk -v file="$file" '
          BEGIN { in_fence = 0 }
          /^```/ { in_fence = !in_fence; next }
          in_fence { next }
          {
            text = $0
            while (match(text, /`[A-Za-z0-9_./-]+`/)) {
              span = substr(text, RSTART + 1, RLENGTH - 2)
              printf "%s\t%d\t%s\n", file, FNR, span
              text = substr(text, RSTART + RLENGTH)
            }
          }
        ' "$file"
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
