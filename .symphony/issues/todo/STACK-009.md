---
id: STACK-009
priority: 3
labels: stack,ci,edge-mcp,smoke
blocked_by:
---
# Decide where Edge MCP smoke tests run, since GitHub runners cannot drive a desktop browser

`tools/edge-mcp/smoke/smoke.mjs` exists to validate the agent-driven UI loop (Edge DevTools MCP -> agent -> screenshot diff). It is intentionally absent from `.github/workflows/knowledge-base.yml` because `ubuntu-latest` runners have no GUI Edge instance. Today this means the smoke contract is only exercised on developer laptops, which means it bit-rots.

Acceptance criteria:

- Decide and document one of: (a) keep smoke tests strictly local, with a periodic devbox-driven scheduled run that uploads artifacts to a Symphony issue; (b) add a Windows runner job that installs Edge and runs the smoke; (c) replace Edge with a headless-browser equivalent (Playwright in container) for CI while keeping Edge MCP for interactive agent runs.
- If keeping local-only, add a `last_run` ratchet: a Markdown file (e.g. `tools/edge-mcp/smoke/LAST_RUN.md`) that records `commit-sha + UTC timestamp + pass/fail`. The doc-gardener (`scripts/gardener.sh`) should warn when the recorded commit is more than 30 days behind `HEAD`.
- If adding a Windows runner job, confirm the Edge MCP install script (`tools/edge-mcp/install-mcp.sh`) is idempotent on a fresh runner and add a corresponding job to `.github/workflows/knowledge-base.yml`.
- `docs/references/edge-devtools-mcp.md` is updated to reflect the chosen path.
