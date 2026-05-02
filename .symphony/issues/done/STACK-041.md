---
id: STACK-041
priority: 2
labels: stack,lint,layered-architecture,naming
blocked_by:
---
# Lint naming conventions for schemas and types in `packages/*/src/`

The Harness Engineering post lists schema/type naming conventions as one of the static lints they enforce:

> "we statically enforce structured logging, naming conventions for schemas and types, file size limits, and platform-specific reliability requirements with custom lints."

The agent-evals package today follows a clear convention by hand: every Zod schema is named `XxxSchema` and the inferred type is named `Xxx` (e.g., `ConversationSchema` → `Conversation`). There is nothing preventing an agent from drifting (`conversationDef`, `conversation_t`, `IConversation`, etc.).

## Acceptance criteria

- A new lint (script or structural test) walks every `.ts` file under `packages/*/src/types/` and `packages/*/src/config/` and asserts:
  - Any `export const` whose initializer is a `z.<something>(…)` call (or a wrapping `z.object`, `z.array`, etc.) is named with a `Schema` suffix and uses `PascalCase` (`ConversationSchema`, not `conversationSchema` or `Conversation_Schema`).
  - Any `export type` whose definition is `z.infer<typeof XxxSchema>` is named `Xxx` (the schema name minus the suffix).
  - Reject `IFoo`-style interfaces (no Hungarian-prefix interfaces).
- The lint is added to `scripts/validate-knowledge-base.sh` and is exercised by `bun test` via the structural-test suite.
- Document the convention in `docs/references/layered-domain-architecture.md` under a new "Naming conventions" section, with a worked example using `ConversationSchema` / `Conversation`.
- Each violation prints an actionable remediation hint (the renamed identifier the agent should use).

## Out of scope

- Linting non-schema constants and functions; this issue is scoped to the schema/type pairing because that is the post's named example.

## References

- `docs/references/openai_harness_engineering_original_spec.txt` line 163
- `packages/agent-evals/src/types/conversation.ts` (current convention exemplar)
