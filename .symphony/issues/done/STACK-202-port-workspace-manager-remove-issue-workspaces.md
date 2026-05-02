---
id: STACK-202
priority: 1
labels: stack,symphony-elixir,test-port,workspace-manager
blocked_by:
resolved_by: 8ccb3fd
resolved_at: 2026-05-02
---
# Port WorkspaceManager.remove_issue_workspaces/1,2 (and supporting workspace extensions) from upstream

The parked test
`tools/symphony-elixir/test/symphony/workspace_and_config_test.exs.todo_needs_workspace_manager_extensions`
exercises a slate of workspace behaviors that the local module does not yet
implement: `Workspace.remove_issue_workspaces/1` and
`Workspace.remove_issue_workspaces/2` (with optional `worker_host` for SSH
fan-out), the `{:workspace_equals_root, _, _}` rejection on `Workspace.remove/1`,
the symlink-escape rejection (`{:workspace_outside_root, _, _}`), and the
`{:workspace_hook_failed, ..., exit_code, output}` /
`{:workspace_hook_timeout, ..., timeout_ms}` error tuples for `after_create`
hooks.

Upstream reference:
`/home/wranngle/projects/symphony-upstream/elixir/lib/symphony_elixir/workspace.ex`
lines 88-127 (`remove/1,2`) and 130-164 (`remove_issue_workspaces/1,2`),
plus `run_before_run_hook/3` at line 168 and the surrounding hook plumbing for
the related hook-failure assertions.

## Acceptance criteria

- `Symphony.Workspace.remove_issue_workspaces/1,2` is implemented with the
  same return shape and SSH-host handling as upstream
  `WorkspaceManager.remove_issue_workspaces/1,2`.
- All other parked-test expectations in the file are met (workspace symlink
  escape rejection, root-self-removal rejection, `after_create` failure /
  timeout error tuples, deterministic-per-identifier path, reuse semantics).
- Rename `tools/symphony-elixir/test/symphony/workspace_and_config_test.exs.todo_needs_workspace_manager_extensions`
  back to `workspace_and_config_test.exs`.
- `cd tools/symphony-elixir && mix test test/symphony/workspace_and_config_test.exs`
  passes 100%.
- The full `mix test` suite remains green.

## References

- Parked test: `tools/symphony-elixir/test/symphony/workspace_and_config_test.exs.todo_needs_workspace_manager_extensions`
- Upstream source: `/home/wranngle/projects/symphony-upstream/elixir/lib/symphony_elixir/workspace.ex` (lines 88-164, 168+)
- Local workspace module: `tools/symphony-elixir/lib/symphony/workspace.ex`
- Path-safety helper (already in place): `tools/symphony-elixir/lib/symphony/path_safety.ex`

## Standing rule reminder

Copy upstream verbatim unless an intentional deviation is needed; namespace
`SymphonyElixir` -> `Symphony` everywhere; document any deviation in
`docs/references/symphony-orchestration.md` under "Intentional Differences From
Upstream".
