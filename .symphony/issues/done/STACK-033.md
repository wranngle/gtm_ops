---
id: STACK-033
priority: 3
labels: stack,symphony-elixir,workspace,hooks,spec-section-9
blocked_by: STACK-011
---
# Execute workspace hooks (spec section 9.4)

Spec §9.4 defines four workspace lifecycle hooks. The Bash adapter
intentionally does not execute hooks (they would run with broad shell
permissions in a one-shot context); the daemon should run them with the
documented timeouts and failure semantics.

## Supported hooks

- `hooks.after_create` — runs only when a workspace directory is newly
  created. Failure or timeout aborts workspace creation.
- `hooks.before_run` — runs before each agent attempt after workspace
  preparation and before launching the coding agent. Failure or timeout
  aborts the current attempt.
- `hooks.after_run` — runs after each agent attempt (success, failure,
  timeout, or cancellation) once the workspace exists. Failure or timeout
  is logged and ignored.
- `hooks.before_remove` — runs before workspace deletion if the directory
  exists. Failure or timeout is logged and ignored; cleanup still proceeds.

## Execution contract

- Run in a local shell appropriate to the host OS, with the workspace
  directory as `cwd`. POSIX default: `bash -lc <script>`.
- Hook timeout uses `hooks.timeout_ms` (default `60000` ms; non-positive
  values fall back to default).
- Log hook start, failures, and timeouts using the §13.1 key=value
  phrasing (`event.action=hook.<name> event.outcome=...`).

## Acceptance criteria

- All four hooks are wired into the workspace lifecycle in
  `Symphony.WorkspaceManager`.
- Failure semantics match the spec exactly (fatal vs logged-and-ignored).
- Hook timeout enforcement is tested with a fixture script that sleeps
  past `hooks.timeout_ms`.
- Reload of `hooks.timeout_ms` is re-applied to subsequent hook runs (per
  spec §6.2).

Dependencies: STACK-011 (worker spawn must exist before `before_run` /
`after_run` can be wired in).

## Completion note

Completed in `tools/symphony-elixir`: workspace hooks run with the issue
workspace as cwd, `hooks.timeout_ms` falls back to the default for non-positive
values, hook logs use `event.action=hook.<name>` and `event.outcome=...`, and
`before_remove` is wired into `WorkspaceManager.remove/2` with logged-and-
ignored failure semantics. `before_run` and `after_run` remain wired through
the agent runners so attempt lifecycle hooks execute around each run.
Regression coverage lives in `test/symphony/workspace_manager_test.exs`,
`test/symphony/agent_runner/local_shell_test.exs`, and
`test/symphony/agent_runner/codex_app_server_test.exs`.
