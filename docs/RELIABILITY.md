# Reliability

Reliability means future agents and reviewers can reproduce the same result from a clean clone.

## Current Checks

```bash
scripts/validate-knowledge-base.sh
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

