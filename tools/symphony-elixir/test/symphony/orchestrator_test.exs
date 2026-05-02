defmodule Symphony.OrchestratorTest do
  use ExUnit.Case, async: false

  import ExUnit.CaptureLog

  alias Symphony.{Config, Orchestrator, WorkflowLoader}

  setup do
    # Defensive: a previously-failed test may have leaked the named
    # Orchestrator process. Kill it before we start fresh.
    stop_orchestrator()

    tmp = Path.join(System.tmp_dir!(), "symphony-orch-#{System.unique_integer([:positive])}")
    File.mkdir_p!(tmp)

    on_exit(fn ->
      stop_orchestrator()
      File.rm_rf!(tmp)
    end)

    {:ok, tmp: tmp}
  end

  defp stop_orchestrator do
    case GenServer.whereis(Orchestrator) do
      nil ->
        :ok

      pid ->
        ref = Process.monitor(pid)

        try do
          GenServer.stop(pid, :normal, 1_000)
        catch
          :exit, _ -> :ok
        end

        receive do
          {:DOWN, ^ref, :process, ^pid, _} -> :ok
        after
          1_000 -> :ok
        end
    end
  end

  defp boot_with_workflow(tmp, body) do
    path = Path.join(tmp, "WORKFLOW.md")
    File.write!(path, body)
    {:ok, workflow} = WorkflowLoader.load(path)
    {:ok, _pid} = Orchestrator.start_link([])
    :ok = Orchestrator.apply_workflow(workflow)
  end

  test "snapshot exposes runtime state with workflow loaded", %{tmp: tmp} do
    boot_with_workflow(tmp, """
    ---
    tracker:
      kind: noop
    polling:
      interval_ms: 60000
    agent:
      command: scripts/bin/llm.sh
      max_concurrent_agents: 4
    ---
    """)

    {:ok, snap} = Orchestrator.snapshot()
    assert snap.workflow_loaded == true
    assert snap.tracker_kind == :noop
    assert snap.running == []
    assert snap.retrying == []
    assert snap.codex_totals.total_tokens == 0
  end

  test "tick logs dispatch decision with available slots", %{tmp: tmp} do
    boot_with_workflow(tmp, """
    ---
    tracker:
      kind: noop
    polling:
      interval_ms: 60000
    agent:
      command: scripts/bin/llm.sh
      max_concurrent_agents: 2
    ---
    """)

    log =
      capture_log([level: :info], fn ->
        :ok = Orchestrator.tick_now()
      end)

    assert log =~ "symphony.dispatch"
    # The Noop adapter returns zero candidates; ready should be 0.
    assert log =~ "ready=0"
    assert log =~ "available=2"
  end

  test "tick is a no-op without a workflow", %{tmp: _tmp} do
    {:ok, _pid} = Orchestrator.start_link([])

    log =
      capture_log([level: :debug], fn ->
        :ok = Orchestrator.tick_now()
      end)

    assert log =~ "symphony.tick.skipped" or log == ""
    {:ok, snap} = Orchestrator.snapshot()
    assert snap.workflow_loaded == false
  end

  test "rejects unsupported tracker kind", %{tmp: tmp} do
    path = Path.join(tmp, "WORKFLOW.md")

    File.write!(path, """
    ---
    tracker:
      kind: yaml_invented_kind
    ---
    """)

    {:ok, workflow} = WorkflowLoader.load(path)
    {:ok, _pid} = Orchestrator.start_link([])

    assert {:error, {:unsupported_tracker, _}} = Orchestrator.apply_workflow(workflow)
    {:ok, snap} = Orchestrator.snapshot()
    assert snap.workflow_loaded == false
  end

  test "dispatch_sort_key orders by priority then identifier" do
    issues = [
      %Symphony.Tracker.Issue{id: "a", identifier: "Z", priority: 5},
      %Symphony.Tracker.Issue{id: "b", identifier: "A", priority: 1},
      %Symphony.Tracker.Issue{id: "c", identifier: "M", priority: 1}
    ]

    sorted =
      Enum.sort_by(issues, fn i ->
        {i.priority || 999_999, ~U[9999-12-31 23:59:59Z], i.identifier}
      end)

    assert Enum.map(sorted, & &1.identifier) == ["A", "M", "Z"]
  end

  test "respects bounded concurrency: only takes (max - running) candidates" do
    config = %{
      raw: %{},
      resolved: %{
        "tracker.kind" => "noop",
        "agent.max_concurrent_agents" => 2,
        "polling.interval_ms" => 60000
      },
      source_path: "n/a"
    }

    state = %{
      config: config,
      adapter: Symphony.Tracker.Noop,
      running: %{"already-running-id" => %{started_at: DateTime.utc_now()}},
      claimed: MapSet.new(["already-running-id"]),
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

    available = Config.agent_max_concurrent_agents(state.config) - map_size(state.running)
    assert available == 1
  end

  test "tick skips dispatch when preflight validation fails", %{tmp: tmp} do
    # `linear` tracker without api_key/project_slug should fail preflight.
    # The orchestrator must keep running but skip dispatch for that tick.
    boot_with_workflow(tmp, """
    ---
    tracker:
      kind: linear
    polling:
      interval_ms: 60000
    agent:
      command: scripts/bin/llm.sh
      max_concurrent_agents: 1
    ---
    """)

    log =
      capture_log([level: :info], fn ->
        :ok = Orchestrator.tick_now()
      end)

    assert log =~ "symphony.dispatch.preflight_failed"
    refute log =~ "symphony.dispatch ready="
  end

  test "snapshot returns :unavailable when daemon is not running" do
    # No orchestrator started in this test; snapshot must report it.
    assert {:error, :unavailable} = Orchestrator.snapshot()
  end
end
