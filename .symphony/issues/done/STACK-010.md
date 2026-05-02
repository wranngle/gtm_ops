---
id: STACK-010
priority: 1
labels: stack,symphony-elixir,codex,agent-runner,spec-section-10
blocked_by:
---
# Implement the Codex app-server JSON-RPC adapter (spec section 10)

`tools/symphony-elixir/lib/symphony/agent_runner/local_shell.ex` is the only adapter today. It pipes a rendered prompt through `agent.command` via `bash -lc` and captures stdout. That satisfies the local LLM chain contract but does not satisfy spec section 10, which defines a JSON-RPC over stdio protocol with a 4-step handshake (`initialize` -> `initialized` -> `thread/start` -> `turn/start`), line-delimited streaming events, token accounting from `thread/tokenUsage/updated` payloads, approval/sandbox policy plumbing, and the `linear_graphql` dynamic tool extension.

Build `Symphony.AgentRunner.CodexAppServer` that:

- Spawns the configured `codex.command` via `bash -lc` with `cd: workspace.path` and stdout/stderr split.
- Speaks the 4-step handshake above with the request-id correlation that JSON-RPC requires.
- Reads line-delimited messages with a 10MB max-line buffer, JSON-parsing only stdout (stderr is diagnostics only per section 10.3).
- Threads streaming events back to the orchestrator via a callback so it can update `LiveSession` (`last_codex_event`, `last_codex_timestamp`, token counters, rate limits).
- Honors the timeout matrix: `codex.read_timeout_ms` for sync requests, `codex.turn_timeout_ms` per turn, and surfaces stall detection up to the orchestrator (which enforces `codex.stall_timeout_ms`).
- Implements at minimum the high-trust approval defaults from section 10.5 example: auto-approve command/file changes, hard-fail on `turn_input_required`.
- Returns a tool-failure response for any unsupported `item/tool/call` so the session does not stall.
- Optionally implements the `linear_graphql` dynamic tool when `tracker.kind == :linear` and a Linear key is configured.

Acceptance criteria:

- New module `Symphony.AgentRunner.CodexAppServer` implementing the `Symphony.AgentRunner` behaviour.
- `Symphony.AgentRunner.adapter_for/1` selects this adapter when `agent.runner_kind == "codex_app_server"` (or whatever the chosen flag is).
- Unit tests exercise the JSON parsing, request-id correlation, and timeout paths against a fake stdio server.
- Integration smoke (gated, off by default) verifies the handshake against a real `codex app-server` if available.
- Spec error categories from section 10.6 (`codex_not_found`, `invalid_workspace_cwd`, `response_timeout`, `turn_timeout`, `port_exit`, `response_error`, `turn_failed`, `turn_cancelled`, `turn_input_required`) surface through the runner result.

This is the largest single piece of remaining work for the daemon and unblocks proper observability.
