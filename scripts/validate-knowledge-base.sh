#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

required_files=(
  "AGENTS.md"
  "ARCHITECTURE.md"
  "README.md"
  "docs/index.md"
  "docs/design-docs/index.md"
  "docs/design-docs/core-beliefs.md"
  "docs/design-docs/agent-legibility.md"
  "docs/exec-plans/tech-debt-tracker.md"
  "docs/exec-plans/active/001-build-flagship-monorepo.md"
  "docs/exec-plans/completed/2026-04-30-harness-hydration.md"
  "docs/generated/README.md"
  "docs/product-specs/index.md"
  "docs/product-specs/flagship-gtm-engine.md"
  "docs/references/harness-engineering.md"
  "docs/DESIGN.md"
  "docs/FRONTEND.md"
  "docs/PLANS.md"
  "docs/PRODUCT_SENSE.md"
  "docs/QUALITY_SCORE.md"
  "docs/RELIABILITY.md"
  "docs/SECURITY.md"
)

missing=0
for path in "${required_files[@]}"; do
  if [[ ! -f "$path" ]]; then
    printf 'missing required knowledge file: %s\n' "$path" >&2
    missing=1
  fi
done

if (( missing )); then
  exit 1
fi

agent_lines="$(wc -l < AGENTS.md | tr -d ' ')"
if (( agent_lines > 120 )); then
  printf 'AGENTS.md is %s lines; keep it at or below 120 lines and move detail into docs/\n' "$agent_lines" >&2
  exit 1
fi

required_agent_links=(
  "ARCHITECTURE.md"
  "docs/PLANS.md"
  "docs/QUALITY_SCORE.md"
  "docs/RELIABILITY.md"
  "docs/SECURITY.md"
  "docs/exec-plans/active"
)

for needle in "${required_agent_links[@]}"; do
  if ! grep -Fq "$needle" AGENTS.md; then
    printf 'AGENTS.md must point to %s\n' "$needle" >&2
    exit 1
  fi
done

printf 'knowledge base validation passed (%s required files, AGENTS.md %s lines)\n' "${#required_files[@]}" "$agent_lines"

