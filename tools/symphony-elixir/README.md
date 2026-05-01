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

```bash
# install Elixir + Erlang/OTP if not present:
sudo apt-get install -y elixir erlang

# from this directory:
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
| 7 Orchestration state machine   | scaffolded; running/retry/codex_totals tracked, no real dispatch yet |
| 8 Polling, scheduling, reconciliation | poll tick scheduled; reconcile/dispatch land in T-3+ |
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
