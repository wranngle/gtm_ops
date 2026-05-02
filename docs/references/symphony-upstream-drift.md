# Symphony upstream drift map

Status: First-pass walk complete (2026-05-02)
Owner: wranngle
Source: `/home/wranngle/projects/symphony-upstream/elixir/` (commit unknown)
Target: `/home/wranngle/projects/wranngle-gtm-engine/tools/symphony-elixir/`

## Method

Diff every file in upstream `elixir/` against its counterpart under our
tree, normalizing the namespace (`SymphonyElixir` → `Symphony`,
`SymphonyElixirWeb` → `Symphony.Web`, `:symphony_elixir` → `:symphony`)
before comparing.

For each file, classify the divergence:

  - **MATCH** — content equivalent after namespace rewrite.
  - **PORTED+EXTENDED** — upstream content present, plus our additions.
  - **PORTED+REWRITTEN** — same purpose, different shape.
  - **OURS-ONLY** — no upstream counterpart.
  - **UPSTREAM-ONLY** — upstream has it, we don't.
  - **STRUCTURAL** — namespace move, behaviour split, or module rename.

For each non-MATCH row, classify the **why**:

  - **🎯** intentional, documented in `docs/references/symphony-orchestration.md`
  - **🟡** intentional, undocumented
  - **❓** unknown / accidental — needs investigation

This document is the map only. It does not propose fixes.

## File inventory

| Side | Count | Notes |
|---|---|---|
| Upstream `elixir/lib/` | 36 | flat-ish; `web/` is sibling to `symphony/` |
| Our `tools/symphony-elixir/lib/` | 47 | +11 ours-only files |
| Upstream `elixir/test/` | 18 | |
| Our `tools/symphony-elixir/test/` | 28 | +10 ours-only + 3 parked `.todo_*` |

## Drift table — `lib/` paired files

Diff line counts are `[<>]` lines after namespace normalization. "Drift"
in 0–999 lines does not always mean reorganization-only; whitespace and
docstring expansion inflate the number heavily.

| Upstream | Our path | Up LOC | Our LOC | Diff | Verdict | Why | Notes |
|---|---|---|---|---|---|---|---|
| `lib/symphony_elixir.ex` | `lib/symphony.ex` + `lib/symphony/application.ex` | 47 | 33+~120 | 58 | **STRUCTURAL** | 🎯 | Upstream packs `Application` into the same file as `SymphonyElixir`; we split into a dedicated `Symphony.Application` and made the root `Symphony` module a thin API surface (`snapshot/0`, `request_refresh/0`). Our application supervisor adds `Symphony.Logging.Sink`, `WorkerSupervisor` (a Task.Supervisor), and gates dashboard children on `:dashboard_autostart?`. |
| `lib/symphony_elixir/agent_runner.ex` | `lib/symphony/agent_runner.ex` + `lib/symphony/agent_runner/local_shell.ex` + `lib/symphony/agent_runner/codex_app_server.ex` | 203 | 96 + 270 + 280 | 257 | **STRUCTURAL** | 🎯 | Upstream is a single 203-line module with the agent attempt logic inline. We made it a behaviour with two adapter implementations (`LocalShell` for codex-independent shell-out, `CodexAppServer` for the JSON-RPC path) plus an `AgentRunner.adapter_for/1` resolver. Documented in `docs/references/symphony-orchestration.md` as the "codex-independent first adapter" deviation. |
| `lib/symphony_elixir/cli.ex` | `lib/symphony/cli.ex` | 191 | 328 | 389 | **PORTED+EXTENDED** | 🟡 | Our CLI adds `validate`, `list`, `once`, `serve`, plus `--workflow` override and `--dry-run`. Upstream has a smaller subcommand surface. **Likely intentional but no doc explains why we have so much more.** |
| `lib/symphony_elixir/codex/app_server.ex` | `lib/symphony/codex/app_server.ex` | 1096 | 1394 | 748 | **PORTED+EXTENDED** | 🟡 | Ours is +298 lines. Adds extra error categories, retry envelope, tool-output truncation. Need a per-function audit to map what's intentional vs accidental drift. |
| `lib/symphony_elixir/codex/dynamic_tool.ex` | `lib/symphony/codex/dynamic_tool.ex` | 209 | 292 | 107 | **PORTED+EXTENDED** | 🟡 | Adds `tool_executor` injection seam (for tests) and a `:tracker_endpoint` override. Useful refactor; not in upstream. |
| `lib/symphony_elixir/config.ex` | `lib/symphony/config.ex` | 154 | 578 | 552 | **PORTED+REWRITTEN** | ❓ | **MAJOR DIVERGENCE.** Upstream is a small wrapper around `Schema.parse/1` returning a typed struct. Ours has dual-track APIs: typed struct path (`settings/0`, `settings!/0`, `server_port/0`, `validate!/0`, `workflow_prompt/0` — ported from upstream) AND a parallel "dotted-key" API (`from_workflow/1` returning `%{raw, resolved, source_path}`, `tracker_kind/1`, `agent_command/1`, etc.) that the orchestrator and runner adapters consume. The dual track is undocumented; suspect this was an early shape we never replaced after the upstream port. |
| `lib/symphony_elixir/config/schema.ex` | `lib/symphony/config/schema.ex` | 557 | 557 | 0 | **MATCH** | — | Byte-identical after namespace rewrite. |
| `lib/symphony_elixir/http_server.ex` | `lib/symphony/http_server.ex` | 88 | 142 | 126 | **PORTED+EXTENDED** | 🟡 | We made it a `Supervisor` (`type: :supervisor`) wrapping the endpoint instead of upstream's GenServer-on-start pattern. We also added `:dashboard_port` and `:dashboard_host` env precedence. |
| `lib/symphony_elixir/linear/adapter.ex` | `lib/symphony/tracker/linear.ex` | 91 | 92 | 135 | **STRUCTURAL** | ❓ | Same line count, but the implementation is fundamentally different. Upstream defines GraphQL mutations (`commentCreate`, `issueUpdate`, state-lookup) inline in this file and runs `Client.graphql/2`. Ours delegates everything to `Symphony.Tracker.Linear.Client` (which has the GraphQL embedded there). The behaviour signature also differs: upstream's `fetch_*` are 0/1-arg; ours are 1/2-arg with config threading per spec § 11.1. We have a zero-arg facade that wraps the config-threaded implementation, but the test fakes (FakeLinearClient stubbing `Client.graphql/2`) don't work with our shape. **This is exactly what `extensions_test.exs.todo_needs_linear_adapter_graphql_facade` complains about.** |
| `lib/symphony_elixir/linear/client.ex` | `lib/symphony/tracker/linear/client.ex` | 586 | 488 | 742 | **PORTED+REWRITTEN** | ❓ | Ours is SMALLER. Upstream has more exhaustive normalization helpers and probably the `graphql/2` test seam ours lacks. Need module-by-module audit. |
| `lib/symphony_elixir/linear/issue.ex` | `lib/symphony/tracker/linear/issue.ex` | 43 | 102 | 131 | **STRUCTURAL** | 🎯 | Upstream defines the `%Linear.Issue{}` struct here (with `assignee_id`, `assigned_to_worker`). We moved the canonical struct to `Symphony.Tracker.Issue` (in `tracker.ex`) and use this file purely for normalization helpers. Spec § 4.1.1 puts the issue struct at the tracker level, so we're more spec-aligned. |
| `lib/symphony_elixir/log_file.ex` | `lib/symphony/log_file.ex` | 80 | 85 | 23 | **PORTED+EXTENDED** | 🟡 | Adds extensive moduledoc; removes upstream's call to `remove_default_console_handler/0` (we keep the default :default handler). Why we keep the default isn't documented. |
| `lib/symphony_elixir/orchestrator.ex` | `lib/symphony/orchestrator.ex` | 1655 | 1955 | 2762 | **PORTED+REWRITTEN** | ❓ | **THE BIGGEST DRIFT.** ~80 upstream-only function names and ~80 ours-only function names (full list at end of this doc). Same line count ballpark but the implementations are deeply different. Upstream functions we appear to lack: `select_worker_host*` (SSH dispatch), `revalidate_issue_for_dispatch` (re-check after fetch), `restart_stalled_issue`, `terminate_running_issue`, `notify_dashboard`. Our additions: snapshot caching layer (`cached_snapshot`, `mark_poll_check`, `poll_check_in_progress`), tick coalescing (`tick_token`, `next_poll_due_at_ms`), test seams (`inject_running`, `inject_retry`, `set_adapter`, `tick_now`, plus a `test_*` family of dispatch-eligibility helpers), recently-added orphan-process reaper (`scan_and_kill_orphans_under`, `read_session_id`, `list_pids`). Needs a structured per-section audit, not a single sitting. |
| `lib/symphony_elixir/path_safety.ex` | `lib/symphony/path_safety.ex` | 50 | 152 | 114 | **PORTED+EXTENDED** | 🟡 | Ours adds `sanitize_key/1`, `assert_inside_root!/2`, `assert_safe_cwd!/2` (the spec § 9.5 invariants). Upstream's file is just `canonicalize/1`. We bundled all three invariants here; upstream keeps them inside `workspace.ex`. Reasonable refactor. |
| `lib/symphony_elixir/prompt_builder.ex` | `lib/symphony/prompt_renderer.ex` | 64 | 210 | 168 | **PORTED+EXTENDED** | 🎯 | Module renamed `PromptBuilder` → `PromptRenderer`. Ours adds a `render/1` shape for direct template + issue + attempt rendering, error categorization (`:template_parse_error`, `:template_render_error` with sub-codes for `:unknown_variable` / `:unknown_filter`), and binding helpers. Bg-agent B added `build_prompt/1` from upstream so existing tests still pass. Module rename is undocumented. |
| `lib/symphony_elixir/specs_check.ex` | `lib/symphony/specs_check.ex` | 175 | 269 | 384 | **PORTED+REWRITTEN** | ❓ | **DIFFERENT TOOL.** Upstream's enforces "@spec declarations adjacent to public APIs" — a static linter on Elixir source. Ours invokes named runtime checks against the spec text (`dispatch_preflight`, `tracker_adapter_kinds`, etc.). Same module name, completely different purpose. Probably needs splitting — keep ours under a different name and re-port upstream's static-spec linter as `Mix.Tasks.Specs.Check`. |
| `lib/symphony_elixir/ssh.ex` | `lib/symphony/ssh.ex` | 100 | 100 | 0 | **MATCH** | — | Byte-identical. |
| `lib/symphony_elixir/status_dashboard.ex` | `lib/symphony/status_dashboard.ex` | 1952 | 2020 | 68 | **PORTED+EXTENDED** | 🎯 | Wholesale-ported upstream + we appended `humanize_event/2` and `recent_events/2` (plus their helpers) for our LiveView's "recent activity" pane. Documented in `docs/references/symphony-orchestration.md` and via inline comment in the file. |
| `lib/symphony_elixir/tracker.ex` | `lib/symphony/tracker.ex` | 46 | 148 | 154 | **PORTED+REWRITTEN** | 🎯 + 🟡 | Behaviour signature is intentionally different (config-threaded per spec § 11.1; documented). The canonical `%Issue{}` struct is defined here (we moved it from `linear/issue.ex`). We have FIVE tracker kinds (`local_markdown`, `github_issues`, `linear`, `linear_memory`, `noop`); upstream has TWO (`memory`, `linear`). The extra adapters are deviations from upstream — `local_markdown` and `github_issues` are documented in `symphony-orchestration.md`; `noop` and `linear_memory` are not. Tracker.adapter/0 zero-arg facade was added recently to satisfy upstream tests. |
| `lib/symphony_elixir/tracker/memory.ex` | `lib/symphony/tracker/memory.ex` | 72 | 83 | 25 | **PORTED+REWRITTEN** | 🎯 | Adapted to the config-threaded behaviour (per the divergence above). Upstream's reads from `Application.get_env`; ours ignores the threaded config and does the same. |
| `lib/symphony_elixir/workflow.ex` | `lib/symphony/workflow.ex` | 123 | 123 | 0 | **MATCH** | — | Byte-identical. |
| `lib/symphony_elixir/workflow_store.ex` | `lib/symphony/workflow_store.ex` | 153 | 308 | 271 | **PORTED+EXTENDED** | 🟡 | Ours doubles the size. Notable additions: file watcher with mtime+size+content-hash polling (upstream has simpler reload logic), last-known-good fallback, force-reload helper, more error categories. Likely a deliberate hardening, but the rationale isn't in any doc. |
| `lib/symphony_elixir/workspace.ex` | `lib/symphony/workspace_manager.ex` | 483 | 354 | 657 | **PORTED+REWRITTEN** | 🟡 | **OURS IS SMALLER.** Module renamed `Workspace` → `WorkspaceManager`. Upstream has SSH-fanout inline (remote-host shell scripts via `SSH.start_port/3`); ours has the SSH branch as a stub (parked, documented in moduledoc). We split the spec § 9.5 invariants into `Symphony.PathSafety`. Missing functions in ours: `create_for_issue/2` (fully present upstream), full SSH workspace creation. Bg-agent B ported `remove_issue_workspaces/1,2` recently. |
| `lib/symphony_elixir_web/components/layouts.ex` | `lib/symphony/web/components/layouts.ex` | 56 | 56 | 0 | **MATCH** | — | |
| `lib/symphony_elixir_web/controllers/observability_api_controller.ex` | `lib/symphony/web/controllers/observability_api_controller.ex` | 63 | 64 | 53 | **UPSTREAM-ONLY routes** | ❓ | Upstream exposes 3 endpoints: `GET /api/v1/state`, `GET /api/v1/:issue_identifier`, `POST /api/v1/refresh`, plus `match :*` 405 returns. Ours exposes only `GET /api/snapshot` (with a missing/incomplete legacy alias). **We are missing the `refresh` endpoint and the per-issue endpoint entirely**, plus the 405 method-not-allowed catches. |
| `lib/symphony_elixir_web/controllers/static_asset_controller.ex` | `lib/symphony/web/controllers/static_asset_controller.ex` | 35 | 36 | 3 | **MATCH** | — | Whitespace only. |
| `lib/symphony_elixir_web/endpoint.ex` | `lib/symphony/web/endpoint.ex` | 32 | 39 | 11 | **PORTED+EXTENDED** | 🟡 | Cookie key renamed (`_symphony_elixir_key` → `_symphony_key`). Added moduledoc. Otherwise equivalent. |
| `lib/symphony_elixir_web/error_html.ex` | `lib/symphony/web/error_html.ex` | 8 | 8 | 0 | **MATCH** | — | |
| `lib/symphony_elixir_web/error_json.ex` | `lib/symphony/web/error_json.ex` | 8 | 13 | 7 | **MATCH** | — | Whitespace only. |
| `lib/symphony_elixir_web/live/dashboard_live.ex` | `lib/symphony/web/live/dashboard_live.ex` | 330 | 368 | 146 | **PORTED+REWRITTEN** | 🟡 | Module path renamed (`Symphony.Web.DashboardLive` → `Symphony.Web.Live.DashboardLive`). Added moduledoc. `:ok = ObservabilityPubSub.subscribe()` softened to `_ = ObservabilityPubSub.subscribe()` (we tolerate pubsub-unavailable). HTML template reformatted. Functionally similar. |
| `lib/symphony_elixir_web/observability_pubsub.ex` | `lib/symphony/web/observability_pubsub.ex` | 25 | 48 | 31 | **PORTED+EXTENDED** | 🟡 | We added `Process.whereis` defensive guards on `subscribe/0` and `broadcast_update/0` (return `{:error, :pubsub_unavailable}` or no-op respectively) plus an arity-1 `broadcast_update/1` for tests. Upstream is unguarded. The "tolerate missing pubsub" pattern lets the dashboard be cleanly disabled. |
| `lib/symphony_elixir_web/presenter.ex` | `lib/symphony/web/presenter.ex` | 200 | 160 | 228 | **PORTED+REWRITTEN** | 🟡 | **OURS IS SMALLER.** Upstream's API takes `(orchestrator_name, snapshot_timeout_ms)`; ours takes a 0-arity `snapshot_fun` (defaulting to `&Symphony.snapshot/0`) — easier test injection. Upstream has `refresh_payload/1`; we don't (matches the missing controller endpoint). Upstream has poll-loop visibility (`polling.checking?`, `next_poll_in_ms`) — we have it too but added later (STACK-075). |
| `lib/symphony_elixir_web/router.ex` | `lib/symphony/web/router.ex` | 41 | 44 | 27 | **PORTED+REWRITTEN** | ❓ | Ours has `live("/", Live.DashboardLive, :index)` (note `Live.` prefix matching the moved module) and a `scope "/api"` with `/snapshot`. Upstream has `scope "/"` with `/api/v1/state`, `/api/v1/:issue_identifier`, `/api/v1/refresh`, plus `match :*` catch-alls. **Same missing-routes story as the controller.** |
| `lib/symphony_elixir_web/static_assets.ex` | `lib/symphony/web/static_assets.ex` | 33 | 42 | 15 | **PORTED+EXTENDED** | 🟡 | Path expand depth (`../../priv/...` vs `../../../priv/...`) reflects our deeper nesting (`tools/symphony-elixir/lib/symphony/web/...` vs `elixir/lib/symphony_elixir_web/...`). Otherwise equivalent. |
| `lib/mix/tasks/pr_body.check.ex` | `lib/mix/tasks/pr_body_check.ex` | 216 | 216 | 0 | **MATCH** | — | Byte-identical. (Note dot vs underscore in filename.) |
| `lib/mix/tasks/specs.check.ex` | `lib/mix/tasks/specs_check.ex` | 53 | 64 | 85 | **PORTED+REWRITTEN** | ❓ | Different tool. Upstream's enforces `@spec` adjacency; ours runs the runtime spec-coverage checker (`Symphony.SpecsCheck.run/1`). The mix-task name even differs (`Mix.Tasks.Specs.Check` vs `Mix.Tasks.Symphony.SpecsCheck`). |
| `lib/mix/tasks/workspace.before_remove.ex` | `lib/mix/tasks/workspace_before_remove.ex` | 140 | 140 | 0 | **MATCH** | — | |

## Files OURS-ONLY (no upstream counterpart)

| Path | Reason | Documented? |
|---|---|---|
| `lib/symphony/application.ex` | Application supervisor extracted from upstream's `symphony_elixir.ex`; adds Logging.Sink, WorkerSupervisor, dashboard gating. | Inline moduledoc. |
| `lib/symphony/agent_runner/local_shell.ex` | LocalShell adapter — codex-independent shell-out path (the deviation that lets us run without a Codex App Server). | 🎯 `symphony-orchestration.md` |
| `lib/symphony/agent_runner/codex_app_server.ex` | CodexAppServer adapter — the JSON-RPC path equivalent to upstream's inline implementation. | Inline moduledoc. |
| `lib/symphony/live_session.ex` | Per-session struct (`session_id`, `thread_id`, `turn_id`, codex pid, token counters). Upstream packs equivalent fields directly into orchestrator state. | 🟡 |
| `lib/symphony/logging.ex` | ECS-jsonl event emitter (`Logging.emit/4`). Upstream uses plain `Logger` calls. | 🟡 |
| `lib/symphony/logging/sink.ex` | Multi-sink configurator (stderr + file). Upstream relies on `LogFile`. | 🟡 |
| `lib/symphony/providers/anthropic.ex` | Anthropic Messages-API provider with prompt-caching support. Used by `tools/dogfood/` LLM chain, not the orchestrator core. | 🟡 |
| `lib/symphony/retry_queue.ex` | Retry-queue logic (`next_attempt/3` exponential backoff). Upstream has equivalent inline in orchestrator. | 🟡 (refactor for testability) |
| `lib/symphony/run_attempt.ex` | RunAttempt struct (issue_id, attempt, phase, status, started_at, error). Upstream uses raw maps. | 🎯 spec § 4.1.5 typed struct |
| `lib/symphony/tracing.ex` | OTLP/HTTP trace emitter for the local Vector observability stack. | 🟡 |
| `lib/symphony/tracker/github_issues.ex` | GitHub Issues tracker adapter (uses `gh` CLI). | 🎯 `symphony-orchestration.md` |
| `lib/symphony/tracker/local_markdown.ex` | Local Markdown tracker adapter (reads `.symphony/issues/`). Default kind in our config. | 🎯 `symphony-orchestration.md` |
| `lib/symphony/tracker/noop.ex` | No-op tracker (always empty list). Useful for orchestrator smoke tests. | 🟡 |
| `lib/symphony/tracker/linear/memory.ex` | A SECOND in-memory Linear adapter (separate from `tracker/memory.ex`). May be redundant — needs review. | 🟡 |
| `lib/symphony/workflow_loader.ex` | Older parser for `WORKFLOW.md` returning the dotted-key map shape. May be redundant given upstream's `workflow.ex` (which we also have, byte-identical). | ❓ |
| `lib/mix/tasks/trace_smoke.ex` | OTLP trace smoke test. Local observability concern. | 🟡 |

## Files UPSTREAM-ONLY (top-level)

| Path | Notes |
|---|---|
| `Makefile` | Upstream's standard targets (setup/build/test/lint/dialyzer/coverage). We don't ship a Makefile — operators run `mix` directly via `mise`. |
| `WORKFLOW.md` (in `elixir/`) | Upstream's reference workflow YAML. We have one at the **repo root** (different tracker config) instead. |
| `AGENTS.md` (in `elixir/`) | Upstream's per-directory agent guidance. We have an `AGENTS.md` at the repo root instead. |
| `mise.toml` (in `elixir/`) | Upstream pins `erlang = "28"`, `elixir = "1.19.5-otp-28"`. We have `.mise.toml` at repo root pinning `erlang = "27"`, `elixir = "1.19.5-otp-27"`. **Drift in toolchain version** (otp-27 vs otp-28). |
| `.gitignore` (in `elixir/`) | Upstream-specific ignores. We rely on the repo-root gitignore. |
| `docs/logging.md`, `docs/token_accounting.md` | Upstream-internal docs. Worth porting / rewriting under our `docs/references/`. |

## API drift summary

The single most important non-namespace divergence: **the observability
API surface.** Upstream exposes a real REST API (state, issue, refresh,
+ method_not_allowed). Ours collapses it to a single snapshot endpoint.
This is also why several upstream tests in `extensions_test.exs` fail
when un-parked.

Second-most: **the tracker behaviour signature.** Upstream's callbacks
are `fetch_*/0,1`; ours are `fetch_*/1,2` with `Symphony.Config.t()`
threaded as the first arg per spec § 11.1. This is intentional but it
breaks the upstream test fixtures that mock `Tracker.adapter()` and
call zero-arg fetchers.

Third-most: **the dual config API.** Upstream has one path:
`Workflow.current → Schema.parse → typed struct`. Ours has two: that
path AND a parallel `from_workflow → %{raw, resolved, source_path}`
path that the orchestrator uses. The dual track is the most likely
source of accidental drift in `orchestrator.ex` (which has 80+
function-name divergences from upstream).

## Test-suite drift

| Upstream test | Our equivalent | Status |
|---|---|---|
| `app_server_test.exs` | `agent_runner/codex_app_server_test.exs` + `codex/app_server_test.exs` | Split |
| `cli_test.exs` | `cli_test.exs` | Diverged |
| `core_test.exs` | parked `.todo_needs_agent_runner_run_appserver_run_select_worker_host` | **Parked**, needs more upstream functions |
| `dynamic_tool_test.exs` | `codex/dynamic_tool_test.exs` | Diverged |
| `extensions_test.exs` | parked `.todo_needs_linear_adapter_graphql_facade` | **Parked**, blocked on Linear adapter rewrite |
| `live_e2e_test.exs` | `live_e2e_test.exs` | Tagged `:live_e2e`, excluded from default |
| `log_file_test.exs` | `log_file_test.exs` | Diverged |
| `observability_pubsub_test.exs` | `observability_pubsub_test.exs` | Diverged (we softened the no-pubsub test for our lifecycle) |
| `orchestrator_status_test.exs` | `orchestrator_test.exs` | Diverged |
| `specs_check_test.exs` | `specs_check_test.exs` | **Tests different tool** (see `specs_check.ex` row above) |
| `ssh_test.exs` | `ssh_test.exs` | Ported |
| `status_dashboard_snapshot_test.exs` | `status_dashboard_snapshot_test.exs` | Ported, all 6 fixtures |
| `workspace_and_config_test.exs` | parked `.todo_needs_create_for_issue_label_names_revalidate_codex_runtime` | **Parked**, blocked on `WorkspaceManager.create_for_issue` and 6+ other functions |
| `mix/tasks/pr_body_check_test.exs` | `mix/tasks/pr_body_check_test.exs` | Ported |
| `mix/tasks/specs_check_task_test.exs` | (none) | **Missing.** We deleted upstream's task test. |
| `mix/tasks/workspace_before_remove_test.exs` | `mix/tasks/workspace_before_remove_test.exs` | Ported |
| `support/snapshot_support.exs` | `support/snapshot_support.exs` | Ported |
| `support/test_support.exs` | `support/test_support.exs` | Ported, alias-adapted |
| `support/live_e2e_docker/*` | (none) | **Missing.** Upstream ships docker-compose + entrypoint for live_e2e; we don't. |

Tests we have that upstream doesn't (10):
`agent_runner/local_shell_test.exs`, `codex/dynamic_tool_test.exs`,
`config_test.exs`, `http_server_test.exs`, `live_session_test.exs`,
`logging_test.exs`, `path_safety_test.exs`, `prompt_renderer_test.exs`,
`providers/anthropic_test.exs`, `retry_queue_test.exs`,
`run_attempt_test.exs`, `status_dashboard_test.exs`, `tracing_test.exs`,
`tracker/github_issues_test.exs`, `tracker/linear_client_test.exs`,
`tracker/linear_issue_test.exs`, `tracker/linear_test.exs`,
`tracker/local_markdown_test.exs`, `web/dashboard_live_test.exs`,
`web/observability_api_controller_test.exs`, `web/presenter_test.exs`,
`workflow_loader_test.exs`, `workflow_store_test.exs`,
`workspace_manager_test.exs`. (Several are tests for our
ours-only modules.)

## Toolchain / harness drift

| Item | Upstream | Ours | Verdict |
|---|---|---|---|
| Erlang/OTP | 28 | 27 | ❓ (intentional pin or stale?) |
| Elixir | 1.19.5-otp-28 | 1.19.5-otp-27 | ❓ |
| Top-level Makefile | yes | no | 🟡 (we use mise+mix directly) |
| `WORKFLOW.md` location | `elixir/WORKFLOW.md` | `<repo-root>/WORKFLOW.md` | 🎯 (we run from repo root, not from the elixir subtree) |
| `AGENTS.md` location | `elixir/AGENTS.md` | `<repo-root>/AGENTS.md` | 🎯 |
| `mix.exs` deps | upstream + our additions | +`req`, +`yaml_elixir` (we ship), all upstream deps present | match-ish |

## Documentation upstream has that we don't

- `elixir/docs/logging.md` — log-key contract reference.
- `elixir/docs/token_accounting.md` — § 13.5 token-aggregation rules.
- `elixir/AGENTS.md` — operator-facing agent guidance for the elixir subtree.

## Top-level repo (above `elixir/`)

| Upstream | Ours | Notes |
|---|---|---|
| `SPEC.md` | `docs/references/openai_symphony_original_spec.txt` | We mirror it as a reference text. Same content. |
| `LICENSE` (Apache 2.0) | (no `LICENSE` file in our repo) | We don't ship a LICENSE for the Symphony port; upstream's Apache 2.0 covers code we ported. **Potential compliance gap** — should check NOTICE distribution requirements. |
| `NOTICE` | (none) | Apache 2.0 NOTICE file. Should be retained per the license. |
| `README.md` | `README.md` (different) | Ours focuses on the broader `wranngle-gtm-engine` project, not just Symphony. |
| `.codex/skills/{push,pull,commit,linear,land,debug}/SKILL.md` | (some equivalents under `~/.dotfiles`) | Upstream ships agent skill bundles; we have our own. Worth diffing. |
| `.codex/skills/land/land_watch.py` | (none) | PR-watching python script. We have shell equivalents in `tools/dogfood/`. |
| `.github/media/symphony-demo.{mp4,jpg}` | (none) | Demo assets. |

## Function-name divergence in `orchestrator.ex` (raw)

For reference, since this is the most-drifted file. **80 upstream-only**
function names, **80 ours-only**. Names that signal real missing
behaviour (not just internal renames):

Upstream-only that look like they implement spec-mandated behaviour
the orchestrator should have:

  - `select_worker_host`, `select_worker_host_for_test`,
    `worker_host_slots_available`, `running_worker_host_count`,
    `least_loaded_worker_host`, `preferred_worker_host_available`,
    `pick_retry_worker_host`, `spawn_issue_on_worker_host` —
    SSH-fanout dispatch (spec § 8.3 `worker.ssh_hosts`). **Missing.**
  - `revalidate_issue_for_dispatch`, `revalidate_issue_for_dispatch_for_test` —
    re-check after fetch. **Missing.**
  - `restart_stalled_issue` — explicit stall recovery path. **We have
    `do_reconcile_stalls` which may overlap.**
  - `terminate_running_issue`, `terminate_task` — graceful worker
    shutdown. **We have `terminate_worker_for` which may overlap.**
  - `notify_dashboard` — push update via pubsub. **Likely overlaps with
    our `Symphony.Web.ObservabilityPubSub.broadcast_update/0`.**
  - `should_dispatch_issue`, `candidate_issue`, `priority_rank`,
    `sort_issues_for_dispatch` — central dispatch eligibility / sorting.
    **We have `dispatch_eligible`, `dispatch_sort_key` and a `test_*`
    family — semantics may differ.**
  - `apply_codex_rate_limits`, `rate_limits_from_payload`,
    `rate_limits_map`, `rate_limit_payloads` — rate-limit aggregation.
    **We may have under different names.**
  - `compute_token_delta`, `extract_token_delta`,
    `apply_token_delta`, `get_token_usage`,
    `absolute_token_usage_from_payload`, `turn_completed_usage_from_payload` —
    token accounting. **We have `compute_token_deltas`,
    `extract_thread_token_usage`, `extract_total_token_usage` — may overlap.**
  - `pop_retry_attempt_state`, `next_retry_attempt_from_running`,
    `normalize_retry_attempt`, `retry_candidate_issue`, `retry_delay`,
    `failure_retry_delay`, `pick_retry_*` — retry-queue helpers. **We
    have a `Symphony.RetryQueue` module with overlapping
    responsibility.**

Ours-only that we know about:

  - `reap_orphan_workspace_processes`, `scan_and_kill_orphans_under`,
    `read_session_id`, `list_pids` — startup orphan reaper (just added).
  - `cached_snapshot`, `cache_checking_snapshot`,
    `cached_snapshot_checking`, `mark_poll_check`,
    `clear_poll_check_cache`, `poll_check_visible`,
    `poll_check_in_progress` — snapshot caching layer.
  - `tick_token`, `tick_now`, `cancel_pending_tick`, `schedule_tick` —
    tick coalescing per spec § 7.4 / § 8.1.
  - `inject_running`, `inject_retry`, `set_adapter`,
    `safe_settings_for_test`, the entire `test_*` family — test seams.
  - `run_checking_tick`, `run_tick` — tick body.
  - `queue_refresh`, `request_refresh` — explicit-refresh handler.
  - Many small helpers (`map_get`, `map_path`, `pos_int`,
    `normalize_pos_int`, `pick_token`, `entry_identifier`,
    `phase_status`, etc.) that look like inlinings of upstream
    private code.

## Next pass

This document is the truth-finding pass. The natural follow-ups,
in priority order:

1. ~~Pick the dual-config-API drift apart in `config.ex`~~ — **done
   2026-05-02**, see `symphony-config-dual-track-audit.md`. Verdict:
   dotted-key track is needed today, blocked on 4 concrete Schema
   gaps. Three dead-code accessors deleted. Next move: PR (a) from
   the audit's migration plan — add `Tracker.repo`,
   `Tracker.issues_root`, `Agent.command` to `Schema`.
2. Port the missing observability API endpoints (`refresh`, per-issue,
   405 catch-alls) so the upstream `extensions_test.exs` becomes
   un-parkable.
3. Decide on the Linear adapter shape: rewrite ours so the
   `Client.graphql/2` test seam works (matches upstream), or document
   the deviation and rewrite the parked test.
4. Audit the `orchestrator.ex` function-name divergence systematically.
   ~80 upstream functions, ~80 ours; map every pair and flag any
   missing behaviours.
5. Decide on the `specs_check.ex` rewrite — keep our runtime checker
   and re-port upstream's static-spec linter as a sibling task, or
   collapse to one of the two.
6. Compliance: add `LICENSE` and `NOTICE` files for the Apache-2.0
   inheritance from upstream code we ported wholesale.
7. Toolchain: decide whether otp-27 vs otp-28 is intentional.
