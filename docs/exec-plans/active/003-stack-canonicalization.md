## Execution Plan: Stack Canonicalization

Status: Active
Owner: wranngle
Created: 2026-04-30

## Goal

Move the dotfiles + harness + symphony stack from "demonstrated in this repo" to **canonical**: spec-faithful, reusable across projects, free of showcase-repo-specific assumptions. Per the owner's directive (2026-04-30):

> The harness/symphony machinery comes first to enable proper development of the actual project. Avoid polluting the harness/symphony stack with the project-specific. In the end the dotfiles/harness/symphony stack must be canonical. If you wrap all that up then and only then can you begin the showcase project, which will mean repairing the stack along the way to make it truly working and universal.

## In-Scope

1. **Symphony Elixir daemon** (TD-007 final). Build the spec-faithful long-running service: poll loop, state machine (Unclaimed → Claimed → Running/RetryQueued → Released), reconciliation, retry queue, hooks, Liquid templates, token accounting, snapshot interface, Codex app-server JSON-RPC client. Lives at `~/.dotfiles/lib/symphony-elixir/` (via `bin/symphony` shim) for now; portable WORKFLOW.md is the only repo-specific surface it consumes.
   - **Slice progress**: T-1 ✓ install via mise; T-2 ✓ scaffold; T-3 ✓ typed config; T-4 ✓ orchestrator + Tracker behaviour + Noop; T-5 ✓ workspace manager + safety invariants; T-6 ✓ AgentRunner + LocalShell + PromptRenderer; T-7 ✓ LocalMarkdown + GitHubIssues; T-8 ✓ ECS-jsonl Logging + Sink, RetryQueue with exponential backoff, reconcile pass, snapshot enrichment. **51 ExUnit tests passing, stable across 10 consecutive runs.**
   - **Pending**: real Task-supervised worker spawn (replaces log-only dispatch), stall-timeout enforcement (depends on real workers), Codex app-server JSON-RPC adapter (separate later slice — follows after Task supervision).
2. **Edge DevTools MCP wiring** (TD-005). Per directive: Edge (not Chrome), reuse existing session OR launch fresh, modify user-profile shortcuts to include the right `--remote-debugging-port` flag so a single click auto-launches with debugging on. Force-kill/restart whenever needed. Open outside the active window (no focus steal). Wire an MCP server (research candidates: official `playwright-mcp`, community `chrome-devtools-mcp`) into Claude Code's MCP config so any agent in this repo can drive Edge.
   - **Slice progress**: E-1 launcher ✓; E-2 MCP server (`@playwright/mcp`) + endpoint-resolving `launch-mcp.sh` wrapper + `install-mcp.sh` merger ✓; E-3 Start Menu shortcut ✓; E-4 smoke test ✓ (live CDP loop verified WSL → Edge → tab list). One-time UAC-elevated setup script `windows/setup-elevated.sh` writes the v4tov6 portproxy + firewall allow rule.
   - **All TD-005 slices closed.** Owner directives all applied.
3. **Full local observability stack** (TD-002 final). Vector + VictoriaLogs + VictoriaMetrics + VictoriaTraces via docker-compose. Per-worktree allowed. Wire `apps/ops-console` and `packages/agent-evals` to emit logs/metrics/traces; add LogQL/PromQL/TraceQL query examples to docs.
   - **Slice progress**: O-1 docker-compose chassis ✓; O-2 Vector config tailing `.symphony/logs/*.jsonl` + OTLP HTTP intake on 4318 ✓; O-3 agent-evals OTLP metrics emitter ✓; O-4 query cookbook at `docs/references/local-observability.md` (LogsQL, PromQL, TraceQL, end-to-end smoke) ✓.
   - **Pending**: ops-console wiring to PromQL (planned alongside showcase project work, owner-blocked); TraceQL spans (depend on TD-007 follow-on Codex JSON-RPC adapter, out of canonicalization scope).
4. **Stack/project separation discipline.** Audit current placement: `packages/agent-evals` and `apps/ops-console` are *project examples* of the stack — leave them but tag clearly. Stack-level scripts (`scripts/symphony.sh`, `scripts/lint-layered-architecture.sh`, `scripts/gardener.sh`, `scripts/validate-knowledge-base.sh`) must stay free of project-specific paths/strings. Add a doc that names the canonical artifacts vs the showcase artifacts.

## Out of Scope (Deferred Indefinitely)

- **TD-008 agent-to-agent review loop** — owner: "IDK? The question means nothing to me." Defer until natural demand emerges.

## Out of Scope (Until Stack Canonicalization Wraps)

- The voice-agent showcase project itself. Once stack is canonical, the showcase work begins; expect to surface stack gaps and repair them inline. That's the explicit working model.

## Decision Log (Owner-Provided 2026-04-30)

- **Push flow**: stay on `main` only. No PR-based flow yet.
- **TD-007 runtime**: Elixir, per spec precedent. The reference Symphony at `github.com/openai/symphony` is Elixir; matching it is the spec-fidelity move.
- **TD-005 browser**: Edge on Windows (not Chrome / not WSL Chromium). Auto-launch via user-profile shortcut with debug flags pre-baked; force-kill/restart freely; do not steal focus from active window.
- **TD-002 stack**: full local. Worktrees fine for isolation.
- **TD-007 worktree**: discarded via git-reconcile (no unique commits, stale design).

## Acceptance Criteria

- `~/.dotfiles/lib/symphony-elixir/` (via `bin/symphony` shim) runs as a daemon: `mix run --no-halt` boots the supervision tree, polls a configured tracker, dispatches per-issue agent runs into per-issue workspaces, retries with exponential backoff, reconciles every tick, exposes a snapshot API.
- `tools/edge-mcp/edge-debug-launch.sh` (or equivalent) starts Edge with `--remote-debugging-port=<n>` outside the active window and writes a desktop shortcut into the user's Windows profile.
- An MCP server is registered in `~/.claude/settings.json` (or project-local) that connects to that debug port; a sample agent run proves a screenshot can be captured.
- `tools/observability/docker-compose.yml` brings up Vector + Victoria stack; `apps/ops-console` and `packages/agent-evals` emit to it; example LogQL/PromQL/TraceQL queries documented.
- The new artifacts pass `scripts/validate-knowledge-base.sh`, `scripts/lint-layered-architecture.sh`, `scripts/gardener.sh`, and CI.
- A doc clearly distinguishes canonical-stack artifacts from showcase-project artifacts.

## Owner Authorizations Recorded

- Push to `main` autonomously per cron tick (acknowledged).
- Force-kill/restart Edge whenever needed.
- Modify Edge shortcuts in the user's Windows profile to add debug flags.
- Local docker-compose runs allowed.
- Worktree cleanup via git-reconcile authorized (already executed).
