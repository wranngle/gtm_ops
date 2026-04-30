#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

required_files=(
  "AGENTS.md"
  ".agents/AGENTS.md"
  "ARCHITECTURE.md"
  "WORKFLOW.md"
  "README.md"
  "CODE_OF_CONDUCT.md"
  "CONTRIBUTING.md"
  "LICENSE"
  "SECURITY.md"
  ".github/PULL_REQUEST_TEMPLATE.md"
  ".github/dependabot.yml"
  ".github/ISSUE_TEMPLATE/bug_report.yml"
  ".github/ISSUE_TEMPLATE/feature_request.yml"
  ".github/ISSUE_TEMPLATE/config.yml"
  "demo/cassette.tape"
  "scripts/hero.sh"
  "scripts/bin/llm.sh"
  "scripts/symphony.sh"
  "docs/index.md"
  "docs/ORCHESTRATION.md"
  "docs/design-docs/index.md"
  "docs/design-docs/core-beliefs.md"
  "docs/design-docs/agent-legibility.md"
  "docs/design-docs/symphony-layer.md"
  "docs/exec-plans/tech-debt-tracker.md"
  "docs/exec-plans/active/001-build-flagship-monorepo.md"
  "docs/exec-plans/completed/2026-04-30-harness-hydration.md"
  "docs/exec-plans/completed/2026-04-30-symphony-hydration.md"
  "docs/generated/README.md"
  "docs/product-specs/index.md"
  "docs/product-specs/flagship-gtm-engine.md"
  "docs/references/dotfiles-hydration.md"
  "docs/references/harness-engineering.md"
  "docs/references/symphony-orchestration.md"
  "docs/DESIGN.md"
  "docs/FRONTEND.md"
  "docs/PLANS.md"
  "docs/PRODUCT_SENSE.md"
  "docs/QUALITY_SCORE.md"
  "docs/RELIABILITY.md"
  "docs/SECURITY.md"
  ".symphony/issues/todo/WGTE-001.md"
  ".symphony/issues/in_progress/.gitkeep"
  ".symphony/issues/human_review/.gitkeep"
  ".symphony/issues/done/.gitkeep"
  ".symphony/issues/cancelled/.gitkeep"
  ".symphony/logs/.gitkeep"
  ".symphony/workspaces/.gitkeep"
  ".symphony/runtime/.gitkeep"
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
  "WORKFLOW.md"
  "docs/ORCHESTRATION.md"
)

for needle in "${required_agent_links[@]}"; do
  if ! grep -Fq "$needle" AGENTS.md; then
    printf 'AGENTS.md must point to %s\n' "$needle" >&2
    exit 1
  fi
done

placeholder_scan_targets=(
  "SECURITY.md"
  "CODE_OF_CONDUCT.md"
  "CONTRIBUTING.md"
  "README.md"
  ".github/PULL_REQUEST_TEMPLATE.md"
  ".github/ISSUE_TEMPLATE/config.yml"
  "demo/cassette.tape"
  "WORKFLOW.md"
  "docs"
  .symphony/issues/todo/*.md
)

if grep -R -n -E 'REPO_URL_NOT_DETECTED|bot@gemini.com|Replace this with a real demo|Created `.github/PULL_REQUEST_TEMPLATE.md`' \
  "${placeholder_scan_targets[@]}" >/tmp/wranngle-gtm-engine-placeholder-scan.txt; then
  cat /tmp/wranngle-gtm-engine-placeholder-scan.txt >&2
  printf 'placeholder text from primitive hydration must be replaced before commit\n' >&2
  exit 1
fi

if ! grep -Fq 'agent_command: scripts/bin/llm.sh' WORKFLOW.md; then
  printf 'WORKFLOW.md must keep scripts/bin/llm.sh as the default codex-independent agent command\n' >&2
  exit 1
fi

if ! grep -Fq '.symphony/workspaces/*' .gitignore || ! grep -Fq '.symphony/logs/*.jsonl' .gitignore; then
  printf '.gitignore must keep Symphony workspaces and logs out of git\n' >&2
  exit 1
fi

printf 'knowledge base validation passed (%s required files, AGENTS.md %s lines)\n' "${#required_files[@]}" "$agent_lines"
