---
id: STACK-073
priority: 2
labels: cli,escript,bug
---
# `symphony --workflow PATH` flag is silently ignored by the escript

## Problem

The escript at `tools/symphony-elixir/bin/symphony` advertises a top-level `--workflow PATH` flag in its `--help` output, but invoking with the flag does not change the path the application loads.

Reproducer (in any cwd, with `mise` activated):

```bash
$ tools/symphony-elixir/bin/symphony --workflow /home/wranngle/projects/wranngle-gtm-engine/WORKFLOW.md validate
[warning] symphony.workflow_load_failed reason={:missing_workflow_file, "/home/wranngle/projects/wranngle-gtm-engine/tools/symphony-elixir/WORKFLOW.md", :enoent}
validate failed: {:missing_workflow_file, "/home/wranngle/projects/wranngle-gtm-engine/tools/symphony-elixir/WORKFLOW.md", :enoent}
```

The error path is `<escript-cwd>/WORKFLOW.md` regardless of the `--workflow` value.

## Root cause

`Symphony.WorkflowStore` reads `Application.get_env(:symphony, :workflow_path)` at GenServer init time. The escript's `Symphony.CLI.main/1` parses `--workflow` after `Symphony.Application.start/2` has already completed (the escript boots the OTP application before user code runs). By the time `Symphony.CLI.main/1` could call `Application.put_env(:symphony, :workflow_path, path)`, the WorkflowStore has already loaded with the default.

## Fix sketch

Either:

1. Have `Symphony.CLI` read `--workflow` from `argv` BEFORE `Application.ensure_all_started(:symphony)` and `Application.put_env/3` it then. Escripts can do this via the `boot/3` pattern — see `Mix.Tasks.Run` for prior art.
2. Add a `Symphony.WorkflowStore.set_path/1` (or `Symphony.reload_workflow/1` accepting a path) call in `Symphony.CLI.main/1` after argv parsing. The store then re-reads from the new path on the next tick.

(2) is simpler; (1) is more idiomatic for an escript that ships a CLI as the primary entry point.

## Acceptance criteria

- `bin/symphony --workflow /abs/path/to/WORKFLOW.md validate` exits 0 against a valid workflow at `/abs/path/to/`.
- A test case in `test/symphony/cli_test.exs` exercises the flag against a tmp WORKFLOW.md and asserts the error path matches the user-supplied flag, not the default.
