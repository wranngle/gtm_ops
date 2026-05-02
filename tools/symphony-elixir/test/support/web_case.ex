defmodule Symphony.WebCase do
  @moduledoc """
  Test helper for the optional Phoenix dashboard. Assumes
  `test/test_helper.exs` already started `Phoenix.PubSub` (named
  `Symphony.PubSub`) and `Symphony.Web.Endpoint` for the duration of
  the test run.

  Tests opting into the web surface should `use Symphony.WebCase`.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      import Plug.Conn
      import Phoenix.ConnTest
      import Phoenix.LiveViewTest

      alias Symphony.Web.Endpoint

      @endpoint Symphony.Web.Endpoint

      setup _context do
        # Web tests stub `Symphony.snapshot/0` by registering a tiny
        # GenServer under `Symphony.Orchestrator`. Other test files
        # (e.g. `orchestrator_test`) also use that name; clear it before
        # each test so our stub can register cleanly.
        Symphony.WebCase.terminate_existing_orchestrator!()
        :ok
      end
    end
  end

  @doc """
  Stop any process registered under the `Symphony.Orchestrator` name.
  Tolerant of the name being absent or the process having already died.
  """
  @spec terminate_existing_orchestrator!() :: :ok
  def terminate_existing_orchestrator! do
    case Process.whereis(Symphony.Orchestrator) do
      nil ->
        :ok

      pid ->
        if Process.alive?(pid) do
          ref = Process.monitor(pid)

          try do
            GenServer.stop(pid, :normal, 1_000)
          catch
            :exit, _ -> :ok
          end

          receive do
            {:DOWN, ^ref, :process, ^pid, _} -> :ok
          after
            1_500 -> :ok
          end
        else
          :ok
        end
    end
  end

  @doc """
  Stub `Symphony.snapshot/0` for the duration of a test by replacing
  the orchestrator process registration. The simplest thing that works
  here is starting a tiny GenServer named `Symphony.Orchestrator` that
  responds to `:snapshot` with the supplied payload.
  """
  @spec start_stub_snapshot!(map()) :: pid()
  def start_stub_snapshot!(snapshot) do
    {:ok, pid} = Symphony.WebCase.StubOrchestrator.start_link(snapshot)
    pid
  end
end

defmodule Symphony.WebCase.StubOrchestrator do
  @moduledoc false

  use GenServer

  def start_link(snapshot) do
    GenServer.start_link(__MODULE__, snapshot, name: Symphony.Orchestrator)
  end

  @impl true
  def init(snapshot), do: {:ok, snapshot}

  @impl true
  def handle_call(:snapshot, _from, snapshot) do
    {:reply, {:ok, snapshot}, snapshot}
  end
end
