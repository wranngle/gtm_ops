---
id: STACK-075
priority: 3
labels: audit,schedulers,orchestrator,dashboard
---
# Orchestrator lacks `request_refresh` API and `checking?` poll-progress flag

## Problem

The dashboard (`Symphony.StatusDashboard`, `Symphony.Web.Live.DashboardLive`) cannot
distinguish between "the orchestrator is waiting for the next scheduled tick" and
"the orchestrator is currently fetching candidates / reconciling." Upstream
exposes both signals through the snapshot:

```elixir
%{
  polling: %{
    checking?: state.poll_check_in_progress == true,
    next_poll_in_ms: next_poll_in_ms(state.next_poll_due_at_ms, now_ms),
    poll_interval_ms: state.poll_interval_ms
  }
}
```

After the recent tick-coalescing patch (commit `c2a19ba`), the local snapshot has
`polling.poll_interval_ms` and `polling.next_poll_in_ms`, but it does NOT have
`polling.checking?`. As a result the dashboard cannot render the upstream
"checking now…" affordance during a long candidate fetch.

Upstream also exposes `Orchestrator.request_refresh/0` so a dashboard button or
operator command can request an out-of-band tick that coalesces with the
scheduled one (returning `%{queued: true, coalesced: true|false}`). The local
port has `tick_now/0` (test-only) which is documented as test-only and lacks
the coalesced/queued contract for operator UX.

## Root cause (spec ref)

* Spec § 8.1 ("Poll Loop") defines the tick lifecycle but does not mandate the
  `checking?` flag explicitly. The flag is a UX expectation captured in
  spec § 13.5 ("StatusDashboard surface"), where the dashboard must distinguish
  idle vs. in-flight ticks.
* Upstream `SymphonyElixir.Orchestrator.handle_call(:request_refresh, ...)`
  (`/home/wranngle/projects/symphony-upstream/elixir/lib/symphony_elixir/orchestrator.ex:1157`)
  is the operator-facing version of `tick_now` with coalescing semantics.

The local port's `tick_now/0` is described in `@doc` as "Test-only; production
uses the timer." There is no public, operator-safe equivalent.

## Fix sketch

Three additive changes, kept small per file:

1. `Symphony.Orchestrator`:
   * Add a `:poll_check_in_progress` boolean to state, set to `true` on tick
     entry and cleared after `run_tick` returns. Expose as `polling.checking?`
     in `snapshot_payload/1`.
   * Add `Orchestrator.request_refresh/0` returning `{:ok, %{queued: true,
     coalesced: bool}}` — coalesces with a pending or in-progress tick by
     checking `state.poll_check_in_progress` and `state.next_poll_due_at_ms`.

2. `Symphony.Web.Presenter`:
   * Surface `polling.checking?` as a presenter-friendly atom (`:idle |
     :checking`). Already passes `:polling` through to LiveView so the
     additional key is automatic once the orchestrator emits it.

3. `Symphony.Web.Live.DashboardLive`:
   * Render "Checking…" badge when `@payload.polling.checking? == true`.

(StatusDashboard CLI snapshot is similar but optional — upstream renders it as
"Polling: checking now…".)

## Acceptance criteria

* `Orchestrator.snapshot()` returns `%{polling: %{checking?: bool, next_poll_in_ms:
  _, poll_interval_ms: _}}` with `checking?` toggled `true` during the body of
  `run_tick/1`.
* `Orchestrator.request_refresh()` returns `{:ok, %{queued: true, coalesced: bool}}`
  and does not double-fire ticks (verified by a test that calls it during a long
  in-progress tick).
* `tools/symphony-elixir/test/symphony/orchestrator_test.exs` adds at least one
  test asserting the `checking?` flag flips during a tick.
* Dashboard LiveView (`@payload.polling.checking?`) renders a badge or status
  indicator distinct from the "next poll in N s" countdown.
