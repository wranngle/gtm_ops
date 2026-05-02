---
tracker:
  kind: local_markdown
  # Paths in this file resolve against the directory containing this
  # WORKFLOW.md (`examples/csv-validator/`), per spec § 6.1. So
  # `queue` here means `examples/csv-validator/queue/`.
  issues_root: queue
  active_states:
    - todo
  terminal_states:
    - done
    - cancelled
  handoff_state: human_review

polling:
  interval_ms: 5000

workspace:
  root: workspaces

agent:
  # cwd at run time is the per-issue workspace (per spec § 9.5
  # invariant 1), so we resolve back to the repo root via git to find
  # the validator script. Operators running this workflow outside a
  # git worktree should replace `$(git rev-parse --show-toplevel)`
  # with an absolute path.
  command: bash $(git rev-parse --show-toplevel)/examples/csv-validator/validate.sh {{issue.identifier}}
  max_concurrent_agents: 2
  require_explicit_run: false
  # Force the LocalShell adapter; the default heuristic picks
  # CodexAppServer (which expects JSON-RPC) when `codex.command`
  # doesn't contain `scripts/bin/llm.sh`. This workload is a plain
  # shell command, no Codex protocol involved.
  runner_kind: local_shell

codex:
  command: "true"
---
Validate CSV {{issue.identifier}}. The validator script reads the CSV
referenced by the issue, checks the schema (3 columns: name,email,age;
email contains '@'; age is integer), and exits 0 on success or 1 with
diagnostic stderr on failure.

This prompt is consumed by the orchestrator's prompt renderer but the
worker (a bash script) does not actually read it — it's here to satisfy
the spec § 5 workflow file shape. The agent.command above is what
actually runs.
