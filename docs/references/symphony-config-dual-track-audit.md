# Symphony Config dual-track audit

Status: Audit complete (2026-05-02)
Owner: wranngle
Follows: `symphony-upstream-drift.md` "Next pass" item #1

## Question

`Symphony.Config` exposes two parallel APIs over the same `WORKFLOW.md`:

  1. **Typed-struct track (upstream-shaped)** — `settings/0` and
     `settings!/0` return a `Symphony.Config.Schema.t()` produced by
     `Schema.parse/1`. Access is by struct field
     (`settings!().tracker.kind`, `settings!().agent.max_concurrent_agents`).
     The `Schema` module is byte-identical to upstream's after the
     namespace rewrite.
  2. **Dotted-key track (ours-only)** — `from_workflow/1` returns
     `%{raw: map(), resolved: map(), source_path: binary()}` where
     `resolved` is keyed by dotted strings (`"tracker.kind"`,
     `"agent.command"`, ...). Access is via getter functions
     (`Config.tracker_kind/1`, `Config.workspace_root/1`, ...).

Question for this audit: **is the dotted-key track needed at all, or
can every consumer move to the typed-struct track?**

## Answer

**The dotted-key track is needed today.** Removing it would require
four concrete changes; until those land, both tracks must coexist.
This document enumerates exactly what blocks the collapse so a
follow-up PR can do it deterministically.

## What the dotted-key track provides that the typed track doesn't

After this audit's dead-code sweep (see "Dead-code deleted in this
pass" below), four functional capabilities remain unique to the
dotted-key track:

### 1. Schema lacks `tracker.repo`

  - **Used by** `lib/symphony/tracker/github_issues.ex:227` —
    `Config.tracker_repo(config)` resolves the `owner/repo` slug used
    when shelling out to `gh issue list -R ...`.
  - **Why it's missing upstream** — upstream Symphony has only
    `:linear` and `:memory` tracker kinds; the `:github_issues`
    adapter is ours-only.
  - **What's needed** — add `field(:repo, :string)` to
    `Schema.Tracker`, plus an env-resolution pass on it (mirrors how
    `api_key` is resolved through `resolve_secret_setting/2`).

### 2. Schema lacks `tracker.issues_root`

  - **Used by** `lib/symphony/tracker/local_markdown.ex:77` —
    `Map.get(config.resolved, "tracker.issues_root")` resolves to the
    on-disk directory containing per-state markdown issue files.
  - **Why it's missing upstream** — `:local_markdown` is ours-only.
  - **What's needed** — add `field(:issues_root, :string,
    default: ".symphony/issues")` to `Schema.Tracker` AND extend the
    Schema's path-resolution to anchor it against the workflow file's
    directory (see #4).

### 3. Schema lacks `agent.command` separate from `codex.command`

  - **Used by** `lib/symphony/agent_runner/local_shell.ex:107` —
    `Config.agent_command(config)` resolves the command our
    `LocalShell` adapter shells out to. Our typical config sets
    `agent.command: scripts/bin/llm.sh` while leaving
    `codex.command` at its default `codex app-server`.
  - **Why it's missing upstream** — upstream has only the Codex
    runner; the `LocalShell` adapter is the codex-independent first
    deviation documented in `symphony-orchestration.md`.
  - **What's needed** — add `field(:command, :string)` to
    `Schema.Agent`, with env resolution. Decide whether to also
    add `agent.runner_kind` to Schema or keep it as a runtime-only
    override (currently read via
    `Map.get(config.resolved, "agent.runner_kind")` in
    `lib/symphony/agent_runner.ex:81`).

### 4. Schema does not anchor relative paths to `workflow_dir`

  - **Used by** the `from_workflow/1` constructor — `@path_resolvable`
    fields (`workspace.root`, `tracker.issues_root`) get resolved
    against `Path.dirname(source_path)` so the daemon's CWD doesn't
    silently change behaviour.
  - **Why it's missing upstream** — upstream's `Schema` calls
    `Path.expand/1` on `workspace.root` (anchors to CWD) but never
    anchors against the workflow file. This is fine for upstream
    because its operator runbook always invokes from the elixir
    project root. We invoke from a different CWD (`mix run` from
    `tools/symphony-elixir/`, a `Mix.Tasks.Symphony.Serve` from the
    repo root, the dashboard from yet a third location), so we
    explicitly anchor.
  - **What's needed** — `Schema.parse/1` would have to take an
    optional `:workflow_dir` argument (or `Schema.parse_with_anchor/2`)
    that gets threaded into `resolve_path_value/2` and analogous
    helpers. Spec § 6.1 / § 9.1 mandate this anchoring; upstream just
    happens to skip it.

## What the typed track provides that the dotted track doesn't

For completeness, fields the typed `Schema` knows about that the
dotted `@defaults` map doesn't reproduce. None of these are blocking
— they're available via `settings!()` already and consumers that
need them call into the typed track directly.

  - `tracker.assignee` (linear adapter)
  - `worker.ssh_hosts`, `worker.max_concurrent_agents_per_host`
    (multi-host SSH dispatch — currently unimplemented)
  - `agent.max_turns`
  - `agent.max_concurrent_agents_by_state`
  - `codex.approval_policy`, `codex.thread_sandbox`,
    `codex.turn_sandbox_policy`
  - `hooks.{after_create, before_run, after_run, before_remove}` —
    available via `Config.hook_script/2` from the dotted track too,
    but the typed accessors come pre-wired with empty-string handling
  - `observability.{dashboard_enabled, refresh_ms,
    render_interval_ms}` (read directly via `settings!()` in
    `status_dashboard.ex`)
  - `server.{port, host}` (read via `Config.server_port/0` from the
    typed track today)

## Migration cost estimate

To eliminate the dotted-key track entirely, in priority order:

1. **Schema additions** (~120 LOC) — `Tracker.repo`, `Tracker.issues_root`,
   `Agent.command`, optionally `Agent.runner_kind`. New env-resolution
   passes for the secret/path fields.
2. **Schema path anchoring** (~80 LOC) — extend `parse/1` with an
   optional `workflow_dir` argument, thread it through
   `resolve_path_value/2`. Update upstream-ported tests if any rely
   on the unanchored shape.
3. **Migrate ~15 lib files** away from `Config.X(config)` to either
   `Config.settings!().X` (zero-arg facade) or a config-threaded
   `Config.X(settings)` shape. Files in scope:
     - `lib/symphony/orchestrator.ex` (heaviest — ~10 call sites)
     - `lib/symphony/cli.ex` (3 call sites)
     - `lib/symphony/tracker.ex` + adapters (5 files, ~12 call sites)
     - `lib/symphony/agent_runner.ex` + adapters (3 files, ~8 sites)
     - `lib/symphony/codex/app_server.ex` (~6 sites)
     - `lib/symphony/workspace_manager.ex` (~5 sites)
     - `lib/symphony/specs_check.ex` (constructor + getters)
     - `lib/symphony/prompt_renderer.ex` (1 site —
       `Config.workflow_prompt/0`, already typed-track-compatible)
4. **Migrate ~12 test files** that build `%{raw, resolved, source_path}`
   stubs by hand. Largest in `test/symphony/orchestrator_test.exs`
   and `test/symphony/codex/app_server_test.exs`.
5. **Decide on tracker behaviour signature** — our tracker callbacks
   are `fetch_*/1,2` taking `Config.t()` (per spec § 11.1); upstream's
   are `fetch_*/0,1`. Migrating to typed-struct config means picking
   between (a) keeping the threaded shape with `Schema.t()` as the
   threaded arg, or (b) collapsing to upstream's zero-arg-with-global
   shape. (a) keeps spec compliance; (b) restores upstream test
   compatibility (see `extensions_test.exs.todo_needs_linear_adapter_graphql_facade`).
6. **Delete the dotted-key surface** — `from_workflow/1`, all
   `Config.tracker_*/1`, `Config.agent_*/1`, `Config.codex_*/1`,
   `Config.workspace_root/1`, `Config.hooks_timeout_ms/1`,
   `Config.hook_script/2`, the `@defaults` / `@env_resolvable` /
   `@path_resolvable` module attributes, the `get_string/2`,
   `get_string!/2`, `pos_int!/2`, `csv/2`, `fetch_raw/2`,
   `do_fetch/2`, `maybe_resolve_env/2`, `resolve_env/1`,
   `maybe_resolve_path/3`, `resolve_path/2` private helpers, and the
   `t()` typespec.

**Total estimate: 800–1,500 LOC change across ~30 files.** Should
be split into at least three PRs: (a) Schema additions + path
anchoring, (b) lib migration, (c) test migration + dotted-track
deletion.

## Dead-code deleted in this pass

Removed in the same commit as this audit:

  - `Config.log_path/1` (and its `"log_path"` default + env- /
    path-resolvable entries) — defined but never called from any
    `lib/` consumer.
  - `Config.agent_require_explicit_run?/1` (and its
    `"agent.require_explicit_run"` default) — defined but only
    referenced in `test/symphony/config_test.exs`. Test assertions
    removed in the same commit.
  - `"tracker.handoff_state" => "human_review"` default — present in
    `@defaults` but never read by any caller. The `human_review`
    state is referenced as a string elsewhere; no one actually reads
    this config key.

Net: -19 lines from `config.ex`, -3 lines from `config_test.exs`. No
behaviour change.

## Recommendation

Proceed with the migration as a multi-PR sequence in the order
above. The Schema additions (PR a) are independently useful and
unblock the rest. Until then, both tracks remain.

The smallest follow-up that delivers operational value: PR (a)
alone, which eliminates "Schema doesn't know about it" as a reason
for `tracker_repo`, `tracker_issues_root`, and `agent_command` to
live in the dotted track. Even without migrating any consumers,
this would let new code reach for `settings!().tracker.repo`
naturally, slowing dotted-track growth.
