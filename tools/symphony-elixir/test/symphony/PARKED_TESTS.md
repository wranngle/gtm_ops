# Parked upstream tests

Tests in this directory whose filename ends in `.parked_*` are upstream
test files (`openai/symphony`) that we have **decided not to un-park**.
They sit on disk so that:

  1. We can re-read upstream's intent when shaping our own tests.
  2. Future drift audits can compare our test coverage against
     upstream's by glancing at this file.
  3. Anyone reaching for an upstream patch knows immediately that the
     scaffolding for the parked tests was not silently deleted.

Each parked file carries a suffix that explains the parking reason in
its name. This manifest expands on each suffix and lists the test that
covers the same surface in our codebase.

## `core_test.exs.parked_upstream_only_dispatch_helpers`

**Reason:** depends on `Workflow.workflow_file_path/0`,
`Workspace.create_for_issue/1`, `Codex.runtime_settings/0`, and
`Orchestrator.select_worker_host/0` — most of which are upstream-only
or live in modules we restructured. Specifically: `select_worker_host`
is in the SSH-fanout family that is documented as a permanent
upstream-only feature in `symphony-orchestrator-function-audit.md`.

**Equivalent coverage in our suite:**

  - Config defaults + validation: `test/symphony/config_test.exs` (20 tests)
  - Workflow loader: `test/symphony/workflow_loader_test.exs`
  - Workflow store: `test/symphony/workflow_store_test.exs`
  - Workspace creation + path safety: `test/symphony/workspace_manager_test.exs`,
    `test/symphony/path_safety_test.exs`
  - Codex runtime settings: covered indirectly via
    `test/symphony/codex/app_server_test.exs`
  - Orchestrator dispatch eligibility:
    `test/symphony/orchestrator_test.exs`

## `extensions_test.exs.parked_intentional_adapter_shape`

**Reason:** the file is a 771-line integration suite covering ten
distinct surfaces. Most are already covered separately; the one
genuinely unique surface (Linear GraphQL mutation validation via a
`FakeLinearClient.graphql/2` test seam) depends on a tracker
behaviour signature that intentionally diverges from upstream's per
spec § 11.1 (we thread `Symphony.Config.t()` through every callback;
upstream callbacks are 0/1-arg and read from `Application.get_env`).

The adapter-shape deviation is documented in
`docs/references/symphony-orchestration.md` and discussed at length
in `docs/references/symphony-config-dual-track-audit.md`. We are not
regressing it.

**Equivalent coverage in our suite:**

  - Linear adapter facade: `test/symphony/tracker/linear_test.exs`
  - Linear GraphQL client (incl. mutation error shapes):
    `test/symphony/tracker/linear_client_test.exs`
  - Memory tracker: `test/symphony/tracker/local_markdown_test.exs`,
    `test/symphony/tracker/github_issues_test.exs`
  - Workflow store reload + fallback:
    `test/symphony/workflow_store_test.exs`
  - Phoenix observability API state/issue/refresh/405/404:
    `test/symphony/web/observability_api_controller_test.exs`
    (12 tests after item #2 of drift repair)
  - Phoenix presenter: `test/symphony/web/presenter_test.exs`
  - Dashboard LiveView: `test/symphony/web/dashboard_live_test.exs`
  - HTTP server: `test/symphony/http_server_test.exs`

## `workspace_and_config_test.exs.parked_upstream_only_workspace_helpers`

**Reason:** depends on `Workspace.create_for_issue/1` (a multi-host
SSH-aware factory we have parked alongside the SSH-fanout work),
upstream-shaped label-name handling, and a `revalidate_codex_runtime`
helper that does not exist in our codebase. The runtime
revalidation feature is documented as missing in
`symphony-orchestrator-function-audit.md` under
`revalidate_issue_for_dispatch`.

**Equivalent coverage in our suite:**

  - Workspace path resolution + hooks:
    `test/symphony/workspace_manager_test.exs`
  - Schema field parsing (incl. `tracker.repo`, `tracker.issues_root`,
    `agent.command`): `test/symphony/config_test.exs`
  - Path-safety invariants (spec § 9.5): `test/symphony/path_safety_test.exs`

## Policy

Files in `.parked_*` are not deleted because the original upstream
text is the single source of truth for what behaviour we chose not to
port. If we later decide to port any of them, we move the file back
to `.exs` and reshape the assertions; the parking suffix in the
filename gets removed in the same commit.

If you find yourself wanting to un-park a file: re-read the
"Reason" section above. Most parked tests are blocked on intentional
upstream deviations, not on porting work that's actually missing.
