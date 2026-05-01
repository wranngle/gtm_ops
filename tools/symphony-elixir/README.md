# symphony-elixir

Spec-faithful Symphony orchestrator. Long-running OTP application that polls a
configured tracker, dispatches one agent run per active issue into a per-issue
workspace, reconciles every tick, and exposes a snapshot interface.

Reference spec: <https://github.com/openai/symphony/blob/main/SPEC.md>.

## Status

This is the active rewrite of the Bash one-shot adapter at `scripts/symphony.sh`.
Both run side-by-side until parity is reached. Slice progress lives in
`docs/exec-plans/active/003-stack-canonicalization.md` (TD-007 slices T-1
through T-8).

## Run

The repo's `.mise.toml` pins Erlang 27 + Elixir 1.19.5-otp-27. If you have
[mise](https://mise.jdx.dev) installed, `cd` into the repo to auto-activate.
First time only:

```bash
curl -fsSL https://mise.run | sh
mise install                # reads .mise.toml in the repo
```

From this directory:

```bash
mix deps.get
mix compile
mix test
mix run --no-halt   # boots the supervision tree and starts polling
```

`SYMPHONY_WORKFLOW_FILE` (env) overrides the default `WORKFLOW.md` path.

## Layout

```
mix.exs                          Project + deps (yaml_elixir, jason).
config/config.exs                Compile-time config defaults.
lib/symphony.ex                  Top-level public API (snapshot, reload).
lib/symphony/application.ex      OTP entry; starts the supervisor.
lib/symphony/workflow_loader.ex  Parses WORKFLOW.md (front matter + body).
lib/symphony/orchestrator.ex     GenServer owning runtime state + poll tick.
test/symphony/                   ExUnit tests per module.
```

## Spec coverage

| Section | Status |
|---|---|
| 5 Workflow file format          | ✓ loader parses front matter + body, dotted-path getters |
| 5.3 + 6 Typed config layer      | ✓ `Symphony.Config` — defaults, env `$VAR` resolution, typed getters |
| 7 Orchestration state machine   | ✓ in-memory state (`running`, `claimed`, `retry_attempts`, `codex_totals`); real dispatch lands in T-6 |
| 8 Polling, scheduling, reconciliation | ✓ poll tick honors `polling.interval_ms`, fetches candidates, sorts by `(priority, created_at, identifier)`, dispatches up to `agent.max_concurrent_agents`. Stall-detection lands in T-8 |
| 9 Workspace management + safety | ✓ `Symphony.WorkspaceManager` — sanitized keys, `<root>/<key>` layout, `created_now` gate, `assert_inside_root!` + `assert_safe_cwd!`, hook execution with timeout |
| 10.7 Agent runner               | ✓ `Symphony.AgentRunner.LocalShell` — pipes prompt through `agent.command`, captures stdout, fires `before_run`/`after_run` hooks. Codex JSON-RPC variant deferred |
| 11 Tracker integration          | ✓ `Symphony.Tracker` + `Issue` struct + 3 adapters: `Noop`, `LocalMarkdown` (filesystem parity with `scripts/symphony.sh`), `GitHubIssues` (gh CLI) |
| 12 Prompt rendering             | ✓ `Symphony.PromptRenderer` — strict `{{ var }}` substitution with unknown-variable rejection. Full Liquid filters/loops deferred |
| 9 Workspace management          | not yet (T-5) |
| 10 Agent runner protocol        | not yet (T-6) |
| 11 Tracker integration          | not yet (T-7) |
| 13 Logging + observability      | not yet (T-8) |

## Design notes

- Default agent command is `scripts/bin/llm.sh` (codex-independent), per the
  surrounding repo's WORKFLOW.md. The Codex app-server JSON-RPC adapter from
  spec section 10 is a separate later slice.
- Tracker adapters are pluggable via `tracker.kind`; first targets are
  `local_markdown` (filesystem) and `github_issues` (gh CLI), to match the
  Bash adapter at `scripts/symphony.sh`.
- YAML decoding via `yaml_elixir` (Hex). No NIF deps. Workflow front matter
  is decoded into a plain map; spec-defined keys are documented in the loader.
