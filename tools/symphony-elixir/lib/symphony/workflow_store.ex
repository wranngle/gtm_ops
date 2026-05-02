defmodule Symphony.WorkflowStore do
  @moduledoc """
  Caches the last known good workflow and reloads it when the workflow
  file changes (spec § 6.2).

  Polls the configured workflow file mtime/size/content-hash every
  `:poll_interval_ms` (default 1000ms). On detected change, reloads via
  `Symphony.WorkflowLoader.load/1` and pushes the new workflow into
  `Symphony.Orchestrator.apply_workflow/1`. If the reload fails (parse
  error, missing file, unsupported tracker kind), the store keeps the
  last-known-good workflow and emits an operator-visible warning.

  Public API:

    * `current/0` — returns the latest cached workflow (synchronously
      checks for a fresh stamp, falling back to the cached value on
      reload failure).
    * `force_reload/0` — performs an immediate reload + apply round trip.

  Configurability:

    * `:symphony, :workflow_path` — file to watch. Required.
    * `:symphony, :workflow_store_poll_ms` — poll cadence in ms.
    * `:symphony, :workflow_store_apply_on_change?` — when false, the
      store still tracks the file but does not push reloads into the
      orchestrator. Useful in tests.
  """

  use GenServer
  require Logger

  alias Symphony.{Logging, Orchestrator, WorkflowLoader}

  @default_poll_interval_ms 1_000

  defmodule State do
    @moduledoc false

    defstruct [
      :path,
      :stamp,
      :workflow,
      :poll_interval_ms,
      :apply_on_change?,
      :timer_ref
    ]
  end

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Return the last-known-good workflow. If the file has changed since the
  last poll the store attempts a fresh load first; on failure the cached
  workflow is returned with the underlying error suppressed (operators
  should consult the warning log for the failure cause).
  """
  @spec current() :: {:ok, WorkflowLoader.workflow()} | {:error, term()}
  def current do
    case GenServer.whereis(__MODULE__) do
      nil ->
        WorkflowLoader.load()

      _pid ->
        GenServer.call(__MODULE__, :current)
    end
  end

  @doc """
  Force an immediate reload + apply. Returns `:ok` on success or
  `{:error, reason}` when the file cannot be loaded.
  """
  @spec force_reload() :: :ok | {:error, term()}
  def force_reload do
    case GenServer.whereis(__MODULE__) do
      nil ->
        case WorkflowLoader.load() do
          {:ok, _workflow} -> :ok
          {:error, reason} -> {:error, reason}
        end

      _pid ->
        GenServer.call(__MODULE__, :force_reload)
    end
  end

  @doc """
  Update the watched workflow path and immediately reload from the new
  location. Used by the CLI when `--workflow PATH` overrides the
  compile-time default after the store has already booted with the old
  path cached in its state.

  Returns `:ok` if the new path loads cleanly, `{:error, reason}` if the
  store updates its path but the new file fails to load (in which case
  the store keeps polling the new path and will pick it up if/when the
  file becomes readable). Returns `{:error, :not_started}` if the store
  process isn't running (test envs that disable the orchestrator).
  """
  @spec set_path(binary()) :: :ok | {:error, term()}
  def set_path(path) when is_binary(path) do
    case GenServer.whereis(__MODULE__) do
      nil -> {:error, :not_started}
      _pid -> GenServer.call(__MODULE__, {:set_path, path})
    end
  end

  # ============== Callbacks ==============

  @impl true
  def init(opts) do
    poll_interval_ms =
      Keyword.get(opts, :poll_interval_ms) ||
        Application.get_env(:symphony, :workflow_store_poll_ms, @default_poll_interval_ms)

    apply_on_change? =
      Keyword.get(opts, :apply_on_change?) ||
        Application.get_env(:symphony, :workflow_store_apply_on_change?, true)

    path = Keyword.get(opts, :path) || workflow_path()

    state = %State{
      path: path,
      stamp: nil,
      workflow: nil,
      poll_interval_ms: poll_interval_ms,
      apply_on_change?: apply_on_change?,
      timer_ref: nil
    }

    case load_state(state) do
      {:ok, loaded} ->
        # Best-effort initial apply so the orchestrator picks up the
        # workflow immediately on boot. Failures are logged but do not
        # crash the store; the orchestrator may already have its own
        # init-time load, and the next poll will retry.
        if apply_on_change? do
          maybe_apply_workflow(loaded.workflow)
        end

        {:ok, schedule_poll(loaded)}

      {:error, _reason, fallback} ->
        # Even with a load failure we still start: subsequent polls will
        # retry, and the orchestrator can fall back to its own init.
        {:ok, schedule_poll(fallback)}
    end
  end

  @impl true
  def handle_call(:current, _from, %State{} = state) do
    case reload_state(state) do
      {:ok, new_state} ->
        {:reply, {:ok, new_state.workflow}, new_state}

      {:error, _reason, new_state} ->
        case new_state.workflow do
          nil -> {:reply, {:error, :no_cached_workflow}, new_state}
          workflow -> {:reply, {:ok, workflow}, new_state}
        end
    end
  end

  def handle_call(:force_reload, _from, %State{} = state) do
    case reload_state(state) do
      {:ok, new_state} ->
        {:reply, :ok, new_state}

      {:error, reason, new_state} ->
        {:reply, {:error, reason}, new_state}
    end
  end

  def handle_call({:set_path, path}, _from, %State{} = state) do
    # Reset the stamp so reload_state treats the new path as guaranteed
    # changed — otherwise a coincidentally-matching mtime/size/hash
    # tuple would be a false negative and the cached workflow from the
    # OLD path would persist.
    new_state = %{state | path: path, stamp: nil}

    case reload_state(new_state) do
      {:ok, loaded} ->
        {:reply, :ok, loaded}

      {:error, reason, partial} ->
        {:reply, {:error, reason}, partial}
    end
  end

  @impl true
  def handle_info(:poll, %State{} = state) do
    new_state =
      case reload_state(state) do
        {:ok, s} -> s
        {:error, _reason, s} -> s
      end

    {:noreply, schedule_poll(new_state)}
  end

  # Catch-all for tick messages whose timer was already replaced.
  def handle_info(_msg, state), do: {:noreply, state}

  # ============== Helpers ==============

  defp workflow_path do
    Application.get_env(:symphony, :workflow_path) ||
      Path.join(File.cwd!(), "WORKFLOW.md")
  end

  defp schedule_poll(%State{poll_interval_ms: ms} = state) when is_integer(ms) and ms > 0 do
    if is_reference(state.timer_ref) do
      Process.cancel_timer(state.timer_ref)
    end

    ref = Process.send_after(self(), :poll, ms)
    %{state | timer_ref: ref}
  end

  defp reload_state(%State{path: path} = state) do
    cond do
      is_nil(path) ->
        log_reload_error("(unset)", :missing_workflow_path)
        {:error, :missing_workflow_path, state}

      true ->
        case current_stamp(path) do
          {:ok, stamp} when stamp == state.stamp ->
            {:ok, state}

          {:ok, _stamp} ->
            reload_path(state)

          {:error, reason} ->
            log_reload_error(path, reason)
            {:error, reason, state}
        end
    end
  end

  defp reload_path(%State{path: path} = state) do
    case load_state(state) do
      {:ok, new_state} ->
        if state.apply_on_change? do
          case maybe_apply_workflow(new_state.workflow) do
            :ok ->
              Logging.emit(:info, "symphony.workflow.reload", :success, fields: %{path: path})

              Logger.info("symphony.workflow.reload path=#{path}")
              {:ok, new_state}

            {:error, reason} ->
              # Apply failed (e.g. unsupported tracker after edit).
              # Keep the previous workflow cached so callers continue to
              # get the last-known-good config.
              log_reload_error(path, {:apply_failed, reason})
              {:error, reason, %{state | stamp: new_state.stamp}}
          end
        else
          {:ok, new_state}
        end

      {:error, reason, _fallback} ->
        log_reload_error(path, reason)
        {:error, reason, state}
    end
  end

  defp load_state(%State{path: path} = state) do
    with {:ok, workflow} <- WorkflowLoader.load(path),
         {:ok, stamp} <- current_stamp(path) do
      {:ok, %{state | path: path, stamp: stamp, workflow: workflow}}
    else
      {:error, reason} ->
        {:error, reason, state}
    end
  end

  defp current_stamp(path) when is_binary(path) do
    with {:ok, stat} <- File.stat(path, time: :posix),
         {:ok, content} <- File.read(path) do
      {:ok, {stat.mtime, stat.size, :erlang.phash2(content)}}
    else
      {:error, reason} -> {:error, reason}
    end
  end

  defp current_stamp(_path), do: {:error, :missing_workflow_path}

  defp maybe_apply_workflow(workflow) do
    case GenServer.whereis(Orchestrator) do
      nil -> :ok
      _pid -> Orchestrator.apply_workflow(workflow)
    end
  end

  defp log_reload_error(path, reason) do
    Logging.emit(:warning, "symphony.workflow.reload", :failure,
      message: "workflow reload failed; keeping last known good config",
      fields: %{path: to_string(path), reason: inspect(reason)}
    )

    Logger.warning(
      "symphony.workflow.reload outcome=failure path=#{path} reason=#{inspect(reason)}; keeping last known good configuration"
    )
  end
end
