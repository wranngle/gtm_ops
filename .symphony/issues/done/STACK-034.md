---
id: STACK-034
priority: 3
labels: stack,symphony-elixir,preflight,validation,spec-section-6
blocked_by: STACK-013
---
# Per-tick dispatch preflight validation (spec section 6.3)

Spec §6.3 distinguishes startup validation from per-tick dispatch
preflight, which must re-validate before each dispatch cycle and skip
dispatch (but keep reconciliation) when validation fails. The Bash adapter
runs validation once at CLI invocation and exits; a long-running daemon
must re-validate per tick.

## Validation checks (per spec §6.3)

- Workflow file can be loaded and parsed.
- `tracker.kind` is present and supported.
- `tracker.api_key` is present after `$` resolution (when the tracker kind
  requires one).
- `tracker.project_slug` is present when required by the selected tracker
  kind.
- `codex.command` is present and non-empty.

## Behavior

- On startup: validate before starting the scheduling loop. Failure
  aborts startup and emits an operator-visible error.
- On every tick: re-run preflight before fetching candidates. Failure
  skips dispatch for that tick, keeps reconciliation active, and emits an
  operator-visible error.

## Acceptance criteria

- `Symphony.Config.preflight/1` (or equivalent) returns
  `{:ok, effective_config}` or `{:error, reason}` and is invoked from
  both the startup path and the tick handler.
- A test confirms that tick preflight failure skips dispatch but still
  runs reconciliation.
- Invalid reload (covered by STACK-013) does not crash the service —
  the last known good effective config keeps running and an
  operator-visible error is emitted (per spec §6.2).

Dependencies: STACK-013 (dynamic reload provides the effective-config
plumbing the tick preflight reuses).

## Completion note

Completed in `tools/symphony-elixir`: `Symphony.Config.validate_dispatch_preflight/1`
validates tracker and command requirements, the CLI startup validation path
uses it for operator-visible failures, and the orchestrator tick path re-runs
preflight after reconciliation so dispatch is skipped while reconciliation and
snapshot state remain alive. Invalid workflow reloads continue to keep the last
known good workflow through `Symphony.WorkflowStore`. Regression coverage lives
in `test/symphony/config_test.exs`, `test/symphony/orchestrator_test.exs`, and
`test/symphony/workflow_store_test.exs`.
