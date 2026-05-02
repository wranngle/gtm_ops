---
id: STACK-011
priority: 1
labels: stack,symphony-elixir,worker,orchestrator,spec-section-7
blocked_by: STACK-010
---
# Replace log-only dispatch with real worker spawn under Task supervision

`tools/symphony-elixir/lib/symphony/orchestrator.ex` currently logs each eligible issue via `log_dispatch/2` instead of starting a real run. The `running` map is never populated and the spec section 7 state machine (`Unclaimed -> Claimed -> Running -> RetryQueued -> Released`) does not actually transition.

Wire a `Task.Supervisor` so each dispatched issue spawns a worker process that:

- Builds a `Symphony.RunAttempt` struct, walks it through the 11 phases (`PreparingWorkspace` -> `BuildingPrompt` -> `LaunchingAgentProcess` -> `InitializingSession` -> `StreamingTurn` -> `Finishing` -> terminal) and reports each transition back to the orchestrator.
- Calls `Symphony.WorkspaceManager.ensure_exists/2` and runs `after_create` / `before_run` hooks.
- Renders the prompt via `Symphony.PromptRenderer`.
- Invokes the agent runner adapter (LocalShell today, CodexAppServer once STACK-010 lands).
- On exit, sends a typed message to the orchestrator with the outcome so it can update aggregate `codex_totals`, schedule the spec-mandated 1s continuation retry on clean exit (section 7.1), or queue a failure-driven exponential backoff on abnormal exit.
- Honors per-turn `agent.max_turns` (default 20) inside one worker run.

Acceptance criteria:

- Orchestrator `running` map is populated with `RunAttempt`-shaped entries while a worker is alive.
- Killing the orchestrator does not orphan running tasks (use the supervisor's `:transient` strategy).
- A successful worker exit results in a continuation retry queued at +1000 ms; an abnormal exit goes through `Symphony.RetryQueue.next_attempt/3` with `:failure`.
- Snapshot reflects active workers with `turn_count` per spec section 13.3.
- Tests cover both clean and abnormal exit paths against the LocalShell adapter (no Codex needed).

Once this lands the existing `log_dispatch/2` call in `Symphony.Orchestrator.dispatch_eligible/1` can be deleted.
