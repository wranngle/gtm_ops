defmodule Symphony.Logging.Sink do
  @moduledoc """
  GenServer holding the active log sink. Each event is appended as a
  single JSON line.

  The sink is one of:

    * `:stderr` (default) — writes to `:standard_error`
    * `{:file, path}` — appends to the given path
    * `{:multi, [sink, ...]}` — fans out to multiple sinks (file + stderr)

  Configure via `Symphony.Logging.Sink.configure/1` (typically called from
  the application boot or test setup).
  """

  use GenServer

  @type sink :: :stderr | {:file, String.t()} | {:multi, [sink()]}

  # ============== Public API ==============

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    GenServer.start_link(__MODULE__, Keyword.get(opts, :sink, :stderr), name: __MODULE__)
  end

  @spec configure(sink()) :: :ok
  def configure(new_sink) do
    case GenServer.whereis(__MODULE__) do
      nil ->
        {:ok, _pid} = start_link(sink: new_sink)
        :ok

      _pid ->
        GenServer.call(__MODULE__, {:configure, new_sink})
    end
  end

  @spec write(map()) :: :ok
  def write(event) do
    line = Jason.encode!(event) <> "\n"

    case GenServer.whereis(__MODULE__) do
      nil ->
        # Default behaviour when the sink isn't started: stderr.
        IO.binwrite(:standard_error, line)
        :ok

      _pid ->
        # call/cast tradeoff: call serializes writes and ensures they're
        # observable when the function returns (important for tests that
        # assert on captured stderr). Log volume is bounded by tick rate
        # and dispatch decisions, so the synchronous round-trip is cheap.
        GenServer.call(__MODULE__, {:write, line})
    end
  end

  # ============== Callbacks ==============

  @impl true
  def init(sink), do: {:ok, %{sink: sink}}

  @impl true
  def handle_call({:configure, new_sink}, _from, state) do
    {:reply, :ok, %{state | sink: new_sink}}
  end

  @impl true
  def handle_call({:write, line}, _from, state) do
    do_write(state.sink, line)
    {:reply, :ok, state}
  end

  defp do_write(:stderr, line) do
    IO.binwrite(:standard_error, line)
  end

  defp do_write({:file, path}, line) do
    File.mkdir_p!(Path.dirname(path))
    File.write!(path, line, [:append])
  end

  defp do_write({:multi, sinks}, line) do
    Enum.each(sinks, &do_write(&1, line))
  end
end
