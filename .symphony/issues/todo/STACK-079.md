---
id: STACK-079
priority: 2
labels: stack,harness,per-worktree,ops-console,ui-validation
blocked_by:
---
# Add per-worktree app boot for runnable UI targets

Harness Engineering calls out making the app bootable per git worktree so each
agent can launch and drive an isolated instance of the app under test. This
repo has worktree-aware Edge and observability tracks, but the runnable UI
itself is still not managed per worktree: the ops-console is a Streamlit app
without a port-managed boot contract that agents can discover and reuse.

`STACK-019` covers per-worktree Edge debug instances and `STACK-071` covers
observability namespacing. This issue covers the missing app process: starting,
recording, validating, and cleaning up the UI target that Edge should drive.

## Acceptance criteria

- Add a repo-local app boot helper for the ops-console that starts Streamlit
  from the current worktree, allocates a free port from a configurable range,
  records `pid`, `port`, `url`, and log path in a worktree-local runtime file,
  and reuses or restarts the process deterministically.
- Add a cleanup/status command so agents can stop stale app processes and see
  which worktree owns a running UI target.
- Edge MCP docs learn to read the app boot file and navigate to the matching
  worktree URL instead of assuming a global app instance.
- A smoke check launches two temporary worktree/workspace targets in parallel,
  verifies distinct ports and logs, and confirms both URLs return a Streamlit
  response.
- `docs/RELIABILITY.md`, `docs/FRONTEND.md`, and
  `docs/references/edge-devtools-mcp.md` document the boot/validate/cleanup
  loop.

## References

- `docs/references/openai_harness_engineering_original_spec.txt` line 46.
- `docs/references/harness-engineering.md` "Codex Drives The App With Chrome
  DevTools MCP".
- `docs/QUALITY_SCORE.md` row "Per-worktree app boot".

## Implementation note

Worker J added `tools/ops-console/ops-console.sh` with `start`, `restart`,
`status`, `stop`, and `url` commands. It writes
`.symphony/runtime/ops-console-port` and
`.symphony/runtime/ops-console.json` with `pid`, `port`, `url`, and `log_path`.

`tools/ops-console/smoke.sh` starts two temporary Streamlit runtimes in
parallel and verifies distinct ports/logs plus HTTP Streamlit responses.

Remaining acceptance item: pair the app helper with live Edge MCP navigation
on Windows after the Edge debug range has been registered.
