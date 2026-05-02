---
id: STACK-040
priority: 2
labels: stack,lint,layered-architecture,reliability
blocked_by:
---
# Statically enforce structured logging across `packages/*/src/`

The Harness Engineering post lists "structured logging" as one of the custom lints that compounded their leverage:

> "we statically enforce structured logging, naming conventions for schemas and types, file size limits, and platform-specific reliability requirements with custom lints. Because the lints are custom, we write the error messages to inject remediation instructions into agent context."

Right now `packages/agent-evals/src/providers/logger.ts` provides a JSON logger (`createJsonLogger`), and `runtime/cli.ts` uses it. But nothing prevents a future agent from sprinkling `console.log("debug", x)` or `process.stderr.write("…")` calls into `service/`, `repo/`, or `ui/`. Once that pattern lands, agents pattern-match it and the structured-logging contract decays.

## Acceptance criteria

- A new `scripts/lint-structured-logging.sh` (or equivalent extension to an existing lint) walks every `.ts(x)` file under `packages/*/src/` and rejects:
  - `console.{log,info,warn,error,debug,trace}` calls anywhere except `runtime/` (where the bootstrap may emit a startup banner, if at all). The runtime CLI may also use `process.stderr.write` for usage messages.
  - `process.stderr.write` / `process.stdout.write` outside `runtime/`.
  - Log emission via the provider but with a non-string `message` argument or with no fields object when the call sits in a code path that is supposed to be structured.
- The lint is wired into `scripts/validate-knowledge-base.sh` and into the structural test suite under `packages/agent-evals/tests/lint-coverage.test.ts` so it is exercised by `bun test`.
- Each violation prints a remediation hint that names the logger provider and points to `docs/references/layered-domain-architecture.md`.
- Document the rule in `docs/references/layered-domain-architecture.md` under a new "Structured logging" section.

## Out of scope

- Forcing every layer to take a `Logger` parameter. That is a bigger refactor and worth a separate plan.
- Linting log-field naming conventions (e.g., `userId` vs `user_id`); add later if the repo grows enough log surface to need it.

## References

- `docs/references/openai_harness_engineering_original_spec.txt` lines 163–165
- `packages/agent-evals/src/providers/logger.ts`
- `scripts/lint-layered-architecture.sh` (template for the new lint shape, including comment-stripping and remediation messages)
