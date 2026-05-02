---
id: STACK-013
priority: 2
labels: stack,symphony-elixir,reload,filesystem-watcher,spec-section-6
blocked_by:
---
# Add a WORKFLOW.md filesystem watcher for dynamic reload (spec section 6.2)

Spec section 6.2 says "The software should watch `WORKFLOW.md` for changes. On change, it should re-read and re-apply workflow config and prompt template without restart." The orchestrator already has `Symphony.Orchestrator.apply_workflow/1` and `Symphony.reload_workflow/0`, so the runtime hook exists; what is missing is the filesystem watcher that calls it.

Build a `Symphony.WorkflowWatcher` GenServer that:

- Adds a dependency on `:file_system` (the de-facto Elixir filesystem watch lib; FreeBSD/inotify/fsevents-aware).
- Watches the directory containing the configured `WORKFLOW.md`.
- Debounces events (200-500 ms) so a save with editor swap files does not trigger 5 reloads.
- Calls `Symphony.reload_workflow/0` on file change. Logs success/failure via `Symphony.Logging.emit/4` with `event.action: "symphony.workflow.reload"`.
- Handles the spec's "invalid reloads should not crash the service" requirement: keep operating with the last-known-good config and surface an operator-visible warning via the existing logging sink.
- Optionally re-validates defensively per tick (per spec section 6.2 last bullet) so a missed inotify event does not strand the daemon on a stale config.

Acceptance criteria:

- New module `Symphony.WorkflowWatcher` started by the application supervisor when the orchestrator is enabled.
- Smoke test that writes WORKFLOW.md, observes the reload, and asserts a config field changed in `Symphony.snapshot/0`.
- Configurable opt-out (e.g. `:symphony, :workflow_watcher_enabled?` defaulting to true) so test environments can disable it.
