---
id: STACK-014
priority: 2
labels: stack,symphony-elixir,reconciliation,stall,startup-cleanup,spec-section-8
blocked_by: STACK-011
---
# Wire stall detection (spec 8.5 part A) and startup terminal workspace cleanup (spec 8.6)

Two pieces of spec section 8 are absent today:

1. Stall detection. Spec 8.5 part A says: for each running issue, compute `elapsed_ms` since `last_codex_timestamp` (or `started_at` if no event has been seen) and terminate the worker + queue a retry when `elapsed_ms > codex.stall_timeout_ms`. The current `Symphony.Orchestrator.reconcile_running/1` only refreshes tracker state - the stall path is missing entirely.
2. Startup terminal workspace cleanup. Spec 8.6 says: at startup, query the tracker for issues in terminal states, and for each returned identifier remove the corresponding workspace directory. The current startup path skips this; stale workspaces accumulate after restarts.

Implementation notes:

- Stall detection needs a real `running` map populated by STACK-011 to be meaningful. Wire a tick path that walks the map, computes `elapsed_ms` against the live session's `last_codex_timestamp`, and either kills the worker (Task.shutdown) or schedules a retry via `Symphony.RetryQueue.next_attempt(_, :failure, _)`.
- Startup cleanup should call the tracker adapter's `fetch_issues_by_states/2` with the configured `tracker.terminal_states`, then for each identifier compute `Symphony.WorkspaceManager.workspace_path/2` and `File.rm_rf!/1` it (after running the `before_remove` hook, with failures logged-and-ignored per spec 9.4).
- A failure of the terminal-issues fetch should log a warning and continue startup (spec 8.6 last bullet).

Acceptance criteria:

- Stall detection terminates a worker that has not emitted an event for `codex.stall_timeout_ms`.
- `codex.stall_timeout_ms <= 0` skips stall detection entirely (spec 8.5 part A).
- Startup cleanup removes one stale workspace in a unit test where a terminal-state issue's workspace exists on disk.
- Both behaviors emit ECS-jsonl events via `Symphony.Logging.emit/4` so operators can confirm them.
