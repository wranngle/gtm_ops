---
id: STACK-200
priority: 1
labels: stack,symphony-elixir,test-port,config
blocked_by:
---
# Port Symphony.Config.validate!/0 from upstream so the parked core_test passes

The Elixir daemon at `tools/symphony-elixir/` is missing
`Symphony.Config.validate!/0`. The parked test
`tools/symphony-elixir/test/symphony/core_test.exs.todo_needs_config_validate_and_prompt_builder`
expects `Config.validate!/0` to return `:ok` or `{:error, {:invalid_workflow_config, message}}`
(plus `:missing_linear_project_slug` and `{:unsupported_tracker_kind, kind}`
shapes) with detailed schema-error messages keyed by dotted path
(`polling.interval_ms`, `agent.max_turns`, `tracker.active_states`,
`codex.command`, `codex.approval_policy`, `codex.thread_sandbox`).

The matching upstream implementation lives at
`/home/wranngle/projects/symphony-upstream/elixir/lib/symphony_elixir/config.ex`
lines 94-99 (`validate!/0`) and 117-134 (`validate_semantics/1`). Note that
upstream only knows `linear` and `memory`, so the local port must extend the
supported-kind list to include `local_markdown` and `github_issues` to match
the existing `Symphony.Config.tracker_kind/1` resolver.

## Acceptance criteria

- Implement (or wire up) `Symphony.Config.validate!/0` so the parked test
  passes verbatim.
- Rename `tools/symphony-elixir/test/symphony/core_test.exs.todo_needs_config_validate_and_prompt_builder`
  back to `core_test.exs`.
- `cd tools/symphony-elixir && mix test test/symphony/core_test.exs` passes 100%.
- The full suite (`mix test`) still passes after the rename.

## References

- Parked test: `tools/symphony-elixir/test/symphony/core_test.exs.todo_needs_config_validate_and_prompt_builder`
- Upstream source: `/home/wranngle/projects/symphony-upstream/elixir/lib/symphony_elixir/config.ex` (lines 94-99, 117-134)
- Upstream `PromptBuilder` for the companion `build_prompt/1` covered by the
  same test file: `/home/wranngle/projects/symphony-upstream/elixir/lib/symphony_elixir/prompt_builder.ex` (lines 11-26)
- Local config module: `tools/symphony-elixir/lib/symphony/config.ex`
- Existing dispatch preflight (do not regress): same file, lines 275-306

## Standing rule reminder

Copy upstream verbatim unless an intentional deviation is needed; namespace
`SymphonyElixir` -> `Symphony` everywhere; document any deviation in
`docs/references/symphony-orchestration.md` under "Intentional Differences From
Upstream".
