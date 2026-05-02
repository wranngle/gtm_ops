---
id: STACK-021
priority: 3
labels: stack,edge-mcp,ci,self-hosted-runner
blocked_by:
---
# CI integration for the Edge DevTools MCP smoke

The Edge DevTools MCP smoke (`tools/edge-mcp/smoke/smoke.mjs`) currently runs local-only because:

- Standard GitHub Actions runners do not have Microsoft Edge installed (they ship Chromium, not the `msedge` channel the launcher targets).
- The launcher requires a working WSL2 ↔ Windows portproxy bridge that does not exist in CI containers.
- Edge cold-start timing in headless CI is unvalidated.

## Acceptance criteria — pick a runner story

### Path A — self-hosted Windows runner with Edge

- Provision a self-hosted Windows runner with Edge installed and the portproxy + firewall rules already set up via `tools/edge-mcp/windows/setup-elevated.sh`.
- Add a `.github/workflows/edge-mcp-smoke.yml` job gated by `runs-on: [self-hosted, windows, edge]` that runs the smoke on every change under `tools/edge-mcp/`.
- Replace the "CI integration" section of `docs/references/edge-devtools-mcp.md` with the workflow path and a runner-bring-up runbook.

### Path B — Linux runner with Chromium adapter (lower-fidelity)

- Adapt `launch-mcp.sh` to optionally launch `chromium` headless when `CI=1`, accepting that this exercises the MCP wrapper but not the Edge-on-Windows bridge.
- Run the smoke with the Chromium adapter on `ubuntu-latest`. Document explicitly that this catches MCP-wiring regressions but not Windows-side regressions.
- Keep the Windows path as the canonical pre-merge check.

Either path satisfies the CI requirement. Path A is higher fidelity but requires a real machine; Path B is cheap but partial.

## References

- `docs/references/edge-devtools-mcp.md` ("CI integration" section)
- `tools/edge-mcp/smoke/smoke.mjs`
- `tools/edge-mcp/windows/setup-elevated.sh`
