# edge-mcp

Wire Microsoft Edge (on Windows) into Claude Code's MCP layer so an agent
running in WSL can drive the browser — navigate, snapshot, dump DOM, validate
UI state — per the Harness Engineering post's "Codex drives the app with
Chrome DevTools MCP" loop.

## Components

- `edge-debug-launch.sh` — WSL-side launcher. Force-kills any prior msedge,
  launches a fresh instance with `--remote-debugging-port=9222` and a
  dedicated `EdgeDebugProfile` so the owner's main session is untouched.
  Positions the window offscreen so it does not steal focus. Probes both
  127.0.0.1 (mirrored networking) and the Windows host IP (NAT networking).
- `install-edge-shortcut.ps1` — drops `Edge (Debug).lnk` into the user's
  Start Menu so a single click auto-launches Edge with the right flags.
  Run from PowerShell on Windows (or from WSL via `powershell.exe -File`).
- `mcp.json` — MCP server registration template using
  [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp). Provides
  `browser_navigate`, `browser_snapshot` (accessibility tree),
  `browser_screenshot`, `browser_click`, `browser_fill`, `browser_evaluate`.
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
# 1. Install the Start Menu shortcut (Edge will use the Debug profile).
powershell.exe -ExecutionPolicy Bypass -File "$(wslpath -w tools/edge-mcp/install-edge-shortcut.ps1)"

# 2. Install or merge the MCP server entry into Claude Code settings.
tools/edge-mcp/install-mcp.sh                  # user-level (~/.claude/settings.json)
# or:
tools/edge-mcp/install-mcp.sh --scope project  # project-local

# 3. Restart Claude Code so it picks up the new MCP server.
# 4. Run /mcp inside Claude Code to confirm 'edge-devtools' is registered.
```

## Per-session use

```bash
tools/edge-mcp/edge-debug-launch.sh   # kills any prior msedge, launches debug
curl -s http://172.31.240.1:9222/json/version | jq    # NAT-mode probe
# (or 127.0.0.1:9222 with mirrored networking)
```

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

After this, the launcher reaches Edge via `127.0.0.1:9222`. Set
`EDGE_DEBUG_USE_LOCALHOST=1` if you want to force the localhost probe.

### Fix B — Windows portproxy (no WSL restart, requires admin once)

From elevated PowerShell on Windows:

```powershell
netsh interface portproxy add v4tov4 `
  listenport=9222 listenaddress=0.0.0.0 `
  connectport=9222 connectaddress=127.0.0.1
```

The launcher will then reach Edge via the WSL host-IP route.
Verify with `netsh interface portproxy show all`. Remove with
`netsh interface portproxy delete v4tov4 listenport=9222 listenaddress=0.0.0.0`.

## Owner directives applied

- Edge (not Chrome). Path: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
- Force-kill / restart Edge whenever needed.
- Open outside the active window (positioned at 30000,30000 offscreen).
- A single click on the Start Menu shortcut auto-launches with debug flags.
- Separate `EdgeDebugProfile` user-data-dir so the owner's main browser
  session stays untouched.

## Safety

- Edge debug port binds to localhost only (Chromium-enforced).
- `EDGE_DEBUG_FRESH_PROFILE=1` wipes the dedicated profile before each launch
  for a known-clean session.
- The launcher never touches the owner's main Edge profile or its cookies.
- Fix B's portproxy exposes 9222 to the local network. Acceptable for a
  workstation behind a firewall; remove the rule if the box is shared.

## Status

- E-1 (launcher) ✓
- E-2 (MCP server pick + wiring template + installer) ✓
- E-3 (Start Menu shortcut) ✓
- E-4 (live smoke test) deferred until owner picks Fix A or Fix B above
