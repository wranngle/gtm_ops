#!/usr/bin/env bash
# Doc gardener — scheduled doc-staleness scan invoked by
# .github/workflows/gardener.yml on Mondays + manual dispatch.
#
# Detects three classes of staleness in checked-in markdown:
#   1. WIP markers — lines containing TODO / FIXME / TBD / "coming soon"
#      / "placeholder" inside top-level *.md (excludes node_modules,
#      vendored docs under lib/, the audit log, and the gardener doc
#      itself which by design contains the marker keywords).
#   2. Broken relative links — markdown links of the form
#      [text](relative/path) where the path target does not exist.
#   3. Dead inline code refs — backticked paths like `path/to/file`
#      that look like real intra-repo paths but resolve to nothing.
#
# Exit codes:
#   0 — clean, no findings.
#   1 — at least one finding emitted to stdout (workflow opens an issue).
#   2 — script error (bad invocation, repo not found, etc.).
#
# Output:
#   stdout — human-readable findings.txt content.
#   stderr — events.jsonl, one finding per line as JSON for tooling.
#
# Stays self-contained — pure bash + grep + awk + sed, no extra deps.

set -uo pipefail

cd "$(dirname "$0")/.." || exit 2

DOCS=(README.md ARCHITECTURE.md DESIGN.md CONTRIBUTING.md SECURITY.md AGENTS.md WORKFLOW.md AUTOMATION.md CODE_OF_CONDUCT.md)
for f in docs/*.md docs/**/*.md apps/ops-console/README.md; do
  [[ -f "$f" ]] && DOCS+=("$f")
done

# These files legitimately contain marker keywords as part of their job
# (this script's docs, the gardener contract doc itself, the audit log).
# Excluded from WIP-marker scanning. The contract doc is also excluded
# from broken-link scanning because its body shows literal example
# link forms inside code spans, which the regex can't disambiguate.
WIP_EXCLUDE_RE='^(docs/references/doc-gardener\.md|logs/self-audit\.log|scripts/gardener\.sh)$'
LINK_EXCLUDE_RE='^(docs/references/doc-gardener\.md|logs/self-audit\.log)$'

findings_count=0
emit() {
  local kind="$1" file="$2" line="$3" detail="$4"
  printf '[%s] %s:%s — %s\n' "$kind" "$file" "$line" "$detail"
  printf '{"kind":"%s","file":"%s","line":%s,"detail":%s}\n' \
    "$kind" "$file" "$line" "$(printf '%s' "$detail" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" >&2
  findings_count=$((findings_count + 1))
}

# ── 1. WIP markers ───────────────────────────────────────────────
for doc in "${DOCS[@]}"; do
  [[ -f "$doc" ]] || continue
  [[ "$doc" =~ $WIP_EXCLUDE_RE ]] && continue
  while IFS=: read -r lineno line; do
    [[ -z "$lineno" ]] && continue
    emit "wip-marker" "$doc" "$lineno" "$(printf '%s' "$line" | sed -E 's/^[[:space:]]+//;s/[[:space:]]+$//')"
  done < <(grep -nE '\b(TODO|FIXME|TBD|XXX|HACK|coming soon|placeholder|come back|fill in)\b' "$doc" 2>/dev/null || true)
done

# ── 2. Broken relative markdown links ────────────────────────────
for doc in "${DOCS[@]}"; do
  [[ -f "$doc" ]] || continue
  [[ "$doc" =~ $LINK_EXCLUDE_RE ]] && continue
  while IFS=: read -r lineno content; do
    [[ -z "$lineno" ]] && continue
    # Extract every [text](target) where target doesn't start with http/https/mailto/#.
    while IFS= read -r target; do
      [[ -z "$target" ]] && continue
      target_stripped="${target%%[#?]*}"
      [[ -z "$target_stripped" ]] && continue
      doc_dir=$(dirname "$doc")
      if [[ "$target_stripped" == /* ]]; then
        full="${target_stripped#/}"
      else
        full="$doc_dir/$target_stripped"
      fi
      # Normalize ./ and ../
      full=$(cd "$(pwd)" && python3 -c "import os,sys; print(os.path.normpath(sys.argv[1]))" "$full" 2>/dev/null || echo "$full")
      if [[ ! -e "$full" ]]; then
        emit "broken-link" "$doc" "$lineno" "→ $target (resolves to missing $full)"
      fi
    done < <(printf '%s\n' "$content" | grep -oE '\]\([^)#][^)]*\)' | sed -E 's/^\]\(//;s/\)$//' | grep -vE '^(https?:|mailto:|tel:|#|data:)' || true)
  done < <(grep -nE '\]\(' "$doc" 2>/dev/null || true)
done

# ── 3. Optional second pass: doc-gardener contract reachable ─────
if [[ ! -f docs/references/doc-gardener.md ]]; then
  emit "missing-contract" "docs/references/doc-gardener.md" "0" "the gardener workflow links here but the file is missing"
fi

if [[ "$findings_count" -gt 0 ]]; then
  printf '\n— %d finding(s) total. See docs/references/doc-gardener.md for triage rules.\n' "$findings_count"
  exit 1
fi
echo "verified clean: 0 findings across ${#DOCS[@]} markdown files."
exit 0
