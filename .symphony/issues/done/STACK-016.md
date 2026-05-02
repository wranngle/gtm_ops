---
id: STACK-016
priority: 2
labels: stack,symphony-elixir,domain-model,run-attempt,live-session,spec-section-4
blocked_by: STACK-011
---
# Plumb the new RunAttempt and LiveSession structs through the orchestrator

`Symphony.RunAttempt` (spec 4.1.5) and `Symphony.LiveSession` (spec 4.1.6) now exist as proper structs but are not wired into the orchestrator's `running` map. Today entries are bare maps with `started_at` and `turn_count` only. Once STACK-011 lands a real worker, the running entry should be a `RunAttempt` plus an associated `LiveSession`.

This issue tracks:

- Replace the orchestrator's `running` map values with `{RunAttempt, LiveSession}` tuples (or a wrapper struct).
- Update `Symphony.snapshot/0` to surface every `LiveSession` field listed in spec 4.1.6: `session_id`, `thread_id`, `turn_id`, `codex_app_server_pid`, `last_codex_event`, `last_codex_timestamp`, `last_codex_message`, all six token counters, `turn_count`.
- Update logging emit sites to thread `session.id` (now supported by `Symphony.Logging.emit/4` via the `:session_id` keyword) for any event tied to a live session.
- Update `Symphony.snapshot/0` aggregate `codex_totals.seconds_running` to be computed at snapshot time per spec section 13.5 ("Implementations may maintain a cumulative counter for ended sessions and add active-session elapsed time derived from `running` entries when producing a snapshot").

Acceptance criteria:

- `Symphony.snapshot/0` returns running rows with the full `LiveSession` field set (zero/nil where data is absent).
- Cumulative `codex_totals.seconds_running` includes elapsed time from currently-running attempts.
- Tests assert the new shape in both empty and populated states.
