---
id: STACK-042
priority: 3
labels: stack,lint,layered-architecture,maintainability
blocked_by:
---
# Lint a per-file size cap under `packages/*/src/`

The Harness Engineering post lists "file size limits" as one of the custom lints they enforce:

> "we statically enforce structured logging, naming conventions for schemas and types, file size limits, and platform-specific reliability requirements with custom lints."

A file-size cap is a cheap legibility multiplier: it forces large modules to be split into small, focused units the agent can reason about end-to-end without summarization. It also discourages the "one-giant-service-file" anti-pattern.

## Acceptance criteria

- A new lint (script or structural test under `packages/agent-evals/tests/`) walks every `.ts(x)` file under `packages/*/src/` and rejects files over a configurable threshold. Reasonable starting bands:
  - Hard cap: 400 lines (lint failure).
  - Warning band: 250 lines (advisory; lint exit 0 but message printed).
- The threshold is a single constant in the lint, easy to tune.
- Test files (`tests/**/*.test.ts`) are exempt — they are allowed to grow with table-driven cases. Fixtures (`fixtures/`) are also exempt.
- The lint runs in `scripts/validate-knowledge-base.sh` and is exercised by `bun test`.
- Each violation tells the agent exactly which file and what the cap is, plus a remediation hint to extract the largest top-level construct into its own module.

## Out of scope

- Counting characters / tokens. Line count is a coarse proxy that the agent can act on without extra tooling.
- Capping function or class size — line cap on the file is the leverage point.

## References

- `docs/references/openai_harness_engineering_original_spec.txt` line 163
- The largest current file in `packages/agent-evals/src/` is `providers/metrics.ts` at ~110 lines, well under any sensible cap; the lint should pass on the existing tree.
