---
id: STACK-043
priority: 3
labels: stack,lint,layered-architecture,providers,boundary-parsing
blocked_by:
---
# Lint that wall-clock time is sampled only inside `providers/`

The Harness Engineering post emphasizes the Providers layer as the **single explicit cross-cutting boundary** for things like clocks:

> "Cross-cutting concerns (auth, connectors, telemetry, feature flags) enter through a single explicit interface: Providers."

In `packages/agent-evals/src/`:

- `providers/clock.ts` exports `Clock` with `nowIso()` (system or fixed) — the canonical entry point.
- `service/evaluator.ts` correctly takes a `Clock` parameter and never samples `Date.now()` itself.
- BUT `providers/logger.ts` and `providers/metrics.ts` reach for `new Date()` / `Date.now()` directly, bypassing the `Clock` provider.

Inside the `providers/` layer this is internally consistent (providers are *the* boundary). What we are missing is mechanical enforcement that **layers other than `providers/` do not sample wall-clock time directly** — which is the rule the post implies.

## Acceptance criteria

- A new lint (or extension of the existing layered-architecture lint) walks every `.ts(x)` file under `packages/*/src/` and flags `Date.now()`, `new Date(`, `performance.now()`, `Math.random()`, and `crypto.randomUUID()` calls outside of `providers/`.
- Inside `providers/` the calls are allowed (that is the point of the layer).
- Violations come with a remediation hint that names the relevant provider abstraction (`Clock`, future `RandomSource`, etc.) and points to `docs/references/layered-domain-architecture.md`.
- A short note is added to `docs/references/layered-domain-architecture.md` explaining the rule, with the working example of `service/evaluator.ts` taking a `Clock`.
- Wired into `scripts/validate-knowledge-base.sh` and exercised by `bun test` via the structural-test suite.

## Out of scope

- Refactoring `providers/logger.ts` and `providers/metrics.ts` to consume `Clock`. That is a separate, smaller change worth filing only if a downstream test needs deterministic timestamps from those providers.

## References

- `docs/references/openai_harness_engineering_original_spec.txt` lines 154–167
- `packages/agent-evals/src/providers/clock.ts`
- `packages/agent-evals/src/service/evaluator.ts` (correct pattern)
