# Technical Debt Tracker

This file tracks debt that should be garbage-collected continuously.

| ID | Area | Debt | Severity | Target |
| --- | --- | --- | --- | --- |
| TD-001 | Validation | Knowledge-base validator only checks required docs and basic links. Architecture lint now exists for `packages/`; per-domain structural tests still missing. | Medium | Add structural tests once a second domain (`data-reconciliation`) lands. |
| TD-002 | Observability | No local logs/metrics/traces stack. Harness post calls for per-worktree Vector + Victoria Logs/Metrics/Traces with LogQL/PromQL/TraceQL access. | High | Add structured logs first, then fixture-backed metrics; full stack deferred until an app exists to instrument. |
| TD-003 | UI validation | No ops-console UI exists yet, so there are no screenshot or DOM validation loops. | Medium | Add when `apps/ops-console` lands. |
| TD-004 | Runtime | No per-worktree app boot. Harness post requires `bun run dev` (or equivalent) per worktree so agents can drive an isolated instance. | High | Land with `apps/ops-console`. |
| TD-005 | Agent legibility | No Chrome DevTools MCP wiring. Harness post shows agents driving the UI via DevTools to snapshot before/after, validate fixes, and loop until clean. | High | Wire after `apps/ops-console` and worktree boot. |
| TD-006 | Gardener | `scripts/gardener.sh` exists; no recurring agent invokes it. | Low | Wire a `/schedule` or CI cron once docs surface is large enough to drift. |
| TD-007 | Symphony fidelity | Current `scripts/symphony.sh` is a one-shot Bash CLI. Symphony spec defines a long-running daemon with nested YAML schema (`tracker`, `polling`, `workspace`, `hooks`, `agent`, `codex`), Codex app-server JSON-RPC protocol, state machine (Unclaimed → Claimed → Running/RetryQueued → Released), reconciliation, retry queue, hooks, Liquid templates, token accounting, snapshot interface. | High | Rewrite as a real daemon (likely Python or Elixir per spec reference impl) once the harness layer is solid. The shape-correct GitHub Issues worktree at `.claude/worktrees/agent-a0f5c2fc8d56dd894` should be discarded and re-done against the spec. |
| TD-008 | Review loop | No agent-to-agent review. Harness post describes a Ralph Wiggum loop where agents review their own PRs, request additional agent reviews, and iterate. | Medium | Land after PR throughput justifies it. |
