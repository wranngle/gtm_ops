---
id: STACK-078
priority: 3
labels: stack,symphony,follow-ups,workflow
blocked_by:
---
# Add an agent-filed follow-up task contract

The Symphony article says agents often notice improvements during
implementation or review and file follow-up issues for humans to evaluate and
schedule later. That keeps the current task focused while preserving useful
discoveries for the orchestrator.

This repo has a local Markdown tracker and external tracker adapters, but
`WORKFLOW.md` does not yet tell agents when or how to file follow-up tasks.
There is also no helper that creates a correctly shaped `.symphony` issue with
links back to the source task. The result is that out-of-scope discoveries are
either dropped or folded into the current task.

## Acceptance criteria

- Document the decision rule in `WORKFLOW.md`: when an agent should create a
  follow-up, when it should update docs/tests in the current task, and when it
  should ask for human judgment instead.
- Add a local helper for Markdown-backed follow-ups that creates the next
  available issue id, writes required front matter (`id`, `priority`, `labels`,
  `blocked_by`), links the source task, and leaves the new issue in `todo`.
- For GitHub Issues or Linear-backed workflows, document the equivalent tracker
  write path and keep it in the agent toolchain, not orchestrator business
  logic.
- `scripts/symphony.sh list` or the Elixir tracker tests cover a fixture with a
  follow-up issue so priority, blocked_by, and active-state behavior remain
  correct.
- The new helper must not create follow-ups from generated build output,
  dependency vendor directories, or private-source material.

## References

- `docs/references/openai_symphony_original_spec.txt` line 61.
- `docs/references/openai_symphony_harness_engineering_stack_diagrams_explained.txt`
  lines 522, 567, and 801.

