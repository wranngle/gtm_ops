#!/usr/bin/env bash
# lint-file-size.sh — enforce a per-file line cap under packages/*/src/. STACK-042.
#
# Custom-lint rule: file-size caps are a
# cheap legibility multiplier: large modules force the agent to summarize
# what it's reading instead of holding the whole thing in working memory.
# A hard cap also discourages the "one-giant-service-file" anti-pattern.
#
# Bands:
#   - Hard cap (lint failure):  400 lines.
#   - Warning band (advisory): 250 lines — printed but does not fail the lint.
#
# Exempt (allowed to grow with table-driven cases):
#   - packages/*/tests/**       (test files; growing test surface is good)
#   - packages/*/fixtures/**    (golden data fixtures)
#   - packages/*/src/**/fixtures/**  (in-source fixtures, if any)
#
# Each hard violation tells the agent the file path, the current line count,
# the cap, and a remediation hint (extract the largest top-level construct
# into its own module).

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

readonly HARD_CAP=400
readonly WARN_BAND=250

violations=0
warnings=0

# ---------------------------------------------------------------------------
# Flat-layout enforcement — gtm_ops has no packages/ tree (yet). lib/, src/,
# and functions/ get a hard cap of 800 lines with a warn band at 600. Files
# that already exceeded the cap when this section landed are grandfathered at
# their then-current size (rounded up slightly): a RATCHET, not a licence —
# each cap may only shrink as the file is split, never grow. Entries here are
# visible debt; delete a row once its file drops under FLAT_HARD_CAP.
# ---------------------------------------------------------------------------
readonly FLAT_HARD_CAP=800
readonly FLAT_WARN_BAND=600

declare -A FLAT_GRANDFATHER=(
  [lib/pipeline.ts]=3100
  [src/transforms/index.ts]=2600
  [lib/estimate.ts]=1600
  [lib/pricing-calculator.ts]=1250
  [src/services/llm.ts]=1200
  [lib/build-technical-approach.ts]=1200
  [lib/integration-research.ts]=1000
  [lib/evaluation/comparator.ts]=950
  [lib/gdpr.ts]=950
  [lib/evaluation/cli.ts]=950
  [lib/branding.ts]=950
  [lib/rbac.ts]=900
  [lib/proactive-research.ts]=900
)

while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  case "$file" in
    */node_modules/*|*/tests/*|*/fixtures/*|*/dist/*|*/schemas/*)
      # schemas grow with table-driven shape definitions; tests/fixtures are
      # exempt for the same growing-surface reason as the packages/ scan.
      continue
      ;;
  esac

  lines=$(awk 'END { print NR }' "$file")

  cap=$FLAT_HARD_CAP
  if [[ -v "FLAT_GRANDFATHER[$file]" ]]; then
    cap=${FLAT_GRANDFATHER[$file]}
  fi

  if (( lines > cap )); then
    printf 'lint:file-size: %s\n' "$file" >&2
    printf '  file has %d lines, cap is %d%s\n' "$lines" "$cap" \
      "$([[ -v "FLAT_GRANDFATHER[$file]" ]] && printf ' (grandfathered ratchet — this file may only shrink)')" >&2
    printf '  fix: extract the largest top-level construct (the longest exported function, class, or const) into its own sibling module. See docs/references/layered-domain-architecture.md (section: File size).\n' >&2
    violations=$((violations + 1))
  elif (( lines > FLAT_WARN_BAND )) && [[ ! -v "FLAT_GRANDFATHER[$file]" ]]; then
    printf 'lint:file-size:warn: %s — %d lines (warn band: %d, hard cap: %d)\n' \
      "$file" "$lines" "$FLAT_WARN_BAND" "$FLAT_HARD_CAP" >&2
    warnings=$((warnings + 1))
  fi
done < <(find lib src functions -type f \( -name '*.ts' -o -name '*.tsx' \) \
                       -not -path '*/node_modules/*' \
                       2>/dev/null)

# packages/*/src/ keeps the stricter original bands once domains are extracted.
if [[ -d packages ]]; then
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    case "$file" in
      */node_modules/*|*/tests/*|*/fixtures/*|*/dist/*|*/.next/*)
        continue
        ;;
    esac

    # Use awk for line count so trailing-newline-less files report consistently
    # across GNU and BSD `wc`. NR equals the highest line number seen.
    lines=$(awk 'END { print NR }' "$file")

    if (( lines > HARD_CAP )); then
      printf 'lint:file-size: %s\n' "$file" >&2
      printf '  file has %d lines, hard cap is %d\n' "$lines" "$HARD_CAP" >&2
      printf '  fix: extract the largest top-level construct (the longest exported function, class, or const) into its own sibling module under the same layer. See docs/references/layered-domain-architecture.md (section: File size).\n' >&2
      violations=$((violations + 1))
    elif (( lines > WARN_BAND )); then
      printf 'lint:file-size:warn: %s — %d lines (warn band: %d, hard cap: %d)\n' \
        "$file" "$lines" "$WARN_BAND" "$HARD_CAP" >&2
      warnings=$((warnings + 1))
    fi
  done < <(find packages -type f \( -name '*.ts' -o -name '*.tsx' \) -path '*/src/*' \
                         -not -path '*/node_modules/*' \
                         2>/dev/null)
fi

if (( violations > 0 )); then
  printf '\n%s file-size violation(s) found (warnings: %d)\n' "$violations" "$warnings" >&2
  exit 1
fi

if (( warnings > 0 )); then
  printf 'file-size lint passed (%d warning(s) — review files approaching the hard cap)\n' "$warnings"
else
  printf 'file-size lint passed\n'
fi
