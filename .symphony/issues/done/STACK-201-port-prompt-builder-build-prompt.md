---
id: STACK-201
priority: 1
labels: stack,symphony-elixir,test-port,prompt-builder
blocked_by:
resolved_by: 8ccb3fd
resolved_at: 2026-05-02
---
# Port PromptBuilder.build_prompt/1 from upstream so prompt rendering covers the parked test

The local `tools/symphony-elixir/lib/symphony/prompt_builder.ex` exists but does
not yet expose the `build_prompt(issue, opts)` shape the parked test
`tools/symphony-elixir/test/symphony/core_test.exs.todo_needs_config_validate_and_prompt_builder`
relies on (specifically the strict-Liquid render path with
`strict_variables: true` / `strict_filters: true`, `attempt` opt support, and
the `Workflow.current/0` -> `prompt_template!/1` -> `parse_template!/1` chain
that re-raises `template_parse_error` and `workflow_unavailable` with structured
messages).

Upstream reference:
`/home/wranngle/projects/symphony-upstream/elixir/lib/symphony_elixir/prompt_builder.ex`
lines 11-26 (`build_prompt/2`) and 28-55 (template/struct conversion helpers).

## Acceptance criteria

- `Symphony.PromptBuilder.build_prompt(issue, opts \\ [])` matches the upstream
  contract (strict Liquid render, `attempt` keyword, struct-to-Solid map).
- The parked test `core_test.exs.todo_needs_config_validate_and_prompt_builder`
  is renamed back to `core_test.exs`.
- `cd tools/symphony-elixir && mix test test/symphony/core_test.exs` passes 100%.
- The full `mix test` suite remains green.

## References

- Parked test: `tools/symphony-elixir/test/symphony/core_test.exs.todo_needs_config_validate_and_prompt_builder`
- Upstream source: `/home/wranngle/projects/symphony-upstream/elixir/lib/symphony_elixir/prompt_builder.ex` (lines 11-26, 28-55)
- Local prompt module: `tools/symphony-elixir/lib/symphony/prompt_builder.ex`
- Workflow loader (already in place): `tools/symphony-elixir/lib/symphony/workflow.ex`

## Standing rule reminder

Copy upstream verbatim unless an intentional deviation is needed; namespace
`SymphonyElixir` -> `Symphony` everywhere; document any deviation in
`docs/references/symphony-orchestration.md` under "Intentional Differences From
Upstream".
