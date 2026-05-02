---
id: STACK-044
priority: 3
labels: stack,lint,layered-architecture,boundary-parsing
blocked_by:
---
# Lint that JSON.parse / unknown-shape JSON only appears inside `repo/` or `config/`

The Harness Engineering post is explicit about parsing data shapes at every boundary:

> "we require Codex to parse data shapes at the boundary, but are not prescriptive on how that happens (the model seems to like Zod, but we didn't specify that specific library)."
>
> "we don't probe data 'YOLO-style'—we validate boundaries or rely on typed SDKs so the agent can't accidentally build on guessed shapes."

In `packages/agent-evals/src/` today the rule is followed by hand:

- `repo/conversation-repo.ts` does `JSON.parse(raw)` then immediately calls `ConversationFileSchema.parse(parsed)`.
- `config/settings.ts` uses Zod on the env object.

Nothing prevents a future agent from sprinkling `JSON.parse` calls into `service/`, `runtime/`, or `ui/` and treating the result as `any`.

## Acceptance criteria

- A new lint (or structural test) walks every `.ts(x)` file under `packages/*/src/` and rejects `JSON.parse(` appearing anywhere outside `repo/`, `config/`, or `providers/`. Those three are the places where untyped data legitimately enters the domain.
- Bonus: flag any `JSON.parse(...)` whose immediate next statement is not a `*.parse(` (Zod) or equivalent runtime validation. This is a stricter rule and may produce false positives — start with the layer-restriction version and tighten later.
- Each violation prints a remediation hint that names Zod (or the existing schema in `types/`) and points to `docs/references/layered-domain-architecture.md` "Boundary parsing".
- Wired into `scripts/validate-knowledge-base.sh` and `bun test`.

## Out of scope

- Fetching from network APIs (`fetch`, `axios`); that is its own boundary worth filing separately if/when we land HTTP clients.
- Inferring schemas from TS types automatically.

## References

- `docs/references/openai_harness_engineering_original_spec.txt` lines 154 + 220
- `packages/agent-evals/src/repo/conversation-repo.ts`
- `packages/agent-evals/src/config/settings.ts`
