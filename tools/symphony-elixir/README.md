# symphony-elixir

Spec-faithful Symphony orchestrator. Long-running OTP application that polls a
configured tracker, dispatches one agent run per active issue into a per-issue
workspace, reconciles every tick, and exposes a snapshot interface.

Reference spec: <https://github.com/openai/symphony/blob/main/SPEC.md>.

## License

This subtree is a derivative work of OpenAI's Symphony Elixir orchestrator
and is governed by the Apache License, Version 2.0. See `LICENSE-APACHE-2.0`
and `NOTICE` in this directory. The repo-root MIT license does not extend
to this subtree.

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
| 7 Orchestration state machine   | ✓ in-memory state (`running`, `claimed`, `retry_attempts`, `codex_totals`) plus Task-supervised worker dispatch |
| 8 Polling, scheduling, reconciliation | ✓ poll tick honors `polling.interval_ms`, fetches candidates, sorts by `(priority, created_at, identifier)`, dispatches up to `agent.max_concurrent_agents`, reconciles running issues, detects stalls, and redeems retry entries |
| 8.4 Retry + backoff             | ✓ `Symphony.RetryQueue` — continuation 1s, failure exponential `min(10·2^(n-1)·1000, agent.max_retry_backoff_ms)`, active-candidate re-fetch, stale timer ignore, and retry clear on redispatch |
| 9 Workspace management + safety | ✓ `Symphony.WorkspaceManager` — sanitized keys, `<root>/<key>` layout, `created_now` gate, `assert_inside_root!` + `assert_safe_cwd!`, and lifecycle hooks (`after_create`, `before_run`, `after_run`, `before_remove`) with timeout |
| 10.7 Agent runner               | ✓ `Symphony.AgentRunner.LocalShell` plus optional `Symphony.AgentRunner.CodexAppServer` JSON-RPC adapter |
| 11 Tracker integration          | ✓ `Symphony.Tracker` + `Issue` struct + 3 adapters: `Noop`, `LocalMarkdown` (filesystem parity with `scripts/symphony.sh`), `GitHubIssues` (gh CLI) |
| 12 Prompt rendering             | ✓ `Symphony.PromptRenderer` — strict `{{ var }}` substitution with unknown-variable rejection. Full Liquid filters/loops deferred |
| 13.1–13.5 Logging, snapshot, tokens | ✓ `Symphony.Logging` (ECS-jsonl), `Symphony.Logging.Sink` (stderr / file / multi), `Symphony.snapshot/0` with timeout/unavailable errors, live `seconds_running`, delta-aware Codex token totals, and latest rate-limit payload |

## Design notes

- Default agent command is `scripts/bin/llm.sh` (codex-independent), per the
  surrounding repo's WORKFLOW.md. The Codex app-server JSON-RPC adapter is
  available when `agent.runner_kind: codex_app_server` is set or
  `codex.command` points at a non-local-shell command.
- Tracker adapters are pluggable via `tracker.kind`; first targets are
  `local_markdown` (filesystem) and `github_issues` (gh CLI), to match the
  Bash adapter at `scripts/symphony.sh`.
- YAML decoding via `yaml_elixir` (Hex). No NIF deps. Workflow front matter
  is decoded into a plain map; spec-defined keys are documented in the loader.
