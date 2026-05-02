# Symphony orchestrator.ex function-name divergence audit

Status: First-pass walk complete (2026-05-02)
Owner: wranngle
Follows: `symphony-upstream-drift.md` "Next pass" item #4

## Method

Extracted every top-level `def` and `defp` from upstream
`elixir/lib/symphony_elixir/orchestrator.ex` and our
`tools/symphony-elixir/lib/symphony/orchestrator.ex`. Compared the
sorted name sets. Classified each divergence by category and flagged
upstream-only names that look like spec-mandated behaviour we lack
versus pure renames.

## Counts

| Bucket | Count |
|---|---|
| Names in both files | 26 |
| Upstream-only | 80 |
| Ours-only | 79 |
| Total upstream functions | 106 |
| Total our functions | 105 |

The lopsided "26 in common" number understates how much of the file
is genuinely shared — most upstream-only names have a same-purpose
ours-only counterpart. The audit below groups them.

## Upstream-only functions, classified

### 🔴 Missing behaviours (no equivalent in our codebase)

These are upstream features we do not implement. Most map to spec
sections we acknowledge but have not built.

#### SSH-fanout / multi-host worker dispatch (spec § 8.3)

  - `select_worker_host`, `select_worker_host_for_test`
  - `worker_host_slots_available?`
  - `running_worker_host_count`
  - `least_loaded_worker_host`
  - `preferred_worker_host_available?`
  - `pick_retry_worker_host`
  - `pick_retry_workspace_path`
  - `spawn_issue_on_worker_host`
  - `worker_slots_available?`, `state_slots_available?`
  - `dispatch_slots_available?`
  - `issue_routable_to_worker?`

This is the largest functional gap. Upstream supports
`worker.ssh_hosts`-driven multi-host dispatch where every issue can
be assigned to a remote worker over SSH. Our `Symphony.Workspace`
has the SSH branch stubbed and parked. Our `dispatch_eligible` and
`dispatch_sort_key` cover the local-only path; the remote-host
codepath is not wired.

**Effort estimate**: 400–600 LOC across orchestrator + workspace +
config schema + at least one new test module. Realistically a
multi-week effort. Not recommended unless you actually need
multi-host dispatch.

#### Specific reconcile / lifecycle paths

  - `restart_stalled_issue` — explicit "restart this issue from a
    fresh state" path on stall detection. Our `do_reconcile_stalls`
    detects stalls but the recovery path differs (we terminate +
    requeue; upstream restarts in-place).
  - `revalidate_issue_for_dispatch`,
    `revalidate_issue_for_dispatch_for_test` — re-validate an issue
    after a fetch (catches issues whose state changed between the
    candidate phase and the dispatch phase). We don't have this; our
    `apply_tracker_state_refresh` is reconcile-time, not dispatch-time.
  - `terminate_running_issue`, `terminate_task` — graceful worker
    shutdown for a specific issue. We have `terminate_worker_for`
    which overlaps; needs a per-function diff to confirm.
  - `notify_dashboard` — push update via pubsub from inside the
    orchestrator. Our equivalent
    (`Symphony.Web.ObservabilityPubSub.broadcast_update/0`) lives
    outside the orchestrator and is invoked from
    `StatusDashboard.notify_update/0`. Architectural deviation, not
    a missing behaviour.

### 🟡 Same purpose, different decomposition

These upstream functions have an ours-only counterpart that does
the same job. The divergence is naming and/or how the function is
broken up. No behaviour is missing, but the diff in shape makes
upstream patches harder to apply.

| Upstream | Our equivalent |
|---|---|
| `should_dispatch_issue?` | `dispatch_eligible/2` |
| `candidate_issue?` | `active_candidate?/2` |
| `priority_rank` | (inlined in `dispatch_sort_key/1`) |
| `sort_issues_for_dispatch` | `dispatch_sort_key/1` + caller `Enum.sort_by` |
| `choose_issues` | (inlined in `run_tick/1`) |
| `do_dispatch_issue` | `dispatch_with_preflight/3` |
| `maybe_dispatch` | (inlined in `run_tick/1`) |
| `find_issue_by_id` | (inlined `Enum.find/2` calls) |
| `release_issue_claim` | `release_claim/2` |
| `running_issue_count_for_state` | `filter_per_state_caps/3` |
| `active_issue_state?` | `active_candidate?/2` (combined) |
| `terminal_issue_state?` | (inlined `MapSet.member?` calls) |
| `active_state_set`, `terminal_state_set` | (inlined `MapSet.new/1`) |
| `retry_candidate_issue?` | `requeue_retry/3` (inverted predicate) |
| `reconcile_issue_state`, `reconcile_running_issue_states`, `reconcile_running_issues`, `reconcile_missing_running_issue_ids` | `reconcile_running/2`, `reconcile_tracker_states/2`, `apply_tracker_state_refresh/3` |
| `refresh_running_issue_state` | `apply_tracker_state_refresh/3` |
| `log_missing_running_issue` | (inlined `Logger.warning` call) |
| `compute_token_delta`, `extract_token_delta`, `apply_token_delta`, `get_token_usage`, `extract_token_usage` | `compute_token_deltas/2`, `extract_thread_token_usage/1`, `extract_total_token_usage/1`, `usage_to_token_totals/1` |
| `absolute_token_usage_from_payload`, `turn_completed_usage_from_payload` | `extract_absolute_token_totals/1` |
| `payload_get`, `map_at_path`, `explicit_map_at_paths`, `map_integer_value`, `integer_like`, `integer_token_map?`, `maybe_put_runtime_value` | `map_get/2`, `map_path/2`, `pos_int/1`, `normalize_pos_int/1`, `pick_token/2` |
| `apply_codex_rate_limits`, `rate_limits_from_payload`, `rate_limits_map?`, `rate_limit_payloads` | `maybe_put_rate_limits/2` |
| `failure_retry_delay`, `retry_delay`, `pop_retry_attempt_state`, `next_retry_attempt_from_running`, `normalize_retry_attempt`, `pick_retry_error`, `pick_retry_identifier` | `Symphony.RetryQueue.next_attempt/3` + our `retry_attempt_from_entry/1`, `requeue_retry/3` |
| `handle_retry_issue`, `handle_retry_issue_lookup`, `handle_active_retry` | `handle_retry_due/2` (single combined handler) |
| `running_seconds`, `running_entry_session_id`, `last_activity_timestamp` | `runtime_seconds/1`, inlined `Map.get/2` |
| `codex_app_server_pid_for_update` | `pid_for_update/1` |
| `issue_context` | (inlined `Map.take/2` calls) |
| `issue_created_at_sort_key` | (inlined inside `dispatch_sort_key/1`) |
| `summarize_codex_update` | (inlined inside `update_payload/2`) |
| `refresh_runtime_config` | (covered by `apply_workflow_to_state/2`) |
| `schedule_poll_cycle_start` | (covered by `schedule_tick/1`) |
| `normalize_issue_state` | `normalize_state/1` |
| `todo_issue_blocked_by_non_terminal?` | `blocked_todo?/2` + `blocker_active?/2` |

## Ours-only functions, classified

### 🎯 Documented design deviations (not drift)

These are intentional additions tied to documented requirements.
None are accidental. Migrating them to upstream's shape would lose
real behaviour.

#### Test seams

  - `inject_retry/2`, `inject_running/2`
  - `set_adapter/1`
  - `safe_settings_for_test/0`
  - `tick_now/0`
  - `test_active_issue_state?`, `test_active_state_set`,
    `test_available_slots`, `test_candidate_issue?`,
    `test_issue_routable_to_worker?`, `test_should_dispatch_issue?`,
    `test_terminal_issue_state?`, `test_terminal_state_set`,
    `test_todo_issue_blocked_by_non_terminal?`

These exist so tests can drive the dispatch loop synchronously
without booting timers or seeding the workspace. Upstream's tests
use a different pattern (start the orchestrator + wait for a tick).

#### Snapshot caching + poll visibility (spec § 13.5 + STACK-075)

  - `cached_snapshot/1`, `cache_checking_snapshot/2`,
    `cached_snapshot_checking?/1`
  - `clear_poll_check_cache/0`
  - `mark_poll_check/1`
  - `poll_check_in_progress?/0`, `poll_check_visible?/0`

Surfaces poll-loop state to the dashboard without taking out a
GenServer call on every render. Upstream's dashboard is
inline-rendered so it doesn't need this layer.

#### Tick coalescing (spec § 7.4 / § 8.1)

  - `cancel_pending_tick/1`
  - `run_checking_tick/1`, `run_tick/1`
  - (plus `tick_token` field on state)

Combines back-to-back tick triggers (a `:tick` from the timer + a
`:request_refresh` from the API) into a single tick body so we don't
double-fetch.

#### Startup orphan reaper

  - `reap_orphan_workspace_processes/1`,
    `scan_and_kill_orphans_under/1`
  - `read_session_id/1`, `list_pids/0`

Cleans up zombie codex processes left behind by a previous crashed
orchestrator before resuming dispatch (commit `fcc1396`).

#### Workflow hot-reload

  - `apply_workflow/1`, `apply_workflow_to_state/2`

Live-reload the workflow file without restarting the orchestrator.
Upstream restarts.

#### Refresh request handler

  - `queue_refresh/1`

Backs the `POST /api/v1/refresh` endpoint (commit `d9b951f`).

### 🟡 Inlined private helpers

Names that exist in our file because the same logic exists in
upstream as smaller helpers we collapsed:

  - `map_get`, `map_path`, `pos_int`, `normalize_pos_int`
  - `pick_token`, `phase_status`, `entry_identifier`, `update_method`
  - `update_payload`, `snapshot_payload`, `usage_to_token_totals`
  - `tracked_state`, `send_phase`, `run_worker`
  - `runtime_seconds`, `stall_timeout_ms`, `poll_interval`
  - `settings_agent_max_concurrent`, `settings_tracker_field`
  - `resolve_agent_runner`
  - `startup_preflight`, `build_initial_state`, `initial_state`

## Recommendation

In priority order, if you decide to reduce orchestrator drift:

1. **Decide whether SSH-fanout matters.** If yes, port the
   ~15 missing `worker_host_*` / `select_worker_host*` /
   `spawn_issue_on_worker_host` functions plus the workspace SSH
   branch. ~500 LOC, multi-week. If no, document the divergence
   as a permanent intentional deletion in this file and stop here.

2. **Port `restart_stalled_issue` and `revalidate_issue_for_dispatch`.**
   These are smaller (~80 LOC together) and close real gaps in
   our reconciliation loop. Stall recovery in particular is worth
   having — today our `do_reconcile_stalls` terminates the worker
   but doesn't always fully release the per-state slot before the
   next tick.

3. **Skip the cosmetic divergences.** The 🟡 "same purpose,
   different decomposition" rows are not worth touching. Renaming
   our functions to match upstream just to reduce diff would burn
   3,000+ LOC of churn for zero behaviour change. Better policy:
   when porting an upstream patch in the future, accept that you
   will be hand-translating function names.

4. **Keep all 🎯 ours-only behaviours.** Test seams, snapshot
   caching, tick coalescing, orphan reaper, workflow hot-reload,
   refresh request — these are real value and shouldn't be
   collapsed even if upstream lacks them.

## What this audit does NOT decide

  - Whether any individual upstream-only function has a subtle
    behaviour we accidentally dropped. The audit is by name only;
    a follow-up pass would diff function bodies for the
    🟡-classified pairs.
  - Whether the overall control-flow shape (where these functions
    are called from) has drifted. This is a leaf-node audit; the
    call graph could still differ.
  - Anything about `extensions_test.exs.todo_*` parked tests, which
    are blocked on item #3 (Linear adapter shape) not orchestrator
    drift.
