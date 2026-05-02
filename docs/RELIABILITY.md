# Reliability

Reliability means future agents and reviewers can reproduce the same result
from a clean clone.

## Current Checks

```bash
scripts/validate-knowledge-base.sh
scripts/lint-layered-architecture.sh
scripts/gardener.sh
scripts/symphony.sh validate
scripts/symphony.sh once --dry-run --limit 1
tests/symphony-completion-helpers.sh
```

## Planned Checks

```bash
bun test
pytest
tools/ops-console/smoke.sh
```

## Standards

- Every fixture-backed workflow must be runnable without external services.
- Every boundary must parse and validate input before business logic uses it.
- Test output should identify the failing domain and next remediation step.
- UI validation should include before/after screenshots once the ops console exists.
- UI/app boot helpers must write worktree-local runtime files under
  `.symphony/runtime/` and must not assume global ports.
- Runtime logs should be structured once runtime services exist.
- Symphony workspaces must stay under `.symphony/workspaces`.
- Symphony actual agent execution must remain opt-in.
- Symphony PR merge must remain opt-in through the configured merge environment variable.
- Review packets must be reproducible from local commands and fixture-backed UI artifacts when live browser capture is unavailable.

## Live-boot verification rule

Unit-passing is a necessary but **insufficient** signal that infrastructure
slices work. Booting against live downstream services has, repeatedly, surfaced
real bugs the unit tests could not catch:

- LLM-suggested docker image tags that did not exist on the registry.
- Vector VRL config rejected by the actual installed Vector version due to
  fallibility constraints invisible at lint time.
- "OTLP HTTP/JSON" metrics emitter wire-incompatible with both Vector's OTel
  source and VictoriaMetrics's `/opentelemetry` intake (both required
  protobuf, not JSON).
- Edge binding `[::1]:9222` instead of `127.0.0.1:9222`, defeating
  same-version-of-the-flag portproxy rules.
- Bash CLI rendering a prompt **after** `cd`'ing into the workspace, breaking
  every relative path the prompt referenced — silently passed dry-run because
  dry-run does not `cd`.

The rule: when an infrastructure slice (compose stack, networking, agent
runner, tracker adapter, observability sink) lands, run the slice end-to-end
against its real downstream — not a mock — before claiming the slice is done.
Document the live verification in the plan or commit body.

## Per-Worktree Runtime Files

Agents should discover live local services from runtime files instead of
hardcoded ports:

- Edge CDP: `.symphony/runtime/edge-port` and
  `.symphony/runtime/edge-debug.json`.
- Ops console: `.symphony/runtime/ops-console-port` and
  `.symphony/runtime/ops-console.json`.

`tools/edge-mcp/edge-debug-launch.sh` defaults to `EDGE_DEBUG_PORT_RANGE=9222-9322`.
`tools/ops-console/ops-console.sh` defaults to
`OPS_CONSOLE_PORT_RANGE=8501-8599`. Both ranges are configurable so parallel
worktrees can run without colliding.
