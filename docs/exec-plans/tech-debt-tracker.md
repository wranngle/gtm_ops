# Technical Debt Tracker

This file tracks debt that should be garbage-collected continuously.

| ID | Area | Debt | Severity | Target |
| --- | --- | --- | --- | --- |
| TD-002 | Observability | First slice landed: agent-evals' StderrJsonLogger now uses a configurable LogSink (StderrSink default; createFileSink(path) for file output, AGENT_EVALS_LOG_FILE env var). Still missing: metrics + traces, full Vector + Victoria stack with LogQL/PromQL/TraceQL access. | High | Add fixture-backed metrics next, then real stack once an app exists to instrument. |
| TD-003 | UI validation | No ops-console UI exists yet, so there are no screenshot or DOM validation loops. | Medium | Add when `apps/ops-console` lands. |
| TD-005 | Agent legibility | Edge DevTools MCP wiring landed: launcher, install scripts, Start Menu shortcut, MCP server registration, and end-to-end smoke test all pass (see `docs/references/edge-devtools-mcp.md`). Remaining: pair with a per-worktree app boot once `apps/ops-console` grows past stub. | Closed-pending-app | Re-open as a new TD if per-worktree boot reveals gaps. |
| TD-007 | Symphony fidelity | WORKFLOW.md and `symphony.sh` now use the spec's nested YAML schema and dispatch by `tracker.kind` between `local_markdown` and `github_issues` adapters. Still missing: long-running daemon shape, Codex app-server JSON-RPC protocol, state machine (Unclaimed → Claimed → Running/RetryQueued → Released), reconciliation, retry queue, hooks execution, Liquid templates, token accounting, snapshot interface. | High | Rewrite as a real daemon (likely Python or Elixir per spec reference impl). |
| TD-008 | Review loop | STACK-076 landed the mechanical PR shepherding helper: open/update PRs, read review comments, fetch failed logs, rebase, rerun documented flakes, post readiness, and gate merge behind explicit opt-in. Still missing: a real secondary agent reviewer and daemon-observed PR/CI state. | Medium | Configure a secondary agent reviewer after PR throughput justifies it; keep merge policy opt-in. |
