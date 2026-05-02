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
  "docs/references/layered-domain-architecture.md"
  "docs/references/doc-gardener.md"
  "docs/references/symphony-github-issues-adapter.md"
  "docs/references/local-observability.md"
  "docs/references/openai_harness_engineering_original_spec.txt"
  "docs/references/openai_symphony_original_spec.txt"
  "docs/references/openai_symphony_github.txt"
  "docs/references/openai_symphony_harness_engineering_stack_diagrams_explained.txt"
  "docs/references/OAI_Harness_engineering_Codex_drives_the_app_with_Chrome_DevTools_MCP_to_validate_its_work_desktop-dark.png"
  "docs/references/OAI_Harness_engineering_Giving_Codex_a_full_observability_stack_desktop-dark.png"
  "docs/references/OAI_Harness_engineering_Layered_domain_architecture_with_explicit_cross-cutting_boundries_desktop-dark.png"
  "docs/references/OAI_Harness_engineering_The_limits_of_agent_knowledge_desktop-dark.png"
  "docs/references/Coworking-Desktop-Dark-Symphony__1_.png"
  "docs/references/BeforeAndAfter-Desktop-Dark-Symphony.png"
  "docs/exec-plans/active/002-harness-machinery.md"
  "docs/exec-plans/active/003-stack-canonicalization.md"
  "docs/references/canonical-stack.md"
  "tools/symphony-elixir/mix.exs"
  "tools/symphony-elixir/lib/symphony.ex"
  "tools/symphony-elixir/lib/symphony/application.ex"
  "tools/symphony-elixir/lib/symphony/config.ex"
  "tools/symphony-elixir/lib/symphony/orchestrator.ex"
  "tools/symphony-elixir/lib/symphony/tracker.ex"
  "tools/symphony-elixir/lib/symphony/tracker/noop.ex"
  "tools/symphony-elixir/lib/symphony/agent_runner.ex"
  "tools/symphony-elixir/lib/symphony/agent_runner/local_shell.ex"
  "tools/symphony-elixir/lib/symphony/logging.ex"
  "tools/symphony-elixir/lib/symphony/logging/sink.ex"
  "tools/symphony-elixir/lib/symphony/prompt_renderer.ex"
  "tools/symphony-elixir/lib/symphony/retry_queue.ex"
  "tools/symphony-elixir/lib/symphony/workflow_loader.ex"
  "tools/symphony-elixir/lib/symphony/workspace_manager.ex"
  "tools/symphony-elixir/test/symphony/agent_runner/local_shell_test.exs"
  "tools/symphony-elixir/test/symphony/config_test.exs"
  "tools/symphony-elixir/test/symphony/logging_test.exs"
  "tools/symphony-elixir/test/symphony/orchestrator_test.exs"
  "tools/symphony-elixir/test/symphony/prompt_renderer_test.exs"
  "tools/symphony-elixir/test/symphony/retry_queue_test.exs"
  "tools/symphony-elixir/test/symphony/tracker/github_issues_test.exs"
  "tools/symphony-elixir/test/symphony/tracker/local_markdown_test.exs"
  "tools/symphony-elixir/test/symphony/workspace_manager_test.exs"
  "tools/symphony-elixir/config/test.exs"
  ".mise.toml"
  "tools/symphony-elixir/test/symphony/workflow_loader_test.exs"
  "tools/symphony-elixir/README.md"
  "tools/edge-mcp/edge-debug-launch.sh"
  "tools/edge-mcp/install-edge-shortcut.ps1"
  "tools/edge-mcp/install-mcp.sh"
  "tools/edge-mcp/launch-mcp.sh"
  "tools/edge-mcp/mcp.json"
  "tools/edge-mcp/README.md"
  "tools/edge-mcp/windows/edge-mcp-firewall.cmd"
  "tools/edge-mcp/windows/edge-mcp-portproxy.cmd"
  "tools/edge-mcp/windows/setup-elevated.sh"
  "tools/edge-mcp/smoke/smoke.mjs"
  "tools/symphony-elixir/scripts/boot_with_file_sink.exs"
  "docs/references/edge-devtools-mcp.md"
  "tools/observability/docker-compose.yml"
  "tools/observability/vector.yaml"
  "tools/observability/README.md"
  "scripts/lint-layered-architecture.sh"
  "scripts/lint-structured-logging.sh"
  "scripts/gardener.sh"
  ".github/workflows/gardener.yml"
  "packages/agent-evals/README.md"
  "packages/agent-evals/package.json"
  "packages/agent-evals/src/types/index.ts"
  "packages/agent-evals/src/config/index.ts"
  "packages/agent-evals/src/repo/index.ts"
  "packages/agent-evals/src/providers/index.ts"
  "packages/agent-evals/src/providers/metrics.ts"
  "packages/agent-evals/src/service/index.ts"
  "packages/agent-evals/src/runtime/cli.ts"
  "packages/agent-evals/src/ui/index.ts"
  "packages/agent-evals/tests/structure.test.ts"
  "packages/agent-evals/tests/lint-coverage.test.ts"
  "apps/ops-console/main.py"
  "apps/ops-console/domain.py"
  "apps/ops-console/pyproject.toml"
  "apps/ops-console/README.md"
  "apps/ops-console/fixtures/evaluation-results.json"
  "apps/ops-console/tests/test_domain.py"
  "docs/DESIGN.md"
  "docs/FRONTEND.md"
  "docs/PLANS.md"
  "docs/PRODUCT_SENSE.md"
  "docs/QUALITY_SCORE.md"
  "docs/RELIABILITY.md"
  "docs/SECURITY.md"
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

# WGTE-001 must exist somewhere under .symphony/issues/ but its specific
# state directory (todo/doing/done/human_review/cancelled) is fluid as
# the dogfood loop or operators move it through the lifecycle. Hardcoding
# the todo/ path made any non-todo state look like missing knowledge.
if ! find .symphony/issues -name 'WGTE-001.md' -type f -print -quit | grep -q .; then
  printf 'missing required knowledge file: .symphony/issues/**/WGTE-001.md (in any state)\n' >&2
  missing=1
fi

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
  "docs/references/layered-domain-architecture.md"
  "docs/references/doc-gardener.md"
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

if ! grep -Fq 'command: scripts/bin/llm.sh' WORKFLOW.md; then
  printf 'WORKFLOW.md must keep scripts/bin/llm.sh as the default codex-independent agent command (now under agent.command)\n' >&2
  exit 1
fi
if ! grep -Eq '^tracker:[[:space:]]*$' WORKFLOW.md; then
  printf 'WORKFLOW.md must use the Symphony spec nested schema (top-level tracker:, polling:, workspace:, hooks:, agent:, codex:)\n' >&2
  exit 1
fi

if ! grep -Fq '.symphony/workspaces/*' .gitignore || ! grep -Fq '.symphony/logs/*.jsonl' .gitignore; then
  printf '.gitignore must keep Symphony workspaces and logs out of git\n' >&2
  exit 1
fi

if ! scripts/lint-layered-architecture.sh; then
  printf 'layered-architecture lint failed; fix the import-direction violations above\n' >&2
  exit 1
fi

if ! scripts/lint-structured-logging.sh; then
  printf 'structured-logging lint failed; route log emission through the package logger provider\n' >&2
  exit 1
fi

# AGENTS.md link resolution: every Markdown link of the form ](path) where
# path does not look like a URL must resolve to an existing file or directory.
agents_link_failed=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  target="$line"
  case "$target" in
    http://*|https://*|mailto:*|''|'#'*) continue ;;
  esac
  # Strip optional anchor (e.g. file.md#section).
  target_path="${target%%#*}"
  [[ -z "$target_path" ]] && continue
  if [[ ! -e "$target_path" ]]; then
    printf 'AGENTS.md links to %s but it does not exist on disk\n' "$target" >&2
    agents_link_failed=1
  fi
done < <(grep -oE '\]\([^)]+\)' AGENTS.md | sed -E 's/\]\(([^)]+)\)/\1/')
if (( agents_link_failed )); then
  exit 1
fi

# docs/index.md coverage: every top-level docs/*.md (excluding index itself)
# must be mentioned by filename in docs/index.md so nothing goes orphaned.
index_missing=0
while IFS= read -r doc; do
  base="$(basename "$doc")"
  [[ "$base" == "index.md" ]] && continue
  if ! grep -Fq "$base" docs/index.md; then
    printf 'docs/index.md does not mention %s; add a link or remove the file\n' "$base" >&2
    index_missing=1
  fi
done < <(find docs -maxdepth 1 -type f -name '*.md')
if (( index_missing )); then
  exit 1
fi

# Design-doc metadata: every design doc must declare verification status and a
# last-reviewed date so an agent can spot rotted docs without reading them in
# full. (Per the Harness post: "verification status".)
design_meta_failed=0
while IFS= read -r doc; do
  base="$(basename "$doc")"
  [[ "$base" == "index.md" ]] && continue
  if ! grep -Eq '^Status:[[:space:]]+(Active|Draft|Deprecated|Completed)$' "$doc"; then
    printf '%s missing `Status: Active|Draft|Deprecated|Completed` line\n' "$doc" >&2
    design_meta_failed=1
  fi
  if ! grep -Eq '^Last reviewed:[[:space:]]+[0-9]{4}-[0-9]{2}-[0-9]{2}$' "$doc"; then
    printf '%s missing `Last reviewed: YYYY-MM-DD` line\n' "$doc" >&2
    design_meta_failed=1
  fi
done < <(find docs/design-docs -maxdepth 1 -type f -name '*.md')
if (( design_meta_failed )); then
  exit 1
fi

printf 'knowledge base validation passed (%s required files, AGENTS.md %s lines)\n' "${#required_files[@]}" "$agent_lines"
