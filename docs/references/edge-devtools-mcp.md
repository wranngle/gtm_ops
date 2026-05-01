# Edge DevTools MCP — Contract & Smoke Test

The wiring an agent uses to drive Microsoft Edge for UI validation, per the
Harness Engineering post's "Codex drives the app with Chrome DevTools MCP"
loop. Adapted to run from WSL2 against Edge on Windows.

## Topology

```
┌─────────────────────────────┐                ┌─────────────────────────────┐
│ WSL                         │                │ Windows                      │
│                             │                │                              │
│  Claude Code (npx)          │                │   Edge (msedge.exe)          │
│   └─► launch-mcp.sh         │   TCP 9222     │     listens on [::1]:9222    │
│        └─► @playwright/mcp ─┼────────────────┼──► netsh portproxy v4tov6    │
│             --cdp-endpoint  │                │      0.0.0.0:9222 → ::1:9222 │
│             $WSL_HOST_IP    │                │                              │
└─────────────────────────────┘                └─────────────────────────────┘
```

## Components & their contracts

| Path | Role |
|------|------|
| `tools/edge-mcp/edge-debug-launch.sh` | force-kills any prior `msedge.exe`, launches a fresh one with `--remote-debugging-port=9222 --user-data-dir=EdgeDebugProfile`, waits up to 30s for the CDP endpoint to bind, prints the reachable URL on stdout |
| `tools/edge-mcp/install-edge-shortcut.ps1` | drops `Edge (Debug).lnk` in the Start Menu so a single click launches with the right flags |
| `tools/edge-mcp/windows/setup-elevated.sh` | one-time UAC-elevated setup: writes the v4tov6 portproxy + firewall allow rule by triggering `Start-Process -Verb RunAs` against the staged `.cmd` files |
| `tools/edge-mcp/windows/edge-mcp-portproxy.cmd` | netsh: deletes any existing v4tov4 rule, adds v4tov6 from `0.0.0.0:9222` → `[::1]:9222` |
| `tools/edge-mcp/windows/edge-mcp-firewall.cmd` | netsh advfirewall: adds inbound TCP 9222 allow rule named `edge-mcp-9222` |
| `tools/edge-mcp/launch-mcp.sh` | resolves the working CDP endpoint at MCP start (host IP / 127.0.0.1 / `[::1]` fallbacks), then `exec npx -y @playwright/mcp@latest --browser msedge --cdp-endpoint $resolved` |
| `tools/edge-mcp/mcp.json` | Claude Code MCP server registration template — uses `launch-mcp.sh` as the command so endpoint resolution happens fresh each session |
| `tools/edge-mcp/install-mcp.sh` | idempotent merger that writes the `edge-devtools` entry into `~/.claude/settings.json` (or project-local with `--scope project`) |

## One-time owner setup

Already done in this repo's owner environment:

```bash
# 1. Apply Windows-side prerequisites (UAC prompt fires once).
tools/edge-mcp/windows/setup-elevated.sh

# 2. Install the Edge (Debug) Start Menu shortcut.
powershell.exe -ExecutionPolicy Bypass -File "$(wslpath -w tools/edge-mcp/install-edge-shortcut.ps1)"

# 3. Register the MCP server in Claude Code settings.
tools/edge-mcp/install-mcp.sh

# 4. Restart Claude Code; verify with /mcp.
```

## Per-session use

```bash
# Click "Edge (Debug)" in the Start Menu, OR:
tools/edge-mcp/edge-debug-launch.sh
# expected stdout: http://172.31.240.1:9222/json/version  (or similar)

# Then drive Edge through Claude Code's `edge-devtools` MCP server.
# The MCP exposes (via @playwright/mcp): browser_navigate,
# browser_snapshot (accessibility tree), browser_screenshot,
# browser_click, browser_fill, browser_evaluate.
```

## Verified smoke test (recorded 2026-04-30)

End-to-end smoke run after `setup-elevated.sh` + `edge-debug-launch.sh`:

```bash
$ tools/edge-mcp/edge-debug-launch.sh
{"@timestamp": "...", "event.action": "edge.kill-existing", ...}
{"@timestamp": "...", "event.action": "edge.launch", ...}
{"@timestamp": "...", "event.action": "edge.debug-ready", "message": "http://172.31.240.1:9222/json/version"}
http://172.31.240.1:9222/json/version

$ curl -s http://172.31.240.1:9222/json/version | jq -r '.Browser, .webSocketDebuggerUrl'
Edg/147.0.3912.98
ws://172.31.240.1:9222/devtools/browser/<uuid>

$ curl -s http://172.31.240.1:9222/json/list | jq '.[] | {url, type}' | head
{ "url": "about:blank", "type": "page" }
{ "url": "chrome-extension://...", "type": "background_page" }
...
```

The CDP endpoint returns the browser version, an active websocket
debugger URL, and the live tab list — sufficient evidence the entire
chain (Edge bind → portproxy forward → firewall allow → WSL host-IP
route) is functioning.

## Why Edge binds `[::1]` instead of `127.0.0.1`

Recent Edge/Chromium has shifted to IPv6-only loopback for the remote
debugging port on some Windows versions, even when
`--remote-debugging-address=127.0.0.1` is passed. The flag is honored
for *constraining* the bind (it won't bind 0.0.0.0 just because we ask)
but the IP family the OS picks is implementation-defined. We don't try
to fight this — the portproxy + firewall fix is one-time and survives
across Edge updates.

## Failure modes & remediation

| Symptom | Cause | Fix |
|---------|-------|-----|
| `tools/edge-mcp/edge-debug-launch.sh` reports `edge.debug-unreachable` | Edge didn't bind in 30s, or networking gap | Re-run launcher; if still failing, run `tools/edge-mcp/windows/setup-elevated.sh` |
| `curl ... /json/version` returns 000 (timeout) | Firewall blocks inbound 9222 | `netsh advfirewall firewall add rule name=edge-mcp-9222 dir=in action=allow protocol=TCP localport=9222` (admin) |
| Connection works from Windows but not WSL | Portproxy missing or `v4tov4` instead of `v4tov6` | Re-run `tools/edge-mcp/windows/setup-elevated.sh` |
| MCP server registration not visible in Claude Code | Settings file not loaded | Restart Claude Code; check `~/.claude/settings.json` for the `edge-devtools` entry |

## Owner directives applied

- Edge (not Chrome). Path: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
- Force-kill / restart Edge whenever needed (launcher does this every run).
- Open outside the active window (positioned at 30000,30000 offscreen).
- Single click on the Start Menu shortcut auto-launches with debug flags.
- Separate `EdgeDebugProfile` user-data-dir so the owner's main browser
  session stays untouched.

## Related references

- [`tools/edge-mcp/README.md`](../../tools/edge-mcp/README.md) — operational overview
- [`docs/references/harness-engineering.md`](harness-engineering.md) — source loop being implemented
- [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp) — upstream MCP server
