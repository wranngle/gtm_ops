---
id: STACK-020
priority: 2
labels: stack,edge-mcp,security,gating
blocked_by:
---
# Tool-layer gate for browser_run_code_unsafe

`@playwright/mcp@latest` exposes `browser_run_code_unsafe`, which evaluates arbitrary Playwright JavaScript in the Playwright server process — RCE-equivalent against the workstation. Upstream provides no flag or config key to drop a single tool: the `core` capability bundles it and the `capabilities` field in `--config` is purely additive (verified empirically 2026-05-01 by running `@playwright/mcp@0.0.73` with `{"capabilities": ["core-navigation", "core-tabs"]}` and observing the unsafe tool still in `tools/list`).

Original mitigations before the 2026-05-02 repair were:

1. Documentation in `docs/references/edge-devtools-mcp.md` "Security".
2. Marker-only `EDGE_MCP_NO_UNSAFE_TOOLS=1` env var in `tools/edge-mcp/launch-mcp.sh` that emits a stderr warning naming the gating mechanisms.
3. Smoke-test detection of the tool's presence/absence (`SECURITY_GATED_TOOLS` in `tools/edge-mcp/smoke/smoke.mjs`) so a silent upstream rename trips the build.

What's missing is an **enforced** gate. Two implementation paths:

## Acceptance criteria — pick one path

### Path A — Claude Code permission denylist (preferred, no code)

- Document the exact denylist entry shape in `docs/references/edge-devtools-mcp.md`.
- Add it to a project-scope `.claude/settings.json` template the install flow can opt into.
- Verify the deny actually rejects a `tools/call browser_run_code_unsafe` invocation by an agent.

### Path B — JSON-RPC mediator wrapper (heavier, code change)

- Wrap `tools/edge-mcp/launch-mcp.sh` with a node script that spawns `@playwright/mcp` itself, intercepts JSON-RPC traffic on stdio, drops the unsafe tool from `tools/list` responses, and returns an error envelope for any `tools/call` targeting it.
- Smoke verifies the unsafe tool is invisible when the wrapper is enabled.
- Make the wrapper opt-in via `EDGE_MCP_NO_UNSAFE_TOOLS=1` (replacing the marker behavior).

Either path satisfies the security requirement. Path A is preferred unless we discover Claude Code's denylist is not load-bearing for MCP tool calls in the version we run.

## References

- `docs/references/edge-devtools-mcp.md` ("Security" section)
- `tools/edge-mcp/launch-mcp.sh` (current safe-default mediator behavior)
- `tools/edge-mcp/smoke/smoke.mjs` `SECURITY_GATED_TOOLS` constant

## Progress

- 2026-05-02: Path B landed in code. `tools/edge-mcp/filter-unsafe-tools.mjs`
  mediates JSON-RPC stdio, hides `browser_run_code_unsafe` from `tools/list`,
  and rejects direct `tools/call` requests before upstream Playwright MCP sees
  them. `EDGE_MCP_NO_UNSAFE_TOOLS=1` is now the default in
  `tools/edge-mcp/launch-mcp.sh` and `tools/edge-mcp/mcp.json`.
- 2026-05-02: Live Edge MCP smoke passed against a real Edge CDP endpoint on
  `EDGE_DEBUG_PORT=9222`:

  ```bash
  EDGE_DEBUG_PORT=9222 node tools/edge-mcp/smoke/smoke.mjs --record-last-run
  node tools/edge-mcp/smoke/validate-last-run.mjs --max-age-days 30
  ```

  Proof recorded in `tools/edge-mcp/smoke/LAST_RUN.md`:
  `status=pass`, `tool_count=22`, `expected_tool_count=22`,
  `no_unsafe_tools=true`, and `unsafe_tool_denied=true`. The smoke logs showed
  the mediator removed one tool from `tools/list` and denied a direct
  `tools/call browser_run_code_unsafe` request before navigation, screenshot,
  and accessibility snapshot succeeded.

## Completion

Closed 2026-05-02. Path B is load-bearing and live-verified. No remaining
live proof is required for the unsafe-tool gate itself; the separate live-CI
runner story remains tracked by `STACK-021`.
