defmodule Symphony.Orchestrator do
  @moduledoc """
  GenServer that owns the Symphony orchestrator state, per spec section 7.

  Lifecycle:

    1. Init loads `WORKFLOW.md` via `WorkflowLoader` and builds a typed
       `Symphony.Config` view.
    2. A poll timer fires every `polling.interval_ms` (typed config getter).
    3. Each tick:
       a. Reconcile running runs (no-op while running map is always empty).
       b. Validate config preflight; on failure, skip dispatch this tick.
       c. Fetch candidate issues from the configured tracker adapter.
       d. Sort by `(priority asc, created_at asc, identifier asc)`.
       e. Dispatch up to `agent.max_concurrent_agents - running_count` issues.
          (T-4: log-only — no real subprocess spawn yet.)

  T-4 scope:
    * Wire Config into the GenServer state.
    * Resolve a tracker adapter via `Symphony.Tracker.adapter_for/1`.
    * Run the tick sequence with bounded concurrency, log-only dispatch.
    * Track `running` and `claimed` maps so future slices can plug real
      runners in without restructuring state.

  Real subprocess dispatch lands in T-6. Real tracker adapters land in T-7.
  """

  use GenServer
  require Logger

  alias Symphony.{Config, Tracker, WorkflowLoader}

  @type state :: %{
          required(:config) => Config.t() | nil,
          required(:adapter) => module() | nil,
          required(:running) => map(),
          required(:claimed) => MapSet.t(),
          required(:retry_attempts) => map(),
          required(:codex_totals) => map(),
          required(:rate_limits) => map() | nil,
          required(:last_tick_at) => DateTime.t() | nil
        }

  @initial_state %{
    config: nil,
    adapter: nil,
    running: %{},
    claimed: MapSet.new(),
    retry_attempts: %{},
    codex_totals: %{
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      seconds_running: 0
    },
    rate_limits: nil,
    last_tick_at: nil
  }

  # ============== Public API ==============

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @spec snapshot() :: {:ok, map()} | {:error, :unavailable}
  def snapshot do
    case GenServer.whereis(__MODULE__) do
      nil -> {:error, :unavailable}
      pid -> GenServer.call(pid, :snapshot, 5_000)
    end
  end

  @spec apply_workflow(WorkflowLoader.workflow()) :: :ok | {:error, term()}
  def apply_workflow(workflow) do
    case GenServer.whereis(__MODULE__) do
      nil -> {:error, :unavailable}
      pid -> GenServer.call(pid, {:apply_workflow, workflow}, 5_000)
    end
  end

  @doc "Force one tick synchronously. Test-only; production uses the timer."
  @spec tick_now() :: :ok | {:error, term()}
  def tick_now do
    case GenServer.whereis(__MODULE__) do
      nil -> {:error, :unavailable}
      pid -> GenServer.call(pid, :tick_now, 10_000)
    end
  end

  # ============== Callbacks ==============

  @impl true
  def init(_opts) do
    state = build_initial_state()
    schedule_tick(poll_interval(state))
    {:ok, state}
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
    {:reply, :ok, run_tick(state)}
  end

  @impl true
  def handle_info(:tick, state) do
    new_state = run_tick(state)
    schedule_tick(poll_interval(new_state))
    {:noreply, new_state}
  end

  # ============== State construction ==============

  defp build_initial_state do
    case WorkflowLoader.load() do
      {:ok, workflow} ->
        Logger.info("symphony.workflow_loaded path=#{workflow.source_path}")
        {state, _} = apply_workflow_to_state(@initial_state, workflow)
        state

      {:error, reason} ->
        Logger.warning("symphony.workflow_load_failed reason=#{inspect(reason)}")
        @initial_state
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
    |> dispatch_eligible()
    |> Map.put(:last_tick_at, DateTime.utc_now())
  end

  defp reconcile_running(state) do
    # Spec section 8.5 part B: tracker state refresh for running issues.
    # No running issues yet (T-6 wires real dispatch); this becomes a real
    # state-refresh + workspace-cleanup pass once dispatch lands.
    state
  end

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
            |> Enum.sort_by(&dispatch_sort_key/1)
            |> Enum.take(available)

          Logger.info(
            "symphony.dispatch ready=#{length(eligible)} candidates=#{length(candidates)} available=#{available}"
          )

          # T-4 stops at log-only. Real worker spawn lands in T-6.
          Enum.each(eligible, &log_dispatch(&1, state))

          state

        {:error, reason} ->
          Logger.warning("symphony.candidate_fetch_failed reason=#{inspect(reason)}")
          state
      end
    end
  end

  defp available_slots(state) do
    max = Config.agent_max_concurrent_agents(state.config)
    max - map_size(state.running)
  end

  defp already_claimed?(state, %Tracker.Issue{id: id, identifier: ident}) do
    MapSet.member?(state.claimed, id) or MapSet.member?(state.claimed, ident)
  end

  defp dispatch_sort_key(%Tracker.Issue{} = issue) do
    {
      issue.priority || 999_999,
      issue.created_at || ~U[9999-12-31 23:59:59Z],
      issue.identifier
    }
  end

  defp log_dispatch(issue, _state) do
    Logger.info(
      "symphony.dispatch.log_only id=#{issue.id} identifier=#{issue.identifier} state=#{issue.state} priority=#{issue.priority}"
    )
  end

  # ============== Helpers ==============

  defp schedule_tick(interval_ms) when is_integer(interval_ms) and interval_ms > 0 do
    Process.send_after(self(), :tick, interval_ms)
  end

  defp poll_interval(%{config: nil}) do
    Application.get_env(:symphony, :poll_interval_ms, 30_000)
  end

  defp poll_interval(%{config: config}) do
    Config.polling_interval_ms(config)
  rescue
    _ -> 30_000
  end

  defp snapshot_payload(state) do
    %{
      running:
        for {id, entry} <- state.running do
          Map.put(entry, :issue_id, id)
        end,
      retrying:
        for {id, entry} <- state.retry_attempts do
          Map.put(entry, :issue_id, id)
        end,
      codex_totals: state.codex_totals,
      rate_limits: state.rate_limits,
      workflow_loaded: not is_nil(state.config),
      tracker_kind:
        case state.config do
          nil -> nil
          c -> Config.tracker_kind(c)
        end,
      last_tick_at: state.last_tick_at
    }
  end
end
