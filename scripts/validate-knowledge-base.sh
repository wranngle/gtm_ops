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
  "docs/references/edge-devtools-mcp.md"
  "tools/observability/docker-compose.yml"
  "tools/observability/vector.yaml"
  "tools/observability/README.md"
  "scripts/lint-layered-architecture.sh"
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

printf 'knowledge base validation passed (%s required files, AGENTS.md %s lines)\n' "${#required_files[@]}" "$agent_lines"
