# Edge DevTools MCP — Contract & Smoke Test

The wiring an agent uses to drive Microsoft Edge for UI validation, per the
Harness Engineering post's "Codex drives the app with Chrome DevTools MCP"
loop (image #3 in `docs/references/`). Adapted to run from WSL2 against
Edge on Windows.

Status: Active
Last reviewed: 2026-05-01

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
| `tools/edge-mcp/launch-mcp.sh` | resolves the working CDP endpoint at MCP start (host IP / 127.0.0.1 / `[::1]` fallbacks), then runs `@playwright/mcp@latest --browser msedge --cdp-endpoint $resolved`. By default it enables `EDGE_MCP_NO_UNSAFE_TOOLS=1` and runs through `filter-unsafe-tools.mjs`; set `EDGE_MCP_NO_UNSAFE_TOOLS=0` only for deliberate local investigation. Honors `EDGE_MCP_CONSOLE_LEVEL` and `EDGE_MCP_EXTRA_ARGS` |
| `tools/edge-mcp/filter-unsafe-tools.mjs` | JSON-RPC stdio mediator that hides `browser_run_code_unsafe` from `tools/list` and rejects `tools/call` for that tool before the request reaches upstream `@playwright/mcp` |
| `tools/edge-mcp/mcp.json` | Claude Code MCP server registration template — uses `launch-mcp.sh` as the command so endpoint resolution happens fresh each session |
| `tools/edge-mcp/install-mcp.sh` | idempotent merger that writes the `edge-devtools` entry into `~/.claude/settings.json` (or project-local with `--scope project`) |
| `tools/edge-mcp/smoke/smoke.mjs` | end-to-end attach loop: initialize → tools/list → navigate → console_messages → screenshot → snapshot. Fails LOUDLY on tool-list shrink/expansion or security-gated-tool drift |

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
# The MCP exposes a safe filtered browser_* tool set by default — see
# "Tools advertised" below for the full list. Common ones:
# browser_navigate, browser_snapshot (accessibility tree),
# browser_take_screenshot, browser_click, browser_fill_form,
# browser_evaluate. browser_run_code_unsafe is hidden and denied.
```

## Image #3 → tool/script coverage matrix

The OpenAI "Codex drives the app with Chrome DevTools MCP" diagram shows a
9-step loop. Every step is implementable via tools we expose; some steps
require composition of multiple tool calls. This is the contract an agent
implementing the loop should program against.

| Image #3 step | Primary tool(s) | Composition / notes | Where it lives |
|---|---|---|---|
| 1. Select target | `browser_tabs {action:"list"}` then `browser_tabs {action:"select", index:N}` (or `browser_navigate` to open a fresh target) | A "target" in the diagram corresponds to a Playwright page (one CDP target per Edge tab). For per-worktree isolation see "Per-worktree app boot — gap" below. | `@playwright/mcp` |
| 2. Clear console | `browser_console_messages {all:true}` to pull the current buffer once and snapshot it; subsequent calls with `all:false` return only post-baseline messages | Upstream has no `browser_console_clear` tool. The agent treats the snapshot taken in step 1 as the "cleared" baseline and diffs forward. Document this in the agent prompt. | `@playwright/mcp` (compose) |
| 3. Snapshot BEFORE | `browser_snapshot` (accessibility tree) + `browser_take_screenshot` (pixels) + `browser_console_messages` (state) + `browser_network_requests` (HTTP state) | Save all four artifacts to `.playwright-mcp/` so step 8 can diff them. | `@playwright/mcp` (compose) |
| 4. Trigger UI path | `browser_click`, `browser_fill_form`, `browser_type`, `browser_press_key`, `browser_select_option`, `browser_hover`, `browser_drag`, `browser_drop`, `browser_file_upload`, `browser_handle_dialog` | Pick the highest-level tool that fits — `browser_fill_form` for forms, single `browser_click` for buttons. Use refs from the latest snapshot. | `@playwright/mcp` |
| 5. Observe runtime events DURING interaction | `browser_console_messages {all:false}` (log/warning/error stream) + `browser_network_requests` (XHR/fetch list) + `browser_network_request {index:N}` (full headers/body for one request) | Call between user interactions, not just at the end. The diagram shows runtime events fan out from app to DevTools. Both tools are read-only and cheap. | `@playwright/mcp` (compose) |
| 6. Snapshot AFTER | `browser_snapshot` + `browser_take_screenshot` + `browser_console_messages` + `browser_network_requests` | Same artifacts as step 3, captured after the trigger. The agent reasons about deltas. | `@playwright/mcp` (compose) |
| 7. Apply fix | (out of scope for the MCP — agent edits files in the repo) | The MCP loop is the *validator*. Code edits happen via Claude Code's regular Write/Edit tools. | Claude Code core |
| 8. Restart | `tools/edge-mcp/edge-debug-launch.sh` (force-kills + relaunches Edge) followed by reissuing `browser_navigate` | Fully isolated restart. The launcher already force-kills `msedge.exe` per owner directive. For a clean profile, set `EDGE_DEBUG_FRESH_PROFILE=1`. | `tools/edge-mcp/edge-debug-launch.sh` |
| 9. Re-run validation (LOOP UNTIL CLEAN) | Repeat steps 3–6, comparing the new AFTER snapshot to the previous BEFORE | An agent-side loop; see "Worked example: loop until clean" below. | Agent prompt |

Key naming gotchas an agent author needs up front:

- Screenshot tool is `browser_take_screenshot`, not `browser_screenshot`.
- Form-fill tool is `browser_fill_form`, not `browser_fill`.
- `browser_navigate` already returns the post-navigation accessibility
  snapshot inline — calling `browser_snapshot` afterward is optional but
  cheap, and doing both gives the agent a stable artifact ID to reference.
- Console "clear" is not a real upstream tool — see the composition note for
  step 2.
- `browser_run_code_unsafe` evaluates arbitrary Playwright JavaScript in
  the page context. Treat exposure to untrusted prompt input as an RCE
  vector — see "Security" below.

## Worked example: loop until clean

A runnable pattern for an agent driving the validation loop end-to-end. The
agent's prompt programs against this; it is intentionally concrete so the
agent can copy/adapt the call sequence rather than improvise.

Goal: navigate to a target page, trigger a UI flow, assert no console
errors, and loop with a different test fixture if the assertion fails.

Pseudo-tool-calls (use the actual MCP tool shape inside Claude Code):

```text
loop_iteration = 0
fixtures = ["fixtureA", "fixtureB", "fixtureC"]

while loop_iteration < len(fixtures):
  fx = fixtures[loop_iteration]

  # Step 1+2: select target, baseline console.
  browser_navigate { url: "http://localhost:3000/?fixture=" + fx }
  baseline = browser_console_messages { all: true }   # snapshot baseline

  # Step 3: BEFORE artifacts.
  before_dom    = browser_snapshot   { }
  before_pixels = browser_take_screenshot { }
  before_net    = browser_network_requests { static: false }

  # Step 4: Trigger the UI flow under test.
  browser_click     { element: "Submit", ref: <ref from before_dom> }
  browser_wait_for  { text: "Thanks", time: 2 }       # or text-presence

  # Step 5: Observe runtime events that fired DURING the trigger.
  during_console = browser_console_messages { all: false }   # only new messages
  during_net     = browser_network_requests { static: false }

  # Step 6: AFTER artifacts.
  after_dom    = browser_snapshot   { }
  after_pixels = browser_take_screenshot { }

  # "Clean" predicate.
  console_text = during_console.content[0].text
  has_errors   = /Errors: [1-9]/.test(console_text)
  net_failed   = /\b(4\d\d|5\d\d)\b/.test(JSON.stringify(during_net))
  dom_ok       = /text="Thanks"/.test(after_dom.content[0].text)

  if not has_errors and not net_failed and dom_ok:
    return { pass: true, fixture: fx, iterations: loop_iteration + 1 }

  # Step 7: apply fix — the agent decides whether to edit code (out of band)
  # or to retry with a different fixture. Below is the retry-with-fixture
  # branch; the edit-then-restart branch would call edge-debug-launch.sh
  # via Bash and then continue the loop.
  loop_iteration += 1

return { pass: false, fixtures_tried: fixtures }
```

Notes on the loop:

- `browser_console_messages {all:false}` returns only messages emitted since
  the last navigation, which is the diagram's "DURING interaction" window.
- `browser_wait_for` is the supported way to wait for content; do not poll
  with `browser_evaluate` unless `browser_wait_for` won't fit.
- The "fix" branch is the agent's choice. For UI bugs, the fix is a code
  edit + a restart via `tools/edge-mcp/edge-debug-launch.sh`. For data
  bugs, the fix is often a different fixture or a different navigation
  target — no restart required.
- Always cap the iteration count. Six hours of looping is allowed (per the
  Harness post) but uncapped loops mask broken assertions.

## Tools advertised

Default safe inventory verified against `@playwright/mcp@0.0.73` (npm
`@latest`) on 2026-05-01 via `tools/edge-mcp/smoke/smoke.mjs`. Note:
`serverInfo.version` reports `1.60.0-alpha-...` because it surfaces the
bundled `playwright-core` version, not the MCP wrapper version.

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

Default advertised count is 22 because `launch-mcp.sh` enables
`EDGE_MCP_NO_UNSAFE_TOOLS=1` unless explicitly set to `0`. The upstream
unfiltered `@playwright/mcp` inventory still includes
`browser_run_code_unsafe`; the mediator hides it from `tools/list` and
rejects direct `tools/call` attempts.

The smoke test pins the upstream set in `EXPECTED_BASE_TOOLS` and derives
the default safe advertised set by filtering `SECURITY_GATED_TOOLS`. A
live run fails LOUDLY if the upstream:

- removes any tool from this list (regression),
- adds a tool we haven't acknowledged (new tool — update both the
  constant and this list to depend on it intentionally),
- changes the presence or denial behavior of `browser_run_code_unsafe`
  (security-gated tool drift — update `SECURITY_GATED_TOOLS`, the
  mediator, and the Security section).

To regenerate the inventory snapshot before changing the pin:

```bash
node tools/edge-mcp/smoke/smoke.mjs --tool-snapshot | jq .
```

## Verified smoke test (recorded 2026-05-01)

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
```

CDP transport health is the prerequisite. The actual MCP attach loop is
exercised by `tools/edge-mcp/smoke/smoke.mjs`, which spawns
`launch-mcp.sh` over stdio JSON-RPC and asserts:

1. `initialize` returns a `2024-11-05` protocol envelope with a `tools`
   capability and `serverInfo.name == "Playwright"`.
2. `tools/list` advertises exactly the expected safe tool list: the
   upstream inventory in `EXPECTED_BASE_TOOLS` minus `SECURITY_GATED_TOOLS`
   when `EDGE_MCP_NO_UNSAFE_TOOLS` is enabled (no shrink, no
   unacknowledged expansion).
3. With `EDGE_MCP_NO_UNSAFE_TOOLS` enabled, `tools/call
   browser_run_code_unsafe` returns a JSON-RPC denial from the mediator
   before reaching upstream.
4. `tools/call browser_navigate {url:"https://example.com"}` succeeds and
   returns Page URL `https://example.com/` and Page Title `Example Domain`.
5. `tools/call browser_console_messages {all:true}` returns without
   `isError` (proves console-event wiring even when the page emits no
   logs).
6. `tools/call browser_take_screenshot {}` returns either an `image`
   content part or a saved-file reference under `.playwright-mcp/`.
7. `tools/call browser_snapshot` returns an accessibility tree containing
   the `heading "Example Domain"` node.

```bash
$ node tools/edge-mcp/smoke/smoke.mjs
{ "pass": true, "failures": [], "toolCount": 22, "expectedToolCount": 22, "noUnsafeTools": true, ... }
```

This is sufficient evidence the full chain (Edge bind → portproxy
forward → firewall allow → WSL host-IP route → launch-mcp endpoint
resolution → npx fetch → @playwright/mcp stdio → CDP attach → DOM)
is functioning end-to-end.

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
| Edge already running with the owner's main profile (different `--user-data-dir`) | Owner clicked the regular Edge icon before launching debug Edge | The launcher's `Stop-Process -Force msedge` kills *all* msedge.exe, including the owner's main session. Save your work first; this is by owner directive ("Force-kill / restart Edge whenever needed"). Once killed, `edge-debug-launch.sh` relaunches only the Debug profile. The owner's tabs reload from their normal session restore on next manual launch. |
| Smoke reports `tools/list: SHRUNK` after `npm` cache update | Upstream `@playwright/mcp@latest` dropped a tool we relied on | (a) downgrade by pinning a known-good version inside `launch-mcp.sh`, or (b) accept the change: remove the tool from `EXPECTED_BASE_TOOLS` in `smoke.mjs` and from the inventory tables in this doc + `tools/edge-mcp/README.md` |
| Smoke reports `tools/list: EXPANDED — new tools advertised that we don't track` | Upstream added a useful new tool | Decide whether the loop benefits from it. If yes, append the name to `EXPECTED_BASE_TOOLS` and to the inventory tables. If no, the smoke will keep failing until acknowledged — that's intentional, treat it as a documentation drift signal |
| Smoke reports `security-gated tool drift` for `browser_run_code_unsafe` | Upstream renamed/removed the unsafe tool or the mediator stopped filtering it | Update `SECURITY_GATED_TOOLS` in `smoke.mjs`, `filter-unsafe-tools.mjs`, and the Security section here |
| `setup-elevated.sh` declined or partially applied | UAC prompt dismissed mid-flow | Re-run `setup-elevated.sh`. The script is idempotent: each `.cmd` deletes any existing rule before adding the new one, so re-running cannot stack duplicate rules. Verify with `netsh interface portproxy show all` and `netsh advfirewall firewall show rule name=edge-mcp-9222` |
| `cmd.exe` reports `wslpath: Result not representable` | Repo is mounted at a UNC path the launcher can't translate | Move the repo under a normal `/mnt/c/` path, or set `EDGE_EXE_PATH` and `EDGE_DEBUG_PROFILE` to absolute Windows paths |

### Idempotency check for `setup-elevated.sh`

The script is safe to re-run. Each Windows-side `.cmd` deletes any existing
rule before re-adding it:

- `edge-mcp-portproxy.cmd`: `netsh ... portproxy delete v4tov4 ...` then `netsh ... portproxy add v4tov6 ...`. Re-runs replace the rule, never stack duplicates.
- `edge-mcp-firewall.cmd`: `netsh advfirewall firewall delete rule name="edge-mcp-9222"` then `netsh advfirewall firewall add rule name="edge-mcp-9222" ...`. Same pattern.

Verify after each run by inspecting `C:\Users\<user>\edge-mcp-fix.log`,
which is overwritten on each invocation and contains the before/after of
both rule sets.

## Security

`browser_run_code_unsafe` evaluates arbitrary Playwright JavaScript in the
browser context with full `page` object access. Treat any path that lets
unstructured user input flow into a `tools/call browser_run_code_unsafe
{code: ...}` call as an RCE-equivalent vector against the workstation
running Claude Code (not just the Edge tab — the script runs in the
Playwright server process).

Upstream `@playwright/mcp@latest` does **not** expose a flag or config key
to drop a single tool. The `capabilities` config field is purely additive
(it enables extra capability bundles like `vision`, `pdf`, `devtools`);
the `core` capability includes the unsafe tool and there is no way to
opt out of `core`. Verified empirically with `--config` overrides on
2026-05-01.

Therefore the gating mechanism for this repo is
`EDGE_MCP_NO_UNSAFE_TOOLS=1`, enabled by default in `launch-mcp.sh` and
in `tools/edge-mcp/mcp.json`. That mode runs `@playwright/mcp` through
`tools/edge-mcp/filter-unsafe-tools.mjs`, which enforces two behaviors:

1. `tools/list` responses omit `browser_run_code_unsafe`, so agents do
   not discover or plan against the unsafe tool.
2. Any `tools/call` request with `name: "browser_run_code_unsafe"` is
   rejected with JSON-RPC error code `-32001` before it reaches upstream.

Set `EDGE_MCP_NO_UNSAFE_TOOLS=0` only for deliberate local investigation
of upstream MCP behavior. That mode exposes `browser_run_code_unsafe`.

Claude Code permission deny rules can still provide an additional
client-layer defense, but the repo-local load-bearing gate is the
JSON-RPC mediator because it can be verified from this repository.

The `--blocked-origins` and `--allowed-origins` flags exist but are
network-layer controls, not tool-layer. They do not protect against
`browser_run_code_unsafe` (which can `await page.goto` outside any
declared allowlist).

## CI integration

The smoke test does not run on stock GitHub Actions runners because:

- Runners do not have Microsoft Edge installed (they have Chromium
  preinstalled, not the `msedge` channel the launcher targets).
- The launcher requires a working WSL2 ↔ Windows portproxy bridge,
  which is not available in CI containers.
- Edge cold-start is 8–15 seconds with a screen present; the headless
  CI environment exposes a different timing profile we have not validated.

The smoke is therefore a **local-only** check, intended to be run:

- After every change to `tools/edge-mcp/`.
- Before merging anything that touches the Symphony harness.
- Periodically by the owner to detect upstream `@playwright/mcp@latest`
  drift (see "Tools advertised" — the smoke fails LOUDLY on tool-list
  changes).

If/when self-hosted runners with Edge become available, this section
should be replaced with the workflow path. Tracked by `STACK-021`.

## MCP server upgrade story

`launch-mcp.sh` pins `@playwright/mcp@latest` so npm fetches the freshest
release each session. This is fine while the upstream is stable; if a
breaking change ships, the smoke test catches it within the first
post-update run via the tool-list shrink/expansion checks. To pin to a
known-good version after a breaking upstream:

1. Find the last green version: `npm view @playwright/mcp versions | tail -10`.
2. Edit `tools/edge-mcp/launch-mcp.sh`: replace `@playwright/mcp@latest` with
   `@playwright/mcp@<version>`.
3. Re-run `node tools/edge-mcp/smoke/smoke.mjs` to confirm the pinned
   version passes.
4. Note the pin in the "Tools advertised" section above with the date.

## Per-worktree app boot — gap

The Harness Engineering post emphasizes per-worktree app instances so
agents can drive an isolated copy of the application. Our current
`edge-debug-launch.sh` launches a single Edge instance bound to a single
debug port (9222) with a single user-data-dir. Multi-agent / multi-worktree
parallelism would race for that one Edge. Tracked by `STACK-019`.

## Owner directives applied

- Edge (not Chrome). Path: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
- Force-kill / restart Edge whenever needed (launcher does this every run).
- Open outside the active window (positioned at 30000,30000 offscreen).
- Single click on the Start Menu shortcut auto-launches with debug flags.
- Separate `EdgeDebugProfile` user-data-dir so the owner's main browser
  session stays untouched between debug runs.

## Related references

- [`tools/edge-mcp/README.md`](../../tools/edge-mcp/README.md) — operational overview
- [`docs/references/harness-engineering.md`](harness-engineering.md) — source loop being implemented
- [`docs/references/openai_symphony_harness_engineering_stack_diagrams_explained.txt`](openai_symphony_harness_engineering_stack_diagrams_explained.txt) — verbatim diagram description
- [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp) — upstream MCP server
