defmodule Symphony.Orchestrator do
  @moduledoc """
  Symphony orchestrator GenServer.

  Owns the scheduling state for the entire daemon: the running map, the
  per-issue claim set, the retry queue, codex token totals, and the live
  rate-limit payload. Other components (workflow store, status surface)
  push and pull through this server's API; workers communicate exclusively
  by message.

  Tick lifecycle (spec § 8.1):

    1. Reconcile running issues
       - Stall detection (spec § 8.5 part A): kill workers whose
         `last_codex_timestamp` (or `started_at`) is older than
         `codex.stall_timeout_ms`. Schedules a failure-driven retry.
       - Tracker state refresh (spec § 8.5 part B): for each running
         issue, fetch its current tracker state. Terminate workers whose
         issue moved to terminal (workspace cleanup) or non-active
         (no cleanup); refresh the snapshot otherwise.
    2. Validate dispatch preflight (spec § 6.3 / § 8.1).
    3. Fetch candidate issues and sort (spec § 8.2).
    4. Dispatch up to `max_concurrent_agents - running_count`, respecting
       per-state caps (spec § 8.3).

  Worker spawn (STACK-011):

    Each dispatched issue becomes a `Task` under `Symphony.WorkerSupervisor`.
    The worker walks the spec § 7.2 phases (PreparingWorkspace ->
    BuildingPrompt -> LaunchingAgentProcess -> InitializingSession ->
    StreamingTurn -> Finishing -> Succeeded/Failed). Phase transitions
    and live-session updates flow back as `{:worker_phase, ...}` and
    `{:codex_worker_update, ...}` messages.

  Retry / backoff (spec § 8.4):

    * Clean worker exit -> `:continuation` retry at +1000ms.
    * Abnormal exit / stall -> `:failure` retry with exponential backoff
      delegated to `Symphony.RetryQueue.next_attempt/3`.

  Snapshot (spec § 13.3, § 13.5):

    Returns `{:ok, %{running: [...], retrying: [...], codex_totals: ...,
    rate_limits: ..., last_tick_at: ..., tracker_kind: ...}}`. The
    `seconds_running` aggregate is composed of cumulative completed-session
    time plus active-session elapsed time computed at snapshot time.
  """

  use GenServer
  require Logger

  alias Symphony.{
    AgentRunner,
    Config,
    LiveSession,
    Logging,
    RetryQueue,
    RunAttempt,
    Tracker,
    Tracing,
    WorkflowLoader,
    WorkspaceManager
  }

  @worker_supervisor Symphony.WorkerSupervisor

  @initial_codex_totals %{
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    seconds_running: 0
  }

  defmodule State do
    @moduledoc """
    Runtime state for the Symphony orchestrator polling loop.

    Mirrors the upstream `SymphonyElixir.Orchestrator.State` struct shape so
    upstream tests that pattern-match on `%Orchestrator.State{}` work without
    modification, while retaining our extra runtime fields (`config`,
    `adapter`, `last_tick_at`, `startup_cleanup_done?`,
    `poll_interval_override_ms`).

    The `codex_rate_limits` field is the Symphony-internal name for what the
    snapshot output map exposes externally as `rate_limits` (matching upstream
    naming). See `snapshot_payload/1`.
    """

    defstruct [
      # ---- upstream fields ----
      :poll_interval_ms,
      :max_concurrent_agents,
      :next_poll_due_at_ms,
      :tick_timer_ref,
      :tick_token,
      poll_check_in_progress: false,
      running: %{},
      completed: MapSet.new(),
      claimed: MapSet.new(),
      retry_attempts: %{},
      codex_totals: nil,
      codex_rate_limits: nil,
      # ---- Symphony-only fields ----
      config: nil,
      adapter: nil,
      last_tick_at: nil,
      startup_cleanup_done?: false,
      poll_interval_override_ms: nil
    ]
  end

  # Spec § 7.4 / § 8.1 tick coalescing notes:
  #   `tick_timer_ref` is the `Process.send_after/3` reference for the next
  #   pending tick; `tick_token` is a `make_ref()` matched in
  #   `handle_info({:tick, token})` so stale timers (from cancelled schedules
  #   or an interleaved manual `tick_now`) are dropped instead of running.
  #   `next_poll_due_at_ms` is the monotonic-clock target for the next tick,
  #   surfaced through the snapshot per spec § 13.5.
  defp initial_state do
    %State{codex_totals: @initial_codex_totals}
  end

  @poll_check_key {__MODULE__, :poll_check_in_progress}
  @snapshot_cache_key {__MODULE__, :snapshot_cache}

  # ============== Public API ==============

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  defp call_snapshot(pid) do
    timeout_ms = Application.get_env(:symphony, :snapshot_timeout_ms, 10_000)

    try do
      GenServer.call(pid, :snapshot, timeout_ms)
    catch
      :exit, {:timeout, _} -> {:error, :timeout}
      :exit, {:noproc, _} -> {:error, :unavailable}
    end
  end

  @spec snapshot() :: {:ok, map()} | {:error, :unavailable | :timeout}
  def snapshot do
    case GenServer.whereis(__MODULE__) do
      nil ->
        {:error, :unavailable}

      pid ->
        if poll_check_visible?() do
          case cached_snapshot() do
            %{} = snapshot ->
              {:ok, snapshot}

            _ ->
              call_snapshot(pid)
          end
        else
          call_snapshot(pid)
        end
    end
  end

  @spec request_refresh() ::
          {:ok, %{queued: true, coalesced: boolean()}} | {:error, :unavailable | :timeout}
  def request_refresh do
    case GenServer.whereis(__MODULE__) do
      nil ->
        {:error, :unavailable}

      pid ->
        if poll_check_visible?() do
          {:ok, %{queued: true, coalesced: true}}
        else
          try do
            GenServer.call(pid, :request_refresh, 10_000)
          catch
            :exit, {:timeout, _} -> {:error, :timeout}
            :exit, {:noproc, _} -> {:error, :unavailable}
          end
        end
    end
  end

  @spec apply_workflow(WorkflowLoader.workflow()) :: :ok | {:error, term()}
  def apply_workflow(workflow) do
    case GenServer.whereis(__MODULE__) do
      nil -> {:error, :unavailable}
      pid -> GenServer.call(pid, {:apply_workflow, workflow}, 10_000)
    end
  end

  @doc "Force one tick synchronously. Test-only; production uses the timer."
  @spec tick_now() :: :ok | {:error, term()}
  def tick_now do
    case GenServer.whereis(__MODULE__) do
      nil -> {:error, :unavailable}
      pid -> GenServer.call(pid, :tick_now, 30_000)
    end
  end

  @doc """
  Test seam: replace the running map with a synthetic entry. Used by
  unit tests that need to exercise stall detection or reconciliation
  without spawning a real worker.
  """
  @spec inject_running(binary(), map()) :: :ok | {:error, :unavailable}
  def inject_running(issue_id, entry) when is_binary(issue_id) and is_map(entry) do
    case GenServer.whereis(__MODULE__) do
      nil -> {:error, :unavailable}
      pid -> GenServer.call(pid, {:inject_running, issue_id, entry}, 5_000)
    end
  end

  @doc """
  Test seam: swap the tracker adapter to a test-only module.
  """
  @spec set_adapter(module()) :: :ok | {:error, :unavailable}
  def set_adapter(module) when is_atom(module) do
    case GenServer.whereis(__MODULE__) do
      nil -> {:error, :unavailable}
      pid -> GenServer.call(pid, {:set_adapter, module}, 5_000)
    end
  end

  @doc """
  Test seam: insert a retry entry directly so branch tests can drive
  the § 8.4 retry handler without waiting for wall-clock backoff.
  """
  @spec inject_retry(binary(), map()) :: :ok | {:error, :unavailable}
  def inject_retry(issue_id, retry_entry) when is_binary(issue_id) and is_map(retry_entry) do
    case GenServer.whereis(__MODULE__) do
      nil -> {:error, :unavailable}
      pid -> GenServer.call(pid, {:inject_retry, issue_id, retry_entry}, 5_000)
    end
  end

  # ============== Test seams (upstream-compatible) ==============
  # These public helpers expose private dispatch-eligibility logic so the
  # core test suite can exercise the rules without spinning up the full
  # GenServer + tracker stack. Mirrors upstream
  # `SymphonyElixir.Orchestrator.should_dispatch_issue_for_test/2` and
  # `sort_issues_for_dispatch_for_test/1` (orchestrator.ex lines 310-328).
  # State construction in tests is intentionally minimal — only the fields
  # named below need to be populated; absent fields default to empty maps
  # / sets. Active/terminal state membership reads from
  # `Config.settings!()` so tests do not need to seed `state.config`.

  alias Symphony.Tracker.Issue

  @doc false
  @spec should_dispatch_issue_for_test(Issue.t(), term()) :: boolean()
  def should_dispatch_issue_for_test(%Issue{} = issue, %State{} = state) do
    test_should_dispatch_issue?(issue, state, test_active_state_set(), test_terminal_state_set())
  end

  def should_dispatch_issue_for_test(_issue, _state), do: false

  @doc false
  @spec sort_issues_for_dispatch_for_test([Issue.t()]) :: [Issue.t()]
  def sort_issues_for_dispatch_for_test(issues) when is_list(issues) do
    Enum.sort_by(issues, &dispatch_sort_key/1)
  end

  defp test_should_dispatch_issue?(
         %Issue{} = issue,
         %State{running: running, claimed: claimed} = state,
         active_states,
         terminal_states
       ) do
    test_candidate_issue?(issue, active_states, terminal_states) and
      not test_todo_issue_blocked_by_non_terminal?(issue, terminal_states) and
      not MapSet.member?(claimed || MapSet.new(), issue.id) and
      not Map.has_key?(running || %{}, issue.id) and
      test_available_slots(state) > 0
  end

  defp test_should_dispatch_issue?(_issue, _state, _active_states, _terminal_states), do: false

  defp test_candidate_issue?(%Issue{} = issue, active_states, terminal_states) do
    test_issue_routable_to_worker?(issue) and
      test_active_issue_state?(issue.state, active_states) and
      not test_terminal_issue_state?(issue.state, terminal_states)
  end

  defp test_issue_routable_to_worker?(%Issue{assigned_to_worker: assigned})
       when is_boolean(assigned),
       do: assigned

  defp test_issue_routable_to_worker?(_issue), do: true

  defp test_todo_issue_blocked_by_non_terminal?(
         %Issue{state: state_name, blocked_by: blockers},
         terminal_states
       )
       when is_binary(state_name) and is_list(blockers) do
    normalize_state(state_name) == "todo" and
      Enum.any?(blockers, fn
        %{state: blocker_state} when is_binary(blocker_state) ->
          not test_terminal_issue_state?(blocker_state, terminal_states)

        _ ->
          true
      end)
  end

  defp test_todo_issue_blocked_by_non_terminal?(_issue, _terminal_states), do: false

  defp test_terminal_issue_state?(state_name, terminal_states) when is_binary(state_name) do
    MapSet.member?(terminal_states, normalize_state(state_name))
  end

  defp test_terminal_issue_state?(_state_name, _terminal_states), do: false

  defp test_active_issue_state?(state_name, active_states) when is_binary(state_name) do
    MapSet.member?(active_states, normalize_state(state_name))
  end

  defp test_active_issue_state?(_state_name, _active_states), do: false

  defp test_active_state_set do
    settings = safe_settings_for_test()
    states = settings_tracker_field(settings, :active_states) || ["Todo", "In Progress"]

    states
    |> Enum.map(&normalize_state/1)
    |> Enum.reject(&(&1 == ""))
    |> MapSet.new()
  end

  defp test_terminal_state_set do
    settings = safe_settings_for_test()

    states =
      settings_tracker_field(settings, :terminal_states) ||
        ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"]

    states
    |> Enum.map(&normalize_state/1)
    |> Enum.reject(&(&1 == ""))
    |> MapSet.new()
  end

  # The parsed Schema is an Ecto struct (no Access behaviour), but the
  # default-fallback path returns a plain map. Read via struct field
  # accessors when the input is the schema; fall back to map lookup
  # otherwise so both shapes work.
  defp settings_tracker_field(%{tracker: tracker}, field) when is_map(tracker) do
    Map.get(tracker, field)
  end

  defp settings_tracker_field(_settings, _field), do: nil

  defp settings_agent_max_concurrent(%{agent: agent}) when is_map(agent) do
    Map.get(agent, :max_concurrent_agents)
  end

  defp settings_agent_max_concurrent(_settings), do: nil

  defp safe_settings_for_test do
    Config.settings!()
  rescue
    _ ->
      %{
        tracker: %{
          active_states: ["Todo", "In Progress"],
          terminal_states: ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"]
        }
      }
  end

  defp test_available_slots(%State{max_concurrent_agents: max, running: running})
       when is_integer(max) and max > 0 do
    max(max - map_size(running || %{}), 0)
  end

  defp test_available_slots(%State{running: running}) do
    settings = safe_settings_for_test()
    max = settings_agent_max_concurrent(settings) || 10
    max(max - map_size(running || %{}), 0)
  end

  # ============== Callbacks ==============

  @impl true
  def init(_opts) do
    case build_initial_state() do
      {:ok, state} ->
        clear_poll_check_cache()

        # Spec § 8.6 startup terminal workspace cleanup. Best-effort: a fetch
        # failure is logged and ignored so the daemon still boots.
        state = run_terminal_workspace_cleanup(state)

        # Reap subprocesses leaked by a prior BEAM that was SIGKILL'd
        # (LocalShell's setsid -w + group-kill cleanup only fires on
        # graceful shutdown; ungraceful BEAM termination leaves bash +
        # llm.sh trees alive). Scans /proc for processes whose cwd is
        # under our `workspace.root` and SIGKILLs their session group.
        state = reap_orphan_workspace_processes(state)
        # Spec § 8.1: "schedules an immediate tick, and then repeats every
        # `polling.interval_ms`." The first tick is delay=0 so the daemon
        # does not idle for a full poll interval before fetching candidates.
        state = schedule_tick(state, 0)
        {:ok, state}

      {:error, reason} ->
        {:stop, reason}
    end
  end

  @impl true
  def handle_call(:snapshot, _from, state) do
    {:reply, {:ok, snapshot_payload(state)}, state}
  end

  def handle_call({:apply_workflow, workflow}, _from, state) do
    {new_state, reply} = apply_workflow_to_state(state, workflow)
    {:reply, reply, new_state}
  end

  def handle_call(:tick_now, _from, state) do
    # Spec § 7.4 idempotency: a manual tick coalesces with the scheduled
    # one. Cancel the pending timer (and invalidate its token) before
    # running, then re-arm so the next tick is `interval_ms` from now
    # rather than racing with a stale timer.
    state = cancel_pending_tick(state)
    new_state = run_checking_tick(state)
    new_state = schedule_tick(new_state, poll_interval(new_state))
    {:reply, :ok, new_state}
  end

  def handle_call(:request_refresh, _from, state) do
    {new_state, coalesced?} = queue_refresh(state)
    {:reply, {:ok, %{queued: true, coalesced: coalesced?}}, new_state}
  end

  def handle_call({:inject_running, issue_id, entry}, _from, state) do
    new_state = %{
      state
      | running: Map.put(state.running, issue_id, entry),
        claimed: MapSet.put(state.claimed, issue_id)
    }

    {:reply, :ok, new_state}
  end

  def handle_call({:set_adapter, module}, _from, state) do
    {:reply, :ok, %{state | adapter: module}}
  end

  def handle_call({:inject_retry, issue_id, retry_entry}, _from, state) do
    new_retry = Map.put(retry_entry, :issue_id, issue_id)

    new_state = %{
      state
      | retry_attempts: Map.put(state.retry_attempts, issue_id, new_retry),
        claimed: MapSet.put(state.claimed, issue_id)
    }

    {:reply, :ok, new_state}
  end

  @impl true
  # Spec § 7.4 idempotency: tick coalescing. The token in the message
  # must match the orchestrator's current `tick_token`, otherwise the
  # message came from a cancelled timer and is dropped. This prevents
  # overlapping ticks when `tick_now`, an `apply_workflow` reload, or a
  # rescheduled timer fires while a stale `:tick` message is still in
  # the mailbox.
  def handle_info({:tick, token}, %{tick_token: token} = state) when is_reference(token) do
    state = %{state | tick_timer_ref: nil, tick_token: nil, next_poll_due_at_ms: nil}
    new_state = run_checking_tick(state)
    new_state = schedule_tick(new_state, poll_interval(new_state))
    {:noreply, new_state}
  end

  def handle_info({:tick, _stale_token}, state), do: {:noreply, state}

  # Backward-compat: untokenized `:tick` (used by tests that send the
  # raw atom). Treated as a coalesced tick that always re-arms the
  # next interval.
  def handle_info(:tick, state) do
    state = cancel_pending_tick(state)
    new_state = run_checking_tick(state)
    new_state = schedule_tick(new_state, poll_interval(new_state))
    {:noreply, new_state}
  end

  # ---- Worker lifecycle messages ----

  def handle_info({:worker_phase, issue_id, phase, payload}, state)
      when is_binary(issue_id) and is_atom(phase) and is_map(payload) do
    case Map.get(state.running, issue_id) do
      nil ->
        {:noreply, state}

      entry ->
        %RunAttempt{} = attempt = entry.attempt || %RunAttempt{}

        new_attempt = %RunAttempt{
          attempt
          | phase: phase,
            status: phase_status(phase),
            error: payload[:error] || attempt.error,
            workspace_path: payload[:workspace_path] || attempt.workspace_path
        }

        new_running = Map.put(state.running, issue_id, %{entry | attempt: new_attempt})
        {:noreply, %{state | running: new_running}}
    end
  end

  def handle_info({:codex_worker_update, issue_id, %{event: _, timestamp: _} = update}, state)
      when is_binary(issue_id) do
    case Map.get(state.running, issue_id) do
      nil ->
        {:noreply, state}

      entry ->
        {new_session, token_delta, rate_limits} = integrate_codex_update(entry.session, update)
        new_running = Map.put(state.running, issue_id, %{entry | session: new_session})

        new_state =
          state
          |> Map.put(:running, new_running)
          |> apply_codex_token_delta(token_delta)
          |> maybe_put_rate_limits(rate_limits)

        {:noreply, new_state}
    end
  end

  def handle_info({:DOWN, ref, :process, _pid, reason}, state) do
    case find_issue_id_for_ref(state.running, ref) do
      nil ->
        {:noreply, state}

      issue_id ->
        {entry, state_after_pop} = pop_running_entry(state, issue_id)
        state_after_pop = record_session_completion_totals(state_after_pop, entry)

        new_state =
          case reason do
            :normal ->
              # Spec § 7.1: clean worker exit -> 1s continuation retry so
              # the orchestrator can re-check whether the issue still
              # needs another worker session.
              Logger.info(
                "symphony.worker.exit outcome=normal issue_id=#{issue_id} identifier=#{entry_identifier(entry)}"
              )

              state_after_pop
              |> complete_issue(issue_id)
              |> schedule_issue_retry(issue_id, entry, :continuation, nil)

            other ->
              Logger.warning(
                "symphony.worker.exit outcome=abnormal issue_id=#{issue_id} identifier=#{entry_identifier(entry)} reason=#{inspect(other)}"
              )

              schedule_issue_retry(
                state_after_pop,
                issue_id,
                entry,
                :failure,
                "agent exited: #{inspect(other)}"
              )
          end

        {:noreply, new_state}
    end
  end

  def handle_info({:retry_due, issue_id, retry_token}, state) do
    case Map.get(state.retry_attempts, issue_id) do
      %{retry_token: ^retry_token} = retry_entry ->
        # Re-fetch the issue and re-dispatch if still candidate-eligible.
        new_state = handle_retry_due(state, issue_id, retry_entry)
        {:noreply, new_state}

      _ ->
        # Stale timer (token mismatch or already cleared); ignore.
        {:noreply, state}
    end
  end

  def handle_info(msg, state) do
    Logger.debug("symphony.orchestrator.ignored_message #{inspect(msg)}")
    {:noreply, state}
  end

  # ============== State construction ==============

  defp build_initial_state do
    case WorkflowLoader.load() do
      {:ok, workflow} ->
        Logger.info("symphony.workflow_loaded path=#{workflow.source_path}")
        {state, _} = apply_workflow_to_state(initial_state(), workflow)

        case startup_preflight(state) do
          :ok -> {:ok, state}
          {:error, reason} -> {:error, reason}
        end

      {:error, reason} ->
        Logger.warning("symphony.workflow_load_failed reason=#{inspect(reason)}")
        {:ok, initial_state()}
    end
  end

  defp startup_preflight(%{config: nil}), do: {:error, :startup_config_unavailable}

  defp startup_preflight(%{config: config}) do
    case Config.validate_dispatch_preflight(config) do
      :ok ->
        :ok

      {:error, reason} = error ->
        Logging.emit(:error, "symphony.startup.preflight_failed", :failure,
          message: "startup aborted",
          fields: %{reason: inspect(reason)}
        )

        Logger.error("symphony.startup.preflight_failed reason=#{inspect(reason)}")
        error
    end
  end

  defp apply_workflow_to_state(state, workflow) do
    with {:ok, config} <- Config.from_workflow(workflow),
         {:ok, adapter} <- Tracker.adapter_for(config) do
      {%{state | config: config, adapter: adapter}, :ok}
    else
      {:error, reason} = err ->
        Logger.warning("symphony.workflow_apply_failed reason=#{inspect(reason)}")
        {state, err}
    end
  end

  # ============== Tick body ==============

  defp run_tick(%{config: nil} = state) do
    Logger.debug("symphony.tick.skipped reason=no_config_loaded")
    %{state | last_tick_at: DateTime.utc_now()}
  end

  defp run_tick(state) do
    state
    |> reconcile_running()
    |> dispatch_with_preflight()
    |> Map.put(:last_tick_at, DateTime.utc_now())
  end

  defp run_checking_tick(state) do
    state = mark_poll_check(state, true)

    try do
      run_tick(state)
    after
      :persistent_term.put(@poll_check_key, false)
    end
    |> mark_poll_check(false)
  end

  defp queue_refresh(state) do
    coalesced? = state.poll_check_in_progress or is_reference(state.tick_timer_ref)

    cond do
      state.poll_check_in_progress ->
        {state, true}

      true ->
        new_state =
          state
          |> Map.put(:poll_check_in_progress, true)
          |> schedule_tick(0)
          |> cache_checking_snapshot()

        {new_state, coalesced?}
    end
  end

  # Spec § 6.3 / § 8.1: per-tick dispatch preflight. On failure, skip
  # dispatch but keep reconciliation active and emit an operator-visible
  # warning.
  defp dispatch_with_preflight(state) do
    case Config.validate_dispatch_preflight(state.config) do
      :ok ->
        dispatch_eligible(state)

      {:error, {:dispatch_preflight, reasons}} ->
        Logging.emit(:warning, "symphony.dispatch.preflight_failed", :failure,
          message: "dispatch skipped",
          fields: %{reasons: Enum.map(reasons, &Atom.to_string/1)}
        )

        Logger.warning(
          "symphony.dispatch.preflight_failed reasons=#{Enum.join(Enum.map(reasons, &Atom.to_string/1), ",")}"
        )

        state
    end
  end

  # Spec § 8.5: stall detection + tracker state refresh.
  defp reconcile_running(state) do
    state
    |> reconcile_stalled_running_issues()
    |> reconcile_tracker_states()
  end

  # Spec § 8.5 part A: stall detection. Kill any worker whose elapsed
  # time since `last_codex_timestamp` (or `started_at`) exceeds
  # `codex.stall_timeout_ms`; queue a failure retry.
  defp reconcile_stalled_running_issues(%{config: config} = state) do
    timeout_ms = stall_timeout_ms(config)

    cond do
      timeout_ms <= 0 -> state
      map_size(state.running) == 0 -> state
      true -> do_reconcile_stalls(state, timeout_ms)
    end
  end

  defp do_reconcile_stalls(state, timeout_ms) do
    now = DateTime.utc_now()

    Enum.reduce(state.running, state, fn {issue_id, entry}, acc ->
      elapsed_ms = stall_elapsed_ms(entry, now)

      if is_integer(elapsed_ms) and elapsed_ms > timeout_ms do
        Logging.emit(:warning, "symphony.reconcile.stall", :failure,
          issue: entry_identifier(entry),
          fields: %{issue_id: issue_id, elapsed_ms: elapsed_ms, timeout_ms: timeout_ms}
        )

        Logger.warning(
          "symphony.reconcile.stall issue_id=#{issue_id} identifier=#{entry_identifier(entry)} elapsed_ms=#{elapsed_ms} timeout_ms=#{timeout_ms}"
        )

        acc
        |> terminate_worker_for(issue_id, false)
        |> schedule_issue_retry(
          issue_id,
          entry,
          :failure,
          "stalled for #{elapsed_ms}ms without codex activity"
        )
      else
        acc
      end
    end)
  end

  defp stall_elapsed_ms(%{session: %LiveSession{last_codex_timestamp: %DateTime{} = ts}}, now) do
    max(0, DateTime.diff(now, ts, :millisecond))
  end

  defp stall_elapsed_ms(%{started_at: %DateTime{} = ts}, now) do
    max(0, DateTime.diff(now, ts, :millisecond))
  end

  defp stall_elapsed_ms(_entry, _now), do: nil

  # Spec § 8.5 part B: tracker state refresh. Terminate workers when
  # their issue goes terminal (with workspace cleanup) or non-active
  # (no cleanup); refresh the snapshot otherwise.
  defp reconcile_tracker_states(%{adapter: nil} = state), do: state

  defp reconcile_tracker_states(%{running: running} = state) when map_size(running) == 0,
    do: state

  defp reconcile_tracker_states(%{adapter: adapter, config: config} = state) do
    ids = Map.keys(state.running)

    case adapter.fetch_issue_states_by_ids(config, ids) do
      {:ok, states} when is_map(states) ->
        terminal =
          MapSet.new(Enum.map(Config.tracker_terminal_states(config), &normalize_state/1))

        active = MapSet.new(Enum.map(Config.tracker_active_states(config), &normalize_state/1))
        apply_tracker_state_refresh(state, states, terminal, active)

      {:error, reason} ->
        Logging.emit(:warning, "symphony.reconcile.refresh_failed", :failure,
          message: "tracker state refresh failed; keeping workers running",
          fields: %{reason: inspect(reason)}
        )

        state
    end
  end

  defp apply_tracker_state_refresh(state, states, terminal, active) do
    Enum.reduce(states, state, fn {issue_id, raw_state}, acc ->
      norm = normalize_state(raw_state)

      cond do
        MapSet.member?(terminal, norm) ->
          Logger.info(
            "symphony.reconcile.terminal issue_id=#{issue_id} state=#{raw_state}; stopping worker and cleaning workspace"
          )

          terminate_worker_for(acc, issue_id, true)

        MapSet.member?(active, norm) ->
          # Active state — refresh in-memory snapshot.
          case Map.get(acc.running, issue_id) do
            nil ->
              acc

            entry ->
              %RunAttempt{} = attempt = entry.attempt || %RunAttempt{}
              attempt = %RunAttempt{attempt | issue_id: issue_id}
              %{acc | running: Map.put(acc.running, issue_id, %{entry | attempt: attempt})}
          end

        true ->
          Logger.info(
            "symphony.reconcile.non_active issue_id=#{issue_id} state=#{raw_state}; stopping worker"
          )

          terminate_worker_for(acc, issue_id, false)
      end
    end)
  end

  # ============== Dispatch ==============

  defp dispatch_eligible(state) do
    config = state.config
    available = available_slots(state)

    if available <= 0 do
      Logger.debug("symphony.dispatch.skipped reason=no_slots running=#{map_size(state.running)}")

      state
    else
      case state.adapter.fetch_candidate_issues(config) do
        {:ok, candidates} ->
          eligible =
            candidates
            |> Enum.reject(&already_claimed?(state, &1))
            |> Enum.reject(&blocked_todo?(&1))
            |> Enum.sort_by(&dispatch_sort_key/1)
            |> filter_per_state_caps(state)
            |> Enum.take(available)

          Logging.emit(:info, "symphony.dispatch", :success,
            fields: %{
              ready: length(eligible),
              candidates: length(candidates),
              available: available
            }
          )

          Logger.info(
            "symphony.dispatch ready=#{length(eligible)} candidates=#{length(candidates)} available=#{available}"
          )

          Enum.reduce(eligible, state, fn issue, acc -> dispatch_issue(acc, issue, nil) end)

        {:error, reason} ->
          Logging.emit(:warning, "symphony.candidate_fetch_failed", :failure,
            message: inspect(reason)
          )

          Logger.warning("symphony.candidate_fetch_failed reason=#{inspect(reason)}")
          state
      end
    end
  end

  defp dispatch_issue(state, %Tracker.Issue{} = issue, attempt) do
    parent = self()
    config = state.config

    case Task.Supervisor.start_child(@worker_supervisor, fn ->
           run_worker(parent, config, issue, attempt)
         end) do
      {:ok, pid} ->
        ref = Process.monitor(pid)

        attempt_struct = %RunAttempt{
          issue_id: issue.id,
          issue_identifier: issue.identifier,
          attempt: attempt,
          phase: :preparing_workspace,
          status: :unknown,
          started_at: DateTime.utc_now()
        }

        entry = %{
          pid: pid,
          ref: ref,
          identifier: issue.identifier,
          issue: issue,
          attempt: attempt_struct,
          session: %LiveSession{},
          started_at: DateTime.utc_now(),
          retry_attempt: attempt
        }

        Logging.emit(:info, "symphony.dispatch.spawn", :success,
          issue: issue.identifier,
          fields: %{id: issue.id, attempt: attempt || 0, pid: inspect(pid)}
        )

        Logger.info(
          "symphony.dispatch.spawn issue_id=#{issue.id} identifier=#{issue.identifier} pid=#{inspect(pid)} attempt=#{inspect(attempt)}"
        )

        %{
          state
          | running: Map.put(state.running, issue.id, entry),
            claimed: MapSet.put(state.claimed, issue.id),
            retry_attempts: Map.delete(state.retry_attempts, issue.id)
        }

      {:error, reason} ->
        Logging.emit(:error, "symphony.dispatch.spawn_failed", :failure,
          issue: issue.identifier,
          fields: %{id: issue.id, reason: inspect(reason)}
        )

        Logger.error(
          "symphony.dispatch.spawn_failed issue_id=#{issue.id} identifier=#{issue.identifier} reason=#{inspect(reason)}"
        )

        synthetic_entry = %{
          identifier: issue.identifier,
          retry_attempt: attempt,
          session: %LiveSession{}
        }

        schedule_issue_retry(
          state,
          issue.id,
          synthetic_entry,
          :failure,
          "failed to spawn worker: #{inspect(reason)}"
        )
    end
  end

  # ============== Worker body (runs in the spawned Task) ==============

  defp run_worker(parent, config, %Tracker.Issue{} = issue, attempt) do
    issue_id = issue.id
    send_phase(parent, issue_id, :preparing_workspace, %{})

    with {:ok, ws} <- WorkspaceManager.ensure_exists(config, issue.identifier),
         _ <- send_phase(parent, issue_id, :building_prompt, %{workspace_path: ws.path}) do
      send_phase(parent, issue_id, :launching_agent_process, %{workspace_path: ws.path})

      session_started_at = DateTime.utc_now()

      send(parent, {
        :codex_worker_update,
        issue_id,
        %{
          event: :session_started,
          timestamp: session_started_at,
          payload: %{}
        }
      })

      send_phase(parent, issue_id, :initializing_session, %{workspace_path: ws.path})
      send_phase(parent, issue_id, :streaming_turn, %{workspace_path: ws.path})

      runner_module = resolve_agent_runner(config)

      on_message = fn message ->
        send(parent, {:codex_worker_update, issue_id, message})
        :ok
      end

      result =
        Tracing.span(
          "symphony.turn",
          %{
            "user.journey" => "agent-dispatch",
            "issue.id" => issue.id,
            "issue.identifier" => issue.identifier,
            "symphony.runner" => inspect(runner_module),
            "symphony.retry_attempt" => attempt || 0
          },
          fn ->
            try do
              runner_module.run(config, issue, ws, on_message: on_message)
            rescue
              e ->
                Logger.error(
                  "symphony.worker.runner_raise issue_id=#{issue_id} error=#{Exception.message(e)}"
                )

                {:error, {:runner_raise, Exception.message(e)}}
            end
          end
        )

      case result do
        {:ok, %{exit_code: 0} = _result} ->
          send_phase(parent, issue_id, :finishing, %{workspace_path: ws.path})
          send_phase(parent, issue_id, :succeeded, %{workspace_path: ws.path})
          :ok

        {:ok, %{exit_code: code} = _result} when is_integer(code) and code != 0 ->
          # Worker process completed without raising but exited non-zero.
          # Per spec § 8.4 this is a failure (continuation retry is for
          # exit_code == 0 only — "the agent finished its turn cleanly,
          # check whether more work is needed"). Surface it through the
          # abnormal-exit retry path so backoff applies.
          send_phase(parent, issue_id, :failed, %{
            workspace_path: ws.path,
            error: "nonzero exit: #{code}"
          })

          exit({:agent_failed, {:nonzero_exit, code}})

        {:ok, _result} ->
          # Older runners that don't yet propagate exit_code: keep the
          # legacy clean-exit path so we don't regress.
          send_phase(parent, issue_id, :finishing, %{workspace_path: ws.path})
          send_phase(parent, issue_id, :succeeded, %{workspace_path: ws.path})
          :ok

        {:error, reason} ->
          send_phase(parent, issue_id, :failed, %{
            workspace_path: ws.path,
            error: inspect(reason)
          })

          # Translate the error into an exit so the parent's :DOWN
          # handler picks the failure-driven retry path.
          exit({:agent_failed, reason})
      end
    else
      {:error, reason} ->
        send_phase(parent, issue_id, :failed, %{error: inspect(reason)})
        exit({:workspace_failed, reason})
    end
  end

  defp send_phase(parent, issue_id, phase, payload) do
    send(parent, {:worker_phase, issue_id, phase, payload})
    :ok
  end

  defp resolve_agent_runner(config) do
    case AgentRunner.adapter_for(config) do
      {:ok, mod} -> mod
      _ -> Symphony.AgentRunner.LocalShell
    end
  end

  # ============== Worker termination ==============

  defp terminate_worker_for(state, issue_id, cleanup_workspace?) do
    case Map.get(state.running, issue_id) do
      nil ->
        # Just release the claim.
        %{state | claimed: MapSet.delete(state.claimed, issue_id)}

      entry ->
        if is_pid(entry.pid) and Process.alive?(entry.pid) do
          _ = Task.Supervisor.terminate_child(@worker_supervisor, entry.pid)
        end

        if is_reference(entry.ref) do
          Process.demonitor(entry.ref, [:flush])
        end

        if cleanup_workspace? do
          cleanup_issue_workspace(state.config, entry)
        end

        state = record_session_completion_totals(state, entry)

        %{
          state
          | running: Map.delete(state.running, issue_id),
            claimed: MapSet.delete(state.claimed, issue_id),
            retry_attempts: Map.delete(state.retry_attempts, issue_id)
        }
    end
  end

  defp cleanup_issue_workspace(config, %{identifier: identifier}) when is_binary(identifier) do
    :ok = WorkspaceManager.remove(config, identifier)
  rescue
    e ->
      Logger.warning(
        "symphony.workspace.cleanup_failed identifier=#{identifier} reason=#{inspect(e)}"
      )
  end

  defp cleanup_issue_workspace(_config, _entry), do: :ok

  # ============== Retry handling ==============

  defp complete_issue(state, issue_id) do
    %{state | retry_attempts: Map.delete(state.retry_attempts, issue_id)}
  end

  defp schedule_issue_retry(state, issue_id, entry, reason, error)
       when reason in [:continuation, :failure] do
    prior =
      case Map.get(state.retry_attempts, issue_id) do
        nil -> %{attempt: max(0, retry_attempt_from_entry(entry))}
        existing -> existing
      end

    max_backoff =
      case state.config do
        nil -> 300_000
        c -> Config.agent_max_retry_backoff_ms(c)
      end

    identifier = entry_identifier(entry)

    next =
      RetryQueue.next_attempt(prior, reason,
        issue_id: issue_id,
        identifier: identifier,
        error: error,
        max_backoff_ms: max_backoff
      )

    # Cancel any existing timer.
    case Map.get(state.retry_attempts, issue_id) do
      %{timer_handle: ref} when is_reference(ref) ->
        Process.cancel_timer(ref)

      _ ->
        :ok
    end

    retry_token = make_ref()
    delay_ms = max(0, next.due_at_ms - System.monotonic_time(:millisecond))
    timer_ref = Process.send_after(self(), {:retry_due, issue_id, retry_token}, delay_ms)

    Logging.emit(:info, "symphony.retry.scheduled", :success,
      issue: identifier,
      fields: %{
        issue_id: issue_id,
        attempt: next.attempt,
        delay_ms: delay_ms,
        reason: Atom.to_string(reason)
      }
    )

    Logger.warning(
      "symphony.retry.scheduled issue_id=#{issue_id} identifier=#{identifier} attempt=#{next.attempt} delay_ms=#{delay_ms} reason=#{reason}"
    )

    retry_entry =
      next
      |> Map.put(:timer_handle, timer_ref)
      |> Map.put(:retry_token, retry_token)
      |> Map.put(:identifier, identifier)
      |> Map.put(:error, error)
      |> Map.put(:reason, reason)
      |> Map.put(:due_at_ms, next.due_at_ms)

    %{state | retry_attempts: Map.put(state.retry_attempts, issue_id, retry_entry)}
  end

  defp retry_attempt_from_entry(%{retry_attempt: n}) when is_integer(n) and n > 0, do: n
  defp retry_attempt_from_entry(_), do: 0

  defp handle_retry_due(state, issue_id, retry_entry) do
    state = %{state | retry_attempts: Map.delete(state.retry_attempts, issue_id)}

    case state.adapter.fetch_candidate_issues(state.config) do
      {:ok, issues} ->
        case Enum.find(issues, fn %Tracker.Issue{id: id} -> id == issue_id end) do
          nil ->
            Logger.debug("symphony.retry.released issue_id=#{issue_id}; no longer a candidate")
            release_claim(state, issue_id)

          %Tracker.Issue{} = issue ->
            cond do
              not active_candidate?(state.config, issue) ->
                Logger.debug(
                  "symphony.retry.released issue_id=#{issue_id}; candidate no longer active"
                )

                release_claim(state, issue_id)

              blocked_todo?(issue) ->
                requeue_retry(state, issue_id, retry_entry, "blocked")

              available_slots(state) > 0 ->
                dispatch_issue(state, issue, retry_entry.attempt)

              true ->
                requeue_retry(state, issue_id, retry_entry, "no available orchestrator slots")
            end
        end

      {:error, reason} ->
        # Per spec § 8.4: requeue with the original retry kind.
        requeue_retry(state, issue_id, retry_entry, "retry poll failed: #{inspect(reason)}")
    end
  end

  defp requeue_retry(state, issue_id, retry_entry, error) do
    synthetic_entry = %{
      identifier: retry_entry.identifier,
      retry_attempt: retry_entry.attempt,
      session: %LiveSession{}
    }

    schedule_issue_retry(state, issue_id, synthetic_entry, retry_entry.reason, error)
  end

  defp release_claim(state, issue_id) do
    %{
      state
      | claimed: MapSet.delete(state.claimed, issue_id),
        retry_attempts: Map.delete(state.retry_attempts, issue_id)
    }
  end

  # ============== Helpers ==============

  defp pop_running_entry(state, issue_id) do
    {Map.get(state.running, issue_id), %{state | running: Map.delete(state.running, issue_id)}}
  end

  defp record_session_completion_totals(state, %{started_at: %DateTime{} = started_at} = _entry) do
    runtime = max(0, DateTime.diff(DateTime.utc_now(), started_at, :second))

    totals = %{
      input_tokens: state.codex_totals.input_tokens,
      output_tokens: state.codex_totals.output_tokens,
      total_tokens: state.codex_totals.total_tokens,
      seconds_running: state.codex_totals.seconds_running + runtime
    }

    %{state | codex_totals: totals}
  end

  defp record_session_completion_totals(state, _entry), do: state

  defp find_issue_id_for_ref(running, ref) do
    Enum.find_value(running, fn {issue_id, %{ref: r}} ->
      if r == ref, do: issue_id
    end)
  end

  defp available_slots(state) do
    max(Config.agent_max_concurrent_agents(state.config) - map_size(state.running), 0)
  end

  defp already_claimed?(state, %Tracker.Issue{id: id, identifier: ident}) do
    MapSet.member?(state.claimed, id) or MapSet.member?(state.claimed, ident)
  end

  # Spec § 8.2 blocker rule.
  defp blocked_todo?(%Tracker.Issue{state: state_name, blocked_by: blockers}) do
    cond do
      String.downcase(state_name || "") != "todo" -> false
      blockers == nil or blockers == [] -> false
      true -> Enum.any?(blockers, &blocker_active?/1)
    end
  end

  defp blocker_active?(%{state: nil}), do: true

  defp blocker_active?(%{state: state}) when is_binary(state) do
    String.downcase(state) not in ["done", "cancelled", "canceled", "duplicate", "closed"]
  end

  defp blocker_active?(_), do: true

  defp active_candidate?(config, %Tracker.Issue{state: state_name}) when is_binary(state_name) do
    active = MapSet.new(Enum.map(Config.tracker_active_states(config), &normalize_state/1))
    MapSet.member?(active, normalize_state(state_name))
  end

  defp active_candidate?(_config, _issue), do: false

  defp dispatch_sort_key(%Tracker.Issue{} = issue) do
    {
      issue.priority || 999_999,
      issue.created_at || ~U[9999-12-31 23:59:59Z],
      issue.identifier
    }
  end

  # Spec § 5.3.5 / § 8.3 per-state concurrency cap.
  defp filter_per_state_caps(eligible, state) do
    by_state_raw =
      case state.config do
        %Symphony.Config.Settings{schema: schema} -> schema.agent.max_concurrent_agents_by_state
        _ -> %{}
      end || %{}

    by_state =
      by_state_raw
      |> Enum.into(%{}, fn {k, v} -> {String.downcase(to_string(k)), normalize_pos_int(v)} end)
      |> Enum.reject(fn {_, v} -> is_nil(v) end)
      |> Enum.into(%{})

    if by_state == %{} do
      eligible
    else
      running_by_state =
        Enum.reduce(state.running, %{}, fn {_id, entry}, acc ->
          s =
            case entry do
              %{issue: %Tracker.Issue{state: s}} when is_binary(s) -> String.downcase(s)
              _ -> ""
            end

          Map.update(acc, s, 1, &(&1 + 1))
        end)

      {kept, _} =
        Enum.reduce(eligible, {[], running_by_state}, fn issue, {acc, counts} ->
          s = String.downcase(issue.state || "")

          case Map.get(by_state, s) do
            nil ->
              {[issue | acc], counts}

            cap ->
              already = Map.get(counts, s, 0)

              if already < cap do
                {[issue | acc], Map.put(counts, s, already + 1)}
              else
                {acc, counts}
              end
          end
        end)

      Enum.reverse(kept)
    end
  end

  defp normalize_pos_int(n) when is_integer(n) and n > 0, do: n

  defp normalize_pos_int(s) when is_binary(s) do
    case Integer.parse(s) do
      {n, ""} when n > 0 -> n
      _ -> nil
    end
  end

  defp normalize_pos_int(_), do: nil

  defp normalize_state(s) when is_binary(s), do: s |> String.downcase() |> String.trim()
  defp normalize_state(_), do: ""

  defp stall_timeout_ms(nil), do: 0
  defp stall_timeout_ms(config), do: Config.codex_stall_timeout_ms(config)

  defp entry_identifier(%{identifier: id}) when is_binary(id), do: id
  defp entry_identifier(_), do: ""

  # ---- Codex update integration ----

  defp integrate_codex_update(%LiveSession{} = session, update) do
    timestamp = update[:timestamp]
    event = update[:event]
    session_id = session_id_for_update(session.session_id, update)
    pid = pid_for_update(session.codex_app_server_pid, update)
    usage = extract_absolute_token_totals(update)
    rate_limits = extract_rate_limits(update)

    {input_d, output_d, total_d, in_rep, out_rep, total_rep} =
      compute_token_deltas(session, usage)

    turn_count = turn_count_for_update(session.turn_count, session.session_id, update)

    {
      %LiveSession{
        session
        | session_id: session_id,
          codex_app_server_pid: pid,
          last_codex_event: to_string(event),
          last_codex_timestamp: timestamp,
          last_codex_message: update[:payload] || update[:raw],
          codex_input_tokens: session.codex_input_tokens + input_d,
          codex_output_tokens: session.codex_output_tokens + output_d,
          codex_total_tokens: session.codex_total_tokens + total_d,
          last_reported_input_tokens: max(session.last_reported_input_tokens, in_rep),
          last_reported_output_tokens: max(session.last_reported_output_tokens, out_rep),
          last_reported_total_tokens: max(session.last_reported_total_tokens, total_rep),
          turn_count: turn_count
      },
      %{input_tokens: input_d, output_tokens: output_d, total_tokens: total_d},
      rate_limits
    }
  end

  defp session_id_for_update(_existing, %{session_id: s}) when is_binary(s), do: s
  defp session_id_for_update(existing, _update), do: existing

  defp pid_for_update(_existing, %{codex_app_server_pid: p}) when is_binary(p), do: p
  defp pid_for_update(existing, _update), do: existing

  defp turn_count_for_update(existing_count, existing_session_id, %{
         event: :session_started,
         session_id: session_id
       })
       when is_integer(existing_count) and is_binary(session_id) do
    if session_id == existing_session_id, do: existing_count, else: existing_count + 1
  end

  defp turn_count_for_update(existing_count, _existing_session_id, _update)
       when is_integer(existing_count),
       do: existing_count

  defp turn_count_for_update(_existing_count, _existing_session_id, _update), do: 0

  defp compute_token_deltas(session, usage) when is_map(usage) do
    next_in = pos_int(usage[:input_tokens])
    next_out = pos_int(usage[:output_tokens])
    next_total = pos_int(usage[:total_tokens])

    in_d = max(0, next_in - session.last_reported_input_tokens)
    out_d = max(0, next_out - session.last_reported_output_tokens)
    total_d = max(0, next_total - session.last_reported_total_tokens)

    {in_d, out_d, total_d, next_in, next_out, next_total}
  end

  defp compute_token_deltas(session, _usage) do
    {0, 0, 0, session.last_reported_input_tokens, session.last_reported_output_tokens,
     session.last_reported_total_tokens}
  end

  defp apply_codex_token_delta(state, %{
         input_tokens: in_d,
         output_tokens: out_d,
         total_tokens: total_d
       }) do
    totals = %{
      input_tokens: state.codex_totals.input_tokens + in_d,
      output_tokens: state.codex_totals.output_tokens + out_d,
      total_tokens: state.codex_totals.total_tokens + total_d,
      seconds_running: state.codex_totals.seconds_running
    }

    %{state | codex_totals: totals}
  end

  defp maybe_put_rate_limits(state, nil), do: state
  defp maybe_put_rate_limits(state, rate_limits), do: %{state | codex_rate_limits: rate_limits}

  defp extract_absolute_token_totals(update) when is_map(update) do
    payload = update_payload(update)
    method = update_method(update, payload)

    cond do
      method == "thread/tokenUsage/updated" ->
        extract_thread_token_usage(payload) || extract_thread_token_usage(update)

      true ->
        extract_total_token_usage(payload) || extract_total_token_usage(update)
    end
  end

  defp extract_absolute_token_totals(_update), do: nil

  defp extract_thread_token_usage(payload) when is_map(payload) do
    [
      map_path(payload, ["params", "totalTokenUsage"]),
      map_path(payload, ["params", "total_token_usage"]),
      map_path(payload, ["params", "usage"]),
      map_get(payload, ["params"]),
      map_get(payload, ["totalTokenUsage", "total_token_usage", "usage"])
    ]
    |> Enum.reject(&is_nil/1)
    |> Enum.find_value(nil, &usage_to_token_totals/1)
  end

  defp extract_thread_token_usage(_payload), do: nil

  defp extract_total_token_usage(payload) when is_map(payload) do
    [
      map_path(payload, ["params", "totalTokenUsage"]),
      map_path(payload, ["params", "total_token_usage"]),
      map_get(payload, ["totalTokenUsage", "total_token_usage"])
    ]
    |> Enum.reject(&is_nil/1)
    |> Enum.find_value(nil, &usage_to_token_totals/1)
  end

  defp extract_total_token_usage(_payload), do: nil

  defp usage_to_token_totals(usage) when is_map(usage) do
    input = pick_token(usage, ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"])

    output =
      pick_token(usage, ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"])

    total = pick_token(usage, ["total_tokens", "totalTokens", "tokens"])

    cond do
      input == nil and output == nil and total == nil ->
        nil

      true ->
        in_v = input || 0
        out_v = output || 0
        %{input_tokens: in_v, output_tokens: out_v, total_tokens: total || in_v + out_v}
    end
  end

  defp usage_to_token_totals(_usage), do: nil

  defp pick_token(map, keys) do
    Enum.find_value(keys, nil, fn key ->
      case map_get(map, [key]) do
        v when is_integer(v) and v >= 0 ->
          v

        v when is_binary(v) ->
          case Integer.parse(v) do
            {n, ""} when n >= 0 -> n
            _ -> nil
          end

        _ ->
          nil
      end
    end)
  end

  defp extract_rate_limits(update) when is_map(update) do
    payload = update_payload(update)
    method = update_method(update, payload)

    direct =
      map_get(update, ["rateLimits", "rate_limits"]) ||
        map_path(payload, ["params", "rateLimits"]) ||
        map_path(payload, ["params", "rate_limits"]) ||
        map_get(payload, ["rateLimits", "rate_limits"])

    cond do
      not is_nil(direct) ->
        direct

      method == "account/rateLimits/updated" ->
        map_get(payload, ["params"]) || payload

      method == "account/updated" ->
        map_path(payload, ["params", "account", "rateLimits"]) ||
          map_path(payload, ["params", "rateLimits"])

      true ->
        nil
    end
  end

  defp extract_rate_limits(_update), do: nil

  defp update_payload(update) when is_map(update) do
    map_get(update, ["payload"]) || map_get(update, ["raw"]) || %{}
  end

  defp update_method(update, payload) do
    map_get(update, ["method"]) || map_get(payload, ["method"])
  end

  defp map_path(map, path) when is_map(map) and is_list(path) do
    Enum.reduce_while(path, map, fn key, acc ->
      case map_get(acc, [key]) do
        nil -> {:halt, nil}
        value -> {:cont, value}
      end
    end)
  end

  defp map_path(_map, _path), do: nil

  defp map_get(map, keys) when is_map(map) and is_list(keys) do
    Enum.find_value(keys, nil, fn key ->
      cond do
        Map.has_key?(map, key) ->
          Map.get(map, key)

        is_binary(key) and Map.has_key?(map, String.to_atom(key)) ->
          Map.get(map, String.to_atom(key))

        is_atom(key) and Map.has_key?(map, Atom.to_string(key)) ->
          Map.get(map, Atom.to_string(key))

        true ->
          nil
      end
    end)
  end

  defp map_get(_map, _keys), do: nil

  defp pos_int(n) when is_integer(n) and n >= 0, do: n
  defp pos_int(_), do: 0

  defp phase_status(:succeeded), do: :ok
  defp phase_status(:failed), do: :error
  defp phase_status(:timed_out), do: :error
  defp phase_status(:stalled), do: :error
  defp phase_status(:canceled_by_reconciliation), do: :error
  defp phase_status(_), do: :unknown

  # ============== Startup terminal cleanup (spec § 8.6) ==============

  defp run_terminal_workspace_cleanup(%{config: nil} = state), do: state
  defp run_terminal_workspace_cleanup(%{adapter: nil} = state), do: state

  defp run_terminal_workspace_cleanup(state) do
    config = state.config
    terminal_states = Config.tracker_terminal_states(config)

    case state.adapter.fetch_issues_by_states(config, terminal_states) do
      {:ok, issues} ->
        cleaned =
          Enum.reduce(issues, 0, fn
            %Tracker.Issue{identifier: identifier}, acc when is_binary(identifier) ->
              path = WorkspaceManager.workspace_path(config, identifier)

              if File.exists?(path) do
                _ = WorkspaceManager.remove(config, identifier)
                acc + 1
              else
                acc
              end

            _, acc ->
              acc
          end)

        Logging.emit(:info, "symphony.startup.terminal_cleanup", :success,
          fields: %{terminal_count: length(issues), cleaned: cleaned}
        )

        Logger.info(
          "symphony.startup.terminal_cleanup terminal_count=#{length(issues)} cleaned=#{cleaned}"
        )

        %{state | startup_cleanup_done?: true}

      {:error, reason} ->
        Logging.emit(:warning, "symphony.startup.terminal_cleanup", :failure,
          message: "could not fetch terminal issues; continuing startup",
          fields: %{reason: inspect(reason)}
        )

        Logger.warning(
          "symphony.startup.terminal_cleanup outcome=failure reason=#{inspect(reason)}; continuing startup"
        )

        %{state | startup_cleanup_done?: true}
    end
  end

  # ============== Startup orphan-process reaping ==============

  defp reap_orphan_workspace_processes(%{config: nil} = state), do: state

  defp reap_orphan_workspace_processes(state) do
    workspace_root =
      case Config.workspace_root(state.config) do
        path when is_binary(path) and path != "" -> Path.expand(path)
        _ -> nil
      end

    if is_nil(workspace_root) do
      state
    else
      reaped = scan_and_kill_orphans_under(workspace_root)

      if reaped > 0 do
        Logger.warning(
          "symphony.startup.orphan_reap reaped=#{reaped} workspace_root=#{workspace_root}"
        )

        Logging.emit(:warning, "symphony.startup.orphan_reap", :success,
          message: "reaped subprocesses left over from a prior BEAM",
          fields: %{reaped: reaped, workspace_root: workspace_root}
        )
      end

      state
    end
  rescue
    e ->
      Logger.debug(
        "symphony.startup.orphan_reap_failed reason=#{Exception.message(e)} (continuing)"
      )

      state
  end

  defp scan_and_kill_orphans_under(workspace_root) do
    # /proc/<pid>/cwd is a symlink to the process's current working
    # directory. We list our own pid's siblings and check whether any
    # symlink resolves to a path inside workspace_root. For each match,
    # we read /proc/<pid>/stat to find its session id (sid, the 6th
    # field) and SIGKILL the entire session via `kill -- -<sid>`.
    own_pid = :os.getpid() |> List.to_string()
    pids = list_pids() -- [own_pid]
    sids_to_kill = MapSet.new()

    sids =
      Enum.reduce(pids, sids_to_kill, fn pid, acc ->
        case File.read_link("/proc/#{pid}/cwd") do
          {:ok, cwd} ->
            cwd_abs = Path.expand(cwd)

            if String.starts_with?(cwd_abs, workspace_root <> "/") or cwd_abs == workspace_root do
              case read_session_id(pid) do
                {:ok, sid} -> MapSet.put(acc, sid)
                _ -> acc
              end
            else
              acc
            end

          _ ->
            acc
        end
      end)

    Enum.each(sids, fn sid ->
      _ = System.cmd("kill", ["-KILL", "--", "-#{sid}"], stderr_to_stdout: true)
    end)

    MapSet.size(sids)
  end

  defp list_pids do
    case File.ls("/proc") do
      {:ok, entries} ->
        entries
        |> Enum.filter(fn e -> match?({_, ""}, Integer.parse(e)) end)

      _ ->
        []
    end
  end

  defp read_session_id(pid) do
    with {:ok, stat} <- File.read("/proc/#{pid}/stat"),
         # `man 5 proc`: stat fields are space-separated; field 6 is sid.
         # The 2nd field (comm) can contain spaces wrapped in parens, so
         # split after the trailing `)` to be safe.
         [_pid_part, rest] <- String.split(stat, ")", parts: 2),
         fields <- String.split(rest, " ", trim: true),
         # rest starts with " <state> <ppid> <pgrp> <sid> ...", so sid is
         # field index 3 (0-based) within the post-`)` portion.
         sid_str when is_binary(sid_str) <- Enum.at(fields, 3),
         {sid, ""} <- Integer.parse(sid_str) do
      {:ok, sid}
    else
      _ -> :error
    end
  end

  # ============== Tick scheduling ==============

  # Spec § 7.4 / § 8.1: cancel any in-flight timer and arm a new one
  # with a fresh token so the matching `handle_info({:tick, token})`
  # is the only one that fires. `delay_ms` may be 0 for immediate ticks
  # (used at startup and from `tick_now`).
  defp schedule_tick(%{} = state, delay_ms) when is_integer(delay_ms) and delay_ms >= 0 do
    state = cancel_pending_tick(state)
    token = make_ref()
    timer_ref = Process.send_after(self(), {:tick, token}, delay_ms)

    %{
      state
      | tick_timer_ref: timer_ref,
        tick_token: token,
        next_poll_due_at_ms: System.monotonic_time(:millisecond) + delay_ms
    }
  end

  defp cancel_pending_tick(%{tick_timer_ref: ref} = state) when is_reference(ref) do
    _ = Process.cancel_timer(ref)
    %{state | tick_timer_ref: nil, tick_token: nil, next_poll_due_at_ms: nil}
  end

  defp cancel_pending_tick(state), do: state

  defp poll_interval(%{poll_interval_override_ms: ms}) when is_integer(ms) and ms > 0, do: ms

  defp poll_interval(%{config: nil}) do
    Application.get_env(:symphony, :poll_interval_ms, 30_000)
  end

  defp poll_interval(%{config: config}) do
    Config.polling_interval_ms(config)
  rescue
    _ -> 30_000
  end

  defp mark_poll_check(state, checking?) when is_boolean(checking?) do
    state = %{state | poll_check_in_progress: checking?}
    :persistent_term.put(@poll_check_key, checking?)

    if checking? do
      :persistent_term.put(@snapshot_cache_key, snapshot_payload(state))
    else
      :persistent_term.erase(@snapshot_cache_key)
    end

    state
  end

  defp cache_checking_snapshot(%{poll_check_in_progress: true} = state) do
    :persistent_term.put(@poll_check_key, true)
    :persistent_term.put(@snapshot_cache_key, snapshot_payload(state))
    state
  end

  defp cache_checking_snapshot(state), do: state

  defp poll_check_in_progress? do
    :persistent_term.get(@poll_check_key, false) == true
  end

  defp poll_check_visible? do
    poll_check_in_progress?() or cached_snapshot_checking?()
  end

  defp cached_snapshot do
    :persistent_term.get(@snapshot_cache_key, nil)
  end

  defp cached_snapshot_checking? do
    case cached_snapshot() do
      %{polling: %{checking?: true}} -> true
      _ -> false
    end
  end

  defp clear_poll_check_cache do
    :persistent_term.put(@poll_check_key, false)
    :persistent_term.erase(@snapshot_cache_key)
    :ok
  end

  # ============== Snapshot ==============

  defp snapshot_payload(state) do
    now = DateTime.utc_now()
    now_ms = System.monotonic_time(:millisecond)

    running_rows =
      Enum.map(state.running, fn {issue_id, entry} ->
        session = entry.session || %LiveSession{}
        attempt = entry.attempt || %RunAttempt{}

        %{
          issue_id: issue_id,
          identifier: entry.identifier,
          state: tracked_state(entry),
          phase: attempt.phase,
          status: attempt.status,
          workspace_path: attempt.workspace_path,
          session_id: session.session_id,
          thread_id: session.thread_id,
          turn_id: session.turn_id,
          codex_app_server_pid: session.codex_app_server_pid,
          last_codex_event: session.last_codex_event,
          last_codex_timestamp: session.last_codex_timestamp,
          last_codex_message: session.last_codex_message,
          codex_input_tokens: session.codex_input_tokens,
          codex_output_tokens: session.codex_output_tokens,
          codex_total_tokens: session.codex_total_tokens,
          last_reported_input_tokens: session.last_reported_input_tokens,
          last_reported_output_tokens: session.last_reported_output_tokens,
          last_reported_total_tokens: session.last_reported_total_tokens,
          turn_count: session.turn_count,
          started_at: entry.started_at,
          runtime_seconds: runtime_seconds(entry.started_at, now)
        }
      end)

    retrying_rows =
      Enum.map(state.retry_attempts, fn {issue_id, retry} ->
        %{
          issue_id: issue_id,
          identifier: Map.get(retry, :identifier),
          attempt: retry.attempt,
          due_in_ms: max(0, retry.due_at_ms - now_ms),
          reason: Map.get(retry, :reason),
          error: Map.get(retry, :error)
        }
      end)

    # Spec § 13.5: aggregate seconds_running = cumulative completed +
    # active-session elapsed time at snapshot time.
    active_seconds =
      Enum.reduce(state.running, 0, fn {_id, entry}, acc ->
        acc + runtime_seconds(entry.started_at, now)
      end)

    codex_totals =
      Map.put(
        state.codex_totals,
        :seconds_running,
        state.codex_totals.seconds_running + active_seconds
      )

    # Spec § 13.5: surface poll-loop visibility (matches upstream
    # `polling: %{checking?, next_poll_in_ms, poll_interval_ms}`).
    polling_info = %{
      poll_interval_ms: poll_interval(state),
      next_poll_in_ms: next_poll_in_ms(state.next_poll_due_at_ms, now_ms),
      checking?: state.poll_check_in_progress == true
    }

    %{
      running: running_rows,
      retrying: retrying_rows,
      codex_totals: codex_totals,
      rate_limits: state.codex_rate_limits,
      workflow_loaded: not is_nil(state.config),
      tracker_kind:
        case state.config do
          nil -> nil
          c -> Config.tracker_kind(c)
        end,
      last_tick_at: state.last_tick_at,
      polling: polling_info
    }
  end

  defp next_poll_in_ms(nil, _now_ms), do: nil

  defp next_poll_in_ms(due_at_ms, now_ms) when is_integer(due_at_ms) and is_integer(now_ms) do
    max(0, due_at_ms - now_ms)
  end

  defp tracked_state(%{issue: %Tracker.Issue{state: s}}) when is_binary(s), do: s
  defp tracked_state(_), do: nil

  defp runtime_seconds(%DateTime{} = started_at, %DateTime{} = now) do
    max(0, DateTime.diff(now, started_at, :second))
  end

  defp runtime_seconds(_started, _now), do: 0
end
