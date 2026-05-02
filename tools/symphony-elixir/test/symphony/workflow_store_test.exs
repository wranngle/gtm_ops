defmodule Symphony.WorkflowStoreTest do
  use ExUnit.Case, async: false

  import ExUnit.CaptureLog

  alias Symphony.WorkflowStore

  setup do
    stop_store()

    tmp = Path.join(System.tmp_dir!(), "symphony-store-#{System.unique_integer([:positive])}")
    File.mkdir_p!(tmp)

    on_exit(fn ->
      stop_store()
      File.rm_rf!(tmp)
    end)

    {:ok, tmp: tmp}
  end

  defp stop_store do
    case GenServer.whereis(WorkflowStore) do
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

  defp write_workflow(path, body) do
    File.write!(path, body)
    # Ensure mtime tick: many filesystems have 1s mtime resolution.
    File.touch!(path, System.os_time(:second))
  end

  defp simple_workflow(state) do
    """
    ---
    tracker:
      kind: noop
    polling:
      interval_ms: #{state}
    agent:
      command: scripts/bin/llm.sh
      max_concurrent_agents: 1
    ---
    """
  end

  test "current/0 returns the loaded workflow", %{tmp: tmp} do
    path = Path.join(tmp, "WORKFLOW.md")
    write_workflow(path, simple_workflow(60_000))

    {:ok, _pid} =
      WorkflowStore.start_link(
        path: path,
        poll_interval_ms: 50,
        apply_on_change?: false
      )

    assert {:ok, workflow} = WorkflowStore.current()
    assert workflow.config["polling"]["interval_ms"] == 60_000
    assert workflow.source_path == path
  end

  test "polls for changes and re-emits a fresh workflow", %{tmp: tmp} do
    path = Path.join(tmp, "WORKFLOW.md")
    write_workflow(path, simple_workflow(60_000))

    {:ok, _pid} =
      WorkflowStore.start_link(
        path: path,
        poll_interval_ms: 50,
        apply_on_change?: false
      )

    {:ok, before} = WorkflowStore.current()
    assert before.config["polling"]["interval_ms"] == 60_000

    # Mutate file content (and touch to ensure stamp changes even on
    # 1s mtime filesystems).
    write_workflow(path, simple_workflow(45_000))

    # Wait up to ~2 polling intervals (with extra slack) for the change
    # to propagate, asserting on `current/0` which forces a reload.
    eventually = fn ->
      Enum.reduce_while(1..40, false, fn _i, _ ->
        case WorkflowStore.current() do
          {:ok, %{config: %{"polling" => %{"interval_ms" => 45_000}}}} ->
            {:halt, true}

          _ ->
            Process.sleep(50)
            {:cont, false}
        end
      end)
    end

    assert eventually.(), "expected reload to surface new polling interval within 2s"
  end

  test "force_reload/0 succeeds on a valid file and returns error when the file is missing",
       %{tmp: tmp} do
    path = Path.join(tmp, "WORKFLOW.md")
    write_workflow(path, simple_workflow(60_000))

    {:ok, _pid} =
      WorkflowStore.start_link(
        path: path,
        poll_interval_ms: 60_000,
        apply_on_change?: false
      )

    assert :ok = WorkflowStore.force_reload()

    # Delete the file so the next reload fails. The cached workflow
    # should remain available via current/0 (last known good).
    File.rm!(path)

    log =
      capture_log(fn ->
        assert {:error, _reason} = WorkflowStore.force_reload()
      end)

    assert log =~ "symphony.workflow.reload" or log =~ "keeping last known good"
    assert {:ok, cached} = WorkflowStore.current()
    assert cached.config["polling"]["interval_ms"] == 60_000
  end

  test "current/0 falls back to a fresh load when the store is not started", %{tmp: tmp} do
    path = Path.join(tmp, "WORKFLOW.md")
    write_workflow(path, simple_workflow(60_000))

    prior = Application.get_env(:symphony, :workflow_path)
    Application.put_env(:symphony, :workflow_path, path)

    on_exit(fn ->
      case prior do
        nil -> Application.delete_env(:symphony, :workflow_path)
        v -> Application.put_env(:symphony, :workflow_path, v)
      end
    end)

    assert {:ok, workflow} = WorkflowStore.current()
    assert workflow.config["polling"]["interval_ms"] == 60_000
  end
end
