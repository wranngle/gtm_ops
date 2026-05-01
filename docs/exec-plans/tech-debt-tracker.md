# Technical Debt Tracker

This file tracks debt that should be garbage-collected continuously.

| ID | Area | Debt | Severity | Target |
| --- | --- | --- | --- | --- |
| TD-002 | Observability | First slice landed: agent-evals' StderrJsonLogger now uses a configurable LogSink (StderrSink default; createFileSink(path) for file output, AGENT_EVALS_LOG_FILE env var). Still missing: metrics + traces, full Vector + Victoria stack with LogQL/PromQL/TraceQL access. | High | Add fixture-backed metrics next, then real stack once an app exists to instrument. |
| TD-003 | UI validation | No ops-console UI exists yet, so there are no screenshot or DOM validation loops. | Medium | Add when `apps/ops-console` lands. |
| TD-005 | Agent legibility | No Chrome DevTools MCP wiring. Harness post shows agents driving the UI via DevTools to snapshot before/after, validate fixes, and loop until clean. | High | Wire after `apps/ops-console` and worktree boot. |
| TD-007 | Symphony fidelity | WORKFLOW.md and `symphony.sh` now use the spec's nested YAML schema and dispatch by `tracker.kind` between `local_markdown` and `github_issues` adapters. Still missing: long-running daemon shape, Codex app-server JSON-RPC protocol, state machine (Unclaimed → Claimed → Running/RetryQueued → Released), reconciliation, retry queue, hooks execution, Liquid templates, token accounting, snapshot interface. | High | Rewrite as a real daemon (likely Python or Elixir per spec reference impl). |
| TD-008 | Review loop | No agent-to-agent review. Harness post describes a Ralph Wiggum loop where agents review their own PRs, request additional agent reviews, and iterate. | Medium | Land after PR throughput justifies it. |
