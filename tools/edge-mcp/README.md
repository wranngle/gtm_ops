# edge-mcp

Wire Microsoft Edge (on Windows) into Claude Code's MCP layer so an agent
running in WSL can drive the browser — navigate, snapshot, dump DOM, validate
UI state — per the Harness Engineering post's "Codex drives the app with
Chrome DevTools MCP" loop.

## Components

- `edge-debug-launch.sh` — WSL-side launcher. Allocates or reuses a
  per-worktree port from `EDGE_DEBUG_PORT_RANGE` (default `9222-9322`),
  launches Edge with a per-worktree `EdgeDebugProfile-<key>` user-data-dir,
  and writes `.symphony/runtime/edge-port` plus
  `.symphony/runtime/edge-debug.json`. It stops only the Edge processes using
  this worktree's debug profile by default. Positions the window offscreen so
  it does not steal focus. Probes both 127.0.0.1 (mirrored networking) and the
  Windows host IP (NAT networking).
- `install-edge-shortcut.ps1` — drops `Edge (Debug).lnk` into the user's
  Start Menu so a single click auto-launches Edge with the right flags.
  Run from PowerShell on Windows (or from WSL via `powershell.exe -File`).
- `mcp.json` — MCP server registration template using
  [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp). The server
  advertises a safe filtered `browser_*` tool set by default — see "Tools
  advertised" below for the full list. Common ones: `browser_navigate`,
  `browser_snapshot` (accessibility tree), `browser_take_screenshot`,
  `browser_click`, `browser_fill_form`, `browser_evaluate`.
- `filter-unsafe-tools.mjs` — JSON-RPC stdio mediator enabled by default
  through `EDGE_MCP_NO_UNSAFE_TOOLS=1`. It hides `browser_run_code_unsafe`
  from `tools/list` and rejects direct `tools/call` attempts before they
  reach upstream `@playwright/mcp`.
- `smoke/smoke.mjs` — node-only JSON-RPC client that spawns
  `launch-mcp.sh`, runs `initialize` + `tools/list` + `browser_navigate` +
  `browser_console_messages` + `browser_take_screenshot` + `browser_snapshot`
  against `https://example.com`, and asserts the accessibility tree contains
  "Example Domain". Also fails LOUDLY when the upstream tool inventory
  shrinks/expands or when the security-gated `browser_run_code_unsafe`
  appears/disappears relative to `EDGE_MCP_NO_UNSAFE_TOOLS`. Run with
  `node tools/edge-mcp/smoke/smoke.mjs`. No npm deps. Use
  `--tool-snapshot` to dump the live tool list as JSON when intentionally
  re-pinning the inventory. Use `--record-last-run` after a live pass to
  update `smoke/LAST_RUN.md`.
- `smoke/LAST_RUN.md` — checked-in live-smoke ratchet. Records the latest
  local live run's commit SHA, UTC timestamp, pass/fail status, tool count,
  and unsafe-tool denial proof.
- `smoke/validate-last-run.mjs` — non-live validator for `LAST_RUN.md`.
  CI and the doc gardener use it to fail or warn when the live proof is
  stale, malformed, or recorded against a non-ancestor commit.
- `install-mcp.sh` — idempotent merger: writes the `edge-devtools` MCP
  server entry into `~/.claude/settings.json` (or project-local
  `.claude/settings.json` with `--scope project`), preserving any other
  MCP servers already configured.

## Why playwright-mcp

| Candidate | Status |
|---|---|
| **`@playwright/mcp`** ✓ chosen | Microsoft-maintained, native Edge support, mature accessibility tree (best for agents that reason about page structure) |
| `chrome-devtools-mcp` | Community CDP wrapper, lighter but smaller surface |
| `@modelcontextprotocol/server-puppeteer` | Older, archived |

Playwright's accessibility-tree-first design is exactly what the harness post
describes: agents reason about UI structurally rather than by pixel
coordinates.

## One-time setup

From WSL (this repo root):

```bash
# 1. Apply Windows portproxy/firewall for the debug range (UAC prompt).
tools/edge-mcp/windows/setup-elevated.sh --port-range 9222-9322

# 2. Install the Start Menu shortcut (optional; launcher is preferred for
# per-worktree profile/port selection).
powershell.exe -ExecutionPolicy Bypass -File "$(wslpath -w tools/edge-mcp/install-edge-shortcut.ps1)"

# 3. Install or merge the MCP server entry into Claude Code settings.
tools/edge-mcp/install-mcp.sh                  # user-level (~/.claude/settings.json)
# or:
tools/edge-mcp/install-mcp.sh --scope project  # project-local

# 4. Restart Claude Code so it picks up the new MCP server.
# 5. Run /mcp inside Claude Code to confirm 'edge-devtools' is registered.
```

## Per-session use

```bash
tools/ops-console/ops-console.sh start    # start this worktree's Streamlit UI
tools/edge-mcp/edge-debug-launch.sh       # start this worktree's debug Edge
jq . .symphony/runtime/edge-debug.json
tools/ops-console/ops-console.sh url      # navigate Edge to this URL via MCP
```

## Live smoke ratchet

The browser smoke is local-only because stock GitHub runners cannot drive this
Windows Edge + WSL portproxy topology. After any real live pass, update the
ratchet:

```bash
node tools/edge-mcp/smoke/smoke.mjs --record-last-run
node tools/edge-mcp/smoke/validate-last-run.mjs
```

`validate-last-run.mjs` is safe for CI because it only reads
`smoke/LAST_RUN.md` and Git metadata. The default policy requires a passing
record no more than 30 days behind `HEAD`; stale records make CI fail and make
`scripts/gardener.sh` emit an `edge-mcp-last-run` warning.

## WSL2 networking — prerequisite

Edge binds the debug port to `127.0.0.1` and **silently ignores
`--remote-debugging-address=0.0.0.0`** (Chromium upstream security). WSL2 in
default (NAT) networking mode cannot reach Windows-internal `127.0.0.1`. Two
fixes; pick one:

### Fix A — WSL2 mirrored networking (recommended, one-time)

Add to `%USERPROFILE%\.wslconfig` on Windows:

```ini
[wsl2]
networkingMode=mirrored
```

Then from PowerShell:

```powershell
wsl --shutdown
# next time you open WSL, 127.0.0.1 mirrors Windows-localhost
```

After this, the launcher reaches Edge via `127.0.0.1:<selected-port>`. Set
`EDGE_DEBUG_USE_LOCALHOST=1` if you want to force the localhost probe.

### Fix B — Windows portproxy (no WSL restart, requires admin once)

From WSL, run the range-aware elevated setup:

```bash
tools/edge-mcp/windows/setup-elevated.sh --port-range 9222-9322
```

The launcher will then reach Edge via the WSL host-IP route.
Verify with `netsh interface portproxy show all`. The default proxy mode is
`v4tov6` because recent Edge builds often bind CDP on `[::1]`. Set
`EDGE_MCP_PORTPROXY_MODE=v4tov4 EDGE_MCP_PORTPROXY_CONNECT_ADDRESS=127.0.0.1`
only when a local Windows check confirms Edge is binding IPv4 loopback.

## Owner directives applied

- Edge (not Chrome). Path: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
- Worktree-scoped Edge restart by default; set `EDGE_DEBUG_KILL_SCOPE=all`
  only for deliberate manual cleanup.
- Open outside the active window (positioned at 30000,30000 offscreen).
- A single click on the Start Menu shortcut auto-launches with debug flags.
- Separate per-worktree `EdgeDebugProfile-<key>` user-data-dir so the owner's
  main browser session and parallel agent sessions stay isolated.

## Safety

- Edge debug port binds to localhost only (Chromium-enforced).
- `EDGE_DEBUG_FRESH_PROFILE=1` wipes the dedicated profile before each launch
  for a known-clean session.
- The launcher never touches the owner's main Edge profile or its cookies in
  the default `EDGE_DEBUG_KILL_SCOPE=profile` mode.
- Fix B's portproxy exposes the selected debug range to the local network.
  Acceptable for a workstation behind a firewall; remove the rule if the box
  is shared.

## Tools advertised

Default safe inventory verified against `@playwright/mcp@1.60.0-alpha-1777669338000`
(npm `@latest`) on 2026-05-01 via `tools/edge-mcp/smoke/smoke.mjs`:

```
browser_click            browser_close              browser_console_messages
browser_drag             browser_drop               browser_evaluate
browser_file_upload      browser_fill_form          browser_handle_dialog
browser_hover            browser_navigate           browser_navigate_back
browser_network_request  browser_network_requests   browser_press_key
browser_resize           browser_select_option
browser_snapshot         browser_tabs               browser_take_screenshot
browser_type             browser_wait_for
```

Notes:
- `browser_take_screenshot` (not `browser_screenshot`) is the screenshot tool.
- `browser_fill_form` (not `browser_fill`) is the form-fill tool.
- Upstream still exposes `browser_run_code_unsafe`, which evaluates
  arbitrary Playwright JS. The default `EDGE_MCP_NO_UNSAFE_TOOLS=1`
  wrapper hides it from `tools/list` and denies direct `tools/call`.
- `browser_navigate` returns the post-navigation accessibility snapshot
  inline, so a separate `browser_snapshot` call is optional.

## Status

- E-1 (launcher) ✓
- E-2 (MCP server pick + wiring template + installer) ✓
- E-3 (Start Menu shortcut) ✓
- E-4 (live smoke test) ✓ — `tools/edge-mcp/smoke/smoke.mjs` drives the full
  initialize → tools/list → navigate → console_messages → screenshot →
  snapshot loop end-to-end, fails loudly on tool-inventory drift, and records
  the latest live proof in `tools/edge-mcp/smoke/LAST_RUN.md`.
- Per-worktree Edge/app boot ✓ — Edge runtime files live under
  `.symphony/runtime/edge-*`; Streamlit app runtime files live under
  `.symphony/runtime/ops-console*`. `tools/ops-console/smoke.sh` verifies two
  parallel app instances without a Windows GUI.

For the full image-#3 loop coverage matrix (which tool implements which
step of the OpenAI "Codex drives the app with Chrome DevTools MCP"
diagram), the worked-example loop pseudocode, the failure-mode triage
table, the security-gating mechanisms for `browser_run_code_unsafe`, and
the CI-integration constraints, see
[`docs/references/edge-devtools-mcp.md`](../../docs/references/edge-devtools-mcp.md).
