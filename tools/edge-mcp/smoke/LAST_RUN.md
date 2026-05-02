---
schema_version: 1
commit_sha: 8ce1316831dec3dd4a80515522e2ad2213d936c8
timestamp_utc: 2026-05-02T05:04:49.915Z
status: pass
command: node tools/edge-mcp/smoke/smoke.mjs --record-last-run
tool_count: 22
expected_tool_count: 22
no_unsafe_tools: true
unsafe_tool_denied: true
worktree_dirty: true
---
# Edge MCP Smoke LAST_RUN

This file is the checked-in ratchet for the local-only Edge MCP live smoke.
Update it by running:

```bash
node tools/edge-mcp/smoke/smoke.mjs --record-last-run
```

## Recorded Result

- Status: pass
- Commit: 8ce1316831dec3dd4a80515522e2ad2213d936c8
- Timestamp UTC: 2026-05-02T05:04:49.915Z
- Tool count: 22
- Expected tool count: 22
- EDGE_MCP_NO_UNSAFE_TOOLS active: true
- Direct unsafe-tool call denied: true
- Worktree dirty during run: true

## Failures

- none

## Tool Names

- browser_click
- browser_close
- browser_console_messages
- browser_drag
- browser_drop
- browser_evaluate
- browser_file_upload
- browser_fill_form
- browser_handle_dialog
- browser_hover
- browser_navigate
- browser_navigate_back
- browser_network_request
- browser_network_requests
- browser_press_key
- browser_resize
- browser_select_option
- browser_snapshot
- browser_tabs
- browser_take_screenshot
- browser_type
- browser_wait_for
