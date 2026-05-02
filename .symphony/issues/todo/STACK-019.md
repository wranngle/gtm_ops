---
id: STACK-019
priority: 2
labels: stack,edge-mcp,harness,per-worktree,infrastructure
blocked_by:
---
# Per-worktree Edge debug instances for parallel agent runs

The Harness Engineering post (image #3, "Codex drives the app with Chrome DevTools MCP") and the verbose narrative both emphasize per-worktree application instances so each agent can launch and drive an isolated copy of the app under test. Our current `tools/edge-mcp/edge-debug-launch.sh` launches a single Edge instance bound to one debug port (9222) and one user-data-dir (`EdgeDebugProfile`). Two agents working different worktrees in parallel race for that one Edge.

This is a real-infrastructure gap, not a doc gap.

## Acceptance criteria

- An agent can launch its own Edge debug instance keyed to its worktree without colliding with another running Edge debug instance.
- The launcher allocates a free TCP port from a configurable range (default 9222–9322), records the chosen port in a worktree-local file (e.g. `.symphony/workspaces/<id>/edge-port`), and reuses it on subsequent launches.
- Each instance gets its own `--user-data-dir` keyed to the worktree id (e.g. `EdgeDebugProfile-<worktree-id>`), so cookies, storage, and sessions never cross worktrees.
- `launch-mcp.sh` reads the same worktree-local port file so the MCP server attaches to the matching CDP endpoint.
- `windows/setup-elevated.sh` can register portproxy + firewall rules for a port range, not just 9222.
- An updated smoke run with two worktrees in parallel confirms both attach loops succeed without interfering.

Out of scope: changing the owner's main Edge profile behavior (still untouched), or supporting non-Edge browsers.

## References

- `docs/references/edge-devtools-mcp.md` ("Per-worktree Edge/App Boot Contract" section)
- `docs/references/openai_harness_engineering_original_spec.txt` line 46 ("we made the app bootable per git worktree")
- `tools/edge-mcp/edge-debug-launch.sh` (current single-instance launcher)
- `tools/edge-mcp/launch-mcp.sh` (current single-port endpoint resolution)
- `tools/edge-mcp/windows/setup-elevated.sh` (current single-rule setup)

## Implementation note

Worker J added the per-worktree runtime contract:

- `tools/edge-mcp/edge-debug-launch.sh` allocates or reuses a port from
  `EDGE_DEBUG_PORT_RANGE` and writes `.symphony/runtime/edge-port` plus
  `.symphony/runtime/edge-debug.json`.
- Edge profile directories default to `EdgeDebugProfile-<worktree-key>`.
- `tools/edge-mcp/launch-mcp.sh` reads the same runtime port/endpoint.
- `tools/edge-mcp/windows/setup-elevated.sh --port-range <start>-<end>`
  stages range-aware portproxy/firewall rules.

Remaining acceptance item: run the dual-worktree live Edge smoke on Windows
after applying the elevated range setup.
