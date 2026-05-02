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
```

## Planned Checks

```bash
bun test
pytest
```

## Standards

- Every fixture-backed workflow must be runnable without external services.
- Every boundary must parse and validate input before business logic uses it.
- Test output should identify the failing domain and next remediation step.
- UI validation should include before/after screenshots once the ops console exists.
- Runtime logs should be structured once runtime services exist.
- Symphony workspaces must stay under `.symphony/workspaces`.
- Symphony actual agent execution must remain opt-in.

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
