defmodule Symphony.Orchestrator do
  @moduledoc """
  GenServer that owns the Symphony orchestrator state, per spec section 7.

  This is the minimum-viable scaffold: schedule, claim, dispatch, retry,
  reconcile. The implementation lands incrementally:

  - poll loop based on `polling.interval_ms`
  - candidate fetch via the configured tracker adapter
  - bounded concurrency via `agent.max_concurrent_agents`
  - retry queue with exponential backoff
  - reconciliation pass before each dispatch

  Today this scaffold tracks the loaded workflow and exposes a snapshot;
  real dispatch wiring lands in subsequent ticks.
  """

  use GenServer
  require Logger

  alias Symphony.WorkflowLoader

  @type state :: %{
          required(:workflow) => map() | nil,
          required(:running) => map(),
          required(:claimed) => MapSet.t(),
          required(:retry_attempts) => map(),
          required(:codex_totals) => map(),
          required(:rate_limits) => map() | nil
        }

  @initial_state %{
    workflow: nil,
    running: %{},
    claimed: MapSet.new(),
    retry_attempts: %{},
    codex_totals: %{
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      seconds_running: 0
    },
    rate_limits: nil
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

  @spec apply_workflow(map()) :: :ok | {:error, term()}
  def apply_workflow(workflow) do
    case GenServer.whereis(__MODULE__) do
      nil -> {:error, :unavailable}
      pid -> GenServer.call(pid, {:apply_workflow, workflow}, 5_000)
    end
  end

  # ============== Callbacks ==============

  @impl true
  def init(_opts) do
    state =
      case WorkflowLoader.load() do
        {:ok, workflow} ->
          Logger.info("symphony.workflow_loaded", path: workflow.source_path)
          %{@initial_state | workflow: workflow}

        {:error, reason} ->
          Logger.warning("symphony.workflow_load_failed", reason: inspect(reason))
          @initial_state
      end

    schedule_tick(poll_interval(state))
    {:ok, state}
  end

  @impl true
  def handle_call(:snapshot, _from, state) do
    {:reply, {:ok, snapshot_payload(state)}, state}
  end

  def handle_call({:apply_workflow, workflow}, _from, state) do
    {:reply, :ok, %{state | workflow: workflow}}
  end

  @impl true
  def handle_info(:tick, state) do
    # Real implementation: reconcile, fetch candidates, dispatch.
    # For now: log the tick and reschedule.
    Logger.debug("symphony.tick",
      running: map_size(state.running),
      retrying: map_size(state.retry_attempts)
    )

    schedule_tick(poll_interval(state))
    {:noreply, state}
  end

  # ============== Helpers ==============

  defp schedule_tick(interval_ms) do
    Process.send_after(self(), :tick, interval_ms)
  end

  defp poll_interval(%{workflow: nil}) do
    Application.get_env(:symphony, :poll_interval_ms, 30_000)
  end

  defp poll_interval(%{workflow: workflow}) do
    case WorkflowLoader.fetch(workflow, "polling.interval_ms", 30_000) do
      n when is_integer(n) and n > 0 -> n
      n when is_binary(n) -> String.to_integer(n)
      _ -> 30_000
    end
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
      workflow_loaded: not is_nil(state.workflow)
    }
  end
end
