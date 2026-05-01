# edge-mcp

Wire Microsoft Edge (on Windows) into Claude Code's MCP layer so an agent
running in WSL can drive the browser — navigate, snapshot, dump DOM, validate
UI state — per the Harness Engineering post's "Codex drives the app with
Chrome DevTools MCP" loop.

## Components

- `edge-debug-launch.sh` — WSL-side launcher. Force-kills any prior msedge,
  launches a fresh instance with `--remote-debugging-port=9222` and a
  dedicated `EdgeDebugProfile` so the owner's main session is untouched.
  Positions the window offscreen so it does not steal focus.
- `install-edge-shortcut.ps1` — drops `Edge (Debug).lnk` into the user's Start
  Menu so a single click auto-launches Edge with the right flags. Run from
  PowerShell on Windows (or from WSL via `powershell.exe -File ...`).
- (next slice) MCP server registration — research and pick from
  `playwright-mcp`, community `chrome-devtools-mcp`, or
  `@modelcontextprotocol/server-puppeteer`.

## One-time setup

From WSL (this repo root):

```bash
# 1. Install the Start Menu shortcut.
powershell.exe -ExecutionPolicy Bypass -File "$(wslpath -w tools/edge-mcp/install-edge-shortcut.ps1)"

# 2. Sanity-check the launcher.
tools/edge-mcp/edge-debug-launch.sh
# expected: prints http://127.0.0.1:9222/json/version on stdout
```

## Per-session use

```bash
# Launch (kills any prior msedge first):
tools/edge-mcp/edge-debug-launch.sh

# Confirm the endpoint:
curl -s http://127.0.0.1:9222/json/version | jq

# Drive a navigation manually (smoke test before MCP wiring):
tab=$(curl -s http://127.0.0.1:9222/json/new?https://example.com)
echo "$tab" | jq
```

## Owner directives applied

- Edge (not Chrome). Path: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
- Force-kill / restart Edge whenever needed.
- Open outside the active window (positioned at 30000,30000 offscreen).
- A single click on the Start Menu shortcut auto-launches with debug flags.
- Separate `EdgeDebugProfile` user-data-dir so the owner's main browser
  session stays untouched.

## Safety

- The debug port (9222 default) is bound to localhost only; nothing on the
  Windows network can reach it.
- `EDGE_DEBUG_FRESH_PROFILE=1` wipes the dedicated profile before each launch
  for a known-clean session.
- The launcher never touches the owner's main Edge profile or its cookies.
